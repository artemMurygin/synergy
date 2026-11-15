-- Баги по агентам портала (change add-featurer-bug-reports).
-- created_at и status_changed_at пишет приложение (Clock). Пара (product, agent)
-- проверяется в use-case, FK на portal_agent_products нет.
-- Откат: DROP TABLE portal_bug_comments; DROP TABLE portal_bugs;

CREATE TABLE portal_bugs (
    id                UUID PRIMARY KEY,
    author_id         UUID NOT NULL REFERENCES auth_users (id),
    product_id        UUID NOT NULL REFERENCES portal_products (id),
    agent_id          UUID NOT NULL REFERENCES portal_agents (id),
    title             TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
    description       TEXT NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 4000),
    status            TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
    wont_fix_reason   TEXT NULL CHECK (wont_fix_reason IS NULL OR char_length(wont_fix_reason) BETWEEN 1 AND 2000),
    status_changed_by UUID NULL REFERENCES auth_users (id),
    created_at        TIMESTAMPTZ NOT NULL,
    status_changed_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT portal_bugs_reason_iff_wont_fix
        CHECK ((status = 'wont_fix') = (wont_fix_reason IS NOT NULL))
);

CREATE INDEX portal_bugs_author_idx ON portal_bugs (author_id, created_at DESC, id);
CREATE INDEX portal_bugs_status_idx ON portal_bugs (status, created_at, id);

CREATE TABLE portal_bug_comments (
    id         UUID PRIMARY KEY,
    bug_id     UUID NOT NULL REFERENCES portal_bugs (id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES auth_users (id),
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL,
    edited_at  TIMESTAMPTZ NULL CHECK (edited_at IS NULL OR edited_at >= created_at)
);

CREATE INDEX portal_bug_comments_bug_idx ON portal_bug_comments (bug_id, created_at, id);
