# Task: Build Teacher Dashboard grade entry + attendance marking UI

## Context

This is a React 18 + TypeScript + Vite app using Supabase (Postgres + Auth + RLS) and
TanStack Query. Tailwind CSS for styling. The **backend and permission model are already
fully built** — this task is frontend-only. Do not create new database tables, RLS
policies, or edge functions. Everything needed already exists; the job is to build the UI
that calls it.

The app is multi-tenant (many schools share one deployment) and has three staff roles in
`profiles.role`: `admin`, `headteacher`, `teacher`. This task is about the **teacher**
role's dashboard at `src/pages/TeacherDashboard.tsx`.

## What already exists (reuse, don't recreate)

**Auth**: `useAuth()` from `src/context/AuthContext.tsx` gives `profile` with `id`,
`school_id`, `full_name`, `role`.

**Types** (`src/types/index.ts`): `AssessmentType` (`'midterm' | 'end_of_term'`),
`GradeScaleBand`, `TeacherAssignment` (`{ id, teacher_id, class_id, subject_id, class_name,
subject_name }`), `AttendanceStatus`, `AttendanceGridRow`, `ClassRoom`, `Subject`, `Term`.

**Data functions to call directly** (already implemented, already RLS-scoped correctly):

From `src/lib/staff/staffApi.ts`:
- `fetchTeacherAssignments(teacherId: string): Promise<TeacherAssignment[]>` — the exact
  (class, subject) pairs this teacher is assigned to teach. This already powers the "My
  Assignments" list currently on `TeacherDashboard.tsx`.

From `src/lib/gradesApi.ts`:
- `fetchTerms(): Promise<Term[]>`
- `fetchGradeScale(): Promise<GradeScaleBand[]>`
- `scoreToLetter(scale: GradeScaleBand[], score: number | null): string | null`
- `fetchGradeGrid(params: { classId, termId, subjectId, assessmentType }): Promise<{ student_id, full_name, score }[]>`
- `saveGrades(params: { schoolId, termId, subjectId, assessmentType, enteredBy, rows: { student_id, score }[] }): Promise<void>`

From `src/lib/queries.ts`:
- `fetchClasses(): Promise<ClassRoom[]>` — for a logged-in teacher, RLS
  (`classes_select_teacher_own_school`) already returns every class in their school, not
  just their own assignments. Useful for the "view other classes' grades in my subject"
  case below.

From `src/lib/attendanceApi.ts`:
- `fetchMyClassTeacherClasses(teacherId: string): Promise<ClassRoom[]>` — classes where
  this teacher is the designated *class teacher* (homeroom concept, separate from subject
  `teacher_assignments`). Usually zero or one class, occasionally more.
- `fetchAttendanceGrid(params: { classId, date }): Promise<AttendanceGridRow[]>`
- `saveAttendance(params: { schoolId, classId, date, markedBy, rows: { student_id, status }[] }): Promise<void>`
- `ATTENDANCE_STATUSES: { value: AttendanceStatus; label: string }[]`

**Existing components to reuse or mirror the pattern of:**
- `src/components/attendance/AttendanceMarkingGrid.tsx` — already fully built, accepts
  `{ schoolId, classId, className, markedBy }`, includes the "Mark All Present" bulk
  action and the five status pills. **Reuse this component directly, don't rebuild it.**
- `src/components/grades/EnterGradesTab.tsx` (admin version) — shows the UI pattern for
  grade entry (class/term/assessment-type/subject pickers → grid of students with score
  inputs → save). Use this as your visual/structural reference, but the admin version lets
  you pick ANY class/subject in the school — the teacher version must be constrained (see
  below).

## The permission model you must respect in the UI

This is already enforced by RLS regardless of what the UI allows — but the UI should
match it, not just rely on the database silently rejecting bad requests:

- A teacher can **write** grades only for the exact (class, subject) pairs in their own
  `teacher_assignments`.
- A teacher can **read** grades for *any* class, for any subject they teach anywhere
  (e.g. if they teach Math in Standard 3 and someone else teaches Math in Standard 4, this
  teacher can view — not edit — Standard 4's Math grades).
- Attendance can only be marked/edited for a class where this teacher is the designated
  `class_teacher_id` — separate concept from subject `teacher_assignments`.

## Task 1: Teacher Grade Entry + View (new)

Create `src/components/teacher/TeacherGrades.tsx` with a mode toggle, same visual pattern
as the admin `EnterGradesTab`'s Subject Grades / Progress Report toggle:

**"Enter Grades" mode:**
- Class + Subject picker, but the options are **derived from `fetchTeacherAssignments(profile.id)`**
  only — not the full school's classes/subjects. If they teach multiple (class, subject)
  pairs, show them as a single combined dropdown (e.g. "Standard 3 — Mathematics").
- Term picker: `fetchTerms()`, unrestricted (teachers can read all terms).
- Assessment type: Midterm / End of Term toggle.
- Once class+subject+term+assessment are all chosen: call `fetchGradeGrid()`, render a
  grid (student name + score input), call `saveGrades()` on submit. This should look and
  behave like the admin version — reuse as much of that logic/JSX as makes sense.

**"View Grades" mode:**
- Subject picker: the **distinct subjects** from this teacher's assignments (they might
  teach the same subject in multiple classes).
- Class picker: once a subject is chosen, show **every class in the school** (via
  `fetchClasses()`) — not just their own assigned class — since they're allowed to view
  any class's grades for a subject they teach.
- Term + assessment type pickers as above.
- Fetch and display the grid **read-only** (no save button, no editable inputs) using
  `fetchGradeGrid()` and `scoreToLetter()`/`fetchGradeScale()` for the letter grade column.
- Visually indicate (e.g. a small badge) whether the currently selected class+subject
  combination is one they can also *edit* (i.e. it matches one of their own
  `teacher_assignments`) versus purely read-only.

Wire this into `TeacherDashboard.tsx` as a new section/tab, alongside the existing "My
Assignments" list.

## Task 2: Verify/complete Teacher Attendance Marking

Check `TeacherDashboard.tsx` for an existing attendance section using
`fetchMyClassTeacherClasses` + `AttendanceMarkingGrid`. If it's missing or incomplete,
implement it:

- Fetch `fetchMyClassTeacherClasses(profile.id)`.
- If empty: render nothing (a teacher who isn't a class teacher for anything shouldn't see
  a broken/empty attendance section).
- If exactly one class: render `<AttendanceMarkingGrid schoolId={profile.school_id}
  classId={c.id} className={c.name} markedBy={profile.id} />` directly.
- If more than one: add a class selector above the grid so they can switch between their
  classes, then render the same component for whichever is selected.

## Conventions to follow

- New components go in `src/components/teacher/` (new folder — doesn't exist yet, mirrors
  the existing `src/components/grades/`, `src/components/attendance/`,
  `src/components/parent/`, `src/components/staff/` pattern).
- Use TanStack Query (`useQuery`/`useMutation`) for all data fetching/writes, matching the
  patterns in `EnterGradesTab.tsx` and `AttendanceMarkingGrid.tsx` — don't introduce
  `useEffect` + manual fetch patterns.
- Tailwind utility classes matching the existing visual style: rounded-xl white cards with
  `border border-gray-200`, `text-gray-900`/`text-gray-500` text hierarchy, `bg-gray-900`
  primary buttons, small `text-xs`/`text-sm` throughout — check `EnterGradesTab.tsx` and
  `AttendanceMarkingGrid.tsx` for exact class names to stay visually consistent.
- Do not add client-side permission checks that duplicate what RLS already enforces
  (e.g. don't write logic that "double-checks" a teacher owns an assignment before
  calling `saveGrades` — RLS already rejects unauthorized writes). The UI's job is to
  guide the teacher toward valid choices via what options are shown, not to re-implement
  the security model.
- No new dependencies. No new Supabase tables, policies, or functions — if you think one
  is needed, stop and flag it instead of creating it.
