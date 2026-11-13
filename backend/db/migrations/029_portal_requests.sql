-- Заявки на навыки. Статус «для автора» не хранится: выводится при чтении
-- (pending / rejected / статус навыка через JOIN), см. design.md п. 4.
-- Откат: DROP TABLE portal_requests;
CREATE TABLE portal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID NOT NULL REFERENCES auth_users (id),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) > 0),
  description TEXT NOT NULL CHECK (char_length(btrim(description)) > 0),
  frequency_count INTEGER NOT NULL CHECK (frequency_count > 0),
  frequency_period TEXT NOT NULL CHECK (frequency_period IN ('day', 'week', 'month')),
  minutes_per_run INTEGER NOT NULL CHECK (minutes_per_run > 0),
  people_count INTEGER NOT NULL CHECK (people_count > 0),
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'accepted', 'rejected')),
  skill_id UUID REFERENCES portal_skills (id),
  reject_reason TEXT,
  decided_by UUID REFERENCES auth_users (id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT portal_requests_accepted_has_skill
    CHECK ((decision = 'accepted') = (skill_id IS NOT NULL)),
  CONSTRAINT portal_requests_rejected_has_reason
    CHECK ((decision = 'rejected') = (reject_reason IS NOT NULL AND char_length(btrim(reject_reason)) > 0)),
  CONSTRAINT portal_requests_reason_only_when_rejected
    CHECK (decision = 'rejected' OR reject_reason IS NULL)
);

CREATE INDEX portal_requests_author_created_idx ON portal_requests (author_id, created_at DESC);
CREATE INDEX portal_requests_pending_idx ON portal_requests (created_at) WHERE decision = 'pending';
CREATE INDEX portal_requests_skill_idx ON portal_requests (skill_id) WHERE skill_id IS NOT NULL;
