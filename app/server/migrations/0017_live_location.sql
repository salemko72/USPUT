CREATE TABLE IF NOT EXISTS location_shares (
 booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token TEXT NOT NULL,
 lease_until INTEGER NOT NULL,
 window_end INTEGER NOT NULL,
 started_at INTEGER NOT NULL,
 PRIMARY KEY(booking_id,user_id)
);
CREATE TABLE IF NOT EXISTS location_fixes (
 booking_id TEXT NOT NULL,
 user_id TEXT NOT NULL,
 token TEXT NOT NULL,
 lat REAL NOT NULL CHECK(lat BETWEEN -85 AND 85),
 lng REAL NOT NULL CHECK(lng BETWEEN -180 AND 180),
 accuracy REAL NOT NULL CHECK(accuracy BETWEEN 0 AND 50000),
 captured_at INTEGER NOT NULL,
 received_at INTEGER NOT NULL,
 expires_at INTEGER NOT NULL,
 PRIMARY KEY(booking_id,user_id),
 FOREIGN KEY(booking_id,user_id) REFERENCES location_shares(booking_id,user_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS location_shares_expiry ON location_shares(lease_until);
CREATE INDEX IF NOT EXISTS location_fixes_expiry ON location_fixes(expires_at);
