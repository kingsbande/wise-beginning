DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teacher_details'
          AND column_name = 'highest_degree'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'teacher_details'
          AND column_name = 'highest_qualification'
    ) THEN
        ALTER TABLE public.teacher_details
            RENAME COLUMN highest_degree TO highest_qualification;
    END IF;
END;
$$;

ALTER TABLE public.teacher_details
    ADD COLUMN IF NOT EXISTS tcm_number text;

COMMENT ON COLUMN public.teacher_details.tcm_number IS
    'Optional Teacher Council of Malawi registration number.';