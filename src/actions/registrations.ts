'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
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

  const db = createServiceRoleClient() ?? supabase;
  const result = await schedulingService.updateRegistrationStatus(
    supabase,
    registrationId,
    newStatus,
    db,
  );

  if (result.success) {
    revalidatePath('/admin');
  }

  return result;
}

export async function deleteRegistration(
  registrationId: string,
): Promise<ServiceResult<{ id: string }>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  const result = await schedulingService.deleteRegistration(
    supabase,
    registrationId,
    db,
  );

  if (result.success) {
    revalidatePath('/admin');
  }

  return result;
}
