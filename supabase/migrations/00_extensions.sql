-- ============================================================================
-- 00_extensions — Required PostgreSQL extensions
-- ============================================================================
-- Consolidated schema (Single Source of Truth). Applied first because every
-- table below relies on gen_random_uuid() from pgcrypto.
--
-- Source (merged): 00001_create_prisons.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
