-- Допустимая роль admin: расширяем закрытое множество ролей до ('developer', 'admin').
-- Откат: сначала DELETE FROM auth_user_roles WHERE role = 'admin';
--   затем ALTER TABLE auth_user_roles DROP CONSTRAINT IF EXISTS auth_user_roles_role_check;
--   ALTER TABLE auth_user_roles ADD CONSTRAINT auth_user_roles_role_check CHECK (role IN ('developer'));
ALTER TABLE auth_user_roles DROP CONSTRAINT IF EXISTS auth_user_roles_role_check;
ALTER TABLE auth_user_roles
  ADD CONSTRAINT auth_user_roles_role_check CHECK (role IN ('developer', 'admin'));
