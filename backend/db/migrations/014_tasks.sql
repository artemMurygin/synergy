CREATE TABLE task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 10000),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  deadline TIMESTAMPTZ,
  creator_id UUID NOT NULL REFERENCES auth_users (id),
  assignee_id UUID REFERENCES auth_users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT task_completed_at_matches_status CHECK ((status = 'done') = (completed_at IS NOT NULL))
);

CREATE INDEX task_status_idx ON task (status) WHERE deleted_at IS NULL;
CREATE INDEX task_assignee_idx ON task (assignee_id) WHERE deleted_at IS NULL;
CREATE INDEX task_creator_idx ON task (creator_id) WHERE deleted_at IS NULL;
CREATE INDEX task_deadline_idx ON task (deadline) WHERE deleted_at IS NULL;
CREATE INDEX task_created_at_idx ON task (created_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE task_watcher (
  task_id UUID NOT NULL REFERENCES task (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX task_watcher_user_idx ON task_watcher (user_id);

CREATE TABLE task_attachment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES task (id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  size_bytes BIGINT NOT NULL,
  content_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth_users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX task_attachment_task_idx ON task_attachment (task_id);
