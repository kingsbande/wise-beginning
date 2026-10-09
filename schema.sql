--
-- PostgreSQL database dump
--

\restrict Wdgcf69A1lODiNk8Eo9RiUbjpmslGwLitkkNW78xeShSHA0YiFqbduzf7CIEk0K

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: create_promotion_run(text, text, uuid, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric DEFAULT 50) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_school_id uuid := user_school_id(auth.uid());
  v_run_id uuid;
BEGIN
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school is associated with the current user';
  END IF;

  IF p_minimum_average < 0 OR p_minimum_average > 100 THEN
    RAISE EXCEPTION 'Minimum average must be between 0 and 100';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.terms
    WHERE id = p_final_term_id
      AND school_id = v_school_id
      AND academic_year = p_source_academic_year
  ) THEN
    RAISE EXCEPTION 'The selected final term does not belong to the source academic year';
  END IF;

  INSERT INTO public.promotion_runs (
    school_id, source_academic_year, target_academic_year, final_term_id,
    minimum_average, created_by
  )
  VALUES (
    v_school_id, p_source_academic_year, p_target_academic_year, p_final_term_id,
    p_minimum_average, auth.uid()
  )
  RETURNING id INTO v_run_id;

  WITH required_subjects AS (
    SELECT cs.class_id, count(*)::integer AS subject_count
    FROM public.class_subjects cs
    GROUP BY cs.class_id
  ),
  student_scores AS (
    SELECT
      s.id AS student_id,
      s.class_id AS source_class_id,
      c.is_terminal,
      COALESCE(rs.subject_count, 0) AS required_subject_count,
      count(DISTINCT CASE WHEN g.assessment_type = 'end_of_term' THEN g.subject_id END)::integer AS scored_subject_count,
      avg(g.score) FILTER (WHERE g.assessment_type = 'end_of_term') AS average_score
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id AND c.school_id = v_school_id
    LEFT JOIN required_subjects rs ON rs.class_id = s.class_id
    LEFT JOIN public.grades g
      ON g.student_id = s.id
      AND g.term_id = p_final_term_id
      AND g.assessment_type = 'end_of_term'
      AND g.school_id = v_school_id
    WHERE s.school_id = v_school_id
      AND s.status = 'active'
      AND s.academic_year = p_source_academic_year
    GROUP BY s.id, s.class_id, c.is_terminal, rs.subject_count
  )
  INSERT INTO public.promotion_decisions (
    promotion_run_id, school_id, student_id, source_class_id,
    destination_class_id, average_score, missing_subject_count, outcome, reason
  )
  SELECT
    v_run_id,
    v_school_id,
    ss.student_id,
    ss.source_class_id,
    CASE WHEN ss.is_terminal THEN NULL ELSE next_class.id END,
    round(ss.average_score, 2),
    GREATEST(ss.required_subject_count - ss.scored_subject_count, 0),
    CASE
      WHEN ss.required_subject_count = 0 THEN 'manual_review'
      WHEN ss.scored_subject_count < ss.required_subject_count THEN 'manual_review'
      WHEN ss.is_terminal AND ss.average_score >= p_minimum_average THEN 'graduate'
      WHEN ss.average_score >= p_minimum_average AND next_class.id IS NOT NULL THEN 'promote'
      WHEN ss.average_score < p_minimum_average THEN 'retain'
      ELSE 'manual_review'
    END,
    CASE
      WHEN ss.required_subject_count = 0 THEN 'No subjects are configured for the current class'
      WHEN ss.scored_subject_count < ss.required_subject_count THEN 'Required end-of-term grades are missing'
      WHEN ss.is_terminal AND ss.average_score >= p_minimum_average THEN 'Meets the configured average for graduation review'
      WHEN ss.average_score >= p_minimum_average AND next_class.id IS NOT NULL THEN 'Meets the configured average'
      WHEN ss.average_score < p_minimum_average THEN 'Below the configured minimum average'
      ELSE 'No destination class is configured'
    END
  FROM student_scores ss
  LEFT JOIN LATERAL (
    SELECT c.id
    FROM public.classes c
    WHERE c.school_id = v_school_id
      AND c.progression_order = (
        SELECT source_class.progression_order + 1
        FROM public.classes source_class
        WHERE source_class.id = ss.source_class_id
      )
    ORDER BY c.name
    LIMIT 1
  ) next_class ON true;

  RETURN v_run_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'A promotion run already exists for this academic-year pair';
END;
$$;


ALTER FUNCTION public.create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric) OWNER TO postgres;

--
-- Name: enforce_curriculum_topic_approval_workflow(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_curriculum_topic_approval_workflow() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
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


ALTER FUNCTION public.enforce_curriculum_topic_approval_workflow() OWNER TO postgres;

--
-- Name: enforce_fee_payment_reversal(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.enforce_fee_payment_reversal() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
    actor_id uuid := auth.uid();
BEGIN
    IF actor_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF OLD.reversed_at IS NOT NULL THEN
        RAISE EXCEPTION 'A reversed payment is locked and cannot be changed';
    END IF;

    IF NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason THEN
        IF NULLIF(btrim(NEW.reversal_reason), '') IS NULL THEN
            RAISE EXCEPTION 'A reason is required to reverse a payment';
        END IF;
        IF ROW(NEW.id, NEW.school_id, NEW.fee_charge_id, NEW.amount, NEW.payment_date, NEW.method, NEW.note, NEW.recorded_by, NEW.created_at, NEW.paid_for_items)
            IS DISTINCT FROM
           ROW(OLD.id, OLD.school_id, OLD.fee_charge_id, OLD.amount, OLD.payment_date, OLD.method, OLD.note, OLD.recorded_by, OLD.created_at, OLD.paid_for_items) THEN
            RAISE EXCEPTION 'The original payment cannot be edited while reversing it';
        END IF;
        NEW.reversal_reason := btrim(NEW.reversal_reason);
        NEW.reversed_at := now();
        NEW.reversed_by := actor_id;
    ELSIF NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
        OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by THEN
        RAISE EXCEPTION 'Use the audited reversal action to reverse a payment';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION public.enforce_fee_payment_reversal() OWNER TO postgres;

--
-- Name: get_fee_balance_totals(uuid, uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text) RETURNS TABLE(total_due numeric, total_paid numeric, total_balance numeric)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
    WITH matching_charges AS (
        SELECT charge.id, charge.amount_due
        FROM public.fee_charges charge
        JOIN public.students student ON student.id = charge.student_id
        WHERE charge.school_id = public.user_school_id(auth.uid())
          AND student.school_id = public.user_school_id(auth.uid())
          AND student.status = 'active'
          AND charge.term_id = p_term_id
          AND (p_class_id IS NULL OR student.class_id = p_class_id)
          AND (p_category_id IS NULL OR charge.fee_category_id = p_category_id)
          AND (
              NULLIF(btrim(p_search), '') IS NULL
              OR student.full_name ILIKE '%' || btrim(p_search) || '%'
              OR student.admission_number ILIKE '%' || btrim(p_search) || '%'
          )
    ),
    payment_totals AS (
        SELECT payment.fee_charge_id, sum(payment.amount) AS amount_paid
        FROM public.fee_payments payment
        JOIN matching_charges charge ON charge.id = payment.fee_charge_id
        WHERE payment.school_id = public.user_school_id(auth.uid())
          AND payment.reversed_at IS NULL
        GROUP BY payment.fee_charge_id
    ),
    totals AS (
        SELECT
            COALESCE(sum(charge.amount_due), 0)::numeric AS due,
            COALESCE(sum(payment.amount_paid), 0)::numeric AS paid
        FROM matching_charges charge
        LEFT JOIN payment_totals payment ON payment.fee_charge_id = charge.id
    )
    SELECT totals.due, totals.paid, totals.due - totals.paid
    FROM totals;
$$;


ALTER FUNCTION public.get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text) OWNER TO postgres;

--
-- Name: headteacher_school_id(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.headteacher_school_id(uid uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select school_id from profiles where id = uid and role = 'headteacher';
$$;


ALTER FUNCTION public.headteacher_school_id(uid uuid) OWNER TO postgres;

--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from profiles
    where id = uid and role = 'admin'
  );
$$;


ALTER FUNCTION public.is_admin(uid uuid) OWNER TO postgres;

--
-- Name: parent_school_id(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.parent_school_id(uid uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select school_id from parent_accounts where id = uid;
$$;


ALTER FUNCTION public.parent_school_id(uid uuid) OWNER TO postgres;

--
-- Name: prevent_profile_privilege_escalation(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.prevent_profile_privilege_escalation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Regular authenticated users cannot change protected profile fields.
  -- Trusted Edge Functions using the service-role key can.
  IF current_user <> 'service_role' THEN
    NEW.school_id := OLD.school_id;
    NEW.role := OLD.role;
    NEW.username := OLD.username;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION public.prevent_profile_privilege_escalation() OWNER TO postgres;

--
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

--
-- Name: score_to_letter(uuid, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.score_to_letter(p_school_id uuid, p_score numeric) RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select letter from grade_scale
  where school_id = p_school_id
  and p_score >= min_score and p_score <= max_score
  order by min_score desc
  limit 1;
$$;


ALTER FUNCTION public.score_to_letter(p_school_id uuid, p_score numeric) OWNER TO postgres;

--
-- Name: seed_new_school_defaults(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.seed_new_school_defaults() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  insert into classes (school_id, name)
  select new.id, c.name
  from (values
    ('Pre-School'), ('Nursery'), ('Reception'),
    ('Standard 1'), ('Standard 2'), ('Standard 3'),
    ('Standard 4'), ('Standard 5'), ('Standard 6'),
    ('Standard 7'), ('Standard 8')
  ) as c (name)
  on conflict (school_id, name) do nothing;

  insert into subjects (school_id, name)
  select new.id, s.name
  from (values
    ('Mathematics'), ('English'), ('Chichewa'),
    ('Science'), ('Social Studies'), ('Life Skills')
  ) as s (name)
  on conflict (school_id, name) do nothing;

  insert into terms (school_id, academic_year, name)
  select new.id, to_char(current_date, 'YYYY'), t.name
  from (values ('Term 1'), ('Term 2'), ('Term 3')) as t (name)
  on conflict (school_id, academic_year, name) do nothing;

  insert into grade_scale (school_id, min_score, max_score, letter)
  select new.id, v.min_score, v.max_score, v.letter
  from (values
    (80, 100, 'A'),
    (70, 79.99, 'B'),
    (60, 69.99, 'C'),
    (50, 59.99, 'D'),
    (0, 49.99, 'F')
  ) as v (min_score, max_score, letter);

  insert into progress_report_fields (school_id, label, sort_order)
  select new.id, f.label, f.sort_order
  from (values
    ('Class Teacher''s Comment', 1),
    ('Head Teacher''s Comment', 2),
    ('Conduct', 3),
    ('Attendance', 4)
  ) as f (label, sort_order)
  on conflict (school_id, label) do nothing;

  insert into fee_categories (school_id, name)
  select new.id, c.name
  from (values ('School Fees'), ('Uniform Fees'), ('Books Fees')) as c (name)
  on conflict (school_id, name) do nothing;

  return new;
end;
$$;


ALTER FUNCTION public.seed_new_school_defaults() OWNER TO postgres;

--
-- Name: teacher_school_id(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.teacher_school_id(uid uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select school_id from profiles where id = uid and role = 'teacher';
$$;


ALTER FUNCTION public.teacher_school_id(uid uuid) OWNER TO postgres;

--
-- Name: user_school_id(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.user_school_id(uid uuid) RETURNS uuid
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select school_id from profiles where id = uid and role = 'admin';
$$;


ALTER FUNCTION public.user_school_id(uid uuid) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: attendance_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.attendance_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    date date NOT NULL,
    status text NOT NULL,
    marked_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT attendance_records_status_check CHECK ((status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'half_day'::text, 'excused'::text])))
);


ALTER TABLE public.attendance_records OWNER TO postgres;

--
-- Name: class_subjects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.class_subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.class_subjects OWNER TO postgres;

--
-- Name: classes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    school_id uuid NOT NULL,
    class_teacher_id uuid,
    progression_order integer,
    is_terminal boolean DEFAULT false NOT NULL
);


ALTER TABLE public.classes OWNER TO postgres;

--
-- Name: curriculum_topics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.curriculum_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    term_id uuid NOT NULL,
    title text NOT NULL,
    note text,
    taught_on date,
    completed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    approval_status text DEFAULT 'not_started'::text NOT NULL,
    approval_comment text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    CONSTRAINT curriculum_topics_approval_status_check CHECK ((approval_status = ANY (ARRAY['not_started'::text, 'pending_approval'::text, 'verified'::text, 'approved'::text, 'disapproved'::text]))),
    CONSTRAINT curriculum_topics_note_check CHECK (((note IS NULL) OR (char_length(note) <= 2000))),
    CONSTRAINT curriculum_topics_title_check CHECK (((char_length(btrim(title)) >= 1) AND (char_length(btrim(title)) <= 200)))
);


ALTER TABLE public.curriculum_topics OWNER TO postgres;

--
-- Name: TABLE curriculum_topics; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.curriculum_topics IS 'Term-scoped topics created and tracked by teachers for their assigned class subjects.';


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'admin'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    school_id uuid NOT NULL,
    avatar_url text,
    must_change_password boolean DEFAULT false NOT NULL,
    username text,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'headteacher'::text, 'teacher'::text])))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- Name: COLUMN profiles.is_active; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.profiles.is_active IS 'Whether the staff account may sign in. Deactivation preserves staff history.';


--
-- Name: subjects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.subjects (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.subjects OWNER TO postgres;

--
-- Name: curriculum_topic_progress; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.curriculum_topic_progress WITH (security_invoker='false') AS
 SELECT ct.school_id,
    ct.term_id,
    ct.teacher_id,
    p.full_name AS teacher_name,
    ct.class_id,
    c.name AS class_name,
    ct.subject_id,
    s.name AS subject_name,
    (count(*))::integer AS total_topics,
    (count(*) FILTER (WHERE ct.completed))::integer AS completed_topics,
        CASE
            WHEN (count(*) = 0) THEN (0)::numeric
            ELSE round((((count(*) FILTER (WHERE ct.completed))::numeric * (100)::numeric) / (count(*))::numeric), 2)
        END AS completion_rate,
    p.role AS teacher_role
   FROM (((public.curriculum_topics ct
     JOIN public.profiles p ON ((p.id = ct.teacher_id)))
     JOIN public.classes c ON ((c.id = ct.class_id)))
     JOIN public.subjects s ON ((s.id = ct.subject_id)))
  WHERE (ct.school_id = COALESCE(public.user_school_id(auth.uid()), public.headteacher_school_id(auth.uid())))
  GROUP BY ct.school_id, ct.term_id, ct.teacher_id, p.full_name, p.role, ct.class_id, c.name, ct.subject_id, s.name;


ALTER VIEW public.curriculum_topic_progress OWNER TO postgres;

--
-- Name: VIEW curriculum_topic_progress; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON VIEW public.curriculum_topic_progress IS 'Completion totals and rates for admin curriculum progress reporting.';


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.error_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid,
    user_id uuid,
    error_type text NOT NULL,
    message text NOT NULL,
    page text,
    context jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.error_logs OWNER TO postgres;

--
-- Name: fee_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_flexible boolean DEFAULT false NOT NULL
);


ALTER TABLE public.fee_categories OWNER TO postgres;

--
-- Name: fee_category_item_collections; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_category_item_collections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    fee_category_id uuid NOT NULL,
    fee_category_item_id uuid,
    term_id uuid NOT NULL,
    item_name text NOT NULL,
    is_collected boolean DEFAULT false NOT NULL,
    collected_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


ALTER TABLE public.fee_category_item_collections OWNER TO postgres;

--
-- Name: fee_category_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_category_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    fee_category_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.fee_category_items OWNER TO postgres;

--
-- Name: fee_charges; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_charges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    fee_category_id uuid NOT NULL,
    term_id uuid NOT NULL,
    amount_due numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_charges_amount_due_check CHECK ((amount_due >= (0)::numeric))
);


ALTER TABLE public.fee_charges OWNER TO postgres;

--
-- Name: fee_payments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    fee_charge_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_date date DEFAULT CURRENT_DATE NOT NULL,
    method text,
    note text,
    recorded_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_for_items text[] DEFAULT '{}'::text[] NOT NULL,
    reversed_at timestamp with time zone,
    reversed_by uuid,
    reversal_reason text,
    CONSTRAINT fee_payments_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT fee_payments_reversal_fields_check CHECK ((((reversed_at IS NULL) AND (reversed_by IS NULL) AND (reversal_reason IS NULL)) OR ((reversed_at IS NOT NULL) AND (reversed_by IS NOT NULL) AND (NULLIF(btrim(reversal_reason), ''::text) IS NOT NULL))))
);


ALTER TABLE public.fee_payments OWNER TO postgres;

--
-- Name: fee_structures; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.fee_structures (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    fee_category_id uuid NOT NULL,
    term_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT fee_structures_amount_check CHECK ((amount >= (0)::numeric))
);


ALTER TABLE public.fee_structures OWNER TO postgres;

--
-- Name: grade_releases; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grade_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    term_id uuid NOT NULL,
    released_at timestamp with time zone DEFAULT now() NOT NULL,
    released_by uuid
);


ALTER TABLE public.grade_releases OWNER TO postgres;

--
-- Name: grade_scale; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grade_scale (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    min_score numeric NOT NULL,
    max_score numeric NOT NULL,
    letter text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.grade_scale OWNER TO postgres;

--
-- Name: grades; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.grades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    term_id uuid NOT NULL,
    assessment_type text NOT NULL,
    score numeric NOT NULL,
    entered_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT grades_assessment_type_check CHECK ((assessment_type = ANY (ARRAY['midterm'::text, 'end_of_term'::text]))),
    CONSTRAINT grades_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))
);


ALTER TABLE public.grades OWNER TO postgres;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    student_id uuid,
    recipient_type text NOT NULL,
    recipient_phone text NOT NULL,
    message text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    provider_response text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_recipient_type_check CHECK ((recipient_type = ANY (ARRAY['parent'::text, 'admin'::text]))),
    CONSTRAINT notifications_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text])))
);


ALTER TABLE public.notifications OWNER TO postgres;

--
-- Name: parent_accounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.parent_accounts (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    full_name text NOT NULL,
    username text NOT NULL,
    phone text,
    is_active boolean DEFAULT true NOT NULL,
    must_change_password boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.parent_accounts OWNER TO postgres;

--
-- Name: progress_report_entries; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.progress_report_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    term_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value text,
    entered_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.progress_report_entries OWNER TO postgres;

--
-- Name: progress_report_fields; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.progress_report_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.progress_report_fields OWNER TO postgres;

--
-- Name: promotion_decisions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promotion_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    promotion_run_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    source_class_id uuid NOT NULL,
    destination_class_id uuid,
    average_score numeric,
    missing_subject_count integer DEFAULT 0 NOT NULL,
    outcome text NOT NULL,
    reason text NOT NULL,
    override_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_decisions_average_score_check CHECK (((average_score >= (0)::numeric) AND (average_score <= (100)::numeric))),
    CONSTRAINT promotion_decisions_missing_subject_count_check CHECK ((missing_subject_count >= 0)),
    CONSTRAINT promotion_decisions_outcome_check CHECK ((outcome = ANY (ARRAY['promote'::text, 'retain'::text, 'manual_review'::text, 'graduate'::text, 'exclude'::text])))
);


ALTER TABLE public.promotion_decisions OWNER TO postgres;

--
-- Name: promotion_policies; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promotion_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    minimum_average numeric DEFAULT 50 NOT NULL,
    use_end_of_term_only boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT promotion_policies_minimum_average_check CHECK (((minimum_average >= (0)::numeric) AND (minimum_average <= (100)::numeric)))
);


ALTER TABLE public.promotion_policies OWNER TO postgres;

--
-- Name: promotion_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.promotion_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    source_academic_year text NOT NULL,
    target_academic_year text NOT NULL,
    final_term_id uuid NOT NULL,
    minimum_average numeric NOT NULL,
    status text DEFAULT 'review'::text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    CONSTRAINT promotion_runs_minimum_average_check CHECK (((minimum_average >= (0)::numeric) AND (minimum_average <= (100)::numeric))),
    CONSTRAINT promotion_runs_status_check CHECK ((status = ANY (ARRAY['review'::text, 'approved'::text, 'cancelled'::text])))
);


ALTER TABLE public.promotion_runs OWNER TO postgres;

--
-- Name: schools; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.schools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text NOT NULL,
    logo_url text,
    registration_terms text
);


ALTER TABLE public.schools OWNER TO postgres;

--
-- Name: student_status_history; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.student_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    old_status text NOT NULL,
    new_status text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    note text
);


ALTER TABLE public.student_status_history OWNER TO postgres;

--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.students (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admission_number text NOT NULL,
    full_name text NOT NULL,
    date_of_birth date NOT NULL,
    gender text NOT NULL,
    class_id uuid NOT NULL,
    parent_name text NOT NULL,
    parent_phone text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_occupation text,
    health_notes text,
    former_school text,
    age integer,
    pickup_person text,
    location text,
    address text,
    academic_year text DEFAULT to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY'::text) NOT NULL,
    school_id uuid NOT NULL,
    date_joined date DEFAULT CURRENT_DATE NOT NULL,
    government_code text,
    photo_url text,
    parent_account_id uuid,
    status text DEFAULT 'active'::text NOT NULL,
    status_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT students_gender_check CHECK ((gender = ANY (ARRAY['male'::text, 'female'::text]))),
    CONSTRAINT students_status_check CHECK ((status = ANY (ARRAY['active'::text, 'withdrawn'::text, 'graduated'::text, 'transferred'::text])))
);


ALTER TABLE public.students OWNER TO postgres;

--
-- Name: teacher_assignments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.teacher_assignments OWNER TO postgres;

--
-- Name: teacher_certifications; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher_certifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    title text NOT NULL,
    issuing_body text,
    issued_date date,
    expiry_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.teacher_certifications OWNER TO postgres;

--
-- Name: teacher_details; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teacher_details (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    date_of_birth date,
    national_id text,
    home_address text,
    personal_phone text,
    personal_email text,
    emergency_contact_name text,
    emergency_contact_phone text,
    highest_qualification text,
    major text,
    resume_summary text,
    employee_id text,
    date_of_hire date,
    contract_type text,
    salary_grade text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tcm_number text,
    CONSTRAINT teacher_details_contract_type_check CHECK ((contract_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'substitute'::text])))
);


ALTER TABLE public.teacher_details OWNER TO postgres;

--
-- Name: COLUMN teacher_details.tcm_number; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.teacher_details.tcm_number IS 'Optional Teacher Council of Malawi registration number.';


--
-- Name: terms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.terms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    academic_year text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.terms OWNER TO postgres;

--
-- Name: weekly_assessment_scores; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.weekly_assessment_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    weekly_assessment_id uuid NOT NULL,
    student_id uuid NOT NULL,
    score numeric NOT NULL,
    entered_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT weekly_assessment_scores_score_check CHECK (((score >= (0)::numeric) AND (score <= (100)::numeric)))
);


ALTER TABLE public.weekly_assessment_scores OWNER TO postgres;

--
-- Name: weekly_assessments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.weekly_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    term_id uuid NOT NULL,
    week_number smallint NOT NULL,
    assessment_date date NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    submitted_at timestamp with time zone,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_comment text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT weekly_assessments_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'changes_requested'::text, 'approved'::text]))),
    CONSTRAINT weekly_assessments_week_number_check CHECK (((week_number >= 1) AND (week_number <= 12)))
);


ALTER TABLE public.weekly_assessments OWNER TO postgres;

--
-- Name: weekly_performance_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.weekly_performance_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    week_start_date date NOT NULL,
    review_text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.weekly_performance_reviews OWNER TO postgres;

--
-- Name: attendance_records attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);


--
-- Name: attendance_records attendance_records_student_id_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_student_id_date_key UNIQUE (student_id, date);


--
-- Name: class_subjects class_subjects_class_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_subject_id_key UNIQUE (class_id, subject_id);


--
-- Name: class_subjects class_subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: classes classes_school_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_name_key UNIQUE (school_id, name);


--
-- Name: curriculum_topics curriculum_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_pkey PRIMARY KEY (id);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: fee_categories fee_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_pkey PRIMARY KEY (id);


--
-- Name: fee_categories fee_categories_school_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_school_id_name_key UNIQUE (school_id, name);


--
-- Name: fee_category_item_collections fee_category_item_collections_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_pkey PRIMARY KEY (id);


--
-- Name: fee_category_item_collections fee_category_item_collections_student_item_term_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_student_item_term_key UNIQUE (student_id, fee_category_item_id, term_id);


--
-- Name: fee_category_items fee_category_items_category_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_items
    ADD CONSTRAINT fee_category_items_category_name_key UNIQUE (fee_category_id, name);


--
-- Name: fee_category_items fee_category_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_items
    ADD CONSTRAINT fee_category_items_pkey PRIMARY KEY (id);


--
-- Name: fee_charges fee_charges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_pkey PRIMARY KEY (id);


--
-- Name: fee_charges fee_charges_student_id_fee_category_id_term_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_student_id_fee_category_id_term_id_key UNIQUE (student_id, fee_category_id, term_id);


--
-- Name: fee_payments fee_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_pkey PRIMARY KEY (id);


--
-- Name: fee_structures fee_structures_class_id_fee_category_id_term_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_class_id_fee_category_id_term_id_key UNIQUE (class_id, fee_category_id, term_id);


--
-- Name: fee_structures fee_structures_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);


--
-- Name: grade_releases grade_releases_class_id_term_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_releases
    ADD CONSTRAINT grade_releases_class_id_term_id_key UNIQUE (class_id, term_id);


--
-- Name: grade_releases grade_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_releases
    ADD CONSTRAINT grade_releases_pkey PRIMARY KEY (id);


--
-- Name: grade_scale grade_scale_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_scale
    ADD CONSTRAINT grade_scale_pkey PRIMARY KEY (id);


--
-- Name: grades grades_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_pkey PRIMARY KEY (id);


--
-- Name: grades grades_student_id_subject_id_term_id_assessment_type_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_subject_id_term_id_assessment_type_key UNIQUE (student_id, subject_id, term_id, assessment_type);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: parent_accounts parent_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_accounts
    ADD CONSTRAINT parent_accounts_pkey PRIMARY KEY (id);


--
-- Name: parent_accounts parent_accounts_username_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_accounts
    ADD CONSTRAINT parent_accounts_username_key UNIQUE (username);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: progress_report_entries progress_report_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_pkey PRIMARY KEY (id);


--
-- Name: progress_report_entries progress_report_entries_student_id_term_id_field_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_student_id_term_id_field_id_key UNIQUE (student_id, term_id, field_id);


--
-- Name: progress_report_fields progress_report_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_fields
    ADD CONSTRAINT progress_report_fields_pkey PRIMARY KEY (id);


--
-- Name: progress_report_fields progress_report_fields_school_id_label_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_fields
    ADD CONSTRAINT progress_report_fields_school_id_label_key UNIQUE (school_id, label);


--
-- Name: promotion_decisions promotion_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_pkey PRIMARY KEY (id);


--
-- Name: promotion_decisions promotion_decisions_promotion_run_id_student_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_promotion_run_id_student_id_key UNIQUE (promotion_run_id, student_id);


--
-- Name: promotion_policies promotion_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_policies
    ADD CONSTRAINT promotion_policies_pkey PRIMARY KEY (id);


--
-- Name: promotion_policies promotion_policies_school_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_policies
    ADD CONSTRAINT promotion_policies_school_id_key UNIQUE (school_id);


--
-- Name: promotion_runs promotion_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_runs
    ADD CONSTRAINT promotion_runs_pkey PRIMARY KEY (id);


--
-- Name: promotion_runs promotion_runs_school_id_source_academic_year_target_academ_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_runs
    ADD CONSTRAINT promotion_runs_school_id_source_academic_year_target_academ_key UNIQUE (school_id, source_academic_year, target_academic_year);


--
-- Name: schools schools_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_name_key UNIQUE (name);


--
-- Name: schools schools_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_pkey PRIMARY KEY (id);


--
-- Name: schools schools_slug_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.schools
    ADD CONSTRAINT schools_slug_key UNIQUE (slug);


--
-- Name: student_status_history student_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_pkey PRIMARY KEY (id);


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_pkey PRIMARY KEY (id);


--
-- Name: students students_school_admission_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_admission_number_key UNIQUE (school_id, admission_number);


--
-- Name: subjects subjects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);


--
-- Name: subjects subjects_school_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_id_name_key UNIQUE (school_id, name);


--
-- Name: teacher_assignments teacher_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);


--
-- Name: teacher_assignments teacher_assignments_teacher_id_class_id_subject_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_class_id_subject_id_key UNIQUE (teacher_id, class_id, subject_id);


--
-- Name: teacher_certifications teacher_certifications_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_certifications
    ADD CONSTRAINT teacher_certifications_pkey PRIMARY KEY (id);


--
-- Name: teacher_details teacher_details_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_details
    ADD CONSTRAINT teacher_details_pkey PRIMARY KEY (id);


--
-- Name: terms terms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terms
    ADD CONSTRAINT terms_pkey PRIMARY KEY (id);


--
-- Name: terms terms_school_id_academic_year_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terms
    ADD CONSTRAINT terms_school_id_academic_year_name_key UNIQUE (school_id, academic_year, name);


--
-- Name: weekly_assessment_scores weekly_assessment_scores_assessment_student_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessment_scores
    ADD CONSTRAINT weekly_assessment_scores_assessment_student_key UNIQUE (weekly_assessment_id, student_id);


--
-- Name: weekly_assessment_scores weekly_assessment_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessment_scores
    ADD CONSTRAINT weekly_assessment_scores_pkey PRIMARY KEY (id);


--
-- Name: weekly_assessments weekly_assessments_class_subject_term_week_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_class_subject_term_week_key UNIQUE (class_id, subject_id, term_id, week_number);


--
-- Name: weekly_assessments weekly_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_pkey PRIMARY KEY (id);


--
-- Name: weekly_performance_reviews weekly_performance_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_performance_reviews
    ADD CONSTRAINT weekly_performance_reviews_pkey PRIMARY KEY (id);


--
-- Name: curriculum_topics_assignment_title_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX curriculum_topics_assignment_title_key ON public.curriculum_topics USING btree (teacher_id, class_id, subject_id, term_id, lower(btrim(title)));


--
-- Name: error_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX error_logs_created_at_idx ON public.error_logs USING btree (created_at DESC);


--
-- Name: error_logs_error_type_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX error_logs_error_type_idx ON public.error_logs USING btree (error_type);


--
-- Name: error_logs_school_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX error_logs_school_id_idx ON public.error_logs USING btree (school_id);


--
-- Name: idx_attendance_school_class_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_school_class_date ON public.attendance_records USING btree (school_id, class_id, date);


--
-- Name: idx_attendance_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_attendance_student ON public.attendance_records USING btree (student_id);


--
-- Name: idx_classes_school_progression_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_classes_school_progression_order ON public.classes USING btree (school_id, progression_order);


--
-- Name: idx_curriculum_topics_class_subject_term; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_curriculum_topics_class_subject_term ON public.curriculum_topics USING btree (class_id, subject_id, term_id);


--
-- Name: idx_curriculum_topics_school_term; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_curriculum_topics_school_term ON public.curriculum_topics USING btree (school_id, term_id);


--
-- Name: idx_curriculum_topics_teacher_term; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_curriculum_topics_teacher_term ON public.curriculum_topics USING btree (teacher_id, term_id);


--
-- Name: idx_fee_charges_school_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fee_charges_school_student ON public.fee_charges USING btree (school_id, student_id);


--
-- Name: idx_fee_payments_charge; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fee_payments_charge ON public.fee_payments USING btree (fee_charge_id);


--
-- Name: idx_fee_payments_school_date; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_fee_payments_school_date ON public.fee_payments USING btree (school_id, payment_date);


--
-- Name: idx_grades_school_term_subject; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_grades_school_term_subject ON public.grades USING btree (school_id, term_id, subject_id);


--
-- Name: idx_grades_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_grades_student ON public.grades USING btree (student_id);


--
-- Name: idx_parent_accounts_full_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parent_accounts_full_name_trgm ON public.parent_accounts USING gin (full_name public.gin_trgm_ops);


--
-- Name: idx_parent_accounts_phone_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parent_accounts_phone_trgm ON public.parent_accounts USING gin (phone public.gin_trgm_ops);


--
-- Name: idx_parent_accounts_school_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parent_accounts_school_created_at ON public.parent_accounts USING btree (school_id, created_at DESC);


--
-- Name: idx_parent_accounts_school_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parent_accounts_school_id ON public.parent_accounts USING btree (school_id);


--
-- Name: idx_parent_accounts_username_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_parent_accounts_username_trgm ON public.parent_accounts USING gin (username public.gin_trgm_ops);


--
-- Name: idx_profiles_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_profiles_username ON public.profiles USING btree (username) WHERE (username IS NOT NULL);


--
-- Name: idx_progress_entries_school_term; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_progress_entries_school_term ON public.progress_report_entries USING btree (school_id, term_id);


--
-- Name: idx_student_status_history_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_student_status_history_student ON public.student_status_history USING btree (student_id);


--
-- Name: idx_students_admission_number_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_admission_number_trgm ON public.students USING gin (admission_number public.gin_trgm_ops);


--
-- Name: idx_students_class_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_class_id ON public.students USING btree (class_id);


--
-- Name: idx_students_date_joined; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_date_joined ON public.students USING btree (date_joined);


--
-- Name: idx_students_full_name_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_full_name_trgm ON public.students USING gin (full_name public.gin_trgm_ops);


--
-- Name: idx_students_school_class; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_school_class ON public.students USING btree (school_id, class_id);


--
-- Name: idx_students_school_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_school_created_at ON public.students USING btree (school_id, created_at DESC);


--
-- Name: idx_students_school_date_joined; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_school_date_joined ON public.students USING btree (school_id, date_joined);


--
-- Name: idx_students_school_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_school_id ON public.students USING btree (school_id);


--
-- Name: idx_students_school_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_students_school_status ON public.students USING btree (school_id, status);


--
-- Name: idx_teacher_assignments_class_subject; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_assignments_class_subject ON public.teacher_assignments USING btree (class_id, subject_id);


--
-- Name: idx_teacher_assignments_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_assignments_teacher ON public.teacher_assignments USING btree (teacher_id);


--
-- Name: idx_teacher_certifications_teacher; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_teacher_certifications_teacher ON public.teacher_certifications USING btree (teacher_id);


--
-- Name: idx_teacher_details_school_employee_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_teacher_details_school_employee_id ON public.teacher_details USING btree (school_id, employee_id) WHERE (employee_id IS NOT NULL);


--
-- Name: idx_weekly_assessment_scores_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_weekly_assessment_scores_student ON public.weekly_assessment_scores USING btree (student_id, weekly_assessment_id);


--
-- Name: idx_weekly_assessments_class_subject; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_weekly_assessments_class_subject ON public.weekly_assessments USING btree (class_id, subject_id, term_id, week_number);


--
-- Name: idx_weekly_assessments_school_term; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_weekly_assessments_school_term ON public.weekly_assessments USING btree (school_id, term_id, week_number);


--
-- Name: idx_weekly_performance_reviews_class_week; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_weekly_performance_reviews_class_week ON public.weekly_performance_reviews USING btree (class_id, week_start_date);


--
-- Name: idx_weekly_performance_reviews_student; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_weekly_performance_reviews_student ON public.weekly_performance_reviews USING btree (student_id);


--
-- Name: curriculum_topics trg_enforce_curriculum_topic_approval_workflow; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_enforce_curriculum_topic_approval_workflow BEFORE INSERT OR UPDATE ON public.curriculum_topics FOR EACH ROW EXECUTE FUNCTION public.enforce_curriculum_topic_approval_workflow();


--
-- Name: fee_payments trg_enforce_fee_payment_reversal; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_enforce_fee_payment_reversal BEFORE UPDATE ON public.fee_payments FOR EACH ROW EXECUTE FUNCTION public.enforce_fee_payment_reversal();


--
-- Name: profiles trg_prevent_profile_privilege_escalation; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_prevent_profile_privilege_escalation BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();


--
-- Name: schools trg_seed_new_school_defaults; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_seed_new_school_defaults AFTER INSERT ON public.schools FOR EACH ROW EXECUTE FUNCTION public.seed_new_school_defaults();


--
-- Name: attendance_records attendance_records_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: attendance_records attendance_records_marked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES public.profiles(id);


--
-- Name: attendance_records attendance_records_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: attendance_records attendance_records_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.attendance_records
    ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: class_subjects class_subjects_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.class_subjects
    ADD CONSTRAINT class_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: classes classes_class_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_class_teacher_id_fkey FOREIGN KEY (class_teacher_id) REFERENCES public.profiles(id);


--
-- Name: classes classes_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: curriculum_topics curriculum_topics_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: curriculum_topics curriculum_topics_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: curriculum_topics curriculum_topics_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: curriculum_topics curriculum_topics_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: curriculum_topics curriculum_topics_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: curriculum_topics curriculum_topics_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.curriculum_topics
    ADD CONSTRAINT curriculum_topics_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;


--
-- Name: error_logs error_logs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE SET NULL;


--
-- Name: error_logs error_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: fee_categories fee_categories_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_categories
    ADD CONSTRAINT fee_categories_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: fee_category_item_collections fee_category_item_collections_fee_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES public.fee_categories(id) ON DELETE CASCADE;


--
-- Name: fee_category_item_collections fee_category_item_collections_fee_category_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_fee_category_item_id_fkey FOREIGN KEY (fee_category_item_id) REFERENCES public.fee_category_items(id) ON DELETE SET NULL;


--
-- Name: fee_category_item_collections fee_category_item_collections_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: fee_category_item_collections fee_category_item_collections_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: fee_category_item_collections fee_category_item_collections_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;


--
-- Name: fee_category_item_collections fee_category_item_collections_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_item_collections
    ADD CONSTRAINT fee_category_item_collections_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.profiles(id);


--
-- Name: fee_category_items fee_category_items_fee_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_items
    ADD CONSTRAINT fee_category_items_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES public.fee_categories(id) ON DELETE CASCADE;


--
-- Name: fee_category_items fee_category_items_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_category_items
    ADD CONSTRAINT fee_category_items_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: fee_charges fee_charges_fee_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES public.fee_categories(id) ON DELETE CASCADE;


--
-- Name: fee_charges fee_charges_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: fee_charges fee_charges_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: fee_charges fee_charges_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_charges
    ADD CONSTRAINT fee_charges_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;


--
-- Name: fee_payments fee_payments_fee_charge_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_fee_charge_id_fkey FOREIGN KEY (fee_charge_id) REFERENCES public.fee_charges(id) ON DELETE CASCADE;


--
-- Name: fee_payments fee_payments_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: fee_payments fee_payments_reversed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_reversed_by_fkey FOREIGN KEY (reversed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: fee_payments fee_payments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_payments
    ADD CONSTRAINT fee_payments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: fee_structures fee_structures_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: fee_structures fee_structures_fee_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES public.fee_categories(id) ON DELETE CASCADE;


--
-- Name: fee_structures fee_structures_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: fee_structures fee_structures_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.fee_structures
    ADD CONSTRAINT fee_structures_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;


--
-- Name: grade_releases grade_releases_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_releases
    ADD CONSTRAINT grade_releases_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: grade_releases grade_releases_released_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_releases
    ADD CONSTRAINT grade_releases_released_by_fkey FOREIGN KEY (released_by) REFERENCES public.profiles(id);


--
-- Name: grade_releases grade_releases_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_releases
    ADD CONSTRAINT grade_releases_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: grade_releases grade_releases_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_releases
    ADD CONSTRAINT grade_releases_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id);


--
-- Name: grade_scale grade_scale_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grade_scale
    ADD CONSTRAINT grade_scale_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: grades grades_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.profiles(id);


--
-- Name: grades grades_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: grades grades_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: grades grades_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id);


--
-- Name: grades grades_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.grades
    ADD CONSTRAINT grades_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id);


--
-- Name: notifications notifications_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: parent_accounts parent_accounts_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.parent_accounts
    ADD CONSTRAINT parent_accounts_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: progress_report_entries progress_report_entries_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.profiles(id);


--
-- Name: progress_report_entries progress_report_entries_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.progress_report_fields(id) ON DELETE CASCADE;


--
-- Name: progress_report_entries progress_report_entries_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: progress_report_entries progress_report_entries_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: progress_report_entries progress_report_entries_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_entries
    ADD CONSTRAINT progress_report_entries_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id);


--
-- Name: progress_report_fields progress_report_fields_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.progress_report_fields
    ADD CONSTRAINT progress_report_fields_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: promotion_decisions promotion_decisions_destination_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_destination_class_id_fkey FOREIGN KEY (destination_class_id) REFERENCES public.classes(id);


--
-- Name: promotion_decisions promotion_decisions_promotion_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_promotion_run_id_fkey FOREIGN KEY (promotion_run_id) REFERENCES public.promotion_runs(id) ON DELETE CASCADE;


--
-- Name: promotion_decisions promotion_decisions_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: promotion_decisions promotion_decisions_source_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_source_class_id_fkey FOREIGN KEY (source_class_id) REFERENCES public.classes(id);


--
-- Name: promotion_decisions promotion_decisions_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_decisions
    ADD CONSTRAINT promotion_decisions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE RESTRICT;


--
-- Name: promotion_policies promotion_policies_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_policies
    ADD CONSTRAINT promotion_policies_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: promotion_runs promotion_runs_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_runs
    ADD CONSTRAINT promotion_runs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: promotion_runs promotion_runs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_runs
    ADD CONSTRAINT promotion_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: promotion_runs promotion_runs_final_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_runs
    ADD CONSTRAINT promotion_runs_final_term_id_fkey FOREIGN KEY (final_term_id) REFERENCES public.terms(id);


--
-- Name: promotion_runs promotion_runs_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.promotion_runs
    ADD CONSTRAINT promotion_runs_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;


--
-- Name: student_status_history student_status_history_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);


--
-- Name: student_status_history student_status_history_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: student_status_history student_status_history_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.student_status_history
    ADD CONSTRAINT student_status_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: students students_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id);


--
-- Name: students students_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: students students_parent_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_parent_account_id_fkey FOREIGN KEY (parent_account_id) REFERENCES public.parent_accounts(id) ON DELETE SET NULL;


--
-- Name: students students_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.students
    ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: subjects subjects_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subjects
    ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: teacher_assignments teacher_assignments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: teacher_assignments teacher_assignments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: teacher_assignments teacher_assignments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: teacher_assignments teacher_assignments_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_assignments
    ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: teacher_certifications teacher_certifications_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_certifications
    ADD CONSTRAINT teacher_certifications_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: teacher_certifications teacher_certifications_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_certifications
    ADD CONSTRAINT teacher_certifications_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: teacher_details teacher_details_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_details
    ADD CONSTRAINT teacher_details_id_fkey FOREIGN KEY (id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: teacher_details teacher_details_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teacher_details
    ADD CONSTRAINT teacher_details_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: terms terms_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.terms
    ADD CONSTRAINT terms_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: weekly_assessment_scores weekly_assessment_scores_entered_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessment_scores
    ADD CONSTRAINT weekly_assessment_scores_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES public.profiles(id);


--
-- Name: weekly_assessment_scores weekly_assessment_scores_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessment_scores
    ADD CONSTRAINT weekly_assessment_scores_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: weekly_assessment_scores weekly_assessment_scores_weekly_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessment_scores
    ADD CONSTRAINT weekly_assessment_scores_weekly_assessment_id_fkey FOREIGN KEY (weekly_assessment_id) REFERENCES public.weekly_assessments(id) ON DELETE CASCADE;


--
-- Name: weekly_assessments weekly_assessments_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: weekly_assessments weekly_assessments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: weekly_assessments weekly_assessments_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id);


--
-- Name: weekly_assessments weekly_assessments_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: weekly_assessments weekly_assessments_subject_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;


--
-- Name: weekly_assessments weekly_assessments_term_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_assessments
    ADD CONSTRAINT weekly_assessments_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;


--
-- Name: weekly_performance_reviews weekly_performance_reviews_class_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_performance_reviews
    ADD CONSTRAINT weekly_performance_reviews_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;


--
-- Name: weekly_performance_reviews weekly_performance_reviews_school_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_performance_reviews
    ADD CONSTRAINT weekly_performance_reviews_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);


--
-- Name: weekly_performance_reviews weekly_performance_reviews_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_performance_reviews
    ADD CONSTRAINT weekly_performance_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;


--
-- Name: weekly_performance_reviews weekly_performance_reviews_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.weekly_performance_reviews
    ADD CONSTRAINT weekly_performance_reviews_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: attendance_records attendance_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_admin_all ON public.attendance_records USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: attendance_records attendance_headteacher_insert_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_headteacher_insert_own_school ON public.attendance_records FOR INSERT WITH CHECK ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: attendance_records attendance_headteacher_select_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_headteacher_select_own_school ON public.attendance_records FOR SELECT USING ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: attendance_records attendance_headteacher_update_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_headteacher_update_own_school ON public.attendance_records FOR UPDATE USING ((school_id = public.headteacher_school_id(auth.uid()))) WITH CHECK ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: attendance_records attendance_insert_class_teacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_insert_class_teacher ON public.attendance_records FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid())))));


--
-- Name: attendance_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

--
-- Name: attendance_records attendance_select_class_teacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_select_class_teacher ON public.attendance_records FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid())))));


--
-- Name: attendance_records attendance_update_class_teacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY attendance_update_class_teacher ON public.attendance_records FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid())))));


--
-- Name: class_subjects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: class_subjects class_subjects_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY class_subjects_all_own_school ON public.class_subjects USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = public.user_school_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = public.user_school_id(auth.uid()))))));


--
-- Name: class_subjects class_subjects_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY class_subjects_select_parent_own_school ON public.class_subjects FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = public.parent_school_id(auth.uid()))))));


--
-- Name: class_subjects class_subjects_select_teacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY class_subjects_select_teacher_own_school ON public.class_subjects FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = public.teacher_school_id(auth.uid()))))));


--
-- Name: classes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

--
-- Name: classes classes_insert_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY classes_insert_own_school ON public.classes FOR INSERT WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: classes classes_select_headteacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY classes_select_headteacher_own_school ON public.classes FOR SELECT USING ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: classes classes_select_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY classes_select_own_school ON public.classes FOR SELECT USING ((school_id = public.user_school_id(auth.uid())));


--
-- Name: classes classes_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY classes_select_parent_own_school ON public.classes FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: classes classes_select_teacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY classes_select_teacher_own_school ON public.classes FOR SELECT USING ((school_id = public.teacher_school_id(auth.uid())));


--
-- Name: classes classes_update_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY classes_update_own_school ON public.classes FOR UPDATE USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: curriculum_topics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.curriculum_topics ENABLE ROW LEVEL SECURITY;

--
-- Name: curriculum_topics curriculum_topics_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_admin_all ON public.curriculum_topics TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = curriculum_topics.school_id) AND (p.role = 'admin'::text))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.school_id = curriculum_topics.school_id) AND (p.role = 'admin'::text)))) AND (EXISTS ( SELECT 1
   FROM public.terms t
  WHERE ((t.id = curriculum_topics.term_id) AND (t.school_id = curriculum_topics.school_id)))) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.school_id = curriculum_topics.school_id) AND (ta.teacher_id = curriculum_topics.teacher_id) AND (ta.class_id = curriculum_topics.class_id) AND (ta.subject_id = curriculum_topics.subject_id))))));


--
-- Name: curriculum_topics curriculum_topics_headteacher_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_headteacher_select ON public.curriculum_topics FOR SELECT TO authenticated USING ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: curriculum_topics curriculum_topics_headteacher_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_headteacher_update ON public.curriculum_topics FOR UPDATE TO authenticated USING ((school_id = public.headteacher_school_id(auth.uid()))) WITH CHECK ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: curriculum_topics curriculum_topics_teacher_delete; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_teacher_delete ON public.curriculum_topics FOR DELETE TO authenticated USING (((teacher_id = auth.uid()) AND (approval_status = ANY (ARRAY['not_started'::text, 'disapproved'::text])) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.school_id = curriculum_topics.school_id) AND (ta.teacher_id = auth.uid()) AND (ta.class_id = curriculum_topics.class_id) AND (ta.subject_id = curriculum_topics.subject_id))))));


--
-- Name: curriculum_topics curriculum_topics_teacher_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_teacher_insert ON public.curriculum_topics FOR INSERT WITH CHECK (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.school_id = curriculum_topics.school_id) AND (ta.teacher_id = auth.uid()) AND (ta.class_id = curriculum_topics.class_id) AND (ta.subject_id = curriculum_topics.subject_id)))) AND (EXISTS ( SELECT 1
   FROM public.terms t
  WHERE ((t.id = curriculum_topics.term_id) AND (t.school_id = curriculum_topics.school_id))))));


--
-- Name: curriculum_topics curriculum_topics_teacher_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_teacher_select ON public.curriculum_topics FOR SELECT USING (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.school_id = curriculum_topics.school_id) AND (ta.teacher_id = auth.uid()) AND (ta.class_id = curriculum_topics.class_id) AND (ta.subject_id = curriculum_topics.subject_id))))));


--
-- Name: curriculum_topics curriculum_topics_teacher_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY curriculum_topics_teacher_update ON public.curriculum_topics FOR UPDATE USING (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.school_id = curriculum_topics.school_id) AND (ta.teacher_id = auth.uid()) AND (ta.class_id = curriculum_topics.class_id) AND (ta.subject_id = curriculum_topics.subject_id)))))) WITH CHECK (((teacher_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.school_id = curriculum_topics.school_id) AND (ta.teacher_id = auth.uid()) AND (ta.class_id = curriculum_topics.class_id) AND (ta.subject_id = curriculum_topics.subject_id)))) AND (EXISTS ( SELECT 1
   FROM public.terms t
  WHERE ((t.id = curriculum_topics.term_id) AND (t.school_id = curriculum_topics.school_id))))));


--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_categories fee_categories_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_categories_admin_all ON public.fee_categories USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: fee_categories fee_categories_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_categories_select_parent_own_school ON public.fee_categories FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: fee_category_item_collections; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fee_category_item_collections ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_category_item_collections fee_category_item_collections_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_category_item_collections_admin_all ON public.fee_category_item_collections USING (((school_id = public.user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.students student
  WHERE ((student.id = fee_category_item_collections.student_id) AND (student.school_id = fee_category_item_collections.school_id)))) AND (EXISTS ( SELECT 1
   FROM public.fee_categories category
  WHERE ((category.id = fee_category_item_collections.fee_category_id) AND (category.school_id = fee_category_item_collections.school_id) AND category.is_flexible))) AND (EXISTS ( SELECT 1
   FROM public.terms term
  WHERE ((term.id = fee_category_item_collections.term_id) AND (term.school_id = fee_category_item_collections.school_id)))))) WITH CHECK (((school_id = public.user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.students student
  WHERE ((student.id = fee_category_item_collections.student_id) AND (student.school_id = fee_category_item_collections.school_id)))) AND (EXISTS ( SELECT 1
   FROM public.fee_categories category
  WHERE ((category.id = fee_category_item_collections.fee_category_id) AND (category.school_id = fee_category_item_collections.school_id) AND category.is_flexible))) AND (EXISTS ( SELECT 1
   FROM public.fee_category_items item
  WHERE ((item.id = fee_category_item_collections.fee_category_item_id) AND (item.fee_category_id = fee_category_item_collections.fee_category_id) AND (item.school_id = fee_category_item_collections.school_id)))) AND (EXISTS ( SELECT 1
   FROM public.terms term
  WHERE ((term.id = fee_category_item_collections.term_id) AND (term.school_id = fee_category_item_collections.school_id))))));


--
-- Name: fee_category_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fee_category_items ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_category_items fee_category_items_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_category_items_admin_all ON public.fee_category_items USING (((school_id = public.user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.fee_categories category
  WHERE ((category.id = fee_category_items.fee_category_id) AND (category.school_id = fee_category_items.school_id) AND category.is_flexible))))) WITH CHECK (((school_id = public.user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.fee_categories category
  WHERE ((category.id = fee_category_items.fee_category_id) AND (category.school_id = fee_category_items.school_id) AND category.is_flexible)))));


--
-- Name: fee_charges; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fee_charges ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_charges fee_charges_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_charges_admin_all ON public.fee_charges USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: fee_charges fee_charges_select_own_child; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_charges_select_own_child ON public.fee_charges FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = fee_charges.student_id) AND (s.parent_account_id = auth.uid())))));


--
-- Name: fee_payments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_payments fee_payments_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_payments_admin_all ON public.fee_payments USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: fee_payments fee_payments_select_own_child; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_payments_select_own_child ON public.fee_payments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.fee_charges fc
     JOIN public.students s ON ((s.id = fc.student_id)))
  WHERE ((fc.id = fee_payments.fee_charge_id) AND (s.parent_account_id = auth.uid())))));


--
-- Name: fee_structures; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;

--
-- Name: fee_structures fee_structures_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY fee_structures_admin_all ON public.fee_structures USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: grade_releases; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.grade_releases ENABLE ROW LEVEL SECURITY;

--
-- Name: grade_releases grade_releases_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grade_releases_all_own_school ON public.grade_releases USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: grade_releases grade_releases_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grade_releases_select_parent_own_school ON public.grade_releases FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: grade_scale; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.grade_scale ENABLE ROW LEVEL SECURITY;

--
-- Name: grade_scale grade_scale_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grade_scale_all_own_school ON public.grade_scale USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: grade_scale grade_scale_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grade_scale_select_parent_own_school ON public.grade_scale FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: grade_scale grade_scale_select_teacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grade_scale_select_teacher_own_school ON public.grade_scale FOR SELECT USING ((school_id = public.teacher_school_id(auth.uid())));


--
-- Name: grades; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

--
-- Name: grades grades_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grades_all_own_school ON public.grades USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: grades grades_insert_teacher_assigned; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grades_insert_teacher_assigned ON public.grades FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.teacher_assignments ta
     JOIN public.students s ON ((s.id = grades.student_id)))
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id) AND (ta.class_id = s.class_id)))));


--
-- Name: grades grades_select_own_child_if_released; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grades_select_own_child_if_released ON public.grades FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.students s
     JOIN public.grade_releases gr ON (((gr.class_id = s.class_id) AND (gr.term_id = grades.term_id))))
  WHERE ((s.id = grades.student_id) AND (s.parent_account_id = auth.uid())))));


--
-- Name: grades grades_select_teacher_own_subjects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grades_select_teacher_own_subjects ON public.grades FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id)))));


--
-- Name: grades grades_update_teacher_assigned; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY grades_update_teacher_assigned ON public.grades FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.teacher_assignments ta
     JOIN public.students s ON ((s.id = grades.student_id)))
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id) AND (ta.class_id = s.class_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.teacher_assignments ta
     JOIN public.students s ON ((s.id = grades.student_id)))
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id) AND (ta.class_id = s.class_id)))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_select_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY notifications_select_own_school ON public.notifications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.students
  WHERE ((students.id = notifications.student_id) AND (students.school_id = public.user_school_id(auth.uid()))))));


--
-- Name: parent_accounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.parent_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: parent_accounts parent_accounts_delete_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parent_accounts_delete_own_school ON public.parent_accounts FOR DELETE USING ((school_id = public.user_school_id(auth.uid())));


--
-- Name: parent_accounts parent_accounts_insert_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parent_accounts_insert_own_school ON public.parent_accounts FOR INSERT WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: parent_accounts parent_accounts_select_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parent_accounts_select_own_school ON public.parent_accounts FOR SELECT USING ((school_id = public.user_school_id(auth.uid())));


--
-- Name: parent_accounts parent_accounts_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parent_accounts_select_self ON public.parent_accounts FOR SELECT USING ((id = auth.uid()));


--
-- Name: parent_accounts parent_accounts_update_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY parent_accounts_update_own_school ON public.parent_accounts FOR UPDATE USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT USING ((id = auth.uid()));


--
-- Name: profiles profiles_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_parent_own_school ON public.profiles FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: profiles profiles_select_school_staff_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_school_staff_admin ON public.profiles FOR SELECT USING ((school_id = public.user_school_id(auth.uid())));


--
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- Name: progress_report_entries progress_entries_select_own_child_if_released; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY progress_entries_select_own_child_if_released ON public.progress_report_entries FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.students s
     JOIN public.grade_releases gr ON (((gr.class_id = s.class_id) AND (gr.term_id = progress_report_entries.term_id))))
  WHERE ((s.id = progress_report_entries.student_id) AND (s.parent_account_id = auth.uid())))));


--
-- Name: progress_report_fields progress_fields_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY progress_fields_select_parent_own_school ON public.progress_report_fields FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: progress_report_entries; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.progress_report_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: progress_report_entries progress_report_entries_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY progress_report_entries_all_own_school ON public.progress_report_entries USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: progress_report_fields; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.progress_report_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: progress_report_fields progress_report_fields_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY progress_report_fields_all_own_school ON public.progress_report_fields USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: promotion_decisions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.promotion_decisions ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_decisions promotion_decisions_school_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY promotion_decisions_school_access ON public.promotion_decisions USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: promotion_policies; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.promotion_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_policies promotion_policies_school_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY promotion_policies_school_access ON public.promotion_policies USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: promotion_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.promotion_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: promotion_runs promotion_runs_school_access; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY promotion_runs_school_access ON public.promotion_runs USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: schools; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

--
-- Name: schools schools_select_headteacher_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY schools_select_headteacher_own ON public.schools FOR SELECT USING ((id = public.headteacher_school_id(auth.uid())));


--
-- Name: schools schools_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY schools_select_own ON public.schools FOR SELECT USING ((id = public.user_school_id(auth.uid())));


--
-- Name: schools schools_select_parent_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY schools_select_parent_own ON public.schools FOR SELECT USING ((id = public.parent_school_id(auth.uid())));


--
-- Name: schools schools_select_teacher_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY schools_select_teacher_own ON public.schools FOR SELECT USING ((id = public.teacher_school_id(auth.uid())));


--
-- Name: schools schools_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY schools_update_own ON public.schools FOR UPDATE USING ((id = public.user_school_id(auth.uid()))) WITH CHECK ((id = public.user_school_id(auth.uid())));


--
-- Name: student_status_history; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;

--
-- Name: student_status_history student_status_history_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY student_status_history_all_own_school ON public.student_status_history USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

--
-- Name: students students_delete_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_delete_own_school ON public.students FOR DELETE USING ((school_id = public.user_school_id(auth.uid())));


--
-- Name: students students_insert_headteacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_insert_headteacher ON public.students FOR INSERT WITH CHECK ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: students students_insert_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_insert_own_school ON public.students FOR INSERT WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: students students_select_class_teacher_classes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_select_class_teacher_classes ON public.students FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = students.class_id) AND (c.class_teacher_id = auth.uid())))));


--
-- Name: students students_select_headteacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_select_headteacher ON public.students FOR SELECT USING ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: students students_select_own_parent_account; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_select_own_parent_account ON public.students FOR SELECT USING ((parent_account_id = auth.uid()));


--
-- Name: students students_select_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_select_own_school ON public.students FOR SELECT USING ((school_id = public.user_school_id(auth.uid())));


--
-- Name: students students_select_teacher_assigned_classes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_select_teacher_assigned_classes ON public.students FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.class_id = students.class_id)))));


--
-- Name: students students_update_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY students_update_own_school ON public.students FOR UPDATE USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: subjects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

--
-- Name: subjects subjects_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subjects_all_own_school ON public.subjects USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: subjects subjects_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subjects_select_parent_own_school ON public.subjects FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: subjects subjects_select_teacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subjects_select_teacher_own_school ON public.subjects FOR SELECT USING ((school_id = public.teacher_school_id(auth.uid())));


--
-- Name: subjects subjects_select_headteacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY subjects_select_headteacher_own_school ON public.subjects FOR SELECT TO authenticated USING ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: teacher_assignments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_assignments teacher_assignments_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teacher_assignments_admin_all ON public.teacher_assignments USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: teacher_assignments teacher_assignments_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teacher_assignments_select_self ON public.teacher_assignments FOR SELECT USING ((teacher_id = auth.uid()));


--
-- Name: teacher_certifications; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teacher_certifications ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_certifications teacher_certifications_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teacher_certifications_admin_all ON public.teacher_certifications USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: teacher_certifications teacher_certifications_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teacher_certifications_select_self ON public.teacher_certifications FOR SELECT USING ((teacher_id = auth.uid()));


--
-- Name: teacher_details; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.teacher_details ENABLE ROW LEVEL SECURITY;

--
-- Name: teacher_details teacher_details_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teacher_details_admin_all ON public.teacher_details USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: teacher_details teacher_details_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY teacher_details_select_self ON public.teacher_details FOR SELECT USING ((id = auth.uid()));


--
-- Name: terms; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

--
-- Name: terms terms_all_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY terms_all_own_school ON public.terms USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: terms terms_select_headteacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY terms_select_headteacher_own_school ON public.terms FOR SELECT TO authenticated USING ((school_id = public.headteacher_school_id(auth.uid())));


--
-- Name: terms terms_select_parent_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY terms_select_parent_own_school ON public.terms FOR SELECT USING ((school_id = public.parent_school_id(auth.uid())));


--
-- Name: terms terms_select_teacher_own_school; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY terms_select_teacher_own_school ON public.terms FOR SELECT USING ((school_id = public.teacher_school_id(auth.uid())));


--
-- Name: weekly_assessment_scores; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.weekly_assessment_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_assessment_scores weekly_assessment_scores_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessment_scores_admin_all ON public.weekly_assessment_scores TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.weekly_assessments assessment
     JOIN public.profiles profile ON ((profile.id = auth.uid())))
  WHERE ((assessment.id = weekly_assessment_scores.weekly_assessment_id) AND (assessment.school_id = public.user_school_id(auth.uid())) AND (assessment.school_id = profile.school_id) AND (profile.role = ANY (ARRAY['admin'::text, 'headteacher'::text])))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.weekly_assessments assessment
     JOIN public.profiles profile ON ((profile.id = auth.uid())))
  WHERE ((assessment.id = weekly_assessment_scores.weekly_assessment_id) AND (assessment.school_id = public.user_school_id(auth.uid())) AND (assessment.school_id = profile.school_id) AND (profile.role = ANY (ARRAY['admin'::text, 'headteacher'::text]))))) AND (EXISTS ( SELECT 1
   FROM (public.students student
     JOIN public.weekly_assessments assessment ON ((assessment.id = weekly_assessment_scores.weekly_assessment_id)))
  WHERE ((student.id = weekly_assessment_scores.student_id) AND (student.class_id = assessment.class_id) AND (student.school_id = assessment.school_id))))));


--
-- Name: weekly_assessment_scores weekly_assessment_scores_parent_read_approved; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessment_scores_parent_read_approved ON public.weekly_assessment_scores FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.students student
     JOIN public.weekly_assessments assessment ON ((assessment.id = weekly_assessment_scores.weekly_assessment_id)))
  WHERE ((student.id = weekly_assessment_scores.student_id) AND (student.parent_account_id = auth.uid()) AND (student.school_id = assessment.school_id) AND (assessment.status = 'approved'::text)))));


--
-- Name: weekly_assessment_scores weekly_assessment_scores_teacher_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessment_scores_teacher_insert ON public.weekly_assessment_scores FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.weekly_assessments assessment
     JOIN public.teacher_assignments assignment ON (((assignment.class_id = assessment.class_id) AND (assignment.subject_id = assessment.subject_id) AND (assignment.teacher_id = auth.uid()))))
  WHERE ((assessment.id = weekly_assessment_scores.weekly_assessment_id) AND (assessment.school_id = public.teacher_school_id(auth.uid())) AND (assessment.status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))))) AND (EXISTS ( SELECT 1
   FROM (public.students student
     JOIN public.weekly_assessments assessment ON ((assessment.id = weekly_assessment_scores.weekly_assessment_id)))
  WHERE ((student.id = weekly_assessment_scores.student_id) AND (student.class_id = assessment.class_id) AND (student.school_id = assessment.school_id))))));


--
-- Name: weekly_assessment_scores weekly_assessment_scores_teacher_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessment_scores_teacher_select ON public.weekly_assessment_scores FOR SELECT TO authenticated USING (((EXISTS ( SELECT 1
   FROM (public.weekly_assessments assessment
     JOIN public.teacher_assignments assignment ON (((assignment.class_id = assessment.class_id) AND (assignment.subject_id = assessment.subject_id) AND (assignment.teacher_id = auth.uid()))))
  WHERE ((assessment.id = weekly_assessment_scores.weekly_assessment_id) AND (assessment.school_id = public.teacher_school_id(auth.uid()))))) AND (EXISTS ( SELECT 1
   FROM (public.students student
     JOIN public.weekly_assessments assessment ON ((assessment.id = weekly_assessment_scores.weekly_assessment_id)))
  WHERE ((student.id = weekly_assessment_scores.student_id) AND (student.class_id = assessment.class_id) AND (student.school_id = assessment.school_id))))));


--
-- Name: weekly_assessment_scores weekly_assessment_scores_teacher_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessment_scores_teacher_update ON public.weekly_assessment_scores FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM (public.weekly_assessments assessment
     JOIN public.teacher_assignments assignment ON (((assignment.class_id = assessment.class_id) AND (assignment.subject_id = assessment.subject_id) AND (assignment.teacher_id = auth.uid()))))
  WHERE ((assessment.id = weekly_assessment_scores.weekly_assessment_id) AND (assessment.school_id = public.teacher_school_id(auth.uid())) AND (assessment.status = ANY (ARRAY['draft'::text, 'changes_requested'::text])))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM (public.weekly_assessments assessment
     JOIN public.teacher_assignments assignment ON (((assignment.class_id = assessment.class_id) AND (assignment.subject_id = assessment.subject_id) AND (assignment.teacher_id = auth.uid()))))
  WHERE ((assessment.id = weekly_assessment_scores.weekly_assessment_id) AND (assessment.school_id = public.teacher_school_id(auth.uid())) AND (assessment.status = ANY (ARRAY['draft'::text, 'changes_requested'::text]))))) AND (EXISTS ( SELECT 1
   FROM (public.students student
     JOIN public.weekly_assessments assessment ON ((assessment.id = weekly_assessment_scores.weekly_assessment_id)))
  WHERE ((student.id = weekly_assessment_scores.student_id) AND (student.class_id = assessment.class_id) AND (student.school_id = assessment.school_id))))));


--
-- Name: weekly_assessments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.weekly_assessments ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_assessments weekly_assessments_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessments_admin_all ON public.weekly_assessments TO authenticated USING (((school_id = public.user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles profile
  WHERE ((profile.id = auth.uid()) AND (profile.school_id = weekly_assessments.school_id) AND (profile.role = ANY (ARRAY['admin'::text, 'headteacher'::text]))))))) WITH CHECK (((school_id = public.user_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.profiles profile
  WHERE ((profile.id = auth.uid()) AND (profile.school_id = weekly_assessments.school_id) AND (profile.role = ANY (ARRAY['admin'::text, 'headteacher'::text]))))) AND (EXISTS ( SELECT 1
   FROM public.classes class_row
  WHERE ((class_row.id = weekly_assessments.class_id) AND (class_row.school_id = weekly_assessments.school_id)))) AND (EXISTS ( SELECT 1
   FROM public.subjects subject
  WHERE ((subject.id = weekly_assessments.subject_id) AND (subject.school_id = weekly_assessments.school_id)))) AND (EXISTS ( SELECT 1
   FROM public.terms term
  WHERE ((term.id = weekly_assessments.term_id) AND (term.school_id = weekly_assessments.school_id))))));


--
-- Name: weekly_assessments weekly_assessments_parent_read_approved; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessments_parent_read_approved ON public.weekly_assessments FOR SELECT TO authenticated USING (((status = 'approved'::text) AND (EXISTS ( SELECT 1
   FROM public.students student
  WHERE ((student.parent_account_id = auth.uid()) AND (student.class_id = weekly_assessments.class_id) AND (student.school_id = weekly_assessments.school_id))))));


--
-- Name: weekly_assessments weekly_assessments_teacher_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessments_teacher_insert ON public.weekly_assessments FOR INSERT TO authenticated WITH CHECK (((school_id = public.teacher_school_id(auth.uid())) AND (status = 'draft'::text) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments assignment
  WHERE ((assignment.teacher_id = auth.uid()) AND (assignment.class_id = weekly_assessments.class_id) AND (assignment.subject_id = weekly_assessments.subject_id)))) AND (EXISTS ( SELECT 1
   FROM public.terms term
  WHERE ((term.id = weekly_assessments.term_id) AND (term.school_id = weekly_assessments.school_id))))));


--
-- Name: weekly_assessments weekly_assessments_teacher_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessments_teacher_select ON public.weekly_assessments FOR SELECT TO authenticated USING (((school_id = public.teacher_school_id(auth.uid())) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments assignment
  WHERE ((assignment.teacher_id = auth.uid()) AND (assignment.class_id = weekly_assessments.class_id) AND (assignment.subject_id = weekly_assessments.subject_id))))));


--
-- Name: weekly_assessments weekly_assessments_teacher_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_assessments_teacher_update ON public.weekly_assessments FOR UPDATE TO authenticated USING (((school_id = public.teacher_school_id(auth.uid())) AND (status = ANY (ARRAY['draft'::text, 'changes_requested'::text])) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments assignment
  WHERE ((assignment.teacher_id = auth.uid()) AND (assignment.class_id = weekly_assessments.class_id) AND (assignment.subject_id = weekly_assessments.subject_id)))))) WITH CHECK (((school_id = public.teacher_school_id(auth.uid())) AND (status = ANY (ARRAY['draft'::text, 'pending_review'::text, 'changes_requested'::text])) AND (EXISTS ( SELECT 1
   FROM public.teacher_assignments assignment
  WHERE ((assignment.teacher_id = auth.uid()) AND (assignment.class_id = weekly_assessments.class_id) AND (assignment.subject_id = weekly_assessments.subject_id)))) AND (EXISTS ( SELECT 1
   FROM public.terms term
  WHERE ((term.id = weekly_assessments.term_id) AND (term.school_id = weekly_assessments.school_id))))));


--
-- Name: weekly_performance_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.weekly_performance_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: weekly_performance_reviews weekly_performance_reviews_admin_all; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_performance_reviews_admin_all ON public.weekly_performance_reviews USING ((school_id = public.user_school_id(auth.uid()))) WITH CHECK ((school_id = public.user_school_id(auth.uid())));


--
-- Name: weekly_performance_reviews weekly_performance_reviews_insert_teacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_performance_reviews_insert_teacher ON public.weekly_performance_reviews FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.class_id = weekly_performance_reviews.class_id)))) OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = weekly_performance_reviews.class_id) AND (c.class_teacher_id = auth.uid()))))));


--
-- Name: weekly_performance_reviews weekly_performance_reviews_select_parent; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_performance_reviews_select_parent ON public.weekly_performance_reviews FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.students s
  WHERE ((s.id = weekly_performance_reviews.student_id) AND (s.parent_account_id = auth.uid())))));


--
-- Name: weekly_performance_reviews weekly_performance_reviews_select_teacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_performance_reviews_select_teacher ON public.weekly_performance_reviews FOR SELECT USING (((EXISTS ( SELECT 1
   FROM public.teacher_assignments ta
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.class_id = weekly_performance_reviews.class_id)))) OR (EXISTS ( SELECT 1
   FROM public.classes c
  WHERE ((c.id = weekly_performance_reviews.class_id) AND (c.class_teacher_id = auth.uid()))))));


--
-- Name: weekly_performance_reviews weekly_performance_reviews_update_teacher; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY weekly_performance_reviews_update_teacher ON public.weekly_performance_reviews FOR UPDATE USING ((teacher_id = auth.uid())) WITH CHECK ((teacher_id = auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric) TO anon;
GRANT ALL ON FUNCTION public.create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric) TO authenticated;
GRANT ALL ON FUNCTION public.create_promotion_run(p_source_academic_year text, p_target_academic_year text, p_final_term_id uuid, p_minimum_average numeric) TO service_role;


--
-- Name: FUNCTION enforce_curriculum_topic_approval_workflow(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_curriculum_topic_approval_workflow() TO anon;
GRANT ALL ON FUNCTION public.enforce_curriculum_topic_approval_workflow() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_curriculum_topic_approval_workflow() TO service_role;


--
-- Name: FUNCTION enforce_fee_payment_reversal(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.enforce_fee_payment_reversal() TO anon;
GRANT ALL ON FUNCTION public.enforce_fee_payment_reversal() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_fee_payment_reversal() TO service_role;


--
-- Name: FUNCTION get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text) TO anon;
GRANT ALL ON FUNCTION public.get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text) TO authenticated;
GRANT ALL ON FUNCTION public.get_fee_balance_totals(p_term_id uuid, p_class_id uuid, p_category_id uuid, p_search text) TO service_role;


--
-- Name: FUNCTION headteacher_school_id(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.headteacher_school_id(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.headteacher_school_id(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.headteacher_school_id(uid uuid) TO service_role;


--
-- Name: FUNCTION is_admin(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_admin(uid uuid) TO service_role;


--
-- Name: FUNCTION parent_school_id(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.parent_school_id(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.parent_school_id(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.parent_school_id(uid uuid) TO service_role;


--
-- Name: FUNCTION prevent_profile_privilege_escalation(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.prevent_profile_privilege_escalation() TO anon;
GRANT ALL ON FUNCTION public.prevent_profile_privilege_escalation() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_profile_privilege_escalation() TO service_role;


--
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- Name: FUNCTION score_to_letter(p_school_id uuid, p_score numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.score_to_letter(p_school_id uuid, p_score numeric) TO anon;
GRANT ALL ON FUNCTION public.score_to_letter(p_school_id uuid, p_score numeric) TO authenticated;
GRANT ALL ON FUNCTION public.score_to_letter(p_school_id uuid, p_score numeric) TO service_role;


--
-- Name: FUNCTION seed_new_school_defaults(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.seed_new_school_defaults() TO anon;
GRANT ALL ON FUNCTION public.seed_new_school_defaults() TO authenticated;
GRANT ALL ON FUNCTION public.seed_new_school_defaults() TO service_role;


--
-- Name: FUNCTION teacher_school_id(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.teacher_school_id(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.teacher_school_id(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.teacher_school_id(uid uuid) TO service_role;


--
-- Name: FUNCTION user_school_id(uid uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.user_school_id(uid uuid) TO anon;
GRANT ALL ON FUNCTION public.user_school_id(uid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_school_id(uid uuid) TO service_role;


--
-- Name: TABLE attendance_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.attendance_records TO anon;
GRANT ALL ON TABLE public.attendance_records TO authenticated;
GRANT ALL ON TABLE public.attendance_records TO service_role;


--
-- Name: TABLE class_subjects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.class_subjects TO anon;
GRANT ALL ON TABLE public.class_subjects TO authenticated;
GRANT ALL ON TABLE public.class_subjects TO service_role;


--
-- Name: TABLE classes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.classes TO anon;
GRANT ALL ON TABLE public.classes TO authenticated;
GRANT ALL ON TABLE public.classes TO service_role;


--
-- Name: TABLE curriculum_topics; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.curriculum_topics TO anon;
GRANT ALL ON TABLE public.curriculum_topics TO authenticated;
GRANT ALL ON TABLE public.curriculum_topics TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE subjects; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.subjects TO anon;
GRANT ALL ON TABLE public.subjects TO authenticated;
GRANT ALL ON TABLE public.subjects TO service_role;


--
-- Name: TABLE curriculum_topic_progress; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.curriculum_topic_progress TO anon;
GRANT ALL ON TABLE public.curriculum_topic_progress TO authenticated;
GRANT ALL ON TABLE public.curriculum_topic_progress TO service_role;


--
-- Name: TABLE error_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.error_logs TO anon;
GRANT ALL ON TABLE public.error_logs TO authenticated;
GRANT ALL ON TABLE public.error_logs TO service_role;


--
-- Name: TABLE fee_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fee_categories TO anon;
GRANT ALL ON TABLE public.fee_categories TO authenticated;
GRANT ALL ON TABLE public.fee_categories TO service_role;


--
-- Name: TABLE fee_category_item_collections; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fee_category_item_collections TO anon;
GRANT ALL ON TABLE public.fee_category_item_collections TO authenticated;
GRANT ALL ON TABLE public.fee_category_item_collections TO service_role;


--
-- Name: TABLE fee_category_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fee_category_items TO anon;
GRANT ALL ON TABLE public.fee_category_items TO authenticated;
GRANT ALL ON TABLE public.fee_category_items TO service_role;


--
-- Name: TABLE fee_charges; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fee_charges TO anon;
GRANT ALL ON TABLE public.fee_charges TO authenticated;
GRANT ALL ON TABLE public.fee_charges TO service_role;


--
-- Name: TABLE fee_payments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fee_payments TO anon;
GRANT ALL ON TABLE public.fee_payments TO authenticated;
GRANT ALL ON TABLE public.fee_payments TO service_role;


--
-- Name: TABLE fee_structures; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.fee_structures TO anon;
GRANT ALL ON TABLE public.fee_structures TO authenticated;
GRANT ALL ON TABLE public.fee_structures TO service_role;


--
-- Name: TABLE grade_releases; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.grade_releases TO anon;
GRANT ALL ON TABLE public.grade_releases TO authenticated;
GRANT ALL ON TABLE public.grade_releases TO service_role;


--
-- Name: TABLE grade_scale; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.grade_scale TO anon;
GRANT ALL ON TABLE public.grade_scale TO authenticated;
GRANT ALL ON TABLE public.grade_scale TO service_role;


--
-- Name: TABLE grades; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.grades TO anon;
GRANT ALL ON TABLE public.grades TO authenticated;
GRANT ALL ON TABLE public.grades TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE parent_accounts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.parent_accounts TO anon;
GRANT ALL ON TABLE public.parent_accounts TO authenticated;
GRANT ALL ON TABLE public.parent_accounts TO service_role;


--
-- Name: TABLE progress_report_entries; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.progress_report_entries TO anon;
GRANT ALL ON TABLE public.progress_report_entries TO authenticated;
GRANT ALL ON TABLE public.progress_report_entries TO service_role;


--
-- Name: TABLE progress_report_fields; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.progress_report_fields TO anon;
GRANT ALL ON TABLE public.progress_report_fields TO authenticated;
GRANT ALL ON TABLE public.progress_report_fields TO service_role;


--
-- Name: TABLE promotion_decisions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.promotion_decisions TO anon;
GRANT ALL ON TABLE public.promotion_decisions TO authenticated;
GRANT ALL ON TABLE public.promotion_decisions TO service_role;


--
-- Name: TABLE promotion_policies; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.promotion_policies TO anon;
GRANT ALL ON TABLE public.promotion_policies TO authenticated;
GRANT ALL ON TABLE public.promotion_policies TO service_role;


--
-- Name: TABLE promotion_runs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.promotion_runs TO anon;
GRANT ALL ON TABLE public.promotion_runs TO authenticated;
GRANT ALL ON TABLE public.promotion_runs TO service_role;


--
-- Name: TABLE schools; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.schools TO anon;
GRANT ALL ON TABLE public.schools TO authenticated;
GRANT ALL ON TABLE public.schools TO service_role;


--
-- Name: TABLE student_status_history; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.student_status_history TO anon;
GRANT ALL ON TABLE public.student_status_history TO authenticated;
GRANT ALL ON TABLE public.student_status_history TO service_role;


--
-- Name: TABLE students; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.students TO anon;
GRANT ALL ON TABLE public.students TO authenticated;
GRANT ALL ON TABLE public.students TO service_role;


--
-- Name: TABLE teacher_assignments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teacher_assignments TO anon;
GRANT ALL ON TABLE public.teacher_assignments TO authenticated;
GRANT ALL ON TABLE public.teacher_assignments TO service_role;


--
-- Name: TABLE teacher_certifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teacher_certifications TO anon;
GRANT ALL ON TABLE public.teacher_certifications TO authenticated;
GRANT ALL ON TABLE public.teacher_certifications TO service_role;


--
-- Name: TABLE teacher_details; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.teacher_details TO anon;
GRANT ALL ON TABLE public.teacher_details TO authenticated;
GRANT ALL ON TABLE public.teacher_details TO service_role;


--
-- Name: TABLE terms; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.terms TO anon;
GRANT ALL ON TABLE public.terms TO authenticated;
GRANT ALL ON TABLE public.terms TO service_role;


--
-- Name: TABLE weekly_assessment_scores; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.weekly_assessment_scores TO anon;
GRANT ALL ON TABLE public.weekly_assessment_scores TO authenticated;
GRANT ALL ON TABLE public.weekly_assessment_scores TO service_role;


--
-- Name: TABLE weekly_assessments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.weekly_assessments TO anon;
GRANT ALL ON TABLE public.weekly_assessments TO authenticated;
GRANT ALL ON TABLE public.weekly_assessments TO service_role;


--
-- Name: TABLE weekly_performance_reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.weekly_performance_reviews TO anon;
GRANT ALL ON TABLE public.weekly_performance_reviews TO authenticated;
GRANT ALL ON TABLE public.weekly_performance_reviews TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict Wdgcf69A1lODiNk8Eo9RiUbjpmslGwLitkkNW78xeShSHA0YiFqbduzf7CIEk0K
