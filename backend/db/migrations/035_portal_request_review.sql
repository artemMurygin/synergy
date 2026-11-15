-- Рассмотрение заявок Featurer: статусы new/under_review, взявший, оценка; уникальные названия агентов и продуктов.
-- Откат (вручную, взятия в работу и оценки теряются, решения сохраняются):
--   DROP INDEX portal_agents_name_uq;
--   DROP INDEX portal_products_name_uq;
--   DROP INDEX portal_requests_pending_idx;
--   ALTER TABLE portal_requests DROP CONSTRAINT portal_requests_decision_check;
--   ALTER TABLE portal_requests DROP CONSTRAINT portal_requests_new_has_no_reviewer;
--   ALTER TABLE portal_requests DROP CONSTRAINT portal_requests_reviewer_has_taken_at;
--   ALTER TABLE portal_requests DROP CONSTRAINT portal_requests_effort_only_when_accepted;
--   ALTER TABLE portal_requests DROP CONSTRAINT portal_requests_effort_positive;
--   UPDATE portal_requests SET decision = 'pending' WHERE decision IN ('new', 'under_review');
--   ALTER TABLE portal_requests DROP COLUMN reviewer_id, DROP COLUMN taken_at, DROP COLUMN effort_hours;
--   ALTER TABLE portal_requests ADD CONSTRAINT portal_requests_decision_check
--     CHECK (decision IN ('pending', 'accepted', 'rejected'));
--   ALTER TABLE portal_requests ALTER COLUMN decision SET DEFAULT 'pending';
--   CREATE INDEX portal_requests_pending_idx ON portal_requests (created_at) WHERE decision = 'pending';

-- 0. Проверка дублей названий (без учёта регистра и крайних пробелов)
DO $$
DECLARE
  dups TEXT;
BEGIN
  SELECT string_agg(format('%s: "%s" x%s', t, k, c), '; ') INTO dups FROM (
    SELECT 'portal_agents' AS t, lower(btrim(name)) AS k, count(*) AS c
      FROM portal_agents GROUP BY lower(btrim(name)) HAVING count(*) > 1
    UNION ALL
    SELECT 'portal_products', lower(btrim(name)), count(*)
      FROM portal_products GROUP BY lower(btrim(name)) HAVING count(*) > 1
  ) d;
  IF dups IS NOT NULL THEN
    RAISE EXCEPTION 'Дубли названий, переименуйте до миграции: %', dups;
  END IF;
END $$;

-- 1. Статусы заявки: pending -> new
ALTER TABLE portal_requests DROP CONSTRAINT portal_requests_decision_check;
UPDATE portal_requests SET decision = 'new' WHERE decision = 'pending';
ALTER TABLE portal_requests ALTER COLUMN decision SET DEFAULT 'new';

-- 2. Взявший, время взятия, оценка
ALTER TABLE portal_requests
  ADD COLUMN reviewer_id UUID REFERENCES auth_users (id),
  ADD COLUMN taken_at TIMESTAMPTZ,
  ADD COLUMN effort_hours INTEGER;

UPDATE portal_requests
   SET reviewer_id = decided_by, taken_at = decided_at
 WHERE decision IN ('accepted', 'rejected');

ALTER TABLE portal_requests
  ADD CONSTRAINT portal_requests_decision_check
    CHECK (decision IN ('new', 'under_review', 'accepted', 'rejected')),
  ADD CONSTRAINT portal_requests_new_has_no_reviewer
    CHECK ((decision = 'new') = (reviewer_id IS NULL)),
  ADD CONSTRAINT portal_requests_reviewer_has_taken_at
    CHECK ((reviewer_id IS NULL) = (taken_at IS NULL)),
  ADD CONSTRAINT portal_requests_effort_only_when_accepted
    CHECK (decision = 'accepted' OR effort_hours IS NULL),
  ADD CONSTRAINT portal_requests_effort_positive
    CHECK (effort_hours IS NULL OR effort_hours > 0);

-- 3. Очередь: новые и на рассмотрении
DROP INDEX portal_requests_pending_idx;
CREATE INDEX portal_requests_pending_idx ON portal_requests (created_at)
  WHERE decision IN ('new', 'under_review');

-- 4. Уникальность названий
CREATE UNIQUE INDEX portal_agents_name_uq ON portal_agents (lower(btrim(name)));
CREATE UNIQUE INDEX portal_products_name_uq ON portal_products (lower(btrim(name)));
