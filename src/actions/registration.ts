'use server';

import { createServerClient } from '@/lib/supabase/server';
import * as schedulingService from '@/lib/services/scheduling';
import type { RegistrationFormData } from '@/lib/validations/registration';
import type { ServiceResult, VisitRegistration, RegistrationVisitor } from '@/types';

export async function submitRegistration(
  prisonId: string,
  formData: RegistrationFormData,
): Promise<ServiceResult<{ registration: VisitRegistration; visitors: RegistrationVisitor[] }>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  return schedulingService.submitRegistration(supabase, prisonId, formData);
}
