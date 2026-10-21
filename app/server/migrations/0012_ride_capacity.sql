ALTER TABLE rides ADD COLUMN seats INTEGER NOT NULL DEFAULT 1 CHECK(seats BETWEEN 1 AND 7);
DROP INDEX IF EXISTS one_seat;
CREATE INDEX IF NOT EXISTS bookings_ride_status ON bookings(ride_id,status);
