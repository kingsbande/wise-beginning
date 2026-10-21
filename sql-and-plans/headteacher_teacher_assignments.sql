-- Allow headteachers to manage teaching assignments within their own school.
-- This does not grant access to staff account administration or subject setup.

BEGIN;

DROP POLICY IF EXISTS profiles_select_headteacher_school_staff ON public.profiles;
CREATE POLICY profiles_select_headteacher_school_staff
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    school_id = public.headteacher_school_id(auth.uid())
    AND role IN ('teacher', 'headteacher')
  );

DROP POLICY IF EXISTS teacher_assignments_headteacher_select ON public.teacher_assignments;
CREATE POLICY teacher_assignments_headteacher_select
  ON public.teacher_assignments
  FOR SELECT
  TO authenticated
  USING (school_id = public.headteacher_school_id(auth.uid()));

DROP POLICY IF EXISTS teacher_assignments_headteacher_insert ON public.teacher_assignments;
CREATE POLICY teacher_assignments_headteacher_insert
  ON public.teacher_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = public.headteacher_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles staff
      WHERE staff.id = teacher_assignments.teacher_id
        AND staff.school_id = teacher_assignments.school_id
        AND staff.role IN ('teacher', 'headteacher')
    )
    AND EXISTS (
      SELECT 1
      FROM public.classes class
      WHERE class.id = teacher_assignments.class_id
        AND class.school_id = teacher_assignments.school_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.subjects subject
      WHERE subject.id = teacher_assignments.subject_id
        AND subject.school_id = teacher_assignments.school_id
    )
  );

DROP POLICY IF EXISTS teacher_assignments_headteacher_update ON public.teacher_assignments;
CREATE POLICY teacher_assignments_headteacher_update
  ON public.teacher_assignments
  FOR UPDATE
  TO authenticated
  USING (school_id = public.headteacher_school_id(auth.uid()))
  WITH CHECK (
    school_id = public.headteacher_school_id(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.profiles staff
      WHERE staff.id = teacher_assignments.teacher_id
        AND staff.school_id = teacher_assignments.school_id
        AND staff.role IN ('teacher', 'headteacher')
    )
    AND EXISTS (
      SELECT 1
      FROM public.classes class
      WHERE class.id = teacher_assignments.class_id
        AND class.school_id = teacher_assignments.school_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.subjects subject
      WHERE subject.id = teacher_assignments.subject_id
        AND subject.school_id = teacher_assignments.school_id
    )
  );

DROP POLICY IF EXISTS teacher_assignments_headteacher_delete ON public.teacher_assignments;
CREATE POLICY teacher_assignments_headteacher_delete
  ON public.teacher_assignments
  FOR DELETE
  TO authenticated
  USING (school_id = public.headteacher_school_id(auth.uid()));

GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_assignments TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
