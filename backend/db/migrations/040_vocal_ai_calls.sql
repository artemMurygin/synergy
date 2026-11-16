-- Хранение звонков VocalAI, синхронизируемых фоновым воркером (change vocal-ai-sync-agent).
-- vocal_ai_projects хранит и метаданные проекта, и курсор синхронизации (last_synced_at);
-- NULL в last_synced_at означает «проект ещё не синхронизирован ни разу».
-- Дочерние таблицы (metric scores / tags / summaries / transcript lines) полностью
-- перезаписываются приложением при каждом upsert звонка — ON DELETE CASCADE достаточен.
-- Откат: DROP TABLE vocal_ai_call_transcript_lines; DROP TABLE vocal_ai_call_summaries;
--   DROP TABLE vocal_ai_call_tags; DROP TABLE vocal_ai_call_metric_scores;
--   DROP TABLE vocal_ai_calls; DROP TABLE vocal_ai_projects;

CREATE TABLE vocal_ai_projects (
    project_id      TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    last_synced_at  TIMESTAMPTZ NULL
);

CREATE TABLE vocal_ai_calls (
    call_id             BIGINT PRIMARY KEY,
    project_id          TEXT NOT NULL,
    manager             TEXT NULL,
    client              TEXT NULL,
    call_type           TEXT NULL,
    call_created_at     TIMESTAMPTZ NULL,
    call_completed_at   TIMESTAMPTZ NULL,
    scored_at           TIMESTAMPTZ NULL,
    rescored_at         TIMESTAMPTZ NULL,
    duration_seconds    INTEGER NULL,
    total_score         DOUBLE PRECISION NULL,
    max_score           DOUBLE PRECISION NULL,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vocal_ai_calls_project_idx ON vocal_ai_calls (project_id, call_completed_at);
CREATE INDEX vocal_ai_calls_manager_idx ON vocal_ai_calls (manager);
CREATE INDEX vocal_ai_calls_total_score_idx ON vocal_ai_calls (total_score);

CREATE TABLE vocal_ai_call_metric_scores (
    id              BIGSERIAL PRIMARY KEY,
    call_id         BIGINT NOT NULL REFERENCES vocal_ai_calls (call_id) ON DELETE CASCADE,
    metric_id       TEXT NOT NULL,
    metric_title    TEXT NOT NULL,
    score_value     DOUBLE PRECISION NOT NULL,
    max_score       DOUBLE PRECISION NOT NULL,
    reason          TEXT NULL,
    recommendations TEXT NULL,
    is_exception    BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT vocal_ai_call_metric_scores_unique UNIQUE (call_id, metric_id)
);

CREATE INDEX vocal_ai_call_metric_scores_metric_idx ON vocal_ai_call_metric_scores (metric_id);

CREATE TABLE vocal_ai_call_tags (
    id                BIGSERIAL PRIMARY KEY,
    call_id           BIGINT NOT NULL REFERENCES vocal_ai_calls (call_id) ON DELETE CASCADE,
    tag_id            TEXT NOT NULL,
    tag_title         TEXT NOT NULL,
    value             TEXT NOT NULL,
    value_description TEXT NULL,
    CONSTRAINT vocal_ai_call_tags_unique UNIQUE (call_id, tag_id)
);

CREATE INDEX vocal_ai_call_tags_tag_idx ON vocal_ai_call_tags (tag_id);

CREATE TABLE vocal_ai_call_summaries (
    id            BIGSERIAL PRIMARY KEY,
    call_id       BIGINT NOT NULL REFERENCES vocal_ai_calls (call_id) ON DELETE CASCADE,
    summary_title TEXT NOT NULL,
    summary_text  TEXT NOT NULL
);

CREATE INDEX vocal_ai_call_summaries_call_idx ON vocal_ai_call_summaries (call_id);

CREATE TABLE vocal_ai_call_transcript_lines (
    call_id             BIGINT NOT NULL REFERENCES vocal_ai_calls (call_id) ON DELETE CASCADE,
    line_index          INTEGER NOT NULL CHECK (line_index >= 0),
    speaker_name        TEXT NOT NULL,
    speaker_role        TEXT NOT NULL CHECK (speaker_role IN ('manager', 'client')),
    start_time_seconds  DOUBLE PRECISION NOT NULL,
    end_time_seconds    DOUBLE PRECISION NOT NULL,
    text                TEXT NOT NULL,
    PRIMARY KEY (call_id, line_index)
);
