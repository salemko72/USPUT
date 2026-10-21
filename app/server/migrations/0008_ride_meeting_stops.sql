ALTER TABLE rides ADD COLUMN meeting_stops_json TEXT;
CREATE TABLE meeting_route_previews(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL,expires INTEGER NOT NULL);
CREATE INDEX meeting_previews_expiry ON meeting_route_previews(expires);
