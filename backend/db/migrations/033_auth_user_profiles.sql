-- Профиль сотрудника 1:1 с auth_users. Строки нет у пользователей, заведённых до профиля:
-- отсутствие строки равно пустому профилю. Полное имя не хранится, собирается из частей.
-- Откат: DROP TABLE auth_user_profiles;
CREATE TABLE auth_user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth_users (id) ON DELETE CASCADE,
  last_name TEXT CHECK (char_length(last_name) <= 200),
  first_name TEXT CHECK (char_length(first_name) <= 200),
  middle_name TEXT CHECK (char_length(middle_name) <= 200),
  department_id TEXT REFERENCES auth_departments (id) ON DELETE RESTRICT,
  position TEXT CHECK (char_length(position) <= 200),
  email TEXT CHECK (char_length(email) <= 254),
  scrm_employee_id TEXT CHECK (char_length(scrm_employee_id) <= 64)
);

CREATE UNIQUE INDEX auth_user_profiles_email_lower_idx
  ON auth_user_profiles (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX auth_user_profiles_department_idx ON auth_user_profiles (department_id);
