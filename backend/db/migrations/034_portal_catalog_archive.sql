-- Каталог Featurer: агент в нескольких продуктах, статус rework, launched_at, архив агентов и навыков.
-- Откат (вручную, архивные флаги теряются, архивные записи снова становятся видны):
--   ALTER TABLE portal_agents ADD COLUMN product_id UUID REFERENCES portal_products (id);
--   UPDATE portal_agents a SET product_id = (SELECT min(p.product_id::text)::uuid FROM portal_agent_products p WHERE p.agent_id = a.id);
--   ALTER TABLE portal_agents ALTER COLUMN product_id SET NOT NULL;
--   CREATE INDEX portal_agents_product_idx ON portal_agents (product_id);
--   DROP TABLE portal_agent_products;
--   UPDATE portal_skills SET status = 'testing' WHERE status = 'rework';
--   ALTER TABLE portal_skills DROP CONSTRAINT portal_skills_launched_has_time;
--   ALTER TABLE portal_skills DROP CONSTRAINT portal_skills_status_check;
--   ALTER TABLE portal_skills ADD CONSTRAINT portal_skills_status_check
--     CHECK (status IN ('planned', 'in_dev', 'testing', 'launched'));
--   ALTER TABLE portal_skills DROP COLUMN launched_at, DROP COLUMN archived_at;
--   ALTER TABLE portal_agents DROP COLUMN archived_at;

-- 0. Связь агент <-> продукт (многие ко многим); перенос существующих пар
CREATE TABLE portal_agent_products (
  agent_id UUID NOT NULL REFERENCES portal_agents (id),
  product_id UUID NOT NULL REFERENCES portal_products (id),
  PRIMARY KEY (agent_id, product_id)
);
CREATE INDEX portal_agent_products_product_idx ON portal_agent_products (product_id);

INSERT INTO portal_agent_products (agent_id, product_id)
SELECT id, product_id FROM portal_agents;

DROP INDEX portal_agents_product_idx;
ALTER TABLE portal_agents DROP COLUMN product_id;

-- 1. Статус rework
ALTER TABLE portal_skills DROP CONSTRAINT portal_skills_status_check;
ALTER TABLE portal_skills ADD CONSTRAINT portal_skills_status_check
  CHECK (status IN ('planned', 'in_dev', 'testing', 'launched', 'rework'));

-- 2-3. launched_at и archived_at у навыка; запуск существующих навыков
ALTER TABLE portal_skills
  ADD COLUMN launched_at TIMESTAMPTZ,
  ADD COLUMN archived_at TIMESTAMPTZ;
UPDATE portal_skills SET launched_at = status_changed_at WHERE status = 'launched';

-- 4. Запущенный навык обязан иметь время запуска
ALTER TABLE portal_skills ADD CONSTRAINT portal_skills_launched_has_time
  CHECK (status <> 'launched' OR launched_at IS NOT NULL);

-- 5. Архив агента
ALTER TABLE portal_agents ADD COLUMN archived_at TIMESTAMPTZ;
