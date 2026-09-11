CREATE TABLE events (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    status VARCHAR(20) DEFAULT 'UPCOMING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE zones (
    id SERIAL PRIMARY KEY,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    current_occupancy INTEGER DEFAULT 0 CHECK (current_occupancy >= 0)
);

CREATE TABLE checkpoints (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(20) DEFAULT 'QR',
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('ENTRY', 'EXIT'))
);

CREATE TABLE participants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150),
    token VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tracking_events (
    id SERIAL PRIMARY KEY,
    participant_id INTEGER REFERENCES participants(id),
    checkpoint_id INTEGER REFERENCES checkpoints(id),
    zone_id INTEGER REFERENCES zones(id),
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('ENTRY', 'EXIT')),
    source VARCHAR(20) NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES zones(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_tracking_zone
ON tracking_events(zone_id);

CREATE INDEX idx_tracking_timestamp
ON tracking_events(timestamp);

CREATE INDEX idx_alerts_zone
ON alerts(zone_id);

INSERT INTO events
(name, description, start_time, end_time, status)
VALUES
(
    'TechFest 2026',
    'Annual technology and innovation festival',
    '2026-09-20 09:00:00',
    '2026-09-20 18:00:00',
    'UPCOMING'
);

INSERT INTO zones
(event_id, name, capacity, current_occupancy)
VALUES
(1, 'Main Hall', 500, 420),
(1, 'Food Court', 300, 180),
(1, 'Entrance', 150, 95),
(1, 'Exhibition Area', 400, 260);

INSERT INTO checkpoints
(zone_id, name, type, direction)
VALUES
(1, 'Main Entrance', 'QR', 'ENTRY');

INSERT INTO participants
(name, email, token)
VALUES
('Rahul', 'rahul@example.com', 'EVT-001'),
('Ananya', 'ananya@example.com', 'EVT-002');