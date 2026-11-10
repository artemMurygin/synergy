CREATE TABLE telegram_links (
  user_id UUID PRIMARY KEY REFERENCES auth_users (id) ON DELETE CASCADE,
  telegram_user_id BIGINT NOT NULL CHECK (telegram_user_id > 0),
  chat_id BIGINT NOT NULL CHECK (chat_id > 0),
  username TEXT,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT telegram_links_telegram_user_id_key UNIQUE (telegram_user_id)
);

CREATE TABLE telegram_deliveries (
  notification_id UUID PRIMARY KEY REFERENCES notifications (id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'skipped')),
  reserved_at TIMESTAMPTZ NOT NULL,
  message_id BIGINT,
  sent_at TIMESTAMPTZ,
  CONSTRAINT telegram_deliveries_sent_has_message
    CHECK (status <> 'sent' OR (message_id IS NOT NULL AND sent_at IS NOT NULL))
);
