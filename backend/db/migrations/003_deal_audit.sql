CREATE TABLE deal_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id TEXT NOT NULL,
  deal_updated_at TIMESTAMPTZ NOT NULL,
  verdict TEXT NOT NULL CHECK (verdict IN ('ok', 'violations', 'skipped')),
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  audited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, deal_updated_at)
);

CREATE INDEX deal_audit_deal_id_idx ON deal_audit (deal_id);
