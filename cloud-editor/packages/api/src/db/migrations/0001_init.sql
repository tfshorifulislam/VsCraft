-- Initial schema for the cloud code editor.
--
-- PostgreSQL stores project/file METADATA only. File contents live in S3/R2.
-- There is intentionally no content column on `files`.
--
-- IMPORTANT: deleting files or projects removes metadata rows via ON DELETE
-- CASCADE / SET NULL below, but it does NOT delete S3 objects. Prompt 4's file
-- service must remove the corresponding S3 objects at the application level
-- (for example: list/delete objects under projects/{projectId}/ before or
-- after deleting the metadata rows). Do not rely on database triggers for S3
-- cleanup because object storage is outside the transaction boundary.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'public')),
  language text NOT NULL DEFAULT 'javascript',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX projects_owner_id_idx ON projects (owner_id);
CREATE INDEX projects_updated_at_idx ON projects (updated_at DESC);

CREATE TABLE project_members (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX project_members_user_id_idx ON project_members (user_id);

-- Exactly one owner membership per project.
CREATE UNIQUE INDEX one_owner_per_project ON project_members (project_id)
  WHERE role = 'owner';

CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path text NOT NULL,
  is_dir boolean NOT NULL DEFAULT false,
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  s3_key text,
  content_hash text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, path),
  CHECK (path <> '' AND path NOT LIKE '/%' AND path NOT LIKE '%..%')
);

CREATE INDEX files_project_id_is_dir_idx ON files (project_id, is_dir);

CREATE TABLE project_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  label text,
  manifest_s3_key text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX project_snapshots_project_id_created_at_idx
  ON project_snapshots (project_id, created_at DESC);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_expires_at_idx ON refresh_tokens (expires_at);

CREATE TABLE runner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  container_id text,
  status text NOT NULL DEFAULT 'starting'
    CHECK (status IN ('starting', 'running', 'stopped', 'failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE INDEX runner_sessions_project_id_idx ON runner_sessions (project_id);
CREATE INDEX runner_sessions_user_id_idx ON runner_sessions (user_id);
CREATE INDEX runner_sessions_status_idx ON runner_sessions (status);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER projects_set_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER files_set_updated_at
  BEFORE UPDATE ON files
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
