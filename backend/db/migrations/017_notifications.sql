CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (char_length(type) > 0),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  target_type TEXT NOT NULL CHECK (char_length(target_type) > 0),
  target_id TEXT NOT NULL CHECK (char_length(target_id) > 0),
  actor_id UUID REFERENCES auth_users (id) ON DELETE SET NULL,
  source_event_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  CONSTRAINT notifications_read_after_created CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX notifications_recipient_created_idx ON notifications (recipient_id, created_at DESC);
CREATE INDEX notifications_recipient_unread_idx ON notifications (recipient_id) WHERE read_at IS NULL;
CREATE UNIQUE INDEX notifications_source_recipient_type_key
  ON notifications (source_event_id, recipient_id, type);
