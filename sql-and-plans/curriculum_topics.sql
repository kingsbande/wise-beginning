-- Teacher Curriculum Topics / Progress KPI
-- Run this script once in the Supabase SQL Editor.
-- Safe to rerun for objects created by this script. If curriculum_topics already
-- exists from another migration, inspect it before running this script.

CREATE TABLE IF NOT EXISTS public.curriculum_topics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
    term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
    title text NOT NULL,
    note text,
    taught_on date,
    completed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_topics_title_check
        CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT curriculum_topics_note_check
        CHECK (note IS NULL OR char_length(note) <= 2000)
);

ALTER TABLE public.curriculum_topics ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_teacher_term
    ON public.curriculum_topics (teacher_id, term_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_school_term
    ON public.curriculum_topics (school_id, term_id);

CREATE INDEX IF NOT EXISTS idx_curriculum_topics_class_subject_term
    ON public.curriculum_topics (class_id, subject_id, term_id);

-- Avoid duplicate topic names for the same teacher, class, subject, and term.
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_topics_assignment_title_key
    ON public.curriculum_topics (
        teacher_id,
        class_id,
        subject_id,
        term_id,
        lower(btrim(title))
    );

-- Admins and headteachers can manage all topic rows in their school.
DROP POLICY IF EXISTS curriculum_topics_admin_all ON public.curriculum_topics;
CREATE POLICY curriculum_topics_admin_all
    ON public.curriculum_topics
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.school_id = curriculum_topics.school_id
              AND p.role IN ('admin', 'headteacher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.school_id = curriculum_topics.school_id
              AND p.role IN ('admin', 'headteacher')
        )
        AND EXISTS (
            SELECT 1
            FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = curriculum_topics.teacher_id
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

-- Teachers can read only topics belonging to their own assignment.
DROP POLICY IF EXISTS curriculum_topics_teacher_select ON public.curriculum_topics;
CREATE POLICY curriculum_topics_teacher_select
    ON public.curriculum_topics
    AS PERMISSIVE
    FOR SELECT
    TO public
    USING (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

DROP POLICY IF EXISTS curriculum_topics_teacher_insert ON public.curriculum_topics;
CREATE POLICY curriculum_topics_teacher_insert
    ON public.curriculum_topics
    AS PERMISSIVE
    FOR INSERT
    TO public
    WITH CHECK (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
    );

DROP POLICY IF EXISTS curriculum_topics_teacher_update ON public.curriculum_topics;
CREATE POLICY curriculum_topics_teacher_update
    ON public.curriculum_topics
    AS PERMISSIVE
    FOR UPDATE
    TO public
    USING (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    )
    WITH CHECK (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
    );

DROP POLICY IF EXISTS curriculum_topics_teacher_delete ON public.curriculum_topics;
CREATE POLICY curriculum_topics_teacher_delete
    ON public.curriculum_topics
    AS PERMISSIVE
    FOR DELETE
    TO public
    USING (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

-- Helpful admin reporting view. RLS on curriculum_topics still applies when queried
-- through Supabase because this view uses security_invoker.
CREATE OR REPLACE VIEW public.curriculum_topic_progress
WITH (security_invoker = true)
AS
SELECT
    ct.school_id,
    ct.term_id,
    ct.teacher_id,
    p.full_name AS teacher_name,
    ct.class_id,
    c.name AS class_name,
    ct.subject_id,
    s.name AS subject_name,
    count(*)::integer AS total_topics,
    count(*) FILTER (WHERE ct.completed)::integer AS completed_topics,
    CASE
        WHEN count(*) = 0 THEN 0
        ELSE round(
            (count(*) FILTER (WHERE ct.completed))::numeric
            * 100 / count(*),
            2
        )
    END AS completion_rate
FROM public.curriculum_topics ct
JOIN public.profiles p ON p.id = ct.teacher_id
JOIN public.classes c ON c.id = ct.class_id
JOIN public.subjects s ON s.id = ct.subject_id
GROUP BY
    ct.school_id,
    ct.term_id,
    ct.teacher_id,
    p.full_name,
    ct.class_id,
    c.name,
    ct.subject_id,
    s.name;

GRANT SELECT ON public.curriculum_topic_progress TO authenticated;

COMMENT ON TABLE public.curriculum_topics IS
    'Term-scoped topics created and tracked by teachers for their assigned class subjects.';
COMMENT ON VIEW public.curriculum_topic_progress IS
    'Completion totals and rates for admin curriculum progress reporting.';
