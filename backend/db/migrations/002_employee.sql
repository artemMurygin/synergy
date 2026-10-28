CREATE TABLE employee (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crm_responsible_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  telegram_username TEXT UNIQUE,
  telegram_chat_id BIGINT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX employee_telegram_username_lower_idx ON employee (lower(telegram_username));
