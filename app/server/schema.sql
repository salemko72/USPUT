PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',email TEXT NOT NULL UNIQUE,password TEXT,salt TEXT,google_id TEXT UNIQUE,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(id TEXT PRIMARY KEY,verifier TEXT NOT NULL,redirect_uri TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rides(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL REFERENCES users(id),from_id TEXT NOT NULL,to_id TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,departure INTEGER NOT NULL,car TEXT NOT NULL,from_json TEXT,to_json TEXT,route_json TEXT,meeting_stops_json TEXT,note TEXT NOT NULL DEFAULT '',cost_sharing INTEGER NOT NULL DEFAULT 0 CHECK(cost_sharing IN (0,1)),seats INTEGER NOT NULL DEFAULT 1 CHECK(seats BETWEEN 1 AND 7),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','matched','cancelled','completed')),cancelled_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,ride_id TEXT NOT NULL REFERENCES rides(id),passenger_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','ready','cancelled','completed')),cancelled_at INTEGER,created_at INTEGER NOT NULL,UNIQUE(ride_id,passenger_id));
CREATE INDEX IF NOT EXISTS bookings_ride_status ON bookings(ride_id,status);
CREATE INDEX IF NOT EXISTS rides_search ON rides(date,from_id,to_id,status);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
CREATE INDEX IF NOT EXISTS bookings_passenger ON bookings(passenger_id);
CREATE TABLE IF NOT EXISTS vehicles (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
 make_id TEXT NOT NULL,
 make TEXT NOT NULL,
 model TEXT NOT NULL,
 color TEXT NOT NULL,
 manual_model INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
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
CREATE TABLE IF NOT EXISTS routing_cache(id TEXT PRIMARY KEY,payload TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS booking_routes(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),match_json TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS routing_health(id TEXT PRIMARY KEY,status TEXT NOT NULL,detail TEXT,checked_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS meeting_route_previews(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS meeting_previews_expiry ON meeting_route_previews(expires);

CREATE TABLE IF NOT EXISTS saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  query_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS saved_searches_owner_latest
  ON saved_searches(user_id, updated_at DESC, id DESC);


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

CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type='booking-accepted'),
 created_at INTEGER NOT NULL,
 seen_at INTEGER
);
CREATE INDEX IF NOT EXISTS notifications_owner ON notifications(user_id,seen_at,created_at);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
 endpoint TEXT NOT NULL UNIQUE,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 language TEXT NOT NULL DEFAULT 'bhs' CHECK(language IN ('bhs','en')),
 display_language TEXT NOT NULL DEFAULT '' CHECK(display_language IN ('','bhs','en','hr','sr-Latn')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_subscriptions_owner ON push_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS push_deliveries (
 notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
 subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
 state TEXT NOT NULL CHECK(state IN ('pending','sending','sent','failed')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt INTEGER NOT NULL,
 lease_until INTEGER,
 claim_token TEXT,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(notification_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS push_delivery_due ON push_deliveries(state,next_attempt);

-- Existing active agreements receive an inbox entry on upgrade. Push remains
-- opt-in: no subscription or external delivery is created by this migration.
INSERT INTO notifications(id,user_id,booking_id,type,created_at)
SELECT b.id,b.passenger_id,b.id,'booking-accepted',CAST(strftime('%s','now') AS INTEGER)*1000
FROM bookings b JOIN rides r ON r.id=b.ride_id
WHERE b.status IN ('accepted','ready') AND r.status IN ('open','matched')
AND r.departure>CAST(strftime('%s','now') AS INTEGER)*1000
ON CONFLICT(booking_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS rides_driver_schedule ON rides(driver_id,date,time,status);
CREATE TABLE IF NOT EXISTS booking_no_shows (
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 reporter_id TEXT NOT NULL REFERENCES users(id),
 reported_role TEXT NOT NULL CHECK(reported_role IN ('driver','passenger')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(booking_id,reporter_id)
);

CREATE TABLE IF NOT EXISTS booking_proposals(booking_id TEXT PRIMARY KEY REFERENCES bookings(id),version INTEGER NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),input_json TEXT NOT NULL,match_json TEXT NOT NULL,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS booking_messages(id TEXT PRIMARY KEY,booking_id TEXT NOT NULL REFERENCES bookings(id),sender_id TEXT NOT NULL REFERENCES users(id),text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 280),created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS booking_messages_order ON booking_messages(booking_id,created_at,id);
