-- ============================================================
-- Mastery Ecosystem — Supabase Schema Migration
-- 
-- HOW TO RUN:
-- 1. Go to https://supabase.com/dashboard/project/ouvowqkwsxgdgbxrmism/sql/new
-- 2. Paste this entire file
-- 3. Click "Run" or Ctrl+Enter
-- ============================================================

-- 1. Map Users (public talent registration from /public/index.html)
CREATE TABLE IF NOT EXISTS map_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_map_users_location ON map_users (latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_map_users_email ON map_users (email);

-- 2. Auth Users (sign up / sign in from auth.html)
CREATE TABLE IF NOT EXISTS auth_users (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  district TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  skills JSONB DEFAULT '[]'::jsonb,
  badges JSONB DEFAULT '[]'::jsonb,
  avatar_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users (email);
