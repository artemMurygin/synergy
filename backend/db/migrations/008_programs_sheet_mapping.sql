CREATE TABLE sheet_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_sheet_id UUID NOT NULL REFERENCES source_sheet (id) ON DELETE CASCADE,
  header_hash TEXT NOT NULL,
  mapping JSONB,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  is_manually_edited BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('supported', 'unsupported')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_sheet_id, header_hash, model, prompt_version),
  CHECK ((status = 'supported' AND mapping IS NOT NULL) OR (status = 'unsupported'))
);

CREATE INDEX sheet_mapping_source_sheet_idx ON sheet_mapping (source_sheet_id);
