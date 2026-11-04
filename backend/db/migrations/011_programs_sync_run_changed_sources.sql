ALTER TABLE programs_sync_run
  ADD COLUMN changed_sources JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE programs_sync_run
  ADD COLUMN failure_retryable BOOLEAN;
