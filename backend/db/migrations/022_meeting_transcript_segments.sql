-- Сегменты расшифровки и имена спикеров — отдельные таблицы вместо meeting_transcript.segments JSONB.
CREATE TABLE meeting_transcript_segment (
  file_id UUID NOT NULL REFERENCES meeting_transcript (file_id) ON DELETE CASCADE,
  -- Порядковый номер реплики в расшифровке, с нуля.
  seq INTEGER NOT NULL CHECK (seq >= 0),
  speaker SMALLINT NOT NULL CHECK (speaker >= 1),
  start_sec DOUBLE PRECISION NOT NULL CHECK (start_sec >= 0),
  end_sec DOUBLE PRECISION NOT NULL,
  text TEXT NOT NULL CHECK (char_length(text) > 0),
  PRIMARY KEY (file_id, seq),
  CONSTRAINT meeting_transcript_segment_time_order CHECK (end_sec >= start_sec)
);

-- Строка есть только у спикера с именем: сброс имени = удаление строки.
CREATE TABLE meeting_transcript_speaker (
  file_id UUID NOT NULL REFERENCES meeting_transcript (file_id) ON DELETE CASCADE,
  speaker SMALLINT NOT NULL CHECK (speaker >= 1),
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (file_id, speaker)
);

-- Перенос: порядок массива задаёт seq, номер спикера берётся из метки «Спикер N».
-- Метка другого вида даёт NULL и роняет миграцию: такие данные нужно разобрать вручную.
INSERT INTO meeting_transcript_segment (file_id, seq, speaker, start_sec, end_sec, text)
SELECT
  t.file_id,
  (s.ord - 1)::INTEGER,
  substring(s.segment ->> 'speaker' FROM '^Спикер ([0-9]+)$')::SMALLINT,
  (s.segment ->> 'start')::DOUBLE PRECISION,
  (s.segment ->> 'end')::DOUBLE PRECISION,
  s.segment ->> 'text'
FROM meeting_transcript t
CROSS JOIN LATERAL jsonb_array_elements(t.segments) WITH ORDINALITY AS s (segment, ord);

ALTER TABLE meeting_transcript DROP COLUMN segments;

-- Down (откат вручную; имена спикеров при откате теряются осознанно):
-- ALTER TABLE meeting_transcript
--   ADD COLUMN segments JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(segments) = 'array');
-- UPDATE meeting_transcript t SET segments = s.segments
-- FROM (
--   SELECT file_id,
--          jsonb_agg(jsonb_build_object('speaker', 'Спикер ' || speaker, 'start', start_sec,
--                                       'end', end_sec, 'text', text) ORDER BY seq) AS segments
--   FROM meeting_transcript_segment GROUP BY file_id
-- ) s
-- WHERE s.file_id = t.file_id;
-- DROP TABLE meeting_transcript_speaker;
-- DROP TABLE meeting_transcript_segment;
-- DELETE FROM schema_migrations WHERE name = '022_meeting_transcript_segments.sql';
