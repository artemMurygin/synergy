-- Расшифровка записи встречи. Переживает удаление файла: строка stored_file физически не удаляется.
CREATE TABLE meeting_transcript (
  file_id UUID PRIMARY KEY REFERENCES stored_file (id),
  owner_id UUID NOT NULL REFERENCES auth_users (id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'no_speech', 'failed')),
  failure_reason TEXT
    CHECK (failure_reason IN
      ('provider-unavailable', 'unsupported-media', 'too-long', 'timeout', 'file-deleted')),
  language TEXT,
  duration_sec DOUBLE PRECISION CHECK (duration_sec >= 0),
  speaker_count INTEGER NOT NULL DEFAULT 0 CHECK (speaker_count >= 0),
  -- [{ speaker, start, end, text }], читается только целиком.
  segments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(segments) = 'array'),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT meeting_transcript_failure_reason_matches_status
    CHECK ((status = 'failed') = (failure_reason IS NOT NULL))
);

CREATE INDEX meeting_transcript_owner_idx ON meeting_transcript (owner_id);
