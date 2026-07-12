# Rules for Future AI

The AI executing these phases must strictly adhere to the following rules:
* **Never skip phases:** You must implement the roadmap in the exact sequence specified.
* **Never merge phases:** Do not combine multiple phases into a single session. Each phase represents a distinct, atomic unit of work.
* **Never implement future phases:** Focus exclusively on the current phase. Do not add placeholders, mockups, or partial implementations for future features.
* **Never modify unrelated modules:** Only change files that are directly related to the tasks in the current phase.
* **Always follow the roadmap:** Do not deviate from the architecture, technology stack, database schema, or design rules defined in this document and the original project specifications.
* **Always respect dependencies:** Ensure that all prerequisite phases listed for a given phase are fully completed and verified before starting.
* **Always ask for approval before moving to the next phase:** When you finish implementing a phase, summarize:
  1. Completed work
  2. Files created
  3. Files modified
  4. Tests added
  Then stop and explicitly ask the user for permission to proceed to the next phase. Never automatically continue.
* **Treat this roadmap as the single source of truth** unless explicitly overridden by the user.

---

# Implementation Phases

## Phase 01: Project Foundation Scaffolding
### Goal
Initialize the Next.js project with TypeScript, TailwindCSS, and basic configuration files.
### Prerequisites
None
### Inputs
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
- [System Overview](file:///d:/Download/code/docs/01-system-overview.md)
### Tasks
* [ ] Initialize a new Next.js 15 project in the workspace root using TypeScript and App Router.
* [ ] Configure `.eslintrc.json`, `tsconfig.json`, and `.prettierrc` for strict mode and consistent formatting.
* [ ] Configure TailwindCSS in `tailwind.config.ts` and set up standard path aliases (`@/*`) in `tsconfig.json`.
* [ ] Create a `.env.example` file detailing all required environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `NEXT_PUBLIC_APP_URL`).
* [ ] Set up the initial Git repository and define a standard `.gitignore` file.
### Deliverables
* A clean, running Next.js 15 TypeScript project with dev server compiling successfully.
* `.env.example` file and configure linting rules.
### Acceptance Criteria
* Running `npm run dev` builds the page without errors.
* Running `npm run lint` yields no warnings or errors.
### Risks
* Dependency conflicts with Next.js 15. Ensure compatible dependencies are installed.
### Notes
* Avoid adding any layout logic or custom code in this phase.

---

## Phase 02: Folder Structure Scaffolding
### Goal
Scaffold the entire directory structure in the source directory (`src/`) to prepare for modular development.
### Prerequisites
- Phase 01
### Inputs
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Create directories: `src/app/`, `src/actions/`, `src/components/`, `src/hooks/`, `src/lib/`, `src/types/`, and their respective subdirectories.
* [ ] Create placeholder files or empty index files for folders like `src/lib/utils.ts`, `src/lib/constants.ts`, and core route layouts.
* [ ] Create the standard public/private route groups structures: `src/app/(public)/` and `src/app/admin/`.
### Deliverables
* Complete empty directory structure matching the recommended folder layout exactly.
### Acceptance Criteria
* The directory structure is fully created on disk.
* Project successfully compiles with no build issues from empty directories.
### Risks
* None.
### Notes
* Do not write actual logic, just set up folders and empty helper scripts.

---

## Phase 03: Database Setup - Prisons and Admin Profiles
### Goal
Create the core schema tables `prisons` and `admin_profiles` in PostgreSQL via migrations.
### Prerequisites
- Phase 02
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [ERD](file:///d:/Download/code/diagrams/erd.md)
### Tasks
* [ ] Create a local `supabase/migrations/` folder.
* [ ] Create migration `00001_create_prisons.sql` defining the `prisons` table (UUID, name, code, address, phone, is_active, created_at, updated_at).
* [ ] Create migration `00002_create_admin_profiles.sql` defining the `admin_profiles` table (id PK referencing auth.users, prison_id FK, full_name, role, is_active, timestamps).
* [ ] Add unique constraints on `prisons.code` and CHECK constraints on `admin_profiles.role` ('admin', 'super_admin').
### Deliverables
* Migrations `00001` and `00002` ready to run.
### Acceptance Criteria
* SQL files run without errors on a PostgreSQL database.
* Constraints are correctly applied.
### Risks
* Potential foreign key mismatches on `auth.users` depending on Supabase CLI settings.
### Notes
* Maintain all constraints strictly.

---

## Phase 04: Database Setup - Inmates Table
### Goal
Create the `inmates` table with all corresponding indexes and soft-delete features.
### Prerequisites
- Phase 03
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [Business Rules](file:///d:/Download/code/docs/03-business-rules.md)
### Tasks
* [ ] Create migration `00003_create_inmates.sql` for the `inmates` table.
* [ ] Include fields: `id`, `prison_id`, `prison_number`, `full_name`, `date_of_birth`, `citizen_id`, `permanent_address`, `criminal_offense`, `arrest_date`, `admission_date`, `classification`, `visit_status`, created/updated logs, and `deleted_at`.
* [ ] Add constraint `UNIQUE(prison_id, prison_number) WHERE deleted_at IS NULL`.
* [ ] Add CHECK constraints for `classification` ('Người bị tạm giữ', 'Người bị tạm giam', 'Phạm nhân') and `visit_status` ('Có thể thăm gặp', 'Hạn chế thăm gặp').
* [ ] Create indexes: B-tree on `deleted_at` and `classification`, and unique index on `(prison_id, prison_number)`.
### Deliverables
* Migration file `00003_create_inmates.sql`.
### Acceptance Criteria
* Migration applies cleanly.
* Validates classification and status strings correctly via PostgreSQL constraints.
### Risks
* Handling case-insensitive match rules; this is handled in SQL layer when querying, keep columns simple.
### Notes
* Ensure all constraints are strictly aligned with business requirements.

---

## Phase 05: Database Setup - Visit Registrations and Visitors
### Goal
Create tables for tracking registrations and visitor details.
### Prerequisites
- Phase 04
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [ERD](file:///d:/Download/code/diagrams/erd.md)
### Tasks
* [ ] Create migration `00004_create_visit_registrations.sql` for `visit_registrations` (id, prison_id, inmate_id, visit_date, time_slot_start, time_slot_end, status, notes, timestamps).
* [ ] Create migration `00005_create_registration_visitors.sql` for `registration_visitors` (id, registration_id, full_name, date_of_birth, citizen_id, relationship, display_order, created_at).
* [ ] Add check constraints on `visit_registrations.status` ('confirmed', 'completed', 'no_show') and time duration boundaries.
* [ ] Add check constraint on `registration_visitors.display_order` (between 1 and 3).
* [ ] Create composite index `idx_vr_scheduling` on `(prison_id, visit_date, time_slot_start, status)`.
* [ ] Create index `idx_vr_inmate_month` on `(inmate_id, visit_date, status)`.
### Deliverables
* Migration files `00004` and `00005`.
### Acceptance Criteria
* Tables successfully created with composite indexes verified.
### Risks
* None.
### Notes
* Double-check composite indexes as they are critical for scheduling efficiency.

---

## Phase 06: Database Setup - Settings and Audit Logs
### Goal
Create configurations and logging tables to handle scheduling settings and audit histories.
### Prerequisites
- Phase 05
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
### Tasks
* [ ] Create migration `00006_create_scheduling_settings.sql` for `scheduling_settings` (id, prison_id UNIQUE, visit_time, morning_start_time, morning_end_time, afternoon_start_time, afternoon_end_time, max_visit_per_time, suitable_days, timestamps).
* [ ] Add check constraints on `scheduling_settings` fields (visit_time between 10 and 120, max_visit_per_time between 1 and 10, time ordering).
* [ ] Create migration `00007_create_audit_logs.sql` for `audit_logs` (id, prison_id, user_id, action, table_name, record_id, old_values, new_values, ip_address, created_at).
* [ ] Add indexes on `audit_logs` for chronological searching and table lookups.
### Deliverables
* Migration files `00006` and `00007`.
### Acceptance Criteria
* Migrations apply successfully.
* All settings limits constraints function as expected.
### Risks
* Config table uniqueness on `prison_id` must be guaranteed.
### Notes
* `suitable_days` is an array of integers `INTEGER[]`. Ensure proper DB initialization.

---

## Phase 07: Database Setup - Triggers and Row Level Security
### Goal
Enforce security policies at the database level and automate updated timestamps.
### Prerequisites
- Phase 06
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [Security](file:///d:/Download/code/docs/12-security.md)
### Tasks
* [ ] Create trigger function `fn_update_timestamp` to automatically set `updated_at = now()`.
* [ ] Apply triggers to all mutable tables: `prisons`, `inmates`, `visit_registrations`, `scheduling_settings`, `admin_profiles`.
* [ ] Enable Row Level Security (RLS) on all tables.
* [ ] Write policy definitions for admins (access to records matching their `prison_id`) and anonymous users (select on settings/active inmates, insert on registrations).
### Deliverables
* Migration file `00008_create_triggers_and_rls.sql`.
### Acceptance Criteria
* Triggers successfully update timestamps on updates.
* RLS policies restrict raw read/write access based on role.
### Risks
* Faulty RLS configurations might lock out legitimate admin requests. Verify roles thoroughly.
### Notes
* Use `auth.jwt() ->> 'prison_id'` in policies.

---

## Phase 08: Database Setup - Limit Verification Function
### Goal
Implement SQL database verification for monthly visit limits.
### Prerequisites
- Phase 07
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [Scheduling Algorithm](file:///d:/Download/code/docs/08-scheduling-algorithm.md)
### Tasks
* [ ] Create database function `fn_check_monthly_visit_limit(p_inmate_id UUID, p_visit_date DATE)` returning `BOOLEAN`.
* [ ] Query `visit_registrations` to count existing confirmed, completed, or no-show entries for the given inmate within the calendar month of `p_visit_date`.
* [ ] Fetch limit configuration based on classification ('Người bị tạm giữ': 2, others: 1).
* [ ] Return `TRUE` if current count is less than maximum allowed, else `FALSE`.
### Deliverables
* Migration `00009_create_fn_check_monthly_visit_limit.sql`.
### Acceptance Criteria
* Running query tests directly on SQL returns correct limit flags for simulated users.
### Risks
* Time zone boundary discrepancies at the beginning/end of the month. Use UTC dates consistently.
### Notes
* None.

---

## Phase 09: Database Setup - Time Slot Assignment Function
### Goal
Implement a concurrent-safe, database-level time slot allocation query using advisory locks.
### Prerequisites
- Phase 08
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [Scheduling Algorithm](file:///d:/Download/code/docs/08-scheduling-algorithm.md)
### Tasks
* [ ] Create database function `fn_assign_time_slot(p_prison_id UUID, p_visit_date DATE, p_inmate_id UUID)` returning `TABLE(slot_start TIME, slot_end TIME)`.
* [ ] Acquire a PostgreSQL advisory lock on the hash of `(p_prison_id, p_visit_date)`: `pg_advisory_xact_lock(hashtext(p_prison_id::text || p_visit_date::text))`.
* [ ] Check monthly limits using `fn_check_monthly_visit_limit`. If exceeded, fail slot allocation.
* [ ] Generate time slot ranges dynamically using `scheduling_settings` values.
* [ ] Query existing registrations occupancy for that date grouped by `time_slot_start`.
* [ ] Assign the first slot that has capacity left (i.e. `slot_count < max_visit_per_time`).
* [ ] If no slot is available, return NULL/empty table.
### Deliverables
* Migration `00010_create_fn_assign_time_slot.sql`.
### Acceptance Criteria
* Slot allocator assigns first available slots consecutively and prevents overbooking when simulating parallel allocations.
### Risks
* Lock contention under heavy traffic. Keep lock scope brief and execute quickly inside transactions.
### Notes
* Re-study the advisory lock hashing function to ensure zero hash collision risk.

---

## Phase 10: Authentication - Custom Claims & User Seeds
### Goal
Create token hooks for Custom claims in JWT for roles and associate seeds.
### Prerequisites
- Phase 09
### Inputs
- [Authentication](file:///d:/Download/code/docs/07-authentication.md)
- [Security](file:///d:/Download/code/docs/12-security.md)
### Tasks
* [ ] Define Supabase token hook SQL `custom_access_token_hook(event jsonb)` to add `app_role` and `prison_id` to JWT from `admin_profiles`.
* [ ] Set up default seeds: default prison record, default settings (`max_visit_per_time = 2`, `suitable_days = '{4,5}'`), and script structure for admin insertion.
* [ ] Test token claims function locally.
### Deliverables
* Migration file `00011_setup_auth_hooks_and_seeds.sql` and `supabase/seed.sql`.
### Acceptance Criteria
* Hook applies cleanly and returns the expected claim parameters.
### Risks
* Modifying default claims requires proper trigger permissions in the auth schema.
### Notes
* None.

---

## Phase 11: Authentication - Middleware & Server Actions
### Goal
Implement server-side authentication helpers, session validation middleware, and auth Server Actions.
### Prerequisites
- Phase 10
### Inputs
- [Authentication](file:///d:/Download/code/docs/07-authentication.md)
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Install `@supabase/ssr` and configure client/server supabase SDK initializers in `src/lib/supabase/`.
* [ ] Create Server Actions `login` and `logout` in `src/actions/auth.ts`.
* [ ] Create middleware logic in `src/middleware.ts` to protect `/admin/*` routes (redirect unauthenticated to `/admin/login`).
* [ ] In middleware, verify that the logged-in user has active status and the role `admin` or `super_admin`.
### Deliverables
* `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/middleware.ts`.
* `src/middleware.ts`.
* `src/actions/auth.ts`.
### Acceptance Criteria
* Unauthenticated navigation to `/admin` redirects cleanly to `/admin/login`.
* Session is parsed correctly from HTTP-only cookies.
### Risks
* Incompatibilities between `@supabase/ssr` cookies and Next.js middleware header mutations. Follow Supabase official middleware guide exactly.
### Notes
* Never expose the service role key to the client.

---

## Phase 12: Core Backend - Inmate Service
### Goal
Implement the business logic service class for managing inmate records.
### Prerequisites
- Phase 11
### Inputs
- [Business Rules](file:///d:/Download/code/docs/03-business-rules.md)
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Create `src/lib/services/inmates.ts`.
* [ ] Implement `getInmateById`, `listInmates` (handling search, filter, pagination, soft-deleted filter).
* [ ] Implement `createInmate`, `updateInmate`, and `deleteInmate` (soft-delete by setting `deleted_at = now()`).
* [ ] Enforce unique `prison_number` constraint handling and block soft-deletion if future confirmed registrations exist.
* [ ] Create Server Actions in `src/actions/inmates.ts` mapping to these service routines.
### Deliverables
* `src/lib/services/inmates.ts`.
* `src/actions/inmates.ts`.
### Acceptance Criteria
* CRUD operations modify database records and enforce validation rules.
* Soft-deleted inmates are correctly omitted from default list lookups.
### Risks
* Race conditions when deleting inmates with future visits. Perform query check inside the deletion transaction.
### Notes
* None.

---

## Phase 13: Core Backend - Scheduling Settings Service
### Goal
Implement business service to fetch and update configurations.
### Prerequisites
- Phase 12
### Inputs
- [Business Rules](file:///d:/Download/code/docs/03-business-rules.md)
- [Validation Rules](file:///d:/Download/code/docs/09-validation-rules.md)
### Tasks
* [ ] Create Zod schema for settings validation in `src/lib/validations/settings.ts`.
* [ ] Implement service class `src/lib/services/settings.ts`.
* [ ] Add method `getSettings(prisonId)` and `updateSettings(prisonId, data)`.
* [ ] Implement validation checks: morning session must end before afternoon start, positive integer validations.
* [ ] Create Server Action `updateSchedulingSettings` in `src/actions/settings.ts`.
### Deliverables
* `src/lib/validations/settings.ts`.
* `src/lib/services/settings.ts`.
* `src/actions/settings.ts`.
### Acceptance Criteria
* Saving settings checks constraints (e.g. morning ends by 11:30 and afternoon starts at 13:30) and writes to DB correctly.
### Risks
* Misconfigured settings can break the time slot generator algorithm.
### Notes
* None.

---

## Phase 14: Core Backend - Registration & Scheduling Service
### Goal
Implement the core scheduling workflow coordinator on the server.
### Prerequisites
- Phase 13
### Inputs
- [Scheduling Algorithm](file:///d:/Download/code/docs/08-scheduling-algorithm.md)
- [Validation Rules](file:///d:/Download/code/docs/09-validation-rules.md)
### Tasks
* [ ] Create Zod schemas for registration validation in `src/lib/validations/registration.ts` (1-3 visitors details, date validations).
* [ ] Create `src/lib/services/scheduling.ts` containing the coordinator logic.
* [ ] Implement visitor form validations: verify inmate exists, check classification, DOB matches system database record, check inmate `visit_status = 'Có thể thăm gặp'`.
* [ ] Call RPC function `fn_assign_time_slot` to run slot allocation.
* [ ] Create Server Actions `submitRegistration` and `updateRegistrationStatus` in `src/actions/registration.ts` and `src/actions/registrations.ts`.
### Deliverables
* Zod schemas, scheduling services, and status update Server Actions.
### Acceptance Criteria
* Submitting registrations validates inputs, crosses information against simulated database inmates, and schedules a time slot correctly.
### Risks
* Multi-visitor registration inserts must be fully transactional. If one insert fails, roll back the whole operation.
### Notes
* Keep user-friendly error messages in Vietnamese as defined in business rules.

---

## Phase 15: APIs - Public & Admin GET Handlers
### Goal
Create REST Route Handlers for standard read APIs.
### Prerequisites
- Phase 14
### Inputs
- [API Design](file:///d:/Download/code/docs/06-api-design.md)
### Tasks
* [ ] Implement `src/app/api/v1/settings/public/route.ts` returning allowed suitable days and guidelines notices in Vietnamese.
* [ ] Implement `src/app/api/v1/admin/registrations/route.ts` supporting paginated query filtering by status and date.
* [ ] Implement `src/app/api/v1/admin/inmates/route.ts` listing all inmate records.
* [ ] Apply authorization guards inside the `/api/v1/admin/*` handlers using Supabase server client.
### Deliverables
* REST GET Route Handlers.
### Acceptance Criteria
* Fetching public settings returns JSON matching the contract in API Design.
* Admin route requests without a valid session return `401 Unauthorized`.
### Risks
* Exposed admin data via poorly protected route headers. Verify session middleware works on API groups.
### Notes
* None.

---

## Phase 16: APIs - Inmate Excel Import Route
### Goal
Create a Route Handler to handle Excel spreadsheets processing for bulk inmate imports.
### Prerequisites
- Phase 15
### Inputs
- [API Design](file:///d:/Download/code/docs/06-api-design.md)
- [Validation Rules](file:///d:/Download/code/docs/09-validation-rules.md)
### Tasks
* [ ] Install spreadsheet processing library (like `xlsx` or `exceljs`).
* [ ] Implement Route Handler `src/app/api/v1/admin/inmates/import/route.ts`.
* [ ] Parse `multipart/form-data` file upload, enforcing validation (max 5MB, `.xlsx` format, max 5000 rows).
* [ ] Validate each row against the inmate validation schemas.
* [ ] Insert valid records in chunks; collect skipped rows and errors to return in standard JSON report payload.
### Deliverables
* Inmate Excel import route handler.
### Acceptance Criteria
* Uploading invalid files returns `400` errors.
* Processing valid Excel adds inmates to DB and reports skipped rows cleanly.
### Risks
* Memory spikes when parsing large sheets. Limit row sizes and read streams carefully.
### Notes
* None.

---

## Phase 17: APIs - Excel Export Route Handlers
### Goal
Create Excel generation routes for lists of inmates and registrations.
### Prerequisites
- Phase 16
### Inputs
- [API Design](file:///d:/Download/code/docs/06-api-design.md)
### Tasks
* [ ] Create Excel export helper in `src/lib/services/export.ts` using `exceljs` / similar library.
* [ ] Implement Route Handler `/api/v1/admin/inmates/export` converting inmate table details to a spreadsheet.
* [ ] Implement Route Handler `/api/v1/admin/registrations/export` filtering by request query and returning Excel sheet.
* [ ] Configure response headers for file attachment downloads.
### Deliverables
* Export Excel route handlers.
### Acceptance Criteria
* Triggering routes downloads a valid `.xlsx` file containing the requested database table rows.
### Risks
* Large registration tables (>10k rows) can time out. Use pagination limits or streams if required.
### Notes
* None.

---

## Phase 18: APIs - PDF & Word Export Route Handlers
### Goal
Create document generators for single registration slips.
### Prerequisites
- Phase 17
### Inputs
- [API Design](file:///d:/Download/code/docs/06-api-design.md)
### Tasks
* [ ] Install PDF/Word generation libraries (such as `pdfmake`, `@react-pdf/renderer`, or `docx`).
* [ ] Design a clean, printable layout template in Vietnamese.
* [ ] Implement Route Handler `/api/v1/admin/registrations/[id]/pdf` generating a PDF slip.
* [ ] Implement Route Handler `/api/v1/admin/registrations/[id]/docx` generating a Word document.
### Deliverables
* Document generator route handlers.
### Acceptance Criteria
* Requesting endpoints downloads a clean, readable PDF or Word document containing inmate and visitor details.
### Risks
* Unicode character issues with Vietnamese diacritics in PDF generators. Ensure appropriate fonts (e.g., Roboto/Inter) are loaded.
### Notes
* None.

---

## Phase 19: Testing - Backend Unit Tests
### Goal
Verify the backend core logic, Zod validation models, and database functions.
### Prerequisites
- Phase 18
### Inputs
- [Scheduling Algorithm](file:///d:/Download/code/docs/08-scheduling-algorithm.md)
- [Validation Rules](file:///d:/Download/code/docs/09-validation-rules.md)
### Tasks
* [ ] Install `jest` or Vitest test runner.
* [ ] Write unit tests for the Zod validators (`src/lib/validations/*`).
* [ ] Write mock test cases for the Scheduling coordinator service.
* [ ] Write database seeding unit scripts to exercise the concurrent locks and slot generation functions.
### Deliverables
* Test suites in `tests/unit/`.
### Acceptance Criteria
* Running `npm run test` executes tests and matches all target assertions (>90% coverage on core logic).
### Risks
* Test database isolation issues. Run tests against a clean mock DB schema.
### Notes
* None.

---

## Phase 20: Frontend Foundation & Global Styles
### Goal
Set up global style sheets, Tailwind CSS configurations, and font fallbacks.
### Prerequisites
- Phase 19
### Inputs
- [Frontend Design](file:///d:/Download/code/docs/15-frontend-design.md)
### Tasks
* [ ] Import Google Fonts: **Inter** (as primary substitute for Helvetica Now / Futura ND).
* [ ] Define the design color tokens inside `tailwind.config.ts` using HSL variables or exact hex values (Ink, Soft Cloud, Canvas, Mute, Sale, Success).
* [ ] Configure global styles inside `src/app/globals.css` with Tailwind directives.
* [ ] Create the base root layout `src/app/layout.tsx`.
### Deliverables
* Configured `tailwind.config.ts` and global CSS tokens.
* Root base layout.
### Acceptance Criteria
* Custom classes (e.g., `bg-soft-cloud`, `text-ink`) apply styling cleanly.
* Font variables render correct fallbacks.
### Risks
* None.
### Notes
* Strictly adhere to the typography tokens in the design documentation.

---

## Phase 21: UI Components - shadcn/ui Scaffolding
### Goal
Install and configure shadcn/ui components required for the forms and tables.
### Prerequisites
- Phase 20
### Inputs
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
- [Frontend Design](file:///d:/Download/code/docs/15-frontend-design.md)
### Tasks
* [ ] Initialize shadcn/ui CLI configuration using `components.json`.
* [ ] Install components: `button`, `input`, `select`, `table`, `dialog`, `toast`, `calendar`, `form`, `tabs`.
* [ ] Adjust default radii in shadcn config to match design specs (button radius: full/30px, card radius: 0px).
### Deliverables
* Scaffolding component source files in `src/components/ui/`.
### Acceptance Criteria
* Running shadcn components render styles consistent with the design specification guidelines.
### Risks
* Theme overrides might get overwritten. Keep customized Tailwind variables in `globals.css` separate.
### Notes
* None.

---

## Phase 22: UI Components - Shared Utilities
### Goal
Build shared custom layout elements like spinners, modals, and file upload fields.
### Prerequisites
- Phase 21
### Inputs
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Create `LoadingSpinner` in `src/components/shared/loading-spinner.tsx`.
* [ ] Create `ErrorMessage` in `src/components/shared/error-message.tsx`.
* [ ] Create `ConfirmDialog` in `src/components/shared/confirm-dialog.tsx`.
* [ ] Create a styled drag-and-drop `FileUpload` handler in `src/components/shared/file-upload.tsx` restricting format to `.xlsx`.
### Deliverables
* Shared helper component source files.
### Acceptance Criteria
* Dropzone components correctly reject files that are not `.xlsx` and display localized error feedback.
### Risks
* File uploads require clean error handling for oversized files.
### Notes
* None.

---

## Phase 23: UI Components - Admin Dashboard Shell
### Goal
Create layout wrappers, side navigation panels, and primary headers for administrators.
### Prerequisites
- Phase 22
### Inputs
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
- [Frontend Design](file:///d:/Download/code/docs/15-frontend-design.md)
### Tasks
* [ ] Create `AdminSidebar` component featuring links for Visit list (Tab 1), Settings (Tab 2), and Inmates (Tab 3).
* [ ] Create `AdminHeader` displaying the logo, title, and current logged-in user profile with a logout button.
* [ ] Assemble `AdminLayout` wrapper component in `src/app/admin/layout.tsx`.
### Deliverables
* Admin navigation components and dashboard layout shell.
### Acceptance Criteria
* Renders sidebar and main content section accurately on desktop layout viewports.
### Risks
* Navigation responsive clipping. Collapse sidebar to hamburger overlays on smaller viewports.
### Notes
* Use clean pill-shaped styling and strict grayscale tones for the shell UI.

---

## Phase 24: UI Components - Visitor Portal Shell
### Goal
Create the layout wrapper and headers for the public website.
### Prerequisites
- Phase 23
### Inputs
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
- [Frontend Design](file:///d:/Download/code/docs/15-frontend-design.md)
### Tasks
* [ ] Create public header with official logo and center title alignment.
* [ ] Create public footer displaying Vietnamese contact details and scheduling notes.
* [ ] Create the layout wrapper in `src/app/(public)/layout.tsx`.
### Deliverables
* Public layout shell.
### Acceptance Criteria
* Responsive rendering from 320px screens upwards.
### Risks
* None.
### Notes
* Apply the pure white background (`bg-canvas`) and typography guidelines.

---

## Phase 25: UI Components - Public Registration Form UI
### Goal
Build the registration form interface without live backend integrations.
### Prerequisites
- Phase 24
### Inputs
- [Visitor Flow](file:///d:/Download/code/diagrams/visitor-flow.md)
- [Frontend Design](file:///d:/Download/code/docs/15-frontend-design.md)
### Tasks
* [ ] Create the main registration page layout (`src/app/(public)/page.tsx`).
* [ ] Build dynamic Visitor sections matching Zod validation schema (supporting addition up to 3 visitors, inline validations).
* [ ] Build Inmate input sections (Prison number, full name, DOB, Classification selection).
* [ ] Build Calendar date picker allowing only configurable allowed days in the future.
* [ ] Render dynamic notice guidelines.
### Deliverables
* Static public registration form components.
### Acceptance Criteria
* Form sections toggle, dynamically validate fields (e.g. CCCD exact length), and restrict date picker choices correctly.
### Risks
* Complex form states. Use `react-hook-form` to track nesting arrays cleanly.
### Notes
* Keep all UI text and warning states in Vietnamese.

---

## Phase 26: UI Components - Admin Inmate Management UI
### Goal
Build the inmate records administration view, including tables and dialog boxes.
### Prerequisites
- Phase 25
### Inputs
- [Admin Flow](file:///d:/Download/code/diagrams/admin-flow.md)
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Build paginated DataTable component featuring columns for Prison number, full name, DOB, Classification, and visit status.
* [ ] Create Inmate details edit modal and new inmate insertion form modal.
* [ ] Create soft-delete confirmation dialog component.
* [ ] Add search bar and filtering dropdowns for classification.
### Deliverables
* Inmate listing components.
### Acceptance Criteria
* Modal forms validate fields correctly and pagination controls respond on screen size shifts.
### Risks
* Heavy tables. Ensure virtual lists or proper paging triggers are implemented.
### Notes
* None.

---

## Phase 27: UI Components - Admin Settings UI
### Goal
Build the scheduling parameter configuration page controls.
### Prerequisites
- Phase 26
### Inputs
- [Admin Flow](file:///d:/Download/code/diagrams/admin-flow.md)
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Create settings form component layout (`src/app/admin/settings/page.tsx`).
* [ ] Implement time picker inputs for morning and afternoon ranges.
* [ ] Build a multi-select day checkbox selector for allowed suitable days.
* [ ] Include input fields for max visits and visit durations.
* [ ] Set up interactive previews showing expected slots count generated per day based on settings inputs.
### Deliverables
* Static settings page and preview controls.
### Acceptance Criteria
* Form inputs validate constraints locally and accurately estimate slot count projections.
### Risks
* Time string conversions. Keep consistent HH:mm formats.
### Notes
* None.

---

## Phase 28: UI Components - Admin Registration UI
### Goal
Build the registration list tracking page.
### Prerequisites
- Phase 27
### Inputs
- [Admin Flow](file:///d:/Download/code/diagrams/admin-flow.md)
- [Folder Structure](file:///d:/Download/code/docs/11-folder-structure.md)
### Tasks
* [ ] Build registration tracking table displaying: No., Visitor, Inmate, Date, Assigned Time, and status.
* [ ] Implement search bar, filter tabs by status, and custom date range calendar picker.
* [ ] Create sliding Drawer or modal component showing full registration and visitor group details.
* [ ] Add PDF, Word, and Excel export control triggers.
### Deliverables
* Registration dashboard page layout.
### Acceptance Criteria
* Layout supports navigation filters, displays drawers upon row click, and structures details fields nicely.
### Risks
* Displaying multiple visitors per registration in small table rows. Use badge counters or list view inside the detail drawer.
### Notes
* None.

---

## Phase 29: Integration - Public Registration Form
### Goal
Integrate the public visitor portal form with the backend Server Action.
### Prerequisites
- Phase 28
### Inputs
- [Visitor Flow](file:///d:/Download/code/diagrams/visitor-flow.md)
- [Validation Rules](file:///d:/Download/code/docs/09-validation-rules.md)
### Tasks
* [ ] Connect form submission to the `submitRegistration` Server Action.
* [ ] Hook up client-side Zod errors to show up inline next to respective inputs.
* [ ] Fetch public allowed days from `/api/v1/settings/public` on mount to customize calendar picker options dynamically.
* [ ] Build the registration confirmation page displaying assigned slot information on success.
* [ ] Render appropriate Vietnamese error messages for business rule exceptions (e.g. overbooked inmate limits).
### Deliverables
* Fully functional visitor registration page and success flow.
### Acceptance Criteria
* Submitting forms schedules valid time slots in the database and redirects users to details page.
### Risks
* Latency during database lock validation. Display loading spinner overlays on click.
### Notes
* None.

---

## Phase 30: Integration - Admin Login & Session Routing
### Goal
Hook up authentication forms and authorization routing middleware.
### Prerequisites
- Phase 29
### Inputs
- [Authentication Flow](file:///d:/Download/code/diagrams/authentication-flow.md)
- [Authentication](file:///d:/Download/code/docs/07-authentication.md)
### Tasks
* [ ] Connect `src/app/admin/login/page.tsx` form inputs to login server action.
* [ ] Handle validation errors and invalid credential prompts.
* [ ] Ensure middleware routes authenticated admins directly to `/admin` dashboard.
* [ ] Wire up logout actions on the header navigation.
### Deliverables
* Working authentication routing paths.
### Acceptance Criteria
* Logging in stores credentials, redirects to administrative dashboard, and logging out clears cookie sessions correctly.
### Risks
* Token expiry handling. Ensure middleware refreshes JWT tokens automatically.
### Notes
* None.

---

## Phase 31: Integration - Inmate Management CRUD
### Goal
Connect inmate listing pages and modals to Server Actions and Excel routes.
### Prerequisites
- Phase 30
### Inputs
- [Admin Flow](file:///d:/Download/code/diagrams/admin-flow.md)
- [Validation Rules](file:///d:/Download/code/docs/09-validation-rules.md)
### Tasks
* [ ] Connect DataTable to fetch data from `/api/v1/admin/inmates` including pagination and filter states.
* [ ] Integrate create and edit modal inputs with respective service Server Actions.
* [ ] Connect file dropzones to the Excel import route handler, displaying progress bar and localized feedback alerts.
* [ ] Bind download triggers to Excel export URLs.
### Deliverables
* Live inmate admin controller workflow.
### Acceptance Criteria
* Adding, editing, and uploading Excel schedules updates the DB table rows immediately.
### Risks
* Bulk imports timeout on large datasets. Test with files of up to 1000 rows.
### Notes
* None.

---

## Phase 32: Integration - Scheduling Settings Manager
### Goal
Connect configuration panels to update database settings dynamically.
### Prerequisites
- Phase 31
### Inputs
- [Admin Flow](file:///d:/Download/code/diagrams/admin-flow.md)
- [Business Rules](file:///d:/Download/code/docs/03-business-rules.md)
### Tasks
* [ ] Bind form submit actions to `updateSchedulingSettings` server action.
* [ ] Display validation response errors inline.
* [ ] Verify updates take effect instantly by refreshing public allowed days.
### Deliverables
* Live scheduling configurations UI.
### Acceptance Criteria
* Changing settings updates public form notice warnings and disables newly invalid days in date pickers immediately.
### Risks
* Invalid time entries could conflict with existing schedules. Keep existing slots immutable.
### Notes
* None.

---

## Phase 33: Integration - Admin Registrations Table
### Goal
Bind registrations list tables to backend API data and enable real-time socket events.
### Prerequisites
- Phase 32
### Inputs
- [Sequence Diagram](file:///d:/Download/code/diagrams/sequence-diagram.md)
- [Admin Flow](file:///d:/Download/code/diagrams/admin-flow.md)
### Tasks
* [ ] Connect Table to retrieve data from `/api/v1/admin/registrations`.
* [ ] Set up real-time websocket subscription using Supabase client to listen to database insertions and status updates on `visit_registrations`.
* [ ] Automatically prepend incoming records to the dashboard listing with a visual highlight effect.
* [ ] Bind status transition button handlers (Mark Completed / Mark No Show) to Server Actions.
### Deliverables
* Real-time registration administrative console table view.
### Acceptance Criteria
* Submitting a registration on the public side inserts a row on the admin list instantly without reloading.
### Risks
* Parallel edits. Enforce optimistic locks or refresh row values during socket callbacks.
### Notes
* None.

---

## Phase 34: Integration - Export SLips Download
### Goal
Hook up export buttons to generate and download PDFs, Word sheets, and Excel lists.
### Prerequisites
- Phase 33
### Inputs
- [Sequence Diagram](file:///d:/Download/code/diagrams/sequence-diagram.md)
### Tasks
* [ ] Connect "Export Excel" buttons in the registrations table to call export APIs.
* [ ] Connect PDF and DOCX download action triggers in the registration details drawer.
* [ ] Ensure all download requests pass auth cookies successfully.
### Deliverables
* Integrated document export triggers.
### Acceptance Criteria
* Clicking buttons downloads files immediately containing accurate data matching the corresponding record context.
### Risks
* File download request blocks on CORS issues. Use local relative API routes.
### Notes
* None.

---

## Phase 35: Testing - End-to-End Tests
### Goal
Verify the full client-server workflows using automated integration tests.
### Prerequisites
- Phase 34
### Inputs
- [Requirements](file:///d:/Download/code/docs/02-requirements.md)
### Tasks
* [ ] Set up Playwright or Cypress testing tool frameworks.
* [ ] Write E2E test covering public registrations: select future day, enter mock inmate data, verify assigned slot results, verify validation error handling.
* [ ] Write E2E test covering Admin dashboard: login, view list, search/filter table, modify settings, perform Excel imports/exports, verify updates.
### Deliverables
* E2E automated test suites in `tests/e2e/`.
### Acceptance Criteria
* Running tests locally executes without errors and passes all checklist assertions.
### Risks
* Flaky socket tests. Include reasonable timeouts for WebSocket event validations.
### Notes
* None.

---

## Phase 36: Performance Optimization - Caching
### Goal
Improve page speeds and optimize data fetching queries.
### Prerequisites
- Phase 35
### Inputs
- [System Architecture](file:///d:/Download/code/docs/04-system-architecture.md)
### Tasks
* [ ] Wrap scheduling settings fetch calls in Next.js `unstable_cache` helper.
* [ ] Set up cache invalidation triggers on settings modifications.
* [ ] Add indexes validation checkup to ensure queries leverage composite database indexes correctly.
* [ ] Run performance audit (Lighthouse) and resolve critical speed bottlenecks.
### Deliverables
* Optimizations, indexes validation, caching helpers.
### Acceptance Criteria
* Public pages load in less than 2 seconds.
* Dashboard updates happen with under 500ms API query times.
### Risks
* Stale cache. Ensure revalidation tags match update actions exactly.
### Notes
* None.

---

## Phase 37: Security - Edge Rate Limits & Headers
### Goal
Apply edge-level rate limits on public submit APIs and secure HTTP headers.
### Prerequisites
- Phase 36
### Inputs
- [Security](file:///d:/Download/code/docs/12-security.md)
### Tasks
* [ ] Configure HTTP security headers in `next.config.ts` (CSP, HSTS, Frame options, etc.).
* [ ] Implement rate limiting middleware restricting visitor registration submissions (max 10 submissions per minute per IP).
* [ ] Verify file upload security logic: validate MIME types and check file signature sizes.
### Deliverables
* Rate limiters, security configuration files.
### Acceptance Criteria
* Rapid submissions trigger HTTP `429 Too Many Requests` responses with localized warning notifications.
* Headers are verified compliant by web security scanners.
### Risks
* Overly strict CSP headers may block Supabase realtime WebSocket connections.
### Notes
* None.

---

## Phase 38: Deployment - Vercel & Production Setup
### Goal
Deploy the completed application codebase to Vercel and production databases.
### Prerequisites
- Phase 37
### Inputs
- [Deployment](file:///d:/Download/code/docs/13-deployment.md)
### Tasks
* [ ] Link repository to Vercel project deployment pipeline.
* [ ] Initialize a production project in Supabase in Singapore region.
* [ ] Push database migrations using Supabase CLI.
* [ ] Configure environment variables in Vercel settings dashboard.
* [ ] Seed the production database default values and create primary admin login profiles.
### Deliverables
* Live URL and running production database schema.
### Acceptance Criteria
* Public forms load, admin login operates, and registrations are confirmed.
### Risks
* Deployment environment variable mismatches. Double-check keys before deploying.
### Notes
* Ensure custom domains are configured and SSL certificates are provisioned correctly.

---

## Phase 39: Integration - Audit Log Actions
### Goal
Track administrative mutations inside database records through the audit log table.
### Prerequisites
- Phase 38
### Inputs
- [Database Design](file:///d:/Download/code/docs/05-database-design.md)
- [Security](file:///d:/Download/code/docs/12-security.md)
### Tasks
* [ ] Implement triggers on `inmates`, `visit_registrations`, and `scheduling_settings` to log INSERT, UPDATE, and DELETE changes to the `audit_logs` table.
* [ ] Alternatively, integrate explicit audit logging inside core Server Actions mapping old and new JSON payloads.
* [ ] Perform administrative database updates and verify audit log updates.
### Deliverables
* Operational audit trails.
### Acceptance Criteria
* Changes on settings or inmate details generate corresponding rows in `audit_logs`.
### Risks
* Trigger errors can roll back successful updates. Make sure trigger functions are extremely robust.
### Notes
* None.

---

## Phase 40: Final Polish & Hand-off
### Goal
Perform final system tests, resolve minor visual issues, and deliver the final codebase.
### Prerequisites
- Phase 39
### Inputs
- [Future Improvements](file:///d:/Download/code/docs/14-future-improvements.md)
### Tasks
* [ ] Resolve styling issues, ensuring strict compliance with font rules and layout metrics.
* [ ] Validate accessibility (WCAG AA check).
* [ ] Perform end-to-end check of the live staging/production deployment.
* [ ] Document manual verification workflows for subsequent deployment runs.
### Deliverables
* Final verified production site deployment.
### Acceptance Criteria
* The application runs flawlessly on multiple browsers (Chrome, Safari, Firefox, Edge) and mobile devices.
### Risks
* None.
### Notes
* Celebrate completion of the system.
