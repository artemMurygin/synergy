-- Инициатор — пользователь, который фактически создал задачу (собеседник агента).
-- creator_id остаётся постановщиком. Для старых задач инициатор равен создателю.
ALTER TABLE task ADD COLUMN initiator_id UUID REFERENCES auth_users (id);

UPDATE task SET initiator_id = creator_id;

ALTER TABLE task ALTER COLUMN initiator_id SET NOT NULL;

-- Down (откат вручную):
-- ALTER TABLE task DROP COLUMN initiator_id;
-- DELETE FROM schema_migrations WHERE name = '024_task_initiator.sql';
