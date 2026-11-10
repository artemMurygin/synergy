CREATE TABLE outbox_events (
  id UUID PRIMARY KEY,
  event_type TEXT NOT NULL CHECK (char_length(event_type) > 0),
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX outbox_events_aggregate_idx ON outbox_events (aggregate_id, created_at);

CREATE TABLE outbox_deliveries (
  event_id UUID NOT NULL REFERENCES outbox_events (id) ON DELETE CASCADE,
  subscriber TEXT NOT NULL CHECK (char_length(subscriber) > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  processed_at TIMESTAMPTZ,
  PRIMARY KEY (event_id, subscriber)
);

CREATE INDEX outbox_deliveries_due_idx ON outbox_deliveries (next_attempt_at) WHERE status = 'pending';
CREATE INDEX outbox_deliveries_subscriber_status_idx ON outbox_deliveries (subscriber, status);
