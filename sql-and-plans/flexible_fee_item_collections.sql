-- Per-student, per-term collection tracking for flexible fee items.
-- Run after flexible_fee_items.sql in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.fee_category_item_collections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id),
    student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    fee_category_id uuid NOT NULL REFERENCES public.fee_categories(id) ON DELETE CASCADE,
    fee_category_item_id uuid REFERENCES public.fee_category_items(id) ON DELETE SET NULL,
    term_id uuid NOT NULL REFERENCES public.terms(id) ON DELETE CASCADE,
    item_name text NOT NULL,
    is_collected boolean NOT NULL DEFAULT false,
    collected_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES public.profiles(id),
    CONSTRAINT fee_category_item_collections_student_item_term_key
        UNIQUE (student_id, fee_category_item_id, term_id)
);

ALTER TABLE public.fee_category_item_collections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_category_item_collections_admin_all
    ON public.fee_category_item_collections;
CREATE POLICY fee_category_item_collections_admin_all
    ON public.fee_category_item_collections
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (
        school_id = user_school_id(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.students student
            WHERE student.id = fee_category_item_collections.student_id
              AND student.school_id = fee_category_item_collections.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.fee_categories category
            WHERE category.id = fee_category_item_collections.fee_category_id
              AND category.school_id = fee_category_item_collections.school_id
              AND category.is_flexible
        )
        AND EXISTS (
            SELECT 1 FROM public.terms term
            WHERE term.id = fee_category_item_collections.term_id
              AND term.school_id = fee_category_item_collections.school_id
        )
    )
    WITH CHECK (
        school_id = user_school_id(auth.uid())
        AND EXISTS (
            SELECT 1 FROM public.students student
            WHERE student.id = fee_category_item_collections.student_id
              AND student.school_id = fee_category_item_collections.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.fee_categories category
            WHERE category.id = fee_category_item_collections.fee_category_id
              AND category.school_id = fee_category_item_collections.school_id
              AND category.is_flexible
        )
        AND EXISTS (
            SELECT 1 FROM public.fee_category_items item
            WHERE item.id = fee_category_item_collections.fee_category_item_id
              AND item.fee_category_id = fee_category_item_collections.fee_category_id
              AND item.school_id = fee_category_item_collections.school_id
        )
        AND EXISTS (
            SELECT 1 FROM public.terms term
            WHERE term.id = fee_category_item_collections.term_id
              AND term.school_id = fee_category_item_collections.school_id
        )
    );