CREATE TABLE IF NOT EXISTS agencyos_projects (
  id text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agencyos_schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO agencyos_schema_migrations(version)
VALUES ('001-projects-jsonb')
ON CONFLICT DO NOTHING;
