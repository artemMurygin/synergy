CREATE TABLE programs_sync_run (
  id UUID PRIMARY KEY,
  group_id TEXT NOT NULL,
  previous_run_id UUID REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  trigger TEXT NOT NULL CHECK (trigger IN ('scheduled', 'retry')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  failure_code TEXT,
  failure_message TEXT,
  CHECK (previous_run_id IS NULL OR previous_run_id <> id)
);

CREATE INDEX programs_sync_run_group_created_idx ON programs_sync_run (group_id, created_at DESC);
CREATE INDEX programs_sync_run_previous_idx ON programs_sync_run (previous_run_id)
  WHERE previous_run_id IS NOT NULL;
