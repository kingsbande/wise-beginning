const { Client } = require('pg');
const fs = require('fs');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("Error: DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const client = new Client({ connectionString });

const query = `
WITH
tables AS (
  SELECT
    c.oid,
    c.relname AS t_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
),
table_columns AS (
  SELECT
    t.oid,
    t.t_name,
    (
      'CREATE TABLE public.' || quote_ident(t.t_name) ||
      E' (\\n' ||
      (
        SELECT string_agg(
          '    ' || quote_ident(a.attname) || ' ' ||
          pg_catalog.format_type(a.atttypid, a.atttypmod) ||
          CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END,
          E',\\n' ORDER BY a.attnum
        )
        FROM pg_attribute a
        WHERE a.attrelid = t.oid
          AND a.attnum > 0
          AND NOT a.attisdropped
      ) ||
      E'\\n);'
    ) AS schema_element
  FROM tables t
),
rls_enable AS (
  SELECT
    2 AS prio,
    c.relname AS sort_key,
    'ALTER TABLE public.' || quote_ident(c.relname) || ' ENABLE ROW LEVEL SECURITY;' AS schema_element
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=true
),
policies AS (
  SELECT
    3 AS prio,
    pol.tablename AS sort_key,
    'CREATE POLICY ' || quote_ident(pol.policyname) ||
    ' ON public.' || quote_ident(pol.tablename) ||
    ' AS ' || pol.permissive ||
    ' FOR ' || pol.cmd ||
    ' TO ' ||
    COALESCE(
      (
        SELECT string_agg(quote_ident(r), ', ')
        FROM unnest(pol.roles) AS r
      ),
      'PUBLIC'
    ) ||
    CASE WHEN pol.qual IS NOT NULL THEN ' USING (' || pol.qual || ')' ELSE '' END ||
    CASE WHEN pol.with_check IS NOT NULL THEN ' WITH CHECK (' || pol.with_check || ')' ELSE '' END ||
    ';' AS schema_element
  FROM pg_policies pol
  WHERE pol.schemaname='public'
),
constraint_ddls AS (
  SELECT
    4 AS prio,
    c.relname AS sort_key,
    'ALTER TABLE public.' || quote_ident(c.relname) ||
    ' ADD CONSTRAINT ' || quote_ident(con.conname) || ' ' || pg_get_constraintdef(con.oid, true) || ';' AS schema_element
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN pg_namespace n ON n.oid = con.connamespace
  WHERE n.nspname='public'
    AND con.contype IN ('p','u','c','f')
),
indexes AS (
  SELECT
    5 AS prio,
    tbl.relname AS sort_key,
    'CREATE INDEX ' || quote_ident(idx.relname) ||
    ' ON public.' || quote_ident(tbl.relname) ||
    ' USING ' || am.amname ||
    ' (' ||
      (
        SELECT string_agg(
          quote_ident(a.attname) ||
          CASE WHEN ix.indoption[x.ord-1] & 1 = 1 THEN ' DESC' ELSE '' END,
          ', ' ORDER BY x.ord
        )
        FROM unnest(ix.indkey) WITH ORDINALITY AS x(attnum, ord)
        JOIN pg_attribute a
          ON a.attrelid = ix.indrelid
         AND a.attnum = x.attnum
      ) ||
    ')' ||
    CASE WHEN ix.indpred IS NOT NULL THEN ' WHERE ' || pg_get_expr(ix.indpred, ix.indrelid) ELSE '' END ||
    ';' AS schema_element
  FROM pg_index ix
  JOIN pg_class tbl ON tbl.oid = ix.indrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  JOIN pg_class idx ON idx.oid = ix.indexrelid
  JOIN pg_am am ON am.oid = idx.relam
  WHERE n.nspname='public'
    AND tbl.relkind='r'
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = idx.oid)
),
sequences AS (
  SELECT
    6 AS prio,
    c.relname AS sort_key,
    'CREATE SEQUENCE public.' || quote_ident(c.relname) ||
    COALESCE(' INCREMENT BY ' || seq.increment_by, '') ||
    COALESCE(' MINVALUE ' || seq.min_value, '') ||
    COALESCE(' MAXVALUE ' || seq.max_value, '') ||
    COALESCE(' START WITH ' || seq.start_value, '') ||
    COALESCE(' CACHE ' || seq.cache_size, '') ||
    ';' AS schema_element
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_sequences seq ON seq.schemaname = n.nspname AND seq.sequencename = c.relname
  WHERE n.nspname='public'
),
column_defaults AS (
  SELECT
    7 AS prio,
    tbl.relname AS sort_key,
    'ALTER TABLE public.' || quote_ident(tbl.relname) ||
    ' ALTER COLUMN ' || quote_ident(a.attname) ||
    ' SET DEFAULT ' || pg_get_expr(d.adbin, d.adrelid) || ';' AS schema_element
  FROM pg_attrdef d
  JOIN pg_class tbl ON tbl.oid = d.adrelid
  JOIN pg_namespace n ON n.oid = tbl.relnamespace
  JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
  WHERE n.nspname='public'
    AND NOT (pg_get_expr(d.adbin, d.adrelid) LIKE 'nextval%')
)
SELECT string_agg(schema_element, E'\\n\\n' ORDER BY sort_key, prio) AS full_schema
FROM (
  SELECT 1 AS prio, t.t_name AS sort_key, tc.schema_element FROM tables t JOIN table_columns tc ON tc.oid=t.oid
  UNION ALL SELECT prio, sort_key, schema_element FROM rls_enable
  UNION ALL SELECT prio, sort_key, schema_element FROM policies
  UNION ALL SELECT prio, sort_key, schema_element FROM constraint_ddls
  UNION ALL SELECT prio, sort_key, schema_element FROM indexes
  UNION ALL SELECT prio, sort_key, schema_element FROM sequences
  UNION ALL SELECT prio, sort_key, schema_element FROM column_defaults
) objects;
`;

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    const res = await client.query(query);
    const full = res.rows && res.rows[0] ? res.rows[0].full_schema : null;
    fs.writeFileSync('supabase_complete_schema.sql', full || '-- No schema found');
    console.log('Successfully saved to supabase_complete_schema.sql');
  } catch (e) {
    console.error("Execution failed:", e);
  } finally {
    await client.end();
  }
}

run();