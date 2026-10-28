INSERT INTO employee (crm_responsible_id, full_name, telegram_username, is_active) VALUES
  ('resp-1', 'Ivan Petrov', 'ivan_petrov', true),
  ('resp-2', 'Maria Sidorova', 'maria_sidorova', true),
  ('resp-3', 'Alexey Smirnov', 'alexey_smirnov', true),
  ('resp-4', 'Olga Kuznetsova', 'olga_kuznetsova', false)
ON CONFLICT (crm_responsible_id) DO NOTHING;
