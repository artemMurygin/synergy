CREATE TABLE organization_source (
  organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, raw_row_id)
);

CREATE INDEX organization_source_raw_row_idx ON organization_source (raw_row_id);
CREATE INDEX organization_source_last_seen_run_idx ON organization_source (last_seen_run_id);
CREATE INDEX organization_source_group_idx ON organization_source (group_id);

CREATE TABLE faculty_source (
  faculty_id UUID NOT NULL REFERENCES faculty (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (faculty_id, raw_row_id)
);

CREATE INDEX faculty_source_raw_row_idx ON faculty_source (raw_row_id);
CREATE INDEX faculty_source_last_seen_run_idx ON faculty_source (last_seen_run_id);
CREATE INDEX faculty_source_group_idx ON faculty_source (group_id);

CREATE TABLE location_source (
  location_id UUID NOT NULL REFERENCES location (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (location_id, raw_row_id)
);

CREATE INDEX location_source_raw_row_idx ON location_source (raw_row_id);
CREATE INDEX location_source_last_seen_run_idx ON location_source (last_seen_run_id);
CREATE INDEX location_source_group_idx ON location_source (group_id);

CREATE TABLE program_source (
  program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, raw_row_id)
);

CREATE INDEX program_source_raw_row_idx ON program_source (raw_row_id);
CREATE INDEX program_source_last_seen_run_idx ON program_source (last_seen_run_id);
CREATE INDEX program_source_group_idx ON program_source (group_id);

CREATE TABLE offer_source (
  offer_id UUID NOT NULL REFERENCES offer (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, raw_row_id)
);

CREATE INDEX offer_source_raw_row_idx ON offer_source (raw_row_id);
CREATE INDEX offer_source_last_seen_run_idx ON offer_source (last_seen_run_id);
CREATE INDEX offer_source_group_idx ON offer_source (group_id);

CREATE TABLE price_source (
  price_id UUID NOT NULL REFERENCES price (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (price_id, raw_row_id)
);

CREATE INDEX price_source_raw_row_idx ON price_source (raw_row_id);
CREATE INDEX price_source_last_seen_run_idx ON price_source (last_seen_run_id);
CREATE INDEX price_source_group_idx ON price_source (group_id);

CREATE TABLE entrance_requirement_source (
  entrance_requirement_id UUID NOT NULL REFERENCES entrance_requirement (id) ON DELETE CASCADE,
  raw_row_id UUID NOT NULL REFERENCES raw_row (id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  last_seen_run_id UUID NOT NULL REFERENCES programs_sync_run (id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entrance_requirement_id, raw_row_id)
);

CREATE INDEX entrance_requirement_source_raw_row_idx ON entrance_requirement_source (raw_row_id);
CREATE INDEX entrance_requirement_source_last_seen_run_idx ON entrance_requirement_source (last_seen_run_id);
CREATE INDEX entrance_requirement_source_group_idx ON entrance_requirement_source (group_id);
