-- Migration 005: Event-scoped participant token uniqueness
-- Replaces global token uniqueness with per-event token uniqueness (event_id, token)

DO $$
BEGIN
    -- Drop the global unique constraint on token if it exists
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'participants_token_key' AND conrelid = 'participants'::regclass
    ) THEN
        ALTER TABLE participants DROP CONSTRAINT participants_token_key;
    END IF;

    -- Drop the index if it exists as an independent unique index
    IF EXISTS (
        SELECT 1 FROM pg_indexes 
        WHERE indexname = 'participants_token_key'
    ) THEN
        DROP INDEX participants_token_key;
    END IF;

    -- Add composite unique constraint per event if not already present
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'uq_participants_event_token' AND conrelid = 'participants'::regclass
    ) THEN
        ALTER TABLE participants ADD CONSTRAINT uq_participants_event_token UNIQUE (event_id, token);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_participants_event_token ON participants(event_id, token);
