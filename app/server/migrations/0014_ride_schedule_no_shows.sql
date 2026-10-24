CREATE INDEX IF NOT EXISTS rides_driver_schedule ON rides(driver_id,date,time,status);
CREATE TABLE IF NOT EXISTS booking_no_shows (
 booking_id TEXT NOT NULL REFERENCES bookings(id),
 reporter_id TEXT NOT NULL REFERENCES users(id),
 reported_role TEXT NOT NULL CHECK(reported_role IN ('driver','passenger')),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(booking_id,reporter_id)
);
