'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient } from '@/lib/supabase/server';
import * as inmateService from '@/lib/services/inmates';
import type { InmateFormData, InmateListQuery } from '@/lib/validations/inmate';
import type { ServiceResult, Inmate, PaginatedResponse } from '@/types';

export async function createInmate(
  formData: InmateFormData,
): Promise<ServiceResult<Inmate>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const result = await inmateService.createInmate(supabase, formData);

  if (result.success) {
    revalidatePath('/admin');
  }

  return result;
}

export async function updateInmate(
  id: string,
  formData: InmateFormData,
): Promise<ServiceResult<Inmate>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const result = await inmateService.updateInmate(supabase, id, formData);

  if (result.success) {
    revalidatePath('/admin');
  }

  return result;
}

export async function deleteInmate(
  id: string,
): Promise<ServiceResult> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const result = await inmateService.deleteInmate(supabase, id);

  if (result.success) {
    revalidatePath('/admin');
  }

  return result;
}

export async function getInmateById(
  id: string,
): Promise<ServiceResult<Inmate>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  return inmateService.getInmateById(supabase, id);
}

export async function listInmates(
  query: InmateListQuery,
): Promise<ServiceResult<PaginatedResponse<Inmate>>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  return inmateService.listInmates(supabase, query);
}
