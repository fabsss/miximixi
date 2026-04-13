-- Migration 004: PostgreSQL roles for PostgREST + grants
-- Diese Rollen braucht PostgREST, um JWT-Claims (anon, authenticated, service_role) zu mappen.
-- CREATE ROLE IF NOT EXISTS gibt es erst ab PG 16 – daher mit DO-Block absichern.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;

-- postgres (Superuser) muss Mitglied aller drei Rollen sein, damit PostgREST SET ROLE ausführen kann
GRANT anon        TO postgres;
GRANT authenticated TO postgres;
GRANT service_role TO postgres;

-- Schema-Zugriff
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Tabellen-Grants
GRANT SELECT                          ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE  ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES                  ON ALL TABLES IN SCHEMA public TO service_role;

-- Sequences (für INSERT mit SERIAL/gen_random_uuid braucht man keine, aber sicherheitshalber)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

-- Zukünftige Tabellen automatisch berechtigen
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
