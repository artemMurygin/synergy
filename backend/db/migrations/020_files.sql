CREATE TABLE stored_file (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth_users (id),
  original_name TEXT NOT NULL CHECK (char_length(original_name) BETWEEN 1 AND 255),
  media_type TEXT NOT NULL CHECK (char_length(media_type) > 0),
  kind TEXT NOT NULL CHECK (kind IN ('recording', 'document')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  storage_key TEXT NOT NULL UNIQUE CHECK (char_length(storage_key) > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  held_until TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  uploaded_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT stored_file_retention_one_of CHECK ((held_until IS NULL) <> (expires_at IS NULL)),
  CONSTRAINT stored_file_deleted_at_matches_status CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE INDEX stored_file_owner_idx ON stored_file (owner_id);
-- Выборка просроченных: обычный срок и зависшее удержание.
CREATE INDEX stored_file_expires_at_idx ON stored_file (expires_at) WHERE status = 'active';
CREATE INDEX stored_file_held_until_idx ON stored_file (held_until) WHERE status = 'active';
