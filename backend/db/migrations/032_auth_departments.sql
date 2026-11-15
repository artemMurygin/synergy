-- Справочник отделов: плоский список с необязательным руководителем.
-- Идентификатор текстовый: начальная загрузка из файла сохраняет собственные id отделов.
-- Откат: DROP TABLE auth_departments; (сначала откатить 033_auth_user_profiles)
CREATE TABLE auth_departments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 200),
  head_user_id UUID REFERENCES auth_users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX auth_departments_name_lower_idx ON auth_departments (lower(name));
CREATE INDEX auth_departments_head_idx ON auth_departments (head_user_id) WHERE head_user_id IS NOT NULL;
