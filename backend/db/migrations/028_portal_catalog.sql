-- Каталог портала Featurer: продукт -> агент -> навык.
-- Откат: DROP TABLE portal_skills, portal_agents, portal_products;
CREATE TABLE portal_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) > 0),
  name TEXT NOT NULL CHECK (char_length(name) > 0)
);

CREATE TABLE portal_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES portal_products (id),
  slug TEXT NOT NULL UNIQUE CHECK (char_length(slug) > 0),
  name TEXT NOT NULL CHECK (char_length(name) > 0)
);

CREATE TABLE portal_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES portal_agents (id),
  name TEXT NOT NULL CHECK (char_length(name) > 0),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('planned', 'in_dev', 'testing', 'launched')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX portal_agents_product_idx ON portal_agents (product_id);
CREATE INDEX portal_skills_agent_idx ON portal_skills (agent_id);
CREATE INDEX portal_skills_status_idx ON portal_skills (status);
