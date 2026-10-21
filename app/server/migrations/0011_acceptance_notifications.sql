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
