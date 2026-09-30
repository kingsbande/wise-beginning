-- Filter-wide fee balance totals for the admin balances summary strip.
-- Run in the Supabase SQL Editor before deploying the updated app.

CREATE OR REPLACE FUNCTION public.get_fee_balance_totals(
    p_term_id uuid,
    p_class_id uuid,
    p_category_id uuid,
    p_search text
)
RETURNS TABLE (
    total_due numeric,
    total_paid numeric,
    total_balance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.get_fee_balance_totals(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fee_balance_totals(uuid, uuid, uuid, text) TO authenticated;