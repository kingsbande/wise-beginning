-- Keep payment rows as historical records while removing reversed payments
-- from balances and collection totals.

ALTER TABLE public.fee_payments
    ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
    ADD COLUMN IF NOT EXISTS reversed_by uuid,
    ADD COLUMN IF NOT EXISTS reversal_reason text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.fee_payments'::regclass
          AND conname = 'fee_payments_reversed_by_fkey'
    ) THEN
        ALTER TABLE public.fee_payments
            ADD CONSTRAINT fee_payments_reversed_by_fkey
            FOREIGN KEY (reversed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;
END;
$$;

ALTER TABLE public.fee_payments
    DROP CONSTRAINT IF EXISTS fee_payments_reversal_fields_check;

ALTER TABLE public.fee_payments
    ADD CONSTRAINT fee_payments_reversal_fields_check
    CHECK (
        (reversed_at IS NULL AND reversed_by IS NULL AND reversal_reason IS NULL)
        OR (
            reversed_at IS NOT NULL
            AND reversed_by IS NOT NULL
            AND NULLIF(btrim(reversal_reason), '') IS NOT NULL
        )
    );

CREATE OR REPLACE FUNCTION public.enforce_fee_payment_reversal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_enforce_fee_payment_reversal ON public.fee_payments;
CREATE TRIGGER trg_enforce_fee_payment_reversal
    BEFORE UPDATE ON public.fee_payments
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_fee_payment_reversal();

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
$function$;

REVOKE ALL ON FUNCTION public.get_fee_balance_totals(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fee_balance_totals(uuid, uuid, uuid, text) TO authenticated;