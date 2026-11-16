-- Инструкции агентов и доступность продуктов отделам (change add-featurer-agent-guides).
-- Инструкция лежит отдельной таблицей: пустая не хранится (нет строки), архивация агента её не трогает.
-- Доступность продукта справочная, права по отделу не проверяются; отдел удаляется каскадом.
-- Откат: DROP TABLE portal_product_departments; DROP TABLE portal_agent_guides;

CREATE TABLE portal_agent_guides (
    agent_id   UUID PRIMARY KEY REFERENCES portal_agents (id),
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 50000),
    updated_by UUID NOT NULL REFERENCES auth_users (id),
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE portal_product_departments (
    product_id    UUID NOT NULL REFERENCES portal_products (id),
    department_id TEXT NOT NULL REFERENCES auth_departments (id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, department_id)
);

CREATE INDEX portal_product_departments_department_idx ON portal_product_departments (department_id);
