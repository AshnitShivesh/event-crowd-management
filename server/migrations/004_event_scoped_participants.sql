-- Event-scoped participants for DA3.
-- Existing records are associated only when their tracking history identifies one event.
ALTER TABLE participants
  ADD COLUMN IF NOT EXISTS event_id INTEGER REFERENCES events(id) ON DELETE CASCADE;

WITH participant_events AS (
  SELECT t.participant_id, MIN(z.event_id) AS event_id, COUNT(DISTINCT z.event_id) AS event_count
  FROM tracking_events t
  JOIN zones z ON z.id = t.zone_id
  WHERE t.participant_id IS NOT NULL
  GROUP BY t.participant_id
)
UPDATE participants p
SET event_id = pe.event_id
FROM participant_events pe
WHERE pe.participant_id = p.id
  AND pe.event_count = 1
  AND p.event_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_participants_event_id ON participants(event_id);
