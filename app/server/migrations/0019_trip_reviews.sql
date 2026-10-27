CREATE TABLE IF NOT EXISTS trip_review_windows (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  completed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS trip_reviews (
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  target_id TEXT NOT NULL REFERENCES users(id),
  target_role TEXT NOT NULL CHECK(target_role IN ('driver','passenger')),
  stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
  created_at INTEGER NOT NULL,
  release_at INTEGER NOT NULL,
  PRIMARY KEY(booking_id,author_id),
  CHECK(author_id <> target_id)
);
CREATE INDEX IF NOT EXISTS trip_reviews_target ON trip_reviews(target_id,target_role);
