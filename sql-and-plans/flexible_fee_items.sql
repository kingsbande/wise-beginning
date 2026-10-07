-- Flexible fee sub-items and payment item snapshots.
-- Run once in the Supabase SQL Editor before deploying the updated app.

CREATE TABLE IF NOT EXISTS public.fee_category_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL REFERENCES public.schools(id),
    fee_category_id uuid NOT NULL REFERENCES public.fee_categories(id) ON DELETE CASCADE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fee_category_items_category_name_key UNIQUE (fee_category_id, name)
);

ALTER TABLE public.fee_category_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fee_category_items_admin_all ON public.fee_category_items;
CREATE POLICY fee_category_items_admin_all
    ON public.fee_category_items
    AS PERMISSIVE
    FOR ALL
    TO public
    USING (
        school_id = user_school_id(auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.fee_categories category
            WHERE category.id = fee_category_items.fee_category_id
              AND category.school_id = fee_category_items.school_id
              AND category.is_flexible
        )
    )
    WITH CHECK (
        school_id = user_school_id(auth.uid())
        AND EXISTS (
            SELECT 1
            FROM public.fee_categories category
            WHERE category.id = fee_category_items.fee_category_id
              AND category.school_id = fee_category_items.school_id
              AND category.is_flexible
        )
    );

ALTER TABLE public.fee_payments
    ADD COLUMN IF NOT EXISTS paid_for_items text[] NOT NULL DEFAULT '{}'::text[];