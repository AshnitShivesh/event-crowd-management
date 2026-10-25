-- Adds event ownership and explicit staff/viewer membership without deleting existing data.
ALTER TABLE events ADD COLUMN IF NOT EXISTS organizer_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Preserve existing events by assigning them to the earliest organizer account, if one exists.
UPDATE events
SET organizer_id = (SELECT id FROM users WHERE role = 'organizer' ORDER BY id LIMIT 1)
WHERE organizer_id IS NULL;

CREATE TABLE IF NOT EXISTS event_memberships (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('staff', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_memberships_user ON event_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_event_memberships_event ON event_memberships(event_id);
