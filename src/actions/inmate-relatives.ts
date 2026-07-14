'use server';

import { revalidatePath } from 'next/cache';

import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import * as relativeService from '@/lib/services/inmate-relatives';
import type { InmateLookupResult } from '@/lib/services/inmate-relatives';
import type { RelativeFormData } from '@/lib/validations/inmate-relative';
import type { ServiceResult, InmateRelative } from '@/types';

// ─── lookupInmate ───────────────────────────────────────────────────────────

export async function lookupInmate(
  prisonNumber: string,
): Promise<ServiceResult<InmateLookupResult>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  return relativeService.lookupInmateByPrisonNumber(supabase, prisonNumber, db);
}

// ─── listRelativesByInmate ──────────────────────────────────────────────────

export async function listRelativesByInmate(
  inmateId: string,
): Promise<ServiceResult<InmateRelative[]>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  return relativeService.listRelativesByInmate(supabase, inmateId, db);
}

// ─── createRelative ─────────────────────────────────────────────────────────

export async function createRelative(
  inmateId: string,
  formData: RelativeFormData,
): Promise<ServiceResult<InmateRelative>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  const result = await relativeService.createRelative(supabase, inmateId, formData, db);

  if (result.success) {
    revalidatePath('/admin/relatives');
  }

  return result;
}

// ─── updateRelative ─────────────────────────────────────────────────────────

export async function updateRelative(
  id: string,
  formData: RelativeFormData,
): Promise<ServiceResult<InmateRelative>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  const result = await relativeService.updateRelative(supabase, id, formData, db);

  if (result.success) {
    revalidatePath('/admin/relatives');
  }

  return result;
}

// ─── deleteRelative ─────────────────────────────────────────────────────────

export async function deleteRelative(
  id: string,
): Promise<ServiceResult<{ id: string }>> {
  const supabase = await createServerClient();
  if (!supabase) {
    return { success: false, message: 'Supabase chưa được cấu hình.' };
  }

  const db = createServiceRoleClient() ?? supabase;
  const result = await relativeService.deleteRelative(supabase, id, db);

  if (result.success) {
    revalidatePath('/admin/relatives');
  }

  return result;
}
