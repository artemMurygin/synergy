CREATE TABLE discount_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organization (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  percent NUMERIC(5, 2) NOT NULL CHECK (percent >= 0 AND percent <= 100),
  period TEXT,
  documents TEXT,
  applied_by TEXT,
  is_internal_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, category)
);

CREATE TABLE regional_rate (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region TEXT NOT NULL,
  federal_district TEXT,
  level TEXT NOT NULL CHECK (level IN (
    'spo', 'bachelor', 'specialist', 'master', 'postgrad',
    'dpo_pp', 'dpo_pk', 'short_course', 'kids', 'camp'
  )),
  mode TEXT NOT NULL CHECK (mode IN ('distance', 'online')),
  price NUMERIC(12, 2) NOT NULL CHECK (price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region, level, mode)
);

CREATE TABLE payment_method (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner TEXT NOT NULL UNIQUE,
  terms TEXT,
  rate TEXT,
  how_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_group (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  applies_to TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE person (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  bio TEXT,
  role TEXT,
  contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE program_person (
  program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES person (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (program_id, person_id, role)
);

CREATE INDEX program_person_person_idx ON program_person (person_id);

CREATE TABLE program_material (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('curriculum', 'presentation', 'brief', 'promo_lesson', 'other')),
  url TEXT NOT NULL,
  is_internal_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, type, url)
);

CREATE TABLE program_bonus (
  program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  bonus_program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  PRIMARY KEY (program_id, bonus_program_id),
  CHECK (program_id <> bonus_program_id)
);

CREATE INDEX program_bonus_bonus_idx ON program_bonus (bonus_program_id);
