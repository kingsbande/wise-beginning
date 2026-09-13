# Academy School Management System — Project Map & Architecture Guide

> **Quick Reference Guide** for navigating, understanding, and extending the codebase.

---

## 1. System Overview & Tech Stack

A full-featured School Management PWA built for multi-role school operations: Admin, Headteacher, Teacher, and Parent portals.

* **Frontend Framework:** React 18 (TypeScript) + Vite
* **Routing:** `react-router-dom` (v6) with code-split lazy routes and role-based guards
* **State & Data Fetching:** `@tanstack/react-query` (v5) + React Context (`AuthContext`, `ParentAuthContext`)
* **Styling & UI:** Tailwind CSS (v3), Lucide Icons (`lucide-react`)
* **PDF & Media:** `jspdf`, `html2canvas`, Cloudinary (photo uploads)
* **PWA & Offline:** `vite-plugin-pwa`, Workbox
* **Backend / Database:** Supabase (PostgreSQL, Row-Level Security, Auth, Storage, Edge Functions)

---

## 2. Directory Tree & File Index

```
academy-april/
├── public/                     # Static assets & PWA icons
├── supabase/
│   ├── functions/              # Deno Edge Functions
│   │   ├── create-parent-account/
│   │   ├── delete-parent-account/
│   │   ├── reset-parent-password/
│   │   ├── toggle-parent-account-status/
│   │   ├── confirm-parent-password-changed/
│   │   ├── create-staff-account/
│   │   ├── confirm-staff-password-changed/
│   │   └── notify-registration/
│   └── migrations/             # SQL schema migrations
├── src/
│   ├── assets/                 # Brand assets (logo, hero illustrations)
│   ├── components/             # Reusable UI components
│   │   ├── attendance/         # Attendance marking & reporting widgets
│   │   ├── grades/             # Grade entry, view & report card components
│   │   ├── parent/             # Parent portal tabs & navigation
│   │   ├── settings/           # School profile, password, setup tabs
│   │   ├── staff/              # Staff listing & account modals
│   │   ├── ConfirmDialog.tsx   # Reusable confirmation modal
│   │   ├── ErrorBoundary.tsx   # React error boundary
│   │   ├── GlobalSearch.tsx    # Header-wide global search bar
│   │   ├── LoadingScreen.tsx   # Fullscreen suspense loading state
│   │   ├── Pagination.tsx      # Table pagination controls
│   │   ├── ProtectedRoute.tsx  # Staff/Admin route guard
│   │   ├── SearchBar.tsx       # Standard search input widget
│   │   ├── StudentList.tsx     # Filterable student records table
│   │   └── StudentRegistrationForm.tsx # Registration wizard
│   ├── context/
│   │   ├── AuthContext.tsx       # Staff/Admin authentication & profile
│   │   └── ParentAuthContext.tsx # Parent account authentication
│   ├── lib/                    # API clients, helpers & business logic
│   │   ├── parent/             # Parent portal queries (grades, attendance)
│   │   ├── settings/           # School setup queries (terms, subjects, scales)
│   │   ├── staff/              # Staff & teacher detail queries
│   │   ├── attendanceApi.ts    # Daily attendance marking & summaries
│   │   ├── cloudinary.ts       # Image upload helper (student/staff photos)
│   │   ├── csv.ts              # CSV export helper for reports
│   │   ├── globalSearchApi.ts  # Multi-table instant search query
│   │   ├── gradesApi.ts        # Academic grades, scales, releases
│   │   ├── pdf.ts              # PDF progress report generator (jsPDF)
│   │   ├── queries.ts          # Core student & class queries
│   │   ├── queryClient.ts      # Shared TanStack QueryClient
│   │   ├── supabaseClient.ts   # Supabase client singleton
│   │   ├── useDebouncedValue.ts# Debounce hook for searches
│   │   └── useInstallPrompt.ts # PWA install prompt handler
│   ├── pages/                  # Top-level route views
│   │   ├── parent/             # Parent dashboard & password change
│   │   ├── Staff/              # Staff password change
│   │   ├── AdminDashboard.tsx  # Central admin portal with tabs
│   │   ├── Attendance.tsx      # Admin/Headteacher attendance dashboard
│   │   ├── Grades.tsx          # Grades entry & overview
│   │   ├── HeadteacherDashboard.tsx # Headteacher view (read-only grades/students)
│   │   ├── Login.tsx           # Universal login (Staff & Parents)
│   │   ├── ParentAccounts.tsx  # Admin parent account management
│   │   ├── Settings.tsx        # System & school configuration
│   │   ├── Staff.tsx           # Admin staff management
│   │   └── TeacherDashboard.tsx# Teacher view (assigned classes & grades)
│   ├── types/
│   │   └── index.ts            # Central TypeScript interface definitions
│   ├── App.tsx                 # Route declarations & provider wrapping
│   ├── index.css               # Tailwind CSS imports & global styles
│   └── main.tsx                # Application bootstrap
├── package.json
├── PROJECT_MAP.md              # THIS FILE
├── schema.sql                  # Main DB schema reference
└── vite.config.ts              # Build & PWA configuration
```

---

## 3. Core Architecture & Modules

### 3.1 Authentication & Authorization
* **Staff/Admin (`AuthContext.tsx`):** Supabase Auth email/password. Reads `profiles` table (`role`: `'admin' | 'headteacher' | 'teacher'`). Handles forced password changes via `must_change_password`.
* **Parents (`ParentAuthContext.tsx`):** Custom username/password authentication against `parent_accounts` via edge functions.
* **Route Guards:**
  * `ProtectedRoute.tsx`: Checks `profile.role` against `allowedRoles`.
  * `ParentProtectedRoute.tsx`: Protects `/parent` dashboard route.

### 3.2 Key Portals & View Routing

| Role | Primary Route | Entry Page Component | Key Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `/admin` | `pages/AdminDashboard.tsx` | Student Registration, Records, Parent Accounts, Staff, Attendance, Grades, School Settings |
| **Headteacher** | `/headteacher` | `pages/HeadteacherDashboard.tsx` | School-wide record views, grade approvals, attendance monitoring |
| **Teacher** | `/teacher` | `pages/TeacherDashboard.tsx` | Attendance marking for assigned class, grade entry for assigned subjects |
| **Parent** | `/parent` | `pages/parent/ParentDashboard.tsx` | Student progress reports, term grades, attendance record |

---

## 4. Feature Index & File Mapping

### Student Records & Registration
* **Registration Form:** `src/components/StudentRegistrationForm.tsx` (Photo upload via Cloudinary, parent phone, SMS alert).
* **Student List:** `src/components/StudentList.tsx` (Search, class filter, status filter, hard-delete modal, edit drawer).
* **Edit Student:** `src/components/EditStudentForm.tsx`.
* **API Layer:** `src/lib/queries.ts` (`fetchStudentsPage`, `changeStudentStatus`, `hardDeleteStudent`).

### Global Header Search
* **Component:** `src/components/GlobalSearch.tsx` (Debounced cross-table search across Students, Parents, and Staff).
* **API:** `src/lib/globalSearchApi.ts` (`searchEverything`).
* **Integration:** `src/pages/AdminDashboard.tsx` (Switches tabs and pre-fills search query).

### Staff & Teacher Assignments
* **Page:** `src/pages/Staff.tsx`
* **List & Details:** `src/components/staff/StaffList.tsx` (Teacher details, qualifications, certifications, assigned class/subjects).
* **Account Creation Modal:** `src/components/staff/CreateStaffAccountModal.tsx` (Triggers `create-staff-account` edge function).
* **API Layer:** `src/lib/staff/staffApi.ts`.

### Parent Account Management
* **Page:** `src/pages/ParentAccounts.tsx`
* **List Component:** `src/components/ParentAccountsList.tsx` (Password reset modal, activate/deactivate, delete).
* **Creation Modal:** `src/components/CreateParentAccountModal.tsx`.
* **API Layer:** Direct Edge Function invocations (`reset-parent-password`, `delete-parent-account`, `toggle-parent-account-status`).

### Grades & Progress Reports
* **Page:** `src/pages/Grades.tsx`
* **Tabs:**
  * `src/components/grades/EnterGradesTab.tsx` (Bulk entry matrix for assigned classes/subjects).
  * `src/components/grades/ViewGradesTab.tsx` (Term averages, release status, PDF export).
* **PDF Generator:** `src/lib/pdf.ts` (School-branded PDF report cards).
* **API Layer:** `src/lib/gradesApi.ts`.

### Attendance Tracking
* **Page:** `src/pages/Attendance.tsx`
* **Components:**
  * `src/components/attendance/AttendanceMarkingGrid.tsx` (Present, Absent, Late, Half-Day, Excused).
  * `src/components/attendance/AttendanceReports.tsx` (Class summaries, date filters, CSV/PDF export).
* **API Layer:** `src/lib/attendanceApi.ts`.

### School Settings & Configuration
* **Page:** `src/pages/Settings.tsx`
* **Components:**
  * `src/components/settings/SetupTab.tsx` (Terms, Subjects, Grade scale bands, Custom report fields).
  * `src/components/settings/ProfilePictureForm.tsx` (School logo / Admin avatar).
  * `src/components/settings/ChangePasswordForm.tsx`.
* **API Layer:** `src/lib/settings/settingsApi.ts`.

---

## 5. Backend & Supabase Edge Functions

| Edge Function | Path | Purpose |
| :--- | :--- | :--- |
| `notify-registration` | `supabase/functions/notify-registration/` | Sends SMS to parent & admin on new student enrollment |
| `create-parent-account` | `supabase/functions/create-parent-account/` | Generates parent login credentials and links children |
| `reset-parent-password` | `supabase/functions/reset-parent-password/` | Resets parent password to temporary one |
| `toggle-parent-account-status` | `supabase/functions/toggle-parent-account-status/` | Activates or suspends parent access |
| `delete-parent-account` | `supabase/functions/delete-parent-account/` | Deletes parent login record |
| `confirm-parent-password-changed` | `supabase/functions/confirm-parent-password-changed/` | Sets permanent password for parent |
| `create-staff-account` | `supabase/functions/create-staff-account/` | Creates Supabase auth user with role & profile |
| `confirm-staff-password-changed` | `supabase/functions/confirm-staff-password-changed/` | Updates staff password and clears `must_change_password` |

---

## 6. Common Development Commands

* **Run Local Dev Server:** `npm run dev`
* **Type-check & Production Build:** `npm run build`
* **Preview Build:** `npm run preview`

