-- Teacher topics require headteacher verification before admin approval.
-- Headteacher topics go directly to admin approval.

ALTER TABLE public.curriculum_topics
    ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_started',
    ADD COLUMN IF NOT EXISTS approval_comment text,
    ADD COLUMN IF NOT EXISTS reviewed_by uuid,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.curriculum_topics'::regclass
          AND conname = 'curriculum_topics_reviewed_by_fkey'
    ) THEN
        ALTER TABLE public.curriculum_topics
            ADD CONSTRAINT curriculum_topics_reviewed_by_fkey
            FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END;
$$;

ALTER TABLE public.curriculum_topics
    DROP CONSTRAINT IF EXISTS curriculum_topics_approval_status_check;

ALTER TABLE public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_approval_status_check
    CHECK (approval_status IN ('not_started', 'pending_approval', 'verified', 'approved', 'disapproved'));

CREATE OR REPLACE FUNCTION public.enforce_curriculum_topic_approval_workflow()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    actor_id uuid := auth.uid();
    actor_role text;
    author_role text;
BEGIN
    -- Allow trusted database maintenance and service-role jobs without a user JWT.
    IF actor_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT p.role
    INTO actor_role
    FROM public.profiles p
    WHERE p.id = actor_id;

    IF actor_role IS NULL THEN
        RAISE EXCEPTION 'A staff profile is required to change curriculum topics';
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF actor_role NOT IN ('teacher', 'headteacher') THEN
            RAISE EXCEPTION 'Only teachers and headteachers can add curriculum topics';
        END IF;
        NEW.approval_status := 'not_started';
        NEW.completed := false;
        NEW.approval_comment := NULL;
        NEW.reviewed_by := NULL;
        NEW.reviewed_at := NULL;
        RETURN NEW;
    END IF;

    IF actor_role IN ('teacher', 'headteacher') AND OLD.teacher_id = actor_id THEN
        IF ROW(NEW.id, NEW.school_id, NEW.teacher_id, NEW.class_id, NEW.subject_id, NEW.term_id, NEW.created_at)
            IS DISTINCT FROM
           ROW(OLD.id, OLD.school_id, OLD.teacher_id, OLD.class_id, OLD.subject_id, OLD.term_id, OLD.created_at) THEN
            RAISE EXCEPTION 'Topic ownership and assignment cannot be changed';
        END IF;
        IF OLD.approval_status IN ('verified', 'approved')
            OR (OLD.approval_status = 'pending_approval' AND actor_role <> 'headteacher') THEN
            RAISE EXCEPTION 'Verified or approved topics cannot be changed';
        END IF;

        IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
            IF OLD.approval_status NOT IN ('not_started', 'disapproved')
                OR NEW.approval_status <> 'pending_approval' THEN
                RAISE EXCEPTION 'Teachers may only submit or resubmit topics for review';
            END IF;
            IF NEW.taught_on IS NULL THEN
                RAISE EXCEPTION 'A taught date is required before submitting a topic';
            END IF;
            NEW.completed := false;
            NEW.approval_comment := NULL;
            NEW.reviewed_by := NULL;
            NEW.reviewed_at := NULL;
        ELSE
            NEW.completed := false;
            NEW.approval_comment := OLD.approval_comment;
            NEW.reviewed_by := OLD.reviewed_by;
            NEW.reviewed_at := OLD.reviewed_at;
        END IF;
        RETURN NEW;
    END IF;

    IF actor_role = 'headteacher' THEN
        IF OLD.approval_status <> 'pending_approval' OR NEW.approval_status <> 'verified' THEN
            RAISE EXCEPTION 'Headteachers may only verify submitted topics';
        END IF;
        IF OLD.teacher_id = actor_id THEN
            RAISE EXCEPTION 'Headteachers cannot verify their own topics';
        END IF;
        IF ROW(NEW.id, NEW.school_id, NEW.teacher_id, NEW.class_id, NEW.subject_id, NEW.term_id, NEW.title, NEW.note, NEW.taught_on, NEW.created_at)
            IS DISTINCT FROM
           ROW(OLD.id, OLD.school_id, OLD.teacher_id, OLD.class_id, OLD.subject_id, OLD.term_id, OLD.title, OLD.note, OLD.taught_on, OLD.created_at) THEN
            RAISE EXCEPTION 'Headteachers may not edit topic content while verifying';
        END IF;
        NEW.completed := false;
        NEW.approval_comment := NULL;
        NEW.reviewed_by := actor_id;
        NEW.reviewed_at := now();
        RETURN NEW;
    END IF;

    IF actor_role = 'admin' THEN
        SELECT p.role
        INTO author_role
        FROM public.profiles p
        WHERE p.id = OLD.teacher_id;

        IF NOT (
            OLD.approval_status = 'verified'
            OR (OLD.approval_status = 'pending_approval' AND author_role = 'headteacher')
        ) OR NEW.approval_status NOT IN ('approved', 'disapproved') THEN
            RAISE EXCEPTION 'Admins may only finalize verified topics or headteacher-submitted topics';
        END IF;
          IF ROW(NEW.id, NEW.school_id, NEW.teacher_id, NEW.class_id, NEW.subject_id, NEW.term_id, NEW.title, NEW.note, NEW.taught_on, NEW.created_at)
            IS DISTINCT FROM
              ROW(OLD.id, OLD.school_id, OLD.teacher_id, OLD.class_id, OLD.subject_id, OLD.term_id, OLD.title, OLD.note, OLD.taught_on, OLD.created_at) THEN
            RAISE EXCEPTION 'Admins may not edit topic content while reviewing';
        END IF;
        IF NEW.approval_status = 'disapproved' AND NULLIF(btrim(NEW.approval_comment), '') IS NULL THEN
            RAISE EXCEPTION 'A reason is required when disapproving a topic';
        END IF;
        NEW.completed := NEW.approval_status = 'approved';
        IF NEW.approval_status = 'approved' THEN
            NEW.approval_comment := NULL;
        END IF;
        NEW.reviewed_by := actor_id;
        NEW.reviewed_at := now();
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'This role cannot review curriculum topics';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_curriculum_topic_approval_workflow ON public.curriculum_topics;
CREATE TRIGGER trg_enforce_curriculum_topic_approval_workflow
    BEFORE INSERT OR UPDATE ON public.curriculum_topics
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_curriculum_topic_approval_workflow();

-- Admins finalize topics; headteachers verify other teachers' topics only.
DROP POLICY IF EXISTS curriculum_topics_admin_all ON public.curriculum_topics;
CREATE POLICY curriculum_topics_admin_all
    ON public.curriculum_topics
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.school_id = curriculum_topics.school_id
              AND p.role = 'admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.school_id = curriculum_topics.school_id
              AND p.role = 'admin'
        )
        AND EXISTS (
            SELECT 1 FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = curriculum_topics.teacher_id
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

DROP POLICY IF EXISTS curriculum_topics_headteacher_select ON public.curriculum_topics;
CREATE POLICY curriculum_topics_headteacher_select
    ON public.curriculum_topics
    FOR SELECT
    TO authenticated
    USING (school_id = public.headteacher_school_id(auth.uid()));

DROP POLICY IF EXISTS curriculum_topics_headteacher_update ON public.curriculum_topics;
CREATE POLICY curriculum_topics_headteacher_update
    ON public.curriculum_topics
    FOR UPDATE
    TO authenticated
    USING (school_id = public.headteacher_school_id(auth.uid()))
    WITH CHECK (school_id = public.headteacher_school_id(auth.uid()));

DROP POLICY IF EXISTS curriculum_topics_teacher_delete ON public.curriculum_topics;
CREATE POLICY curriculum_topics_teacher_delete
    ON public.curriculum_topics
    FOR DELETE
    TO authenticated
    USING (
        teacher_id = auth.uid()
        AND approval_status IN ('not_started', 'disapproved')
        AND EXISTS (
            SELECT 1 FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

-- Keep staff profile details private while exposing only school-scoped progress aggregates.
CREATE OR REPLACE VIEW public.curriculum_topic_progress
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
            (count(*) FILTER (WHERE ct.completed))::numeric * 100 / count(*),
            2
        )
    END AS completion_rate,
    p.role AS teacher_role
FROM public.curriculum_topics ct
JOIN public.profiles p ON p.id = ct.teacher_id
JOIN public.classes c ON c.id = ct.class_id
JOIN public.subjects s ON s.id = ct.subject_id
WHERE ct.school_id = COALESCE(
    public.user_school_id(auth.uid()),
    public.headteacher_school_id(auth.uid())
)
GROUP BY
    ct.school_id,
    ct.term_id,
    ct.teacher_id,
    p.full_name,
    p.role,
    ct.class_id,
    c.name,
    ct.subject_id,
    s.name;

ALTER VIEW public.curriculum_topic_progress SET (security_invoker = false);

GRANT SELECT ON public.curriculum_topic_progress TO authenticated;

DROP POLICY IF EXISTS subjects_select_headteacher_own_school ON public.subjects;
CREATE POLICY subjects_select_headteacher_own_school
    ON public.subjects
    FOR SELECT
    TO authenticated
    USING (school_id = public.headteacher_school_id(auth.uid()));

DROP POLICY IF EXISTS terms_select_headteacher_own_school ON public.terms;
CREATE POLICY terms_select_headteacher_own_school
    ON public.terms
    FOR SELECT
    TO authenticated
    USING (school_id = public.headteacher_school_id(auth.uid()));