-- Черновик пакета задач агента: propose_tasks сохраняет, create_tasks расходует один раз.
CREATE TABLE task_batch_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  -- Thread агента (id чата).
  thread_id UUID NOT NULL,
  items JSONB NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  -- { kind: 'meeting', fileId, recordingName } или NULL.
  origin JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'superseded', 'consumed')),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Актуальный черновик у thread один: прошлый помечается superseded.
CREATE UNIQUE INDEX task_batch_draft_thread_draft_key ON task_batch_draft (thread_id)
  WHERE status = 'draft';

-- Down (откат вручную):
-- DROP TABLE task_batch_draft;
-- DELETE FROM schema_migrations WHERE name = '025_task_batch_draft.sql';
