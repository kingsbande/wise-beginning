-- Student progression foundation.
-- Apply this migration after supabase_complete_schema.sql.

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS progression_order integer,
  ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_classes_school_progression_order
  ON public.classes (school_id, progression_order);

CREATE TABLE IF NOT EXISTS public.promotion_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  minimum_average numeric NOT NULL DEFAULT 50 CHECK (minimum_average >= 0 AND minimum_average <= 100),
  use_end_of_term_only boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id)
);

CREATE TABLE IF NOT EXISTS public.promotion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  source_academic_year text NOT NULL,
  target_academic_year text NOT NULL,
  final_term_id uuid NOT NULL REFERENCES public.terms(id),
  minimum_average numeric NOT NULL CHECK (minimum_average >= 0 AND minimum_average <= 100),
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'approved', 'cancelled')),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  UNIQUE (school_id, source_academic_year, target_academic_year)
);

CREATE TABLE IF NOT EXISTS public.promotion_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_run_id uuid NOT NULL REFERENCES public.promotion_runs(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  source_class_id uuid NOT NULL REFERENCES public.classes(id),
  destination_class_id uuid REFERENCES public.classes(id),
  average_score numeric CHECK (average_score >= 0 AND average_score <= 100),
  missing_subject_count integer NOT NULL DEFAULT 0 CHECK (missing_subject_count >= 0),
  outcome text NOT NULL CHECK (outcome IN ('promote', 'retain', 'manual_review', 'graduate', 'exclude')),
  reason text NOT NULL,
  override_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (promotion_run_id, student_id)
);

ALTER TABLE public.promotion_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotion_policies_school_access ON public.promotion_policies
  FOR ALL TO public USING (school_id = user_school_id(auth.uid()))
  WITH CHECK (school_id = user_school_id(auth.uid()));

CREATE POLICY promotion_runs_school_access ON public.promotion_runs
  FOR ALL TO public USING (school_id = user_school_id(auth.uid()))
  WITH CHECK (school_id = user_school_id(auth.uid()));

CREATE POLICY promotion_decisions_school_access ON public.promotion_decisions
  FOR ALL TO public USING (school_id = user_school_id(auth.uid()))
  WITH CHECK (school_id = user_school_id(auth.uid()));

CREATE OR REPLACE FUNCTION public.create_promotion_run(
  p_source_academic_year text,
  p_target_academic_year text,
  p_final_term_id uuid,
  p_minimum_average numeric DEFAULT 50
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

REVOKE ALL ON FUNCTION public.create_promotion_run(text, text, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_promotion_run(text, text, uuid, numeric) TO authenticated;