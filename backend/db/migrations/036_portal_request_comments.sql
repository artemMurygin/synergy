-- Комментарии к заявкам портала (change add-featurer-request-comments).
-- created_at пишет приложение (Clock); окно правки проверяется в домене, не в БД.
-- Откат: DROP TABLE portal_request_comments;

CREATE TABLE portal_request_comments (
    id         UUID PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES portal_requests(id) ON DELETE CASCADE,
    author_id  UUID NOT NULL REFERENCES auth_users(id),
    body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
    created_at TIMESTAMPTZ NOT NULL,
    edited_at  TIMESTAMPTZ NULL CHECK (edited_at IS NULL OR edited_at >= created_at)
);

CREATE INDEX portal_request_comments_request_idx
    ON portal_request_comments (request_id, created_at, id);
