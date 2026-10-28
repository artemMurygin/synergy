CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_chunk (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  level TEXT NOT NULL CHECK (level IN (
    'spo', 'bachelor', 'specialist', 'master', 'postgrad',
    'dpo_pp', 'dpo_pk', 'short_course', 'kids', 'camp'
  )),
  section_type TEXT NOT NULL CHECK (section_type IN (
    'about', 'curriculum', 'careers', 'course_goal', 'usp', 'faq', 'people', 'cases', 'practice'
  )),
  chunk_no INTEGER NOT NULL DEFAULT 0 CHECK (chunk_no >= 0),
  text TEXT NOT NULL CHECK (length(btrim(text)) > 0),
  content_hash TEXT GENERATED ALWAYS AS (md5(text)) STORED,
  embedding vector(1536),
  search_vector TSVECTOR GENERATED ALWAYS AS (to_tsvector('russian', text)) STORED,
  source_row_id UUID REFERENCES raw_row (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (program_id, organization_id, level)
    REFERENCES program (id, organization_id, level) ON DELETE CASCADE,
  UNIQUE (program_id, section_type, chunk_no)
);

CREATE INDEX content_chunk_filter_idx ON content_chunk (organization_id, level, section_type);
CREATE INDEX content_chunk_search_vector_idx ON content_chunk USING gin (search_vector);
CREATE INDEX content_chunk_embedding_idx ON content_chunk USING hnsw (embedding vector_cosine_ops);
CREATE INDEX content_chunk_pending_embedding_idx ON content_chunk (id) WHERE embedding IS NULL;

CREATE FUNCTION reset_chunk_embedding_on_text_change() RETURNS trigger AS $$
BEGIN
  IF NEW.text IS DISTINCT FROM OLD.text AND NEW.embedding IS NOT DISTINCT FROM OLD.embedding THEN
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER content_chunk_reset_embedding
  BEFORE UPDATE OF text ON content_chunk
  FOR EACH ROW EXECUTE FUNCTION reset_chunk_embedding_on_text_change();
