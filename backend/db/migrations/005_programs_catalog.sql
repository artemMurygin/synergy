CREATE TABLE organization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('university', 'college', 'branch', 'academy', 'partner', 'school')),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES organization (id) ON DELETE RESTRICT,
  has_own_requisites BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);

CREATE TABLE location (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  city TEXT NOT NULL,
  metro TEXT,
  address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, city, metro, address)
);

CREATE TABLE faculty (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE program (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization (id) ON DELETE RESTRICT,
  faculty_id UUID REFERENCES faculty (id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN (
    'spo', 'bachelor', 'specialist', 'master', 'postgrad',
    'dpo_pp', 'dpo_pk', 'short_course', 'kids', 'camp'
  )),
  title TEXT NOT NULL,
  direction_code TEXT,
  profile TEXT,
  qualification TEXT,
  is_state_funded BOOLEAN NOT NULL DEFAULT false,
  is_accredited BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'enrollment_closed', 'new')),
  crm_name TEXT,
  crm_product_group TEXT,
  source_row_id UUID REFERENCES raw_row (id) ON DELETE SET NULL,
  search_vector TSVECTOR GENERATED ALWAYS AS (
    setweight(
      to_tsvector(
        'russian',
        coalesce(title, '') || ' ' || coalesce(profile, '') || ' ' || coalesce(qualification, '')
      ),
      'A'
    ) || setweight(to_tsvector('simple', coalesce(direction_code, '')), 'A')
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, organization_id, level)
);

CREATE UNIQUE INDEX program_natural_key_with_code_idx
  ON program (organization_id, level, direction_code, profile, qualification)
  NULLS NOT DISTINCT
  WHERE direction_code IS NOT NULL;

CREATE UNIQUE INDEX program_natural_key_without_code_idx
  ON program (organization_id, level, title)
  WHERE direction_code IS NULL;

CREATE INDEX program_organization_level_idx ON program (organization_id, level);
CREATE INDEX program_direction_code_idx ON program (direction_code text_pattern_ops);
CREATE INDEX program_search_vector_idx ON program USING gin (search_vector);

CREATE TABLE offer (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  location_id UUID REFERENCES location (id) ON DELETE SET NULL,
  study_form TEXT NOT NULL CHECK (study_form IN (
    'full_time', 'mixed', 'extramural', 'distance', 'distance_tutor', 'online'
  )),
  base_education TEXT NOT NULL CHECK (base_education IN ('grade9', 'grade11', 'spo', 'vo', 'any')),
  tariff TEXT CHECK (tariff IN ('base', 'optima', 'premium')),
  schedule TEXT,
  duration_months INTEGER CHECK (duration_months > 0),
  hours INTEGER CHECK (hours > 0),
  start_date DATE,
  enroll_until DATE,
  valid_to DATE,
  notes TEXT,
  source_row_id UUID REFERENCES raw_row (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (program_id, location_id, study_form, base_education, tariff)
);

CREATE INDEX offer_filter_idx ON offer (study_form, base_education);

CREATE TABLE price (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id UUID NOT NULL REFERENCES offer (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'first_year', 'next_year', 'total', 'installment', 'lump_sum', 'site_price', 'discounted'
  )),
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL CHECK (currency IN ('RUB', 'USD', 'EUR')),
  condition TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (kind <> 'discounted' OR condition IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (offer_id, kind, condition)
);

CREATE TABLE entrance_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES program (id) ON DELETE CASCADE,
  base_education TEXT NOT NULL CHECK (base_education IN ('grade9', 'grade11', 'spo', 'vo', 'any')),
  subject TEXT NOT NULL,
  min_score INTEGER CHECK (min_score >= 0),
  is_required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (program_id, base_education, subject)
);
