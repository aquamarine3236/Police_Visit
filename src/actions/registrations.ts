'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient } from '@/lib/supabase/server';
import * as schedulingService from '@/lib/services/scheduling';
import type { ServiceResult, VisitRegistration } from '@/types';

export async function updateRegistrationStatus(
  registrationId: string,
  newStatus: 'completed' | 'no_show',
): Promise<ServiceResult<VisitRegistration>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const result = await schedulingService.updateRegistrationStatus(
    supabase,
    registrationId,
    newStatus,
  );

  if (result.success) {
    revalidatePath('/admin');
  }

  return result;
}
