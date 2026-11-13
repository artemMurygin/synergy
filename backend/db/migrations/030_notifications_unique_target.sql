-- Идемпотентность уведомлений теперь включает target_id: одно событие может создать
-- несколько уведомлений одному получателю с одним типом, но для разных целей.
-- Существующие строки остаются валидными: новый индекс строго слабее старого.
-- Откат (допустим, пока нет строк с одинаковыми (source_event_id, recipient_id, type)
-- и разным target_id; такие строки нужно предварительно удалить):
--   DROP INDEX notifications_source_recipient_type_target_key;
--   CREATE UNIQUE INDEX notifications_source_recipient_type_key
--     ON notifications (source_event_id, recipient_id, type);
DROP INDEX notifications_source_recipient_type_key;
CREATE UNIQUE INDEX notifications_source_recipient_type_target_key
  ON notifications (source_event_id, recipient_id, type, target_id);
