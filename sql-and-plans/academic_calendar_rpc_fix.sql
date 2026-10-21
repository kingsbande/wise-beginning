-- Repairs the missing academic-calendar RPC without rerunning the
-- non-rerunnable table/column migration.
--
-- This only installs/replaces the function and refreshes PostgREST's schema
-- cache. It does not change calendar data until the app calls the function.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_school_academic_year(
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

REVOKE ALL ON FUNCTION public.save_school_academic_year(uuid, text, date, date, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_school_academic_year(uuid, text, date, date, jsonb)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
