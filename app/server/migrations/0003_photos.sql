CREATE TABLE IF NOT EXISTS photos (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('avatar','vehicle')),
 object_key TEXT NOT NULL UNIQUE,
 bytes INTEGER NOT NULL,
 width INTEGER NOT NULL,
 height INTEGER NOT NULL,
 vehicle_label TEXT,
 state TEXT NOT NULL CHECK(state IN ('pending','active','retired','abandoned')),
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_photo ON photos(owner_id,kind) WHERE state='active';
CREATE INDEX IF NOT EXISTS photo_cleanup ON photos(state,created_at);
