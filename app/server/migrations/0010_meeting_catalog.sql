-- Community contributions are review candidates until an authorized editor
-- explicitly activates them. Catalogue identities never rewrite ride snapshots.
CREATE TABLE IF NOT EXISTS meeting_points (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 city TEXT NOT NULL,
 city_key TEXT NOT NULL,
 lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90),
 lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
 detail TEXT NOT NULL DEFAULT '',
 approach TEXT NOT NULL DEFAULT '',
 side TEXT NOT NULL DEFAULT '',
 availability TEXT NOT NULL DEFAULT 'candidate'
  CHECK(availability IN ('candidate','active','inactive')),
 source TEXT NOT NULL CHECK(source IN ('editor','contribution')),
 created_by TEXT NOT NULL REFERENCES users(id),
 redirect_id TEXT REFERENCES meeting_points(id),
 version INTEGER NOT NULL DEFAULT 1,
 revision TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 CHECK(redirect_id IS NULL OR redirect_id <> id)
);
CREATE INDEX IF NOT EXISTS meeting_points_city ON meeting_points(city_key,availability);
CREATE INDEX IF NOT EXISTS meeting_points_redirect ON meeting_points(redirect_id);
CREATE TABLE IF NOT EXISTS meeting_point_aliases (
 point_id TEXT NOT NULL REFERENCES meeting_points(id),
 alias TEXT NOT NULL,
 normalized TEXT NOT NULL,
 PRIMARY KEY(point_id,alias)
);
CREATE INDEX IF NOT EXISTS meeting_point_alias_search ON meeting_point_aliases(normalized);
CREATE TABLE IF NOT EXISTS meeting_point_merges (
 id TEXT PRIMARY KEY,
 source_id TEXT NOT NULL REFERENCES meeting_points(id),
 target_id TEXT NOT NULL REFERENCES meeting_points(id),
 source_merged_revision TEXT NOT NULL,
 created_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 undone_by TEXT REFERENCES users(id),
 undone_at INTEGER,
 CHECK(source_id <> target_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS meeting_point_active_merge
 ON meeting_point_merges(source_id) WHERE undone_at IS NULL;
CREATE TABLE IF NOT EXISTS meeting_point_feedback (
 point_id TEXT NOT NULL REFERENCES meeting_points(id),
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 user_id TEXT NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating IN (-1,1)),
 note TEXT NOT NULL DEFAULT '',
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(point_id,booking_id,user_id)
);
CREATE INDEX IF NOT EXISTS meeting_point_feedback_recency
 ON meeting_point_feedback(point_id,updated_at);
