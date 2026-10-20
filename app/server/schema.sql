PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',email TEXT NOT NULL UNIQUE,password TEXT,salt TEXT,google_id TEXT UNIQUE,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(id TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_states(id TEXT PRIMARY KEY,verifier TEXT NOT NULL,redirect_uri TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rides(id TEXT PRIMARY KEY,driver_id TEXT NOT NULL REFERENCES users(id),from_id TEXT NOT NULL,to_id TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,departure INTEGER NOT NULL,car TEXT NOT NULL,from_json TEXT,to_json TEXT,route_json TEXT,note TEXT NOT NULL DEFAULT '',cost_sharing INTEGER NOT NULL DEFAULT 0 CHECK(cost_sharing IN (0,1)),status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','matched','cancelled','completed')),created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS bookings(id TEXT PRIMARY KEY,ride_id TEXT NOT NULL REFERENCES rides(id),passenger_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined','ready','cancelled','completed')),created_at INTEGER NOT NULL,UNIQUE(ride_id,passenger_id));
CREATE UNIQUE INDEX IF NOT EXISTS one_seat ON bookings(ride_id) WHERE status IN ('accepted','ready','completed');
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
