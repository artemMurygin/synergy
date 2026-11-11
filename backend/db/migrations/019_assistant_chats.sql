-- WARNING: destructive. Existing chats have no known owner, so they are removed together
-- with their messages and with the agent checkpointer data (thread ids are chat ids).
DELETE FROM chat_session;

-- The checkpointer tables are created by the library at application start, so they may be
-- absent when this migration runs on a fresh database.
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['checkpoints', 'checkpoint_blobs', 'checkpoint_writes'] LOOP
    IF to_regclass('public.' || tbl) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I', tbl);
    END IF;
  END LOOP;
END $$;

ALTER TABLE chat_session
  ADD COLUMN owner_id UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  ADD COLUMN channel TEXT NOT NULL CHECK (channel IN ('app', 'telegram'));

DROP INDEX chat_session_last_activity_idx;
CREATE INDEX chat_session_owner_activity_idx ON chat_session (owner_id, last_activity_at DESC);

-- One Telegram dialog per owner; app chats are not limited.
CREATE UNIQUE INDEX chat_session_owner_telegram_key ON chat_session (owner_id)
  WHERE channel = 'telegram';
