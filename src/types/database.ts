/**
 * Database entity types matching the PostgreSQL schema.
 * These types mirror the column definitions in supabase/migrations/.
 */

// ─── Prisons ────────────────────────────────────────────────────────────────

export interface Prison {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Inmates ────────────────────────────────────────────────────────────────

export type InmateClassification =
  | 'Người bị tạm giữ'
  | 'Người bị tạm giam'
  | 'Phạm nhân';

export type InmateVisitStatus = 'Có thể thăm gặp' | 'Hạn chế thăm gặp';

export interface Inmate {
  id: string;
  prison_id: string;
  prison_number: string;
  full_name: string;
  date_of_birth: string;
  citizen_id: string | null;
  permanent_address: string | null;
  criminal_offense: string | null;
  arrest_date: string | null;
  admission_date: string | null;
  classification: InmateClassification;
  visit_status: InmateVisitStatus;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  deleted_at: string | null;
}

export type InmateInsert = Omit<
  Inmate,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type InmateUpdate = Partial<
  Omit<Inmate, 'id' | 'prison_id' | 'created_at' | 'updated_at' | 'deleted_at'>
>;

// ─── Visit Registrations ────────────────────────────────────────────────────

export type RegistrationStatus = 'confirmed' | 'completed' | 'no_show';

export interface VisitRegistration {
  id: string;
  prison_id: string;
  inmate_id: string;
  visit_date: string;
  time_slot_start: string;
  time_slot_end: string;
  status: RegistrationStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface VisitRegistrationWithDetails extends VisitRegistration {
  inmate?: Inmate;
  visitors?: RegistrationVisitor[];
}

// ─── Registration Visitors ──────────────────────────────────────────────────

export interface RegistrationVisitor {
  id: string;
  registration_id: string;
  full_name: string;
  date_of_birth: string;
  citizen_id: string;
  relationship: string;
  display_order: number;
  created_at: string;
}

// ─── Scheduling Settings ────────────────────────────────────────────────────

export interface SchedulingSettings {
  id: string;
  prison_id: string;
  visit_time: number;
  morning_start_time: string;
  morning_end_time: string;
  afternoon_start_time: string;
  afternoon_end_time: string;
  max_visit_per_time: number;
  suitable_days: number[];
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

// ─── Admin Profiles ─────────────────────────────────────────────────────────

export type AdminRole = 'admin' | 'super_admin';

export interface AdminProfile {
  id: string;
  prison_id: string;
  full_name: string;
  role: AdminRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Audit Logs ─────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  prison_id: string | null;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

// ─── API Response Types ─────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ServiceResult<T = void> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: Record<string, string[]>;
}
