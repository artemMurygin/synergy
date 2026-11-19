-- Перезапуск ответа с сообщения пользователя (change client-ui-design-parity).
-- agent_checkpoint_id: id последнего чекпоинта агента ПЕРЕД запуском этого вопроса; от него
-- форкается контекст агента при правке вопроса. NULL у вопроса первого хода (контекста ещё нет).
-- rewindable: вопрос можно править; у существующих строк false (точка отката не записывалась).
-- Откат: ALTER TABLE chat_message DROP COLUMN rewindable, DROP COLUMN agent_checkpoint_id;
ALTER TABLE chat_message
  ADD COLUMN agent_checkpoint_id TEXT NULL,
  ADD COLUMN rewindable BOOLEAN NOT NULL DEFAULT false;
