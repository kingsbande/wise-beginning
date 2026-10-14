-- Restrict teacher attendance access to the class's designated class teacher.
-- Remove legacy permissive policies because PostgreSQL combines permissive
-- policies with OR; retaining any broad policy would bypass these checks.
BEGIN;

DROP POLICY IF EXISTS attendance_teacher_select_assigned_classes ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_insert_assigned_classes ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_update_assigned_classes ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_delete_assigned_classes ON public.attendance_records;
DROP POLICY IF EXISTS attendance_headteacher_delete_own_school ON public.attendance_records;
DROP POLICY IF EXISTS attendance_delete_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_select_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_insert_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_update_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_insert_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_update_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_teacher_delete_class_teacher ON public.attendance_records;
DROP POLICY IF EXISTS attendance_admin_all ON public.attendance_records;
DROP POLICY IF EXISTS attendance_headteacher_select_own_school ON public.attendance_records;
DROP POLICY IF EXISTS attendance_headteacher_insert_own_school ON public.attendance_records;
DROP POLICY IF EXISTS attendance_headteacher_update_own_school ON public.attendance_records;

CREATE POLICY attendance_admin_all
    ON public.attendance_records
    FOR ALL
    TO authenticated
    USING (
        school_id = public.user_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.school_id = attendance_records.school_id
              AND p.role = 'admin'
        )
        AND EXISTS (
            SELECT 1
            FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    )
    WITH CHECK (
        school_id = public.user_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
              AND p.school_id = attendance_records.school_id
              AND p.role = 'admin'
        )
        AND EXISTS (
            SELECT 1
            FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_headteacher_select_own_school
    ON public.attendance_records
    FOR SELECT
    TO authenticated
    USING (
        school_id = public.headteacher_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_headteacher_insert_own_school
    ON public.attendance_records
    FOR INSERT
    TO authenticated
    WITH CHECK (
        school_id = public.headteacher_school_id((SELECT auth.uid()))
        AND marked_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_headteacher_update_own_school
    ON public.attendance_records
    FOR UPDATE
    TO authenticated
    USING (
        school_id = public.headteacher_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    )
    WITH CHECK (
        school_id = public.headteacher_school_id((SELECT auth.uid()))
        AND marked_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_headteacher_delete_own_school
    ON public.attendance_records
    FOR DELETE
    TO authenticated
    USING (
        school_id = public.headteacher_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_teacher_select_assigned_classes
    ON public.attendance_records
    FOR SELECT
    TO authenticated
    USING (
        school_id = public.teacher_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
              AND (
                  c.class_teacher_id = (SELECT auth.uid())
                  OR EXISTS (
                      SELECT 1 FROM public.teacher_assignments ta
                      WHERE ta.teacher_id = (SELECT auth.uid())
                        AND ta.school_id = attendance_records.school_id
                        AND ta.class_id = attendance_records.class_id
                  )
              )
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_teacher_insert_class_teacher
    ON public.attendance_records
    FOR INSERT
    TO authenticated
    WITH CHECK (
        school_id = public.teacher_school_id((SELECT auth.uid()))
        AND marked_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
              AND c.class_teacher_id = (SELECT auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_teacher_update_class_teacher
    ON public.attendance_records
    FOR UPDATE
    TO authenticated
    USING (
        school_id = public.teacher_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
              AND c.class_teacher_id = (SELECT auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    )
    WITH CHECK (
        school_id = public.teacher_school_id((SELECT auth.uid()))
        AND marked_by = (SELECT auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
              AND c.class_teacher_id = (SELECT auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

CREATE POLICY attendance_teacher_delete_class_teacher
    ON public.attendance_records
    FOR DELETE
    TO authenticated
    USING (
        school_id = public.teacher_school_id((SELECT auth.uid()))
        AND EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = attendance_records.class_id
              AND c.school_id = attendance_records.school_id
              AND c.class_teacher_id = (SELECT auth.uid())
        )
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = attendance_records.student_id
              AND s.school_id = attendance_records.school_id
              AND s.class_id = attendance_records.class_id
        )
    );

COMMIT;
