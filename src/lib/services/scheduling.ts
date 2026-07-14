import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult, VisitRegistration, RegistrationVisitor } from '@/types';
import {
  registrationFormSchema,
  type RegistrationFormData,
} from '@/lib/validations/registration';
import { formatSuitableDays } from '@/lib/constants';
import { getISODayOfWeekVN, todayVN } from '@/lib/time';

// ─── Cross-verify inmate data against DB ────────────────────────────────────

interface InmateRecord {
  id: string;
  full_name: string;
  date_of_birth: string;
  classification: string;
  visit_status: string;
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

  // Step 2: Verify inmate exists (by prison_number in the given prison).
  // Uses a SECURITY DEFINER RPC so that RESTRICTED inmates are still visible to
  // the anon role (the public RLS policy hides them), allowing us to return the
  // correct "restricted" vs "not found" message.
  const { data: inmateRows, error: inmateError } = await supabase.rpc(
    'fn_lookup_inmate_for_registration',
    {
      p_prison_id: prisonId,
      p_prison_number: inmateInput.prison_number,
    },
  );

  if (inmateError) return { success: false, message: inmateError.message };

  const inmate = Array.isArray(inmateRows) ? inmateRows[0] : inmateRows;

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
  // Day-of-week được tính theo lịch UTC+7 (độc lập timezone server/trình duyệt).
  const { data: settings } = await supabase
    .from('scheduling_settings')
    .select('suitable_days')
    .eq('prison_id', prisonId)
    .maybeSingle();

  if (settings) {
    const dayOfWeek = getISODayOfWeekVN(visit_date);
    const suitableDays: number[] = settings.suitable_days;
    if (!suitableDays.includes(dayOfWeek)) {
      const allowed = formatSuitableDays(suitableDays);
      return {
        success: false,
        message: allowed
          ? `Ngày bạn chọn không phải ngày thăm gặp. Vui lòng chọn ngày ${allowed}.`
          : 'Ngày bạn chọn không phải ngày thăm gặp.',
      };
    }
  }

  // Steps 5–8: Duplicate check, slot assignment, and the registration + visitor
  // inserts are executed atomically inside a single SECURITY DEFINER RPC. This
  // is required because the public flow runs as the `anon` role: RLS hides
  // existing registrations from `anon`, so any client-side capacity/limit check
  // or `INSERT ... RETURNING` would be unreliable. The RPC runs as the function
  // owner, enforces every business rule under an advisory lock, and returns the
  // created rows (or a structured error code).
  const visitorPayload = visitors.map((v) => ({
    full_name: v.full_name.trim(),
    date_of_birth: v.date_of_birth,
    citizen_id: v.citizen_id,
    relationship: v.relationship.trim(),
  }));

  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'fn_submit_registration',
    {
      p_prison_id: prisonId,
      p_inmate_id: inmateRecord.id,
      p_visit_date: visit_date,
      p_visitors: visitorPayload,
    },
  );

  if (rpcError) return { success: false, message: rpcError.message };

  const result = rpcResult as
    | { error: 'DUPLICATE' | 'MONTHLY_LIMIT' | 'NO_SLOT' }
    | { registration: VisitRegistration; visitors: RegistrationVisitor[] };

  if ('error' in result) {
    switch (result.error) {
      case 'DUPLICATE':
        return {
          success: false,
          message: 'Bạn đã đăng ký thăm gặp người này vào ngày này rồi.',
        };
      case 'MONTHLY_LIMIT':
        return { success: false, message: 'Đã quá số lần thăm gặp trong tháng này.' };
      case 'NO_SLOT':
      default:
        return {
          success: false,
          message: 'Đã hết lịch thăm gặp trong ngày hôm đó, vui lòng chọn ngày khác.',
        };
    }
  }

  return {
    success: true,
    data: {
      registration: result.registration,
      visitors: result.visitors ?? [],
    },
  };
}

// ─── updateRegistrationStatus ───────────────────────────────────────────────

export async function updateRegistrationStatus(
  supabase: SupabaseClient,
  registrationId: string,
  newStatus: 'completed' | 'no_show',
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
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

  // Only allow status update strictly after the visit date. Compare on
  // date-only strings in the Asia/Ho_Chi_Minh (UTC+7) zone so the result is
  // independent of the server's timezone (e.g. UTC on Vercel), avoiding
  // off-by-one day boundary errors.
  const today = todayVN();
  const visitDateStr = String(reg.visit_date).split('T')[0];
  if (visitDateStr >= today) {
    return { success: false, message: 'Chỉ có thể cập nhật trạng thái sau ngày thăm gặp.' };
  }

  const validStatuses = ['completed', 'no_show'];
  if (!validStatuses.includes(newStatus)) {
    return { success: false, message: 'Trạng thái không hợp lệ.' };
  }

  const { data, error } = await db
    .from('visit_registrations')
    .update({ status: newStatus, updated_by: user.id })
    .eq('id', registrationId)
    .select()
    .single();

  if (error) return { success: false, message: error.message };
  return { success: true, data: data as VisitRegistration };
}
