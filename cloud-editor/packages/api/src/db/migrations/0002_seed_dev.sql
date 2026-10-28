-- Development-only seed data.
--
-- This migration is a no-op whenever the users table already contains at
-- least one row, so it is safe to keep in the migration chain. The password
-- hash below is bcrypt("password123").
--
-- File rows are metadata only (s3_key is NULL). Upload real content through
-- the S3 file service added in Prompt 4.

DO $$
DECLARE
  demo_user_id uuid;
  demo_project_id uuid;
BEGIN
  IF (SELECT count(*) FROM users) = 0 THEN
    INSERT INTO users (email, password_hash, display_name)
    VALUES (
      'dev@example.com',
      '$2b$10$k08m4Vvzv/9UJRAh9EoP/..P1oDksfCO4zhkPEB4VUmAA0u1s5hwW',
      'Dev User'
    )
    RETURNING id INTO demo_user_id;

    INSERT INTO projects (owner_id, name, description, visibility, language)
    VALUES (
      demo_user_id,
      'demo-project',
      'Seeded project for local smoke tests',
      'private',
      'javascript'
    )
    RETURNING id INTO demo_project_id;

    INSERT INTO project_members (project_id, user_id, role)
    VALUES (demo_project_id, demo_user_id, 'owner');

    INSERT INTO files (project_id, path, is_dir, size_bytes, s3_key, updated_by)
    VALUES
      (demo_project_id, 'src', true, 0, NULL, demo_user_id),
      (demo_project_id, 'src/index.js', false, 0, NULL, demo_user_id);
  END IF;
END
$$;
