ALTER TABLE rides ADD COLUMN cancelled_at INTEGER;
ALTER TABLE bookings ADD COLUMN cancelled_at INTEGER;
UPDATE rides SET cancelled_at=unixepoch()*1000 WHERE status='cancelled';
UPDATE bookings SET cancelled_at=unixepoch()*1000 WHERE status='cancelled';
