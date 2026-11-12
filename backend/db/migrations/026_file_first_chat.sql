-- Чат, куда владелец впервые отправил файл. Без внешнего ключа на chat_session: после
-- удаления этого чата строка остаётся, и сообщение системы не уходит в другой чат.
CREATE TABLE chat_file_first_session (
  file_id UUID PRIMARY KEY REFERENCES stored_file (id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  session_id UUID NOT NULL
);

INSERT INTO chat_file_first_session (file_id, owner_id, session_id)
SELECT DISTINCT ON (a.file_id) a.file_id, s.owner_id, m.session_id
FROM chat_message_attachment a
JOIN chat_message m ON m.id = a.message_id
JOIN chat_session s ON s.id = m.session_id
WHERE m.role = 'user'
ORDER BY a.file_id, a.message_id;

-- Down (откат вручную):
-- DROP TABLE chat_file_first_session;
-- DELETE FROM schema_migrations WHERE name = '026_file_first_chat.sql';
