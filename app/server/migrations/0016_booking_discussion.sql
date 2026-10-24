CREATE TABLE IF NOT EXISTS booking_proposals(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),version INTEGER NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),input_json TEXT NOT NULL,match_json TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS booking_messages(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),sender_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 280),created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS booking_messages_order ON booking_messages(booking_id,created_at,id);
