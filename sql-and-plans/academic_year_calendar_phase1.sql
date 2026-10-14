-- Academic calendar schema foundation.
--
-- This migration is additive only. It does not create academic-year rows,
-- change legacy term values, map existing terms, or move term-linked records.
-- Schools will create academic years and map existing terms through the
-- application after the calendar setup workflow is available.
--
-- Run once after taking a database backup. This file is not rerunnable.

BEGIN;

CREATE TABLE public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (btrim(label) <> ''),
  start_date date,
  end_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_years_date_range_check
    CHECK (
      (start_date IS NULL AND end_date IS NULL)
      OR (
        start_date IS NOT NULL
        AND end_date IS NOT NULL
        AND start_date <= end_date
      )
    ),
  CONSTRAINT academic_years_school_label_key UNIQUE (school_id, label),
  CONSTRAINT academic_years_id_school_key UNIQUE (id, school_id)
);

COMMENT ON TABLE public.academic_years IS
  'School-managed academic years. Calendar rows are created and dated by the school through the application.';

COMMENT ON COLUMN public.academic_years.label IS
  'School-facing academic-year label, for example 2026/2027.';

ALTER TABLE public.terms
  ADD COLUMN academic_year_id uuid,
  ADD COLUMN term_order smallint,
  ADD COLUMN start_date date,
  ADD COLUMN end_date date;

COMMENT ON COLUMN public.terms.academic_year_id IS
  'Academic year parent; null means the legacy term has not been mapped by the school.';

COMMENT ON COLUMN public.terms.term_order IS
  'Explicit term order (1, 2, or 3); it is not inferred from the legacy name.';

ALTER TABLE public.terms
  ADD CONSTRAINT terms_academic_year_school_fkey
    FOREIGN KEY (academic_year_id, school_id)
    REFERENCES public.academic_years (id, school_id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT terms_academic_year_order_check
    CHECK (
      (academic_year_id IS NULL AND term_order IS NULL)
      OR (
        academic_year_id IS NOT NULL
        AND term_order IS NOT NULL
        AND term_order BETWEEN 1 AND 3
      )
    ),
  ADD CONSTRAINT terms_date_range_check
    CHECK (
      (start_date IS NULL AND end_date IS NULL)
      OR (
        start_date IS NOT NULL
        AND end_date IS NOT NULL
        AND start_date <= end_date
      )
    );

CREATE UNIQUE INDEX terms_academic_year_order_key
  ON public.terms (academic_year_id, term_order)
  WHERE academic_year_id IS NOT NULL;

CREATE INDEX terms_academic_year_school_idx
  ON public.terms (academic_year_id, school_id);

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.academic_years FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.academic_years TO authenticated;

CREATE POLICY academic_years_select_own_school
  ON public.academic_years
  FOR SELECT
  TO authenticated
  USING (
    school_id = COALESCE(
      public.user_school_id(auth.uid()),
      public.headteacher_school_id(auth.uid()),
      public.teacher_school_id(auth.uid()),
      public.parent_school_id(auth.uid())
    )
  );

CREATE FUNCTION public.save_school_academic_year(
  p_academic_year_id uuid,
  p_label text,
  p_start_date date,
  p_end_date date,
  p_terms jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_school_id uuid;
  v_role text;
  v_academic_year_id uuid;
  v_term jsonb;
  v_term_order smallint;
  v_term_id uuid;
  v_term_start date;
  v_term_end date;
  v_term_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to manage the academic calendar';
  END IF;

  SELECT profile.school_id, profile.role
  INTO v_school_id, v_role
  FROM public.profiles profile
  WHERE profile.id = v_actor_id;

  IF v_school_id IS NULL OR v_role <> 'admin' THEN
    RAISE EXCEPTION 'Only a school administrator can manage the academic calendar';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_school_id::text, 0));

  IF p_label IS NULL OR btrim(p_label) !~ '^[0-9]{4}/[0-9]{4}$' THEN
    RAISE EXCEPTION 'Academic year must use the format YYYY/YYYY';
  END IF;

  IF split_part(btrim(p_label), '/', 2)::integer
     <> split_part(btrim(p_label), '/', 1)::integer + 1 THEN
    RAISE EXCEPTION 'Academic year must use consecutive years, for example 2026/2027';
  END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_start_date > p_end_date THEN
    RAISE EXCEPTION 'Enter a valid academic-year start and end date';
  END IF;

  IF p_terms IS NULL
     OR jsonb_typeof(p_terms) <> 'array'
     OR jsonb_array_length(p_terms) <> 3
     OR EXISTS (
       SELECT 1
       FROM jsonb_array_elements(p_terms) AS item(value)
       WHERE item.value ->> 'term_order' IS NULL
          OR item.value ->> 'start_date' IS NULL
          OR item.value ->> 'end_date' IS NULL
     )
     OR (
       SELECT array_agg((item.value ->> 'term_order')::smallint ORDER BY (item.value ->> 'term_order')::smallint)
       FROM jsonb_array_elements(p_terms) AS item(value)
     ) IS DISTINCT FROM ARRAY[1, 2, 3]::smallint[] THEN
    RAISE EXCEPTION 'Provide exactly Term 1, Term 2, and Term 3 with dates';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_terms) AS item(value)
    WHERE (item.value ->> 'start_date')::date > (item.value ->> 'end_date')::date
       OR (item.value ->> 'start_date')::date < p_start_date
       OR (item.value ->> 'end_date')::date > p_end_date
  ) THEN
    RAISE EXCEPTION 'Each term must have valid dates within the academic year';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_terms) AS a(value)
    JOIN jsonb_array_elements(p_terms) AS b(value)
      ON (a.value ->> 'term_order')::smallint < (b.value ->> 'term_order')::smallint
    WHERE daterange(
      (a.value ->> 'start_date')::date,
      (a.value ->> 'end_date')::date,
      '[]'
    ) && daterange(
      (b.value ->> 'start_date')::date,
      (b.value ->> 'end_date')::date,
      '[]'
    )
  ) THEN
    RAISE EXCEPTION 'Academic term dates must not overlap';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.academic_years year
    WHERE year.school_id = v_school_id
      AND year.id IS DISTINCT FROM p_academic_year_id
      AND year.start_date IS NOT NULL
      AND daterange(year.start_date, year.end_date, '[]')
          && daterange(p_start_date, p_end_date, '[]')
  ) THEN
    RAISE EXCEPTION 'This academic year overlaps another configured year';
  END IF;

  IF p_academic_year_id IS NULL THEN
    INSERT INTO public.academic_years (school_id, label, start_date, end_date)
    VALUES (v_school_id, btrim(p_label), p_start_date, p_end_date)
    RETURNING id INTO v_academic_year_id;
  ELSE
    UPDATE public.academic_years
    SET label = btrim(p_label),
        start_date = p_start_date,
        end_date = p_end_date
    WHERE id = p_academic_year_id
      AND school_id = v_school_id
    RETURNING id INTO v_academic_year_id;

    IF v_academic_year_id IS NULL THEN
      RAISE EXCEPTION 'The selected academic year does not belong to your school';
    END IF;
  END IF;

  FOR v_term IN
    SELECT item.value
    FROM jsonb_array_elements(p_terms) AS item(value)
    ORDER BY (item.value ->> 'term_order')::smallint
  LOOP
    v_term_order := (v_term ->> 'term_order')::smallint;
    v_term_name := format('Term %s', v_term_order);
    v_term_start := (v_term ->> 'start_date')::date;
    v_term_end := (v_term ->> 'end_date')::date;
    v_term_id := NULLIF(v_term ->> 'term_id', '')::uuid;

    IF v_term_id IS NULL THEN
      INSERT INTO public.terms (
        school_id,
        academic_year,
        name,
        academic_year_id,
        term_order,
        start_date,
        end_date
      )
      VALUES (
        v_school_id,
        split_part(btrim(p_label), '/', 1),
        v_term_name,
        v_academic_year_id,
        v_term_order,
        v_term_start,
        v_term_end
      );
    ELSE
      UPDATE public.terms
      SET academic_year_id = v_academic_year_id,
          term_order = v_term_order,
          start_date = v_term_start,
          end_date = v_term_end
      WHERE id = v_term_id
        AND school_id = v_school_id
        AND btrim(name) = v_term_name
        AND (
          academic_year = split_part(btrim(p_label), '/', 1)
          OR academic_year_id = v_academic_year_id
        )
        AND (academic_year_id IS NULL OR academic_year_id = v_academic_year_id);

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Selected % is not an eligible unmapped term for your school', v_term_name;
      END IF;
    END IF;
  END LOOP;

  RETURN v_academic_year_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_school_academic_year(uuid, text, date, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_school_academic_year(uuid, text, date, date, jsonb) TO authenticated;

COMMIT;
