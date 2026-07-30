# Supabase schema — consolidated (Single Source of Truth)

The 26 incremental migrations (`00001`–`00026`) were consolidated into the
object-oriented final-schema files below. Each SQL object (table, function,
trigger, policy, index) is now defined **exactly once**, in its final state.
Files are applied in filename order (Supabase CLI applies `supabase/migrations/`
numerically), and the numbering encodes dependency order:

| File | Contains |
|------|----------|
| `00_extensions.sql` | `pgcrypto` extension |
| `01_prisons.sql` | `prisons` table + index |
| `02_admin_profiles.sql` | `admin_profiles` table + indexes |
| `03_inmates.sql` | `inmates` table (final columns/constraints) + indexes |
| `04_visit_registrations.sql` | `visit_registrations` table, indexes, unique-per-day index, realtime publication + `REPLICA IDENTITY FULL` |
| `05_registration_visitors.sql` | `registration_visitors` table + indexes |
| `06_scheduling_settings.sql` | `scheduling_settings` table + index |
| `07_audit_logs.sql` | `audit_logs` table + indexes |
| `08_inmate_relatives.sql` | `inmate_relatives` table, indexes, unique, `fn_check_inmate_relatives_limit` + its trigger |
| `10_functions_util.sql` | `fn_update_timestamp`, `fn_audit_log`, `fn_audit_log_inmate_relatives` |
| `11_functions_auth.sql` | `custom_access_token_hook` + grants + `auth_admin_read_admin_profiles` policy |
| `12_functions_scheduling.sql` | `fn_check_monthly_visit_limit`, `fn_assign_time_slot`, `fn_lookup_inmate_for_registration`, `fn_submit_registration`, `fn_bulk_import_relatives` + grants |
| `13_functions_admin_relatives.sql` | `fn_admin_update_relative`, `fn_admin_delete_relative` (SECURITY DEFINER admin write RPCs) + grants |
| `14_functions_admin_inmates.sql` | `fn_admin_update_inmate`, `fn_admin_soft_delete_inmate` (SECURITY DEFINER admin write RPCs) + grants |
| `20_triggers.sql` | `updated_at` + audit triggers for all tables |
| `30_rls.sql` | `ENABLE ROW LEVEL SECURITY` + all final policies |
| `40_timezone.sql` | Session/role timezone → `Asia/Ho_Chi_Minh` |

> Seed data (`supabase/seed.sql`, `supabase/seed_admin.sql`) is unchanged and
> lives outside this folder.

---

## Consolidation report

### `03_inmates.sql`
- **Sources:** `00003_create_inmates.sql`, `00020_make_date_of_birth_nullable.sql`,
  `00024_add_death_sentence_classification.sql`, `00026_rename_visit_status_available.sql`
- **Reason:** all four edit the `inmates` table. Merged to the final schema.
- **Key changes kept:** `date_of_birth` NULLable; 4-value `classification` CHECK
  (incl. `Người bị kết án tử hình`); `classification_changed_at` column;
  `visit_status` default/CHECK use the renamed value `Được thăm gặp`.
- **Dropped:** one-time backfill `UPDATE`s (classification_changed_at, visit_status).

### `04_visit_registrations.sql`
- **Sources:** `00004_create_visit_registrations.sql`,
  `00019_prevent_duplicate_inmate_visit_per_day.sql`, `00016_enable_realtime.sql`
- **Reason:** table definition + its unique-per-day guard + its realtime setup.
- **Key changes kept:** `uq_vr_inmate_visit_date_active`; realtime publication +
  `REPLICA IDENTITY FULL`.
- **Dropped:** the historical dedup `DELETE` from 00019 (no duplicates exist in a fresh DB).

### `05_registration_visitors.sql`
- **Sources:** `00005_create_registration_visitors.sql`, `00020_make_date_of_birth_nullable.sql`
- **Reason:** table + the nullable-DOB change. Merged to final schema.

### `10_functions_util.sql`
- **Sources:** `00008` (`fn_update_timestamp`), `00013` (`fn_audit_log`),
  `00021` (`fn_audit_log_inmate_relatives`)
- **Reason:** grouped all shared/audit trigger functions in one place.

### `11_functions_auth.sql`
- **Sources:** `00011_setup_auth_hooks_and_seeds.sql`, `00014_grant_auth_hook.sql`
- **Reason:** the hook and the grants/policy that make it work belong together.
  Function name/signature preserved to match `config.toml`.

### `12_functions_scheduling.sql` (most significant consolidation)
- **Sources:** `00009`, `00010`, `00015`, `00018`, `00019`, `00022`, `00023`, `00024`, `00025`
- **Reason:** several functions were rewritten repeatedly; only the final,
  correct version of each is kept:
  - `fn_check_monthly_visit_limit` → **final = 00024** (supersedes 00009, 00015)
  - `fn_assign_time_slot` → **final = 00025** (supersedes 00010, 00015, 00018, 00024;
    00024 had reintroduced the `generate_series`-over-`TIME` bug that 00025 fixed)
  - `fn_submit_registration` → **final = 00024** (supersedes 00015, 00019, 00022)
  - `fn_lookup_inmate_for_registration` → from 00015
  - `fn_bulk_import_relatives` → from 00023
- **Behaviour:** unchanged from the final versions; execution grants preserved.

### `20_triggers.sql`
- **Sources:** `00008` (updated_at triggers), `00013` (audit triggers),
  `00021` (inmate_relatives triggers)
- **Reason:** centralized all table→function trigger wiring. Added
  `DROP TRIGGER IF EXISTS` before each `CREATE` for idempotency.

### `30_rls.sql`
- **Sources:** `00008` (base), `00015` (registration_visitors),
  `00021` (inmate_relatives), `00026` (final `public_inmates_read`)
- **Reason:** all `ENABLE RLS` + policies in one place. `public_inmates_read`
  uses the final value `Được thăm gặp`. Added `DROP POLICY IF EXISTS` before each
  `CREATE POLICY` for idempotency (originals were bare `CREATE`).

### `40_timezone.sql`
- **Source:** `00017_set_timezone.sql` — unchanged.

---

## Removed files

All replaced/merged and now deleted:

| Old file | Fate |
|----------|------|
| `00001`–`00008` | Base tables/triggers/RLS → split into `00`–`08`, `20`, `30` |
| `00009_create_fn_check_monthly_visit_limit` | Superseded by 00024 → `12` |
| `00010_create_fn_assign_time_slot` | Superseded by 00025 → `12` |
| `00011_setup_auth_hooks_and_seeds` | → `11` |
| `00012_verify_composite_indexes` | Redundant re-assert of existing indexes → dropped |
| `00013_create_audit_triggers` | → `10` + `20` |
| `00014_grant_auth_hook` | → `11` |
| `00015_secure_registration_flow` | Function bodies superseded; policy → `30`; lookup fn → `12` |
| `00016_enable_realtime` | → `04` |
| `00017_set_timezone` | → `40` |
| `00018_fix_assign_time_slot_generate_series` | Superseded by 00025 → `12` |
| `00019_prevent_duplicate_inmate_visit_per_day` | Index → `04`; fn superseded by 00024; dedup DELETE dropped |
| `00020_make_date_of_birth_nullable` | Folded into `03` + `05` |
| `00021_create_inmate_relatives` | → `08` (table/limit trigger) + `10` (audit fn) + `20` (triggers) + `30` (policy) |
| `00022_add_relative_check_to_submit_registration` | Superseded by 00024 → `12` |
| `00023_create_fn_bulk_import_relatives` | → `12` |
| `00024_add_death_sentence_classification` | Table part → `03`; fn parts → `12` (assign_time_slot part dropped, superseded by 00025) |
| `00025_fix_assign_time_slot_generate_series_regression` | Final `fn_assign_time_slot` → `12` |
| `00026_rename_visit_status_available` | Column part → `03`; policy → `30`; backfill dropped |

### One-time data operations intentionally omitted
These were only needed to upgrade an existing populated database and are
unnecessary for a fresh schema:
- `00019` — `DELETE` of duplicate same-day registrations.
- `00024` — `UPDATE inmates SET classification_changed_at = created_at`.
- `00026` — `UPDATE inmates SET visit_status = 'Được thăm gặp'`.

> ⚠️ If you must upgrade a **pre-existing** production database that already has
> rows created before these renames, run those three backfill statements once
> before/after applying the consolidated schema.
