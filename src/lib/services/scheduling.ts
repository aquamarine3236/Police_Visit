import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult, VisitRegistration, RegistrationVisitor } from '@/types';
import {
  registrationFormSchema,
  type RegistrationFormData,
} from '@/lib/validations/registration';

// ─── Cross-verify inmate data against DB ────────────────────────────────────

interface InmateRecord {
  id: string;
  prison_id: string;
  full_name: string;
  date_of_birth: string;
  classification: string;
  visit_status: string;
  deleted_at: string | null;
}

// ─── submitRegistration ─────────────────────────────────────────────────────

export async function submitRegistration(
  supabase: SupabaseClient,
  prisonId: string,
  formData: RegistrationFormData,
): Promise<ServiceResult<{ registration: VisitRegistration; visitors: RegistrationVisitor[] }>> {
  // Step 1: Validate form input
  const parsed = registrationFormSchema.safeParse(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.');
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return { success: false, message: 'Dữ liệu không hợp lệ.', errors: fieldErrors };
  }

  const { visitors, inmate: inmateInput, visit_date } = parsed.data;

  // Step 2: Verify inmate exists (by prison_number in the given prison)
  const { data: inmate, error: inmateError } = await supabase
    .from('inmates')
    .select('id, prison_id, full_name, date_of_birth, classification, visit_status, deleted_at')
    .eq('prison_id', prisonId)
    .eq('prison_number', inmateInput.prison_number)
    .is('deleted_at', null)
    .maybeSingle();

  if (inmateError) return { success: false, message: inmateError.message };

  if (!inmate) {
    return {
      success: false,
      message: 'Không tìm thấy phạm nhân với số hiệu này. Vui lòng kiểm tra lại.',
    };
  }

  const inmateRecord = inmate as InmateRecord;

  // Step 2b: Cross-verify inmate data
  const formName = inmateInput.full_name.trim().toLowerCase();
  const dbName = inmateRecord.full_name.trim().toLowerCase();
  if (formName !== dbName || inmateInput.date_of_birth !== inmateRecord.date_of_birth || inmateInput.classification !== inmateRecord.classification) {
    return {
      success: false,
      message: 'Thông tin phạm nhân không khớp với hệ thống. Vui lòng kiểm tra lại họ tên, ngày sinh và phân loại.',
    };
  }

  // Step 3: Check visit status
  if (inmateRecord.visit_status === 'Hạn chế thăm gặp') {
    return { success: false, message: 'Người này đang bị hạn chế thăm gặp.' };
  }

  // Step 4: Check visit_date is a suitable day
  const visitDateObj = new Date(visit_date + 'T00:00:00+07:00');
  const { data: settings } = await supabase
    .from('scheduling_settings')
    .select('suitable_days')
    .eq('prison_id', prisonId)
    .maybeSingle();

  if (settings) {
    const dayOfWeek = visitDateObj.getUTCDay() === 0 ? 7 : visitDateObj.getUTCDay();
    const suitableDays: number[] = settings.suitable_days;
    if (!suitableDays.includes(dayOfWeek)) {
      return {
        success: false,
        message: 'Ngày bạn chọn không phải ngày thăm gặp. Vui lòng chọn ngày Thứ Năm hoặc Thứ Sáu.',
      };
    }
  }

  // Step 5: Check for duplicate registration (same first visitor CCCD + inmate + date)
  const firstVisitorCccd = visitors[0].citizen_id;

  // Use a more reliable duplicate check via a separate query
  const { data: existingVisitorRegs } = await supabase
    .from('registration_visitors')
    .select('registration_id')
    .eq('citizen_id', firstVisitorCccd)
    .eq('display_order', 1);

  if (existingVisitorRegs && existingVisitorRegs.length > 0) {
    const regIds = existingVisitorRegs.map((r) => r.registration_id);
    const { count: duplicateCount } = await supabase
      .from('visit_registrations')
      .select('id', { count: 'exact', head: true })
      .in('id', regIds)
      .eq('inmate_id', inmateRecord.id)
      .eq('visit_date', visit_date)
      .in('status', ['confirmed', 'completed', 'no_show']);

    if (duplicateCount && duplicateCount > 0) {
      return {
        success: false,
        message: 'Bạn đã đăng ký thăm gặp người này vào ngày này rồi.',
      };
    }
  }

  // Step 6: Call RPC fn_assign_time_slot for slot allocation
  const { data: slotData, error: slotError } = await supabase.rpc(
    'fn_assign_time_slot',
    {
      p_prison_id: prisonId,
      p_visit_date: visit_date,
      p_inmate_id: inmateRecord.id,
    },
  );

  if (slotError) {
    // Check for monthly limit exceeded error from the DB function
    if (slotError.message?.includes('monthly') || slotError.message?.includes('limit')) {
      return { success: false, message: 'Đã quá số lần thăm gặp trong tháng này.' };
    }
    return { success: false, message: slotError.message };
  }

  if (!slotData || (Array.isArray(slotData) && slotData.length === 0)) {
    return {
      success: false,
      message: 'Đã hết lịch thăm gặp trong ngày hôm đó, vui lòng chọn ngày khác.',
    };
  }

  const assignedSlot = Array.isArray(slotData) ? slotData[0] : slotData;

  // Step 7: Insert the visit registration
  const { data: registration, error: regError } = await supabase
    .from('visit_registrations')
    .insert({
      prison_id: prisonId,
      inmate_id: inmateRecord.id,
      visit_date,
      time_slot_start: assignedSlot.slot_start,
      time_slot_end: assignedSlot.slot_end,
      status: 'confirmed',
    })
    .select()
    .single();

  if (regError) return { success: false, message: regError.message };

  // Step 8: Insert visitors
  const visitorInserts = visitors.map((v, idx) => ({
    registration_id: registration.id,
    full_name: v.full_name.trim(),
    date_of_birth: v.date_of_birth,
    citizen_id: v.citizen_id,
    relationship: v.relationship.trim(),
    display_order: idx + 1,
  }));

  const { data: insertedVisitors, error: visitorError } = await supabase
    .from('registration_visitors')
    .insert(visitorInserts)
    .select();

  if (visitorError) {
    // Rollback: delete the registration if visitor insert fails
    await supabase.from('visit_registrations').delete().eq('id', registration.id);
    return { success: false, message: visitorError.message };
  }

  return {
    success: true,
    data: {
      registration: registration as VisitRegistration,
      visitors: (insertedVisitors ?? []) as RegistrationVisitor[],
    },
  };
}

// ─── updateRegistrationStatus ───────────────────────────────────────────────

export async function updateRegistrationStatus(
  supabase: SupabaseClient,
  registrationId: string,
  newStatus: 'completed' | 'no_show',
): Promise<ServiceResult<VisitRegistration>> {
  // Verify the caller is an admin
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: 'Không có quyền truy cập.' };

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('prison_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return { success: false, message: 'Không có quyền truy cập.' };

  // Fetch current registration
  const { data: reg } = await supabase
    .from('visit_registrations')
    .select('*')
    .eq('id', registrationId)
    .eq('prison_id', profile.prison_id)
    .maybeSingle();

  if (!reg) return { success: false, message: 'Không tìm thấy đăng ký.' };

  // Only allow transition from 'confirmed' status
  if (reg.status !== 'confirmed') {
    return { success: false, message: 'Chỉ có thể cập nhật trạng thái đăng ký đã xác nhận.' };
  }

  // Only allow status update after the visit date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visitDate = new Date(reg.visit_date + 'T00:00:00+07:00');
  if (visitDate >= today) {
    return { success: false, message: 'Chỉ có thể cập nhật trạng thái sau ngày thăm gặp.' };
  }

  const validStatuses = ['completed', 'no_show'];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, message: 'Trạng thái không hợp lệ.' };
  }

  const { data, error } = await supabase
    .from('visit_registrations')
    .update({ status: newStatus, updated_by: user.id })
    .eq('id', registrationId)
    .select()
    .single();

  if (error) return { success: false, message: error.message };
  return { success: true, data: data as VisitRegistration };
}
