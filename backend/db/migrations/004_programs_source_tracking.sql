CREATE TABLE source_sheet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id TEXT NOT NULL,
  sheet_id BIGINT NOT NULL,
  title TEXT NOT NULL,
  content_hash TEXT,
  synced_at TIMESTAMPTZ,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (spreadsheet_id, sheet_id)
);

CREATE TABLE raw_row (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_sheet_id UUID NOT NULL REFERENCES source_sheet (id) ON DELETE CASCADE,
  row_no INTEGER NOT NULL CHECK (row_no > 0),
  data JSONB NOT NULL,
  row_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_sheet_id, row_no)
);
