-- Роли пользователя (закрытое множество). Аддитивная миграция: существующие таблицы не меняются.
-- Откат: DROP TABLE auth_user_roles;
CREATE TABLE auth_user_roles (
  user_id UUID NOT NULL REFERENCES auth_users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('developer')),
  PRIMARY KEY (user_id, role)
);
