CREATE TABLE public.attendance_records (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    class_id uuid NOT NULL,
    date date NOT NULL,
    status text NOT NULL,
    marked_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY attendance_admin_all ON public.attendance_records AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY attendance_select_class_teacher ON public.attendance_records AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid())))));

CREATE POLICY attendance_insert_class_teacher ON public.attendance_records AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid())))));

CREATE POLICY attendance_update_class_teacher ON public.attendance_records AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = attendance_records.class_id) AND (c.class_teacher_id = auth.uid())))));

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_pkey PRIMARY KEY (id);

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_marked_by_fkey FOREIGN KEY (marked_by) REFERENCES profiles(id);

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_student_id_date_key UNIQUE (student_id, date);

ALTER TABLE public.attendance_records ADD CONSTRAINT attendance_records_status_check CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'late'::text, 'half_day'::text, 'excused'::text]));

CREATE INDEX idx_attendance_student ON public.attendance_records USING btree (student_id);

CREATE INDEX idx_attendance_school_class_date ON public.attendance_records USING btree (school_id, class_id, date);

ALTER TABLE public.attendance_records ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.attendance_records ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.attendance_records ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.class_subjects (
    id uuid NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY class_subjects_select_parent_own_school ON public.class_subjects AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = parent_school_id(auth.uid()))))));

CREATE POLICY class_subjects_all_own_school ON public.class_subjects AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = user_school_id(auth.uid())))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = user_school_id(auth.uid()))))));

CREATE POLICY class_subjects_select_teacher_own_school ON public.class_subjects AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = class_subjects.class_id) AND (c.school_id = teacher_school_id(auth.uid()))))));

ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_pkey PRIMARY KEY (id);

ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_class_id_subject_id_key UNIQUE (class_id, subject_id);

ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE public.class_subjects ADD CONSTRAINT class_subjects_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE public.class_subjects ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.class_subjects ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.classes (
    id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    school_id uuid NOT NULL,
    class_teacher_id uuid
);

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY classes_update_own_school ON public.classes AS PERMISSIVE FOR UPDATE TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY classes_select_headteacher_own_school ON public.classes AS PERMISSIVE FOR SELECT TO public USING ((school_id = headteacher_school_id(auth.uid())));

CREATE POLICY classes_insert_own_school ON public.classes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY classes_select_teacher_own_school ON public.classes AS PERMISSIVE FOR SELECT TO public USING ((school_id = teacher_school_id(auth.uid())));

CREATE POLICY classes_select_own_school ON public.classes AS PERMISSIVE FOR SELECT TO public USING ((school_id = user_school_id(auth.uid())));

CREATE POLICY classes_select_parent_own_school ON public.classes AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

ALTER TABLE public.classes ADD CONSTRAINT classes_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.classes ADD CONSTRAINT classes_school_name_key UNIQUE (school_id, name);

ALTER TABLE public.classes ADD CONSTRAINT classes_class_teacher_id_fkey FOREIGN KEY (class_teacher_id) REFERENCES profiles(id);

ALTER TABLE public.classes ADD CONSTRAINT classes_pkey PRIMARY KEY (id);

ALTER TABLE public.classes ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.classes ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.fee_categories (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.fee_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_categories_select_parent_own_school ON public.fee_categories AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

CREATE POLICY fee_categories_admin_all ON public.fee_categories AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.fee_categories ADD CONSTRAINT fee_categories_pkey PRIMARY KEY (id);

ALTER TABLE public.fee_categories ADD CONSTRAINT fee_categories_school_id_name_key UNIQUE (school_id, name);

ALTER TABLE public.fee_categories ADD CONSTRAINT fee_categories_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.fee_categories ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.fee_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.fee_charges (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    fee_category_id uuid NOT NULL,
    term_id uuid NOT NULL,
    amount_due numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

ALTER TABLE public.fee_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_charges_select_own_child ON public.fee_charges AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM students s
  WHERE ((s.id = fee_charges.student_id) AND (s.parent_account_id = auth.uid())))));

CREATE POLICY fee_charges_admin_all ON public.fee_charges AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id) ON DELETE CASCADE;

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_student_id_fee_category_id_term_id_key UNIQUE (student_id, fee_category_id, term_id);

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_pkey PRIMARY KEY (id);

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_amount_due_check CHECK (amount_due >= 0::numeric);

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_term_id_fkey FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE;

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE public.fee_charges ADD CONSTRAINT fee_charges_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

CREATE INDEX idx_fee_charges_school_student ON public.fee_charges USING btree (school_id, student_id);

ALTER TABLE public.fee_charges ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.fee_charges ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.fee_charges ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.fee_payments (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    fee_charge_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_date date NOT NULL,
    method text,
    note text,
    recorded_by uuid,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_payments_select_own_child ON public.fee_payments AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (fee_charges fc
     JOIN students s ON ((s.id = fc.student_id)))
  WHERE ((fc.id = fee_payments.fee_charge_id) AND (s.parent_account_id = auth.uid())))));

CREATE POLICY fee_payments_admin_all ON public.fee_payments AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_pkey PRIMARY KEY (id);

ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_fee_charge_id_fkey FOREIGN KEY (fee_charge_id) REFERENCES fee_charges(id) ON DELETE CASCADE;

ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_amount_check CHECK (amount > 0::numeric);

ALTER TABLE public.fee_payments ADD CONSTRAINT fee_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES profiles(id);

CREATE INDEX idx_fee_payments_charge ON public.fee_payments USING btree (fee_charge_id);

CREATE INDEX idx_fee_payments_school_date ON public.fee_payments USING btree (school_id, payment_date);

ALTER TABLE public.fee_payments ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.fee_payments ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.fee_payments ALTER COLUMN payment_date SET DEFAULT CURRENT_DATE;

CREATE TABLE public.fee_structures (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    fee_category_id uuid NOT NULL,
    term_id uuid NOT NULL,
    amount numeric NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

ALTER TABLE public.fee_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_structures_admin_all ON public.fee_structures AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_pkey PRIMARY KEY (id);

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_amount_check CHECK (amount >= 0::numeric);

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_term_id_fkey FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE;

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_fee_category_id_fkey FOREIGN KEY (fee_category_id) REFERENCES fee_categories(id) ON DELETE CASCADE;

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.fee_structures ADD CONSTRAINT fee_structures_class_id_fee_category_id_term_id_key UNIQUE (class_id, fee_category_id, term_id);

ALTER TABLE public.fee_structures ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.fee_structures ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.fee_structures ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.grade_releases (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    class_id uuid NOT NULL,
    term_id uuid NOT NULL,
    released_at timestamp with time zone NOT NULL,
    released_by uuid
);

ALTER TABLE public.grade_releases ENABLE ROW LEVEL SECURITY;

CREATE POLICY grade_releases_select_parent_own_school ON public.grade_releases AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

CREATE POLICY grade_releases_all_own_school ON public.grade_releases AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.grade_releases ADD CONSTRAINT grade_releases_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);

ALTER TABLE public.grade_releases ADD CONSTRAINT grade_releases_term_id_fkey FOREIGN KEY (term_id) REFERENCES terms(id);

ALTER TABLE public.grade_releases ADD CONSTRAINT grade_releases_released_by_fkey FOREIGN KEY (released_by) REFERENCES profiles(id);

ALTER TABLE public.grade_releases ADD CONSTRAINT grade_releases_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.grade_releases ADD CONSTRAINT grade_releases_pkey PRIMARY KEY (id);

ALTER TABLE public.grade_releases ADD CONSTRAINT grade_releases_class_id_term_id_key UNIQUE (class_id, term_id);

ALTER TABLE public.grade_releases ALTER COLUMN released_at SET DEFAULT now();

ALTER TABLE public.grade_releases ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.grade_scale (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    min_score numeric NOT NULL,
    max_score numeric NOT NULL,
    letter text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.grade_scale ENABLE ROW LEVEL SECURITY;

CREATE POLICY grade_scale_all_own_school ON public.grade_scale AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY grade_scale_select_parent_own_school ON public.grade_scale AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

CREATE POLICY grade_scale_select_teacher_own_school ON public.grade_scale AS PERMISSIVE FOR SELECT TO public USING ((school_id = teacher_school_id(auth.uid())));

ALTER TABLE public.grade_scale ADD CONSTRAINT grade_scale_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.grade_scale ADD CONSTRAINT grade_scale_pkey PRIMARY KEY (id);

ALTER TABLE public.grade_scale ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.grade_scale ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.grades (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    term_id uuid NOT NULL,
    assessment_type text NOT NULL,
    score numeric NOT NULL,
    entered_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;

CREATE POLICY grades_select_own_child_if_released ON public.grades AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (students s
     JOIN grade_releases gr ON (((gr.class_id = s.class_id) AND (gr.term_id = grades.term_id))))
  WHERE ((s.id = grades.student_id) AND (s.parent_account_id = auth.uid())))));

CREATE POLICY grades_select_teacher_own_subjects ON public.grades AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM teacher_assignments ta
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id)))));

CREATE POLICY grades_insert_teacher_assigned ON public.grades AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
   FROM (teacher_assignments ta
     JOIN students s ON ((s.id = grades.student_id)))
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id) AND (ta.class_id = s.class_id)))));

CREATE POLICY grades_all_own_school ON public.grades AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY grades_update_teacher_assigned ON public.grades AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
   FROM (teacher_assignments ta
     JOIN students s ON ((s.id = grades.student_id)))
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id) AND (ta.class_id = s.class_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (teacher_assignments ta
     JOIN students s ON ((s.id = grades.student_id)))
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.subject_id = grades.subject_id) AND (ta.class_id = s.class_id)))));

ALTER TABLE public.grades ADD CONSTRAINT grades_student_id_subject_id_term_id_assessment_type_key UNIQUE (student_id, subject_id, term_id, assessment_type);

ALTER TABLE public.grades ADD CONSTRAINT grades_assessment_type_check CHECK (assessment_type = ANY (ARRAY['midterm'::text, 'end_of_term'::text]));

ALTER TABLE public.grades ADD CONSTRAINT grades_score_check CHECK (score >= 0::numeric AND score <= 100::numeric);

ALTER TABLE public.grades ADD CONSTRAINT grades_pkey PRIMARY KEY (id);

ALTER TABLE public.grades ADD CONSTRAINT grades_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.grades ADD CONSTRAINT grades_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE public.grades ADD CONSTRAINT grades_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id);

ALTER TABLE public.grades ADD CONSTRAINT grades_term_id_fkey FOREIGN KEY (term_id) REFERENCES terms(id);

ALTER TABLE public.grades ADD CONSTRAINT grades_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES profiles(id);

CREATE INDEX idx_grades_school_term_subject ON public.grades USING btree (school_id, term_id, subject_id);

CREATE INDEX idx_grades_student ON public.grades USING btree (student_id);

ALTER TABLE public.grades ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.grades ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.grades ALTER COLUMN updated_at SET DEFAULT now();

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    student_id uuid,
    recipient_type text NOT NULL,
    recipient_phone text NOT NULL,
    message text NOT NULL,
    status text NOT NULL,
    provider_response text,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own_school ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM students
  WHERE ((students.id = notifications.student_id) AND (students.school_id = user_school_id(auth.uid()))))));

ALTER TABLE public.notifications ADD CONSTRAINT notifications_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);

ALTER TABLE public.notifications ADD CONSTRAINT notifications_status_check CHECK (status = ANY (ARRAY['pending'::text, 'sent'::text, 'failed'::text]));

ALTER TABLE public.notifications ADD CONSTRAINT notifications_recipient_type_check CHECK (recipient_type = ANY (ARRAY['parent'::text, 'admin'::text]));

ALTER TABLE public.notifications ALTER COLUMN status SET DEFAULT 'pending'::text;

ALTER TABLE public.notifications ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.notifications ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.parent_accounts (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    full_name text NOT NULL,
    username text NOT NULL,
    phone text,
    is_active boolean NOT NULL,
    must_change_password boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.parent_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY parent_accounts_delete_own_school ON public.parent_accounts AS PERMISSIVE FOR DELETE TO public USING ((school_id = user_school_id(auth.uid())));

CREATE POLICY parent_accounts_select_own_school ON public.parent_accounts AS PERMISSIVE FOR SELECT TO public USING ((school_id = user_school_id(auth.uid())));

CREATE POLICY parent_accounts_insert_own_school ON public.parent_accounts AS PERMISSIVE FOR INSERT TO public WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY parent_accounts_update_own_school ON public.parent_accounts AS PERMISSIVE FOR UPDATE TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY parent_accounts_select_self ON public.parent_accounts AS PERMISSIVE FOR SELECT TO public USING ((id = auth.uid()));

ALTER TABLE public.parent_accounts ADD CONSTRAINT parent_accounts_username_key UNIQUE (username);

ALTER TABLE public.parent_accounts ADD CONSTRAINT parent_accounts_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.parent_accounts ADD CONSTRAINT parent_accounts_pkey PRIMARY KEY (id);

CREATE INDEX idx_parent_accounts_phone_trgm ON public.parent_accounts USING gin (phone);

CREATE INDEX idx_parent_accounts_full_name_trgm ON public.parent_accounts USING gin (full_name);

CREATE INDEX idx_parent_accounts_username_trgm ON public.parent_accounts USING gin (username);

CREATE INDEX idx_parent_accounts_school_id ON public.parent_accounts USING btree (school_id);

CREATE INDEX idx_parent_accounts_school_created_at ON public.parent_accounts USING btree (school_id, created_at DESC);

ALTER TABLE public.parent_accounts ALTER COLUMN is_active SET DEFAULT true;

ALTER TABLE public.parent_accounts ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.parent_accounts ALTER COLUMN must_change_password SET DEFAULT true;

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    school_id uuid NOT NULL,
    avatar_url text,
    must_change_password boolean NOT NULL,
    username text,
    is_active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_school_staff_admin ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((school_id = user_school_id(auth.uid())));

CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO public USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY profiles_select_own ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((id = auth.uid()));

ALTER TABLE public.profiles ADD CONSTRAINT profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['admin'::text, 'headteacher'::text, 'teacher'::text]));

CREATE POLICY profiles_select_parent_own_school ON public.profiles AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

CREATE INDEX idx_profiles_username ON public.profiles USING btree (username) WHERE (username IS NOT NULL);

ALTER TABLE public.profiles ALTER COLUMN must_change_password SET DEFAULT false;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'admin'::text;

ALTER TABLE public.profiles ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.progress_report_entries (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    term_id uuid NOT NULL,
    field_id uuid NOT NULL,
    value text,
    entered_by uuid,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

ALTER TABLE public.progress_report_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY progress_entries_select_own_child_if_released ON public.progress_report_entries AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM (students s
     JOIN grade_releases gr ON (((gr.class_id = s.class_id) AND (gr.term_id = progress_report_entries.term_id))))
  WHERE ((s.id = progress_report_entries.student_id) AND (s.parent_account_id = auth.uid())))));

CREATE POLICY progress_report_entries_all_own_school ON public.progress_report_entries AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_pkey PRIMARY KEY (id);

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES profiles(id);

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_field_id_fkey FOREIGN KEY (field_id) REFERENCES progress_report_fields(id) ON DELETE CASCADE;

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_term_id_fkey FOREIGN KEY (term_id) REFERENCES terms(id);

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_student_id_term_id_field_id_key UNIQUE (student_id, term_id, field_id);

ALTER TABLE public.progress_report_entries ADD CONSTRAINT progress_report_entries_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

CREATE INDEX idx_progress_entries_school_term ON public.progress_report_entries USING btree (school_id, term_id);

ALTER TABLE public.progress_report_entries ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.progress_report_entries ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.progress_report_entries ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.progress_report_fields (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    label text NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.progress_report_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY progress_fields_select_parent_own_school ON public.progress_report_fields AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

CREATE POLICY progress_report_fields_all_own_school ON public.progress_report_fields AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.progress_report_fields ADD CONSTRAINT progress_report_fields_school_id_label_key UNIQUE (school_id, label);

ALTER TABLE public.progress_report_fields ADD CONSTRAINT progress_report_fields_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.progress_report_fields ADD CONSTRAINT progress_report_fields_pkey PRIMARY KEY (id);

ALTER TABLE public.progress_report_fields ALTER COLUMN sort_order SET DEFAULT 0;

ALTER TABLE public.progress_report_fields ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.progress_report_fields ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.schools (
    id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    slug text NOT NULL,
    logo_url text,
    registration_terms text
);

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY schools_select_own ON public.schools AS PERMISSIVE FOR SELECT TO public USING ((id = user_school_id(auth.uid())));

CREATE POLICY schools_select_teacher_own ON public.schools AS PERMISSIVE FOR SELECT TO public USING ((id = teacher_school_id(auth.uid())));

CREATE POLICY schools_select_headteacher_own ON public.schools AS PERMISSIVE FOR SELECT TO public USING ((id = headteacher_school_id(auth.uid())));

CREATE POLICY schools_select_parent_own ON public.schools AS PERMISSIVE FOR SELECT TO public USING ((id = parent_school_id(auth.uid())));

CREATE POLICY schools_update_own ON public.schools AS PERMISSIVE FOR UPDATE TO public USING ((id = user_school_id(auth.uid()))) WITH CHECK ((id = user_school_id(auth.uid())));

ALTER TABLE public.schools ADD CONSTRAINT schools_pkey PRIMARY KEY (id);

ALTER TABLE public.schools ADD CONSTRAINT schools_slug_key UNIQUE (slug);

ALTER TABLE public.schools ADD CONSTRAINT schools_name_key UNIQUE (name);

ALTER TABLE public.schools ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.schools ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.student_status_history (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    old_status text NOT NULL,
    new_status text NOT NULL,
    changed_by uuid,
    changed_at timestamp with time zone NOT NULL,
    note text
);

ALTER TABLE public.student_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY student_status_history_all_own_school ON public.student_status_history AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id);

ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE public.student_status_history ADD CONSTRAINT student_status_history_pkey PRIMARY KEY (id);

CREATE INDEX idx_student_status_history_student ON public.student_status_history USING btree (student_id);

ALTER TABLE public.student_status_history ALTER COLUMN changed_at SET DEFAULT now();

ALTER TABLE public.student_status_history ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.students (
    id uuid NOT NULL,
    admission_number text NOT NULL,
    full_name text NOT NULL,
    date_of_birth date NOT NULL,
    gender text NOT NULL,
    class_id uuid NOT NULL,
    parent_name text NOT NULL,
    parent_phone text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone NOT NULL,
    parent_occupation text,
    health_notes text,
    former_school text,
    age integer,
    pickup_person text,
    location text,
    address text,
    academic_year text NOT NULL,
    school_id uuid NOT NULL,
    date_joined date NOT NULL,
    government_code text,
    photo_url text,
    parent_account_id uuid,
    status text NOT NULL,
    status_changed_at timestamp with time zone NOT NULL
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY students_delete_own_school ON public.students AS PERMISSIVE FOR DELETE TO public USING ((school_id = user_school_id(auth.uid())));

CREATE POLICY students_select_teacher_assigned_classes ON public.students AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
   FROM teacher_assignments ta
  WHERE ((ta.teacher_id = auth.uid()) AND (ta.class_id = students.class_id)))));

CREATE POLICY students_select_class_teacher_classes ON public.students AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
     FROM classes c
    WHERE ((c.id = students.class_id) AND (c.class_teacher_id = auth.uid())))));

CREATE POLICY students_select_own_parent_account ON public.students AS PERMISSIVE FOR SELECT TO public USING ((parent_account_id = auth.uid()));

CREATE POLICY students_insert_headteacher ON public.students AS PERMISSIVE FOR INSERT TO public WITH CHECK ((school_id = headteacher_school_id(auth.uid())));

CREATE POLICY students_update_own_school ON public.students AS PERMISSIVE FOR UPDATE TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY students_select_headteacher ON public.students AS PERMISSIVE FOR SELECT TO public USING ((school_id = headteacher_school_id(auth.uid())));

CREATE POLICY students_insert_own_school ON public.students AS PERMISSIVE FOR INSERT TO public WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY students_select_own_school ON public.students AS PERMISSIVE FOR SELECT TO public USING ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.students ADD CONSTRAINT students_pkey PRIMARY KEY (id);

ALTER TABLE public.students ADD CONSTRAINT students_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id);

ALTER TABLE public.students ADD CONSTRAINT students_gender_check CHECK (gender = ANY (ARRAY['male'::text, 'female'::text]));

ALTER TABLE public.students ADD CONSTRAINT students_status_check CHECK (status = ANY (ARRAY['active'::text, 'withdrawn'::text, 'graduated'::text, 'transferred'::text]));

ALTER TABLE public.students ADD CONSTRAINT students_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.students ADD CONSTRAINT students_parent_account_id_fkey FOREIGN KEY (parent_account_id) REFERENCES parent_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.students ADD CONSTRAINT students_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);

ALTER TABLE public.students ADD CONSTRAINT students_school_admission_number_key UNIQUE (school_id, admission_number);

CREATE INDEX idx_students_date_joined ON public.students USING btree (date_joined);

CREATE INDEX idx_students_admission_number_trgm ON public.students USING gin (admission_number);

CREATE INDEX idx_students_school_status ON public.students USING btree (school_id, status);

CREATE INDEX idx_students_school_id ON public.students USING btree (school_id);

CREATE INDEX idx_students_full_name_trgm ON public.students USING gin (full_name);

CREATE INDEX idx_students_class_id ON public.students USING btree (class_id);

CREATE INDEX idx_students_school_date_joined ON public.students USING btree (school_id, date_joined);

CREATE INDEX idx_students_school_class ON public.students USING btree (school_id, class_id);

CREATE INDEX idx_students_school_created_at ON public.students USING btree (school_id, created_at DESC);

ALTER TABLE public.students ALTER COLUMN academic_year SET DEFAULT to_char((CURRENT_DATE)::timestamp with time zone, 'YYYY'::text);

ALTER TABLE public.students ALTER COLUMN status SET DEFAULT 'active'::text;

ALTER TABLE public.students ALTER COLUMN date_joined SET DEFAULT CURRENT_DATE;

ALTER TABLE public.students ALTER COLUMN status_changed_at SET DEFAULT now();

ALTER TABLE public.students ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.students ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.subjects (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;

CREATE POLICY subjects_select_teacher_own_school ON public.subjects AS PERMISSIVE FOR SELECT TO public USING ((school_id = teacher_school_id(auth.uid())));

CREATE POLICY subjects_select_parent_own_school ON public.subjects AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

CREATE POLICY subjects_all_own_school ON public.subjects AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.subjects ADD CONSTRAINT subjects_school_id_name_key UNIQUE (school_id, name);

ALTER TABLE public.subjects ADD CONSTRAINT subjects_pkey PRIMARY KEY (id);

ALTER TABLE public.subjects ADD CONSTRAINT subjects_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.subjects ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.subjects ALTER COLUMN created_at SET DEFAULT now();

CREATE TABLE public.teacher_assignments (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_assignments_select_self ON public.teacher_assignments AS PERMISSIVE FOR SELECT TO public USING ((teacher_id = auth.uid()));

CREATE POLICY teacher_assignments_admin_all ON public.teacher_assignments AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_teacher_id_class_id_subject_id_key UNIQUE (teacher_id, class_id, subject_id);

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_assignments ADD CONSTRAINT teacher_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

CREATE INDEX idx_teacher_assignments_class_subject ON public.teacher_assignments USING btree (class_id, subject_id);

CREATE INDEX idx_teacher_assignments_teacher ON public.teacher_assignments USING btree (teacher_id);

ALTER TABLE public.teacher_assignments ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.teacher_assignments ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE public.teacher_certifications (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    title text NOT NULL,
    issuing_body text,
    issued_date date,
    expiry_date date,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.teacher_certifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_certifications_admin_all ON public.teacher_certifications AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY teacher_certifications_select_self ON public.teacher_certifications AS PERMISSIVE FOR SELECT TO public USING ((teacher_id = auth.uid()));

ALTER TABLE public.teacher_certifications ADD CONSTRAINT teacher_certifications_pkey PRIMARY KEY (id);

ALTER TABLE public.teacher_certifications ADD CONSTRAINT teacher_certifications_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_certifications ADD CONSTRAINT teacher_certifications_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

CREATE INDEX idx_teacher_certifications_teacher ON public.teacher_certifications USING btree (teacher_id);

ALTER TABLE public.teacher_certifications ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE public.teacher_certifications ALTER COLUMN created_at SET DEFAULT now();

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
    highest_degree text,
    major text,
    resume_summary text,
    employee_id text,
    date_of_hire date,
    contract_type text,
    salary_grade text,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL
);

ALTER TABLE public.teacher_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY teacher_details_admin_all ON public.teacher_details AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY teacher_details_select_self ON public.teacher_details AS PERMISSIVE FOR SELECT TO public USING ((id = auth.uid()));

ALTER TABLE public.teacher_details ADD CONSTRAINT teacher_details_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.teacher_details ADD CONSTRAINT teacher_details_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;

ALTER TABLE public.teacher_details ADD CONSTRAINT teacher_details_pkey PRIMARY KEY (id);

ALTER TABLE public.teacher_details ADD CONSTRAINT teacher_details_contract_type_check CHECK (contract_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'substitute'::text]));

CREATE INDEX idx_teacher_details_school_employee_id ON public.teacher_details USING btree (school_id, employee_id) WHERE (employee_id IS NOT NULL);

ALTER TABLE public.teacher_details ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.teacher_details ALTER COLUMN updated_at SET DEFAULT now();

CREATE TABLE public.terms (
    id uuid NOT NULL,
    school_id uuid NOT NULL,
    academic_year text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone NOT NULL
);

ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY terms_all_own_school ON public.terms AS PERMISSIVE FOR ALL TO public USING ((school_id = user_school_id(auth.uid()))) WITH CHECK ((school_id = user_school_id(auth.uid())));

CREATE POLICY terms_select_teacher_own_school ON public.terms AS PERMISSIVE FOR SELECT TO public USING ((school_id = teacher_school_id(auth.uid())));

CREATE POLICY terms_select_parent_own_school ON public.terms AS PERMISSIVE FOR SELECT TO public USING ((school_id = parent_school_id(auth.uid())));

ALTER TABLE public.terms ADD CONSTRAINT terms_pkey PRIMARY KEY (id);

ALTER TABLE public.terms ADD CONSTRAINT terms_school_id_academic_year_name_key UNIQUE (school_id, academic_year, name);

ALTER TABLE public.terms ADD CONSTRAINT terms_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);

ALTER TABLE public.terms ALTER COLUMN created_at SET DEFAULT now();

ALTER TABLE public.terms ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Weekly Performance Reviews

CREATE TABLE public.weekly_performance_reviews (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    week_start_date date NOT NULL,
    review_text text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_performance_reviews ENABLE ROW LEVEL SECURITY;

-- Admin: Full access to all reviews in the school
CREATE POLICY weekly_performance_reviews_admin_all ON public.weekly_performance_reviews AS PERMISSIVE FOR ALL TO public
    USING (school_id = user_school_id(auth.uid()))
    WITH CHECK (school_id = user_school_id(auth.uid()));

-- Teacher: SELECT reviews for their assigned classes OR classes they are class teacher for
CREATE POLICY weekly_performance_reviews_select_teacher ON public.weekly_performance_reviews AS PERMISSIVE FOR SELECT TO public
    USING (
        EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = auth.uid() AND ta.class_id = weekly_performance_reviews.class_id)
        OR
        EXISTS (SELECT 1 FROM classes c WHERE c.id = weekly_performance_reviews.class_id AND c.class_teacher_id = auth.uid())
    );

-- Teacher: INSERT reviews for their assigned classes OR classes they are class teacher for
CREATE POLICY weekly_performance_reviews_insert_teacher ON public.weekly_performance_reviews AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (
        EXISTS (SELECT 1 FROM teacher_assignments ta WHERE ta.teacher_id = auth.uid() AND ta.class_id = weekly_performance_reviews.class_id)
        OR
        EXISTS (SELECT 1 FROM classes c WHERE c.id = weekly_performance_reviews.class_id AND c.class_teacher_id = auth.uid())
    );

-- Teacher: UPDATE their own reviews
CREATE POLICY weekly_performance_reviews_update_teacher ON public.weekly_performance_reviews AS PERMISSIVE FOR UPDATE TO public
    USING (teacher_id = auth.uid())
    WITH CHECK (teacher_id = auth.uid());

-- Parent: SELECT reviews only for their own children
CREATE POLICY weekly_performance_reviews_select_parent ON public.weekly_performance_reviews AS PERMISSIVE FOR SELECT TO public
    USING (
        EXISTS (SELECT 1 FROM students s WHERE s.id = weekly_performance_reviews.student_id AND s.parent_account_id = auth.uid())
    );

ALTER TABLE public.weekly_performance_reviews ADD CONSTRAINT weekly_performance_reviews_pkey PRIMARY KEY (id);
ALTER TABLE public.weekly_performance_reviews ADD CONSTRAINT weekly_performance_reviews_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id);
ALTER TABLE public.weekly_performance_reviews ADD CONSTRAINT weekly_performance_reviews_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_performance_reviews ADD CONSTRAINT weekly_performance_reviews_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.weekly_performance_reviews ADD CONSTRAINT weekly_performance_reviews_class_id_fkey FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

CREATE INDEX idx_weekly_performance_reviews_student ON public.weekly_performance_reviews USING btree (student_id);
CREATE INDEX idx_weekly_performance_reviews_class_week ON public.weekly_performance_reviews USING btree (class_id, week_start_date);

-- Student Progression

ALTER TABLE public.classes
    ADD COLUMN IF NOT EXISTS progression_order integer,
    ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_classes_school_progression_order
    ON public.classes USING btree (school_id, progression_order);

CREATE TABLE IF NOT EXISTS public.promotion_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    minimum_average numeric NOT NULL DEFAULT 50,
    use_end_of_term_only boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.promotion_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotion_policies_school_access ON public.promotion_policies AS PERMISSIVE FOR ALL TO public
    USING (school_id = user_school_id(auth.uid()))
    WITH CHECK (school_id = user_school_id(auth.uid()));

ALTER TABLE public.promotion_policies ADD CONSTRAINT promotion_policies_pkey PRIMARY KEY (id);
ALTER TABLE public.promotion_policies ADD CONSTRAINT promotion_policies_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_policies ADD CONSTRAINT promotion_policies_minimum_average_check CHECK (minimum_average >= 0 AND minimum_average <= 100);
ALTER TABLE public.promotion_policies ADD CONSTRAINT promotion_policies_school_id_key UNIQUE (school_id);

CREATE TABLE IF NOT EXISTS public.promotion_runs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    source_academic_year text NOT NULL,
    target_academic_year text NOT NULL,
    final_term_id uuid NOT NULL,
    minimum_average numeric NOT NULL,
    status text NOT NULL DEFAULT 'review',
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    approved_by uuid,
    approved_at timestamp with time zone
);

ALTER TABLE public.promotion_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotion_runs_school_access ON public.promotion_runs AS PERMISSIVE FOR ALL TO public
    USING (school_id = user_school_id(auth.uid()))
    WITH CHECK (school_id = user_school_id(auth.uid()));

ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_pkey PRIMARY KEY (id);
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_final_term_id_fkey FOREIGN KEY (final_term_id) REFERENCES terms(id);
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id);
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id);
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_minimum_average_check CHECK (minimum_average >= 0 AND minimum_average <= 100);
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_status_check CHECK (status = ANY (ARRAY['review'::text, 'approved'::text, 'cancelled'::text]));
ALTER TABLE public.promotion_runs ADD CONSTRAINT promotion_runs_school_years_key UNIQUE (school_id, source_academic_year, target_academic_year);

CREATE TABLE IF NOT EXISTS public.promotion_decisions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    promotion_run_id uuid NOT NULL,
    school_id uuid NOT NULL,
    student_id uuid NOT NULL,
    source_class_id uuid NOT NULL,
    destination_class_id uuid,
    average_score numeric,
    missing_subject_count integer NOT NULL DEFAULT 0,
    outcome text NOT NULL,
    reason text NOT NULL,
    override_note text,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.promotion_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY promotion_decisions_school_access ON public.promotion_decisions AS PERMISSIVE FOR ALL TO public
    USING (school_id = user_school_id(auth.uid()))
    WITH CHECK (school_id = user_school_id(auth.uid()));

ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_pkey PRIMARY KEY (id);
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_promotion_run_id_fkey FOREIGN KEY (promotion_run_id) REFERENCES promotion_runs(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_school_id_fkey FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_student_id_fkey FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE RESTRICT;
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_source_class_id_fkey FOREIGN KEY (source_class_id) REFERENCES classes(id);
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_destination_class_id_fkey FOREIGN KEY (destination_class_id) REFERENCES classes(id);
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_average_score_check CHECK (average_score >= 0 AND average_score <= 100);
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_missing_subject_count_check CHECK (missing_subject_count >= 0);
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_outcome_check CHECK (outcome = ANY (ARRAY['promote'::text, 'retain'::text, 'manual_review'::text, 'graduate'::text, 'exclude'::text]));
ALTER TABLE public.promotion_decisions ADD CONSTRAINT promotion_decisions_run_student_key UNIQUE (promotion_run_id, student_id);

CREATE INDEX idx_promotion_decisions_run ON public.promotion_decisions USING btree (promotion_run_id);
CREATE INDEX idx_promotion_decisions_student ON public.promotion_decisions USING btree (student_id);

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

-- Teacher Curriculum Topics / Progress KPI

CREATE TABLE public.curriculum_topics (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    school_id uuid NOT NULL,
    teacher_id uuid NOT NULL,
    class_id uuid NOT NULL,
    subject_id uuid NOT NULL,
    term_id uuid NOT NULL,
    title text NOT NULL,
    note text,
    taught_on date,
    completed boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT curriculum_topics_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT curriculum_topics_note_check CHECK (note IS NULL OR char_length(note) <= 2000)
);

ALTER TABLE public.curriculum_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY curriculum_topics_admin_all ON public.curriculum_topics AS PERMISSIVE FOR ALL TO public
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.school_id = curriculum_topics.school_id
              AND p.role IN ('admin', 'headteacher')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.school_id = curriculum_topics.school_id
              AND p.role IN ('admin', 'headteacher')
        )
        AND EXISTS (
            SELECT 1
            FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = curriculum_topics.teacher_id
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

CREATE POLICY curriculum_topics_teacher_select ON public.curriculum_topics AS PERMISSIVE FOR SELECT TO public
    USING (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

CREATE POLICY curriculum_topics_teacher_insert ON public.curriculum_topics AS PERMISSIVE FOR INSERT TO public
    WITH CHECK (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
    );

CREATE POLICY curriculum_topics_teacher_update ON public.curriculum_topics AS PERMISSIVE FOR UPDATE TO public
    USING (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    )
    WITH CHECK (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
        AND EXISTS (
            SELECT 1
            FROM public.terms t
            WHERE t.id = curriculum_topics.term_id
              AND t.school_id = curriculum_topics.school_id
        )
    );

CREATE POLICY curriculum_topics_teacher_delete ON public.curriculum_topics AS PERMISSIVE FOR DELETE TO public
    USING (
        curriculum_topics.teacher_id = auth.uid()
        AND EXISTS (
            SELECT 1
            FROM public.teacher_assignments ta
            WHERE ta.school_id = curriculum_topics.school_id
              AND ta.teacher_id = auth.uid()
              AND ta.class_id = curriculum_topics.class_id
              AND ta.subject_id = curriculum_topics.subject_id
        )
    );

ALTER TABLE public.curriculum_topics ADD CONSTRAINT curriculum_topics_pkey PRIMARY KEY (id);
ALTER TABLE public.curriculum_topics ADD CONSTRAINT curriculum_topics_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_topics ADD CONSTRAINT curriculum_topics_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_topics ADD CONSTRAINT curriculum_topics_class_id_fkey FOREIGN KEY (class_id) REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_topics ADD CONSTRAINT curriculum_topics_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;
ALTER TABLE public.curriculum_topics ADD CONSTRAINT curriculum_topics_term_id_fkey FOREIGN KEY (term_id) REFERENCES public.terms(id) ON DELETE CASCADE;

CREATE INDEX idx_curriculum_topics_teacher_term ON public.curriculum_topics USING btree (teacher_id, term_id);
CREATE INDEX idx_curriculum_topics_school_term ON public.curriculum_topics USING btree (school_id, term_id);
CREATE INDEX idx_curriculum_topics_class_subject_term ON public.curriculum_topics USING btree (class_id, subject_id, term_id);
CREATE UNIQUE INDEX curriculum_topics_assignment_title_key
    ON public.curriculum_topics (teacher_id, class_id, subject_id, term_id, lower(btrim(title)));

CREATE OR REPLACE VIEW public.curriculum_topic_progress
WITH (security_invoker = true)
AS
SELECT
    ct.school_id,
    ct.term_id,
    ct.teacher_id,
    p.full_name AS teacher_name,
    ct.class_id,
    c.name AS class_name,
    ct.subject_id,
    s.name AS subject_name,
    count(*)::integer AS total_topics,
    count(*) FILTER (WHERE ct.completed)::integer AS completed_topics,
    CASE
        WHEN count(*) = 0 THEN 0
        ELSE round(
            (count(*) FILTER (WHERE ct.completed))::numeric * 100 / count(*),
            2
        )
    END AS completion_rate
FROM public.curriculum_topics ct
JOIN public.profiles p ON p.id = ct.teacher_id
JOIN public.classes c ON c.id = ct.class_id
JOIN public.subjects s ON s.id = ct.subject_id
GROUP BY
    ct.school_id,
    ct.term_id,
    ct.teacher_id,
    p.full_name,
    ct.class_id,
    c.name,
    ct.subject_id,
    s.name;

GRANT SELECT ON public.curriculum_topic_progress TO authenticated;