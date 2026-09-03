import type { SupabaseClient } from '@supabase/supabase-js';

import type { ServiceResult, VisitRegistration, RegistrationVisitor } from '@/types';
import {
  publicRegistrationFormSchema,
  type PublicRegistrationFormData,
} from '@/lib/validations/registration';
import { formatSuitableDays } from '@/lib/constants';
import { getISODayOfWeekVN, hasSlotEndedVN } from '@/lib/time';

// ─── Cross-verify inmate data against DB ────────────────────────────────────

interface InmateRecord {
  id: string;
  date_of_birth: string | null;
  classification: string;
  visit_status: string;
}

// ─── submitRegistration ─────────────────────────────────────────────────────

export async function submitRegistration(
  supabase: SupabaseClient,
  prisonId: string,
  formData: PublicRegistrationFormData,
): Promise<ServiceResult<{ registration: VisitRegistration; visitors: RegistrationVisitor[] }>> {
  // Step 1: Validate form input (public schema — no full_name / citizen_id required)
  const parsed = publicRegistrationFormSchema.safeParse(formData);
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
      message: 'Không tìm thấy phạm nhân với số giam này. Vui lòng kiểm tra lại.',
    };
  }

  const inmateRecord = inmate as InmateRecord;

  // Step 2b: Cross-verify inmate data — only classification is checked.
  // full_name is NOT collected from the public form (hidden for security);
  // the inmate is already uniquely identified by prison_number.
  if (inmateInput.classification !== inmateRecord.classification) {
    return {
      success: false,
      message: 'Phân loại phạm nhân không khớp với hệ thống. Vui lòng kiểm tra lại.',
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
    // Ngày sinh không bắt buộc: gửi null (thay vì chuỗi rỗng) để RPC ép kiểu
    // sang DATE mà không lỗi.
    date_of_birth: v.date_of_birth ? v.date_of_birth : null,
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
    | { error: 'NOT_RELATIVE'; positions: number[] }
    | { registration: VisitRegistration; visitors: RegistrationVisitor[] };

  if ('error' in result) {
    switch (result.error) {
      case 'DUPLICATE':
        return {
          success: false,
          message: 'Phạm nhân này đã có lịch thăm gặp trong khung giờ đã chọn.',
        };
      case 'MONTHLY_LIMIT':
        return { success: false, message: 'Đã quá số lần thăm gặp trong tháng này.' };
      case 'NOT_RELATIVE': {
        // Bước kiểm tra thân thích (mục 6): RPC trả về vị trí (1-based) của
        // những người đăng ký KHÔNG có trong danh sách thân thích. Không có
        // lịch nào được tạo và không có dữ liệu nào được lưu.
        const positions = result.positions ?? [];
        if (positions.length <= 1) {
          return {
            success: false,
            message: 'Bạn không nằm trong danh sách thân thích của người này.',
          };
        }
        return {
          success: false,
          message: `Người thứ ${positions.join(', ')} không nằm trong danh sách thân thích của người này.`,
        };
      }
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
  // Verify the caller is an admin using the cookie-based client (identity
  // comes from the authenticated session, never from a privileged client).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: 'Không có quyền truy cập.' };

  // Resolve the admin's prison and fetch the registration with the PRIVILEGED
  // client (`db`, service-role). The RLS SELECT policy keys off the JWT
  // `prison_id` claim, which is not guaranteed to be present on the cookie
  // client's token — using it here would filter the row out and make the
  // update fail with a misleading "Không tìm thấy đăng ký." (the same reason
  // the admin list route reads via the service-role client). Tenant isolation
  // is still enforced explicitly via `.eq('prison_id', …)` below.
  const { data: profile } = await db
    .from('admin_profiles')
    .select('prison_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return { success: false, message: 'Không có quyền truy cập.' };

  // Fetch current registration, scoped to the admin's prison.
  const { data: reg } = await db
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

  // Only allow the status update once the ASSIGNED time slot has ended. This
  // combines the visit date with `time_slot_end` and compares against "now" in
  // the Asia/Ho_Chi_Minh (UTC+7) zone, so an admin can mark a visit as
  // Completed / No-show as soon as its slot finishes on the same day. The
  // comparison is timezone-independent (server may run in UTC on Vercel),
  // avoiding off-by-one day / hour boundary errors.
  if (!hasSlotEndedVN(String(reg.visit_date), String(reg.time_slot_end))) {
    return {
      success: false,
      message: 'Chỉ có thể cập nhật trạng thái sau khi kết thúc thời gian thăm gặp.',
    };
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

// ─── deleteRegistration ─────────────────────────────────────────────────────

export async function deleteRegistration(
  supabase: SupabaseClient,
  registrationId: string,
  /** Privileged client for the write (bypasses RLS). Defaults to `supabase`. */
  db: SupabaseClient = supabase,
): Promise<ServiceResult<{ id: string }>> {
  // Verify the caller is an admin and resolve their prison in a single query.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: 'Không có quyền truy cập.' };

  const { data: profile } = await supabase
    .from('admin_profiles')
    .select('prison_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile) return { success: false, message: 'Không có quyền truy cập.' };

  // Hard delete, scoped to the admin's prison for tenant isolation.
  // `registration_visitors` rows are removed automatically via the
  // `ON DELETE CASCADE` foreign key (migration 00005).
  //
  // `.select('id')` returns the rows that were actually deleted. This is the
  // critical part: when the privileged service-role client is NOT configured
  // (`createServiceRoleClient()` → null) the write falls back to the
  // cookie-based client, whose RLS DELETE policy requires a `prison_id` claim
  // in the JWT. If that claim is missing the DELETE matches ZERO rows and
  // Postgres returns NO error — the old code then reported success while the
  // row stayed in place ("không xóa được"). Inspecting the deleted rows lets us
  // surface that as an explicit failure instead of a silent no-op.
  const { data: deleted, error } = await db
    .from('visit_registrations')
    .delete()
    .eq('id', registrationId)
    .eq('prison_id', profile.prison_id)
    .select('id');

  if (error) return { success: false, message: error.message };

  if (!deleted || deleted.length === 0) {
    return {
      success: false,
      message:
        'Không thể xóa lần gặp. Có thể do thiếu quyền (SUPABASE_SERVICE_ROLE_KEY chưa cấu hình) hoặc bản ghi không thuộc đơn vị của bạn.',
    };
  }

  return { success: true, data: { id: registrationId } };
}
