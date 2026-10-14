-- Follow-up migration for databases that already ran
-- curriculum_topic_headteacher_verification.sql.
-- Adds the headteacher "needs_changes" outcome without rerunning the original
-- migration or modifying existing topic rows.

BEGIN;

ALTER TABLE public.curriculum_topics
    DROP CONSTRAINT IF EXISTS curriculum_topics_approval_status_check;

ALTER TABLE public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_approval_status_check
    CHECK (approval_status IN ('not_started', 'pending_approval', 'needs_changes', 'verified', 'approved', 'disapproved'));

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

        IF OLD.approval_status IN ('verified', 'approved') THEN
            RAISE EXCEPTION 'Verified or approved topics cannot be changed';
        END IF;

        IF NEW.approval_status IS DISTINCT FROM OLD.approval_status THEN
            IF OLD.approval_status NOT IN ('not_started', 'needs_changes', 'disapproved')
                OR NEW.approval_status <> 'pending_approval' THEN
                RAISE EXCEPTION 'Teachers may only submit or resubmit topics for review';
            END IF;
            IF NEW.taught_on IS NULL THEN
                RAISE EXCEPTION 'A taught date is required before submitting a topic';
            END IF;
            IF NULLIF(btrim(NEW.note), '') IS NULL THEN
                RAISE EXCEPTION 'A short note is required before submitting a topic';
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
        IF OLD.approval_status <> 'pending_approval'
            OR NEW.approval_status NOT IN ('verified', 'needs_changes') THEN
            RAISE EXCEPTION 'Headteachers may only verify or return submitted topics';
        END IF;
        IF OLD.teacher_id = actor_id THEN
            RAISE EXCEPTION 'Headteachers cannot verify their own topics';
        END IF;
        IF ROW(NEW.id, NEW.school_id, NEW.teacher_id, NEW.class_id, NEW.subject_id, NEW.term_id, NEW.title, NEW.note, NEW.taught_on, NEW.created_at)
            IS DISTINCT FROM
           ROW(OLD.id, OLD.school_id, OLD.teacher_id, OLD.class_id, OLD.subject_id, OLD.term_id, OLD.title, OLD.note, OLD.taught_on, OLD.created_at) THEN
            RAISE EXCEPTION 'Headteachers may not edit topic content while reviewing';
        END IF;
        NEW.completed := false;
        IF NEW.approval_status = 'needs_changes' THEN
            IF NULLIF(btrim(NEW.approval_comment), '') IS NULL THEN
                RAISE EXCEPTION 'A reason is required when returning a topic to the teacher';
            END IF;
        ELSE
            NEW.approval_comment := NULL;
        END IF;
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

DROP POLICY IF EXISTS curriculum_topics_teacher_delete ON public.curriculum_topics;
CREATE POLICY curriculum_topics_teacher_delete
    ON public.curriculum_topics
    FOR DELETE
    TO authenticated
    USING (
        teacher_id = auth.uid()
        AND approval_status IN ('not_started', 'needs_changes', 'disapproved')
        AND EXISTS (
            SELECT 1 FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

COMMIT;
