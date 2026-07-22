-- ============================================================
-- MOVER_A_LEGACY.SQL
-- Mueve todo el contenido de `public` (schema v1) a un schema `legacy`,
-- dejando `public` libre para aplicar el schema v2 encima.
-- Ver docs/MIGRA_PENCA_MULTIP.md, Fase 4a y Apéndice B.
-- ============================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS legacy;

DO $$
DECLARE r record;
BEGIN
  -- Tablas, vistas y sequences sueltas de public → legacy.
  -- Se excluyen: objetos de extensiones (deptype 'e') y sequences owned por columnas
  -- (deptype 'a'/'i'), que viajan solas con su tabla.
  FOR r IN
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r','v','m','S')
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = c.oid AND d.deptype IN ('e'))
      AND NOT (c.relkind = 'S' AND EXISTS (
                 SELECT 1 FROM pg_depend d
                 WHERE d.objid = c.oid AND d.deptype IN ('a','i')))
  LOOP
    EXECUTE format('ALTER %s public.%I SET SCHEMA legacy',
      CASE r.relkind WHEN 'r' THEN 'TABLE'
                     WHEN 'v' THEN 'VIEW'
                     WHEN 'm' THEN 'MATERIALIZED VIEW'
                     ELSE 'SEQUENCE' END,
      r.relname);
  END LOOP;

  -- Funciones propias de public → legacy (las de extensiones se excluyen).
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d
                      WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER FUNCTION public.%I(%s) SET SCHEMA legacy',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Policies de storage de v1: chocan por NOMBRE con las que crea 02_rls.sql.
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_user_delete" ON storage.objects;

COMMIT;

-- Verificación: public debe quedar (casi) vacío y legacy con ~20 tablas de v1
SELECT 'public' AS schema, count(*) FROM pg_tables WHERE schemaname = 'public'
UNION ALL
SELECT 'legacy', count(*) FROM pg_tables WHERE schemaname = 'legacy';
SELECT count(*) AS legacy_predictions FROM legacy.predictions;
SELECT count(*) AS legacy_matches     FROM legacy.matches;      -- esperado: 104
