-- Источник сообщения: ответ запуска агента или сообщение системы (агент пишет первым).
ALTER TABLE chat_message
  ADD COLUMN source TEXT NOT NULL DEFAULT 'run' CHECK (source IN ('run', 'system')),
  -- Ключ идемпотентности сообщения системы (id события); у обычных сообщений NULL.
  ADD COLUMN dedup_key TEXT UNIQUE,
  ADD CONSTRAINT chat_message_system_from_agent CHECK (source <> 'system' OR role = 'agent');

-- Вложения сообщения. Статус файла не копируется: история берёт его из stored_file.
CREATE TABLE chat_message_attachment (
  message_id BIGINT NOT NULL REFERENCES chat_message (id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES stored_file (id),
  position SMALLINT NOT NULL CHECK (position >= 0),
  PRIMARY KEY (message_id, file_id),
  CONSTRAINT chat_message_attachment_position_key UNIQUE (message_id, position)
);

-- «Первый чат, куда отправили файл»: минимальный message_id для file_id.
CREATE INDEX chat_message_attachment_file_idx ON chat_message_attachment (file_id, message_id);

-- Down (откат вручную; сообщения системы и вложения удаляются):
-- DROP TABLE chat_message_attachment;
-- DELETE FROM chat_message WHERE source = 'system';
-- ALTER TABLE chat_message
--   DROP CONSTRAINT chat_message_system_from_agent,
--   DROP COLUMN dedup_key,
--   DROP COLUMN source;
-- DELETE FROM schema_migrations WHERE name = '023_chat_attachments.sql';
