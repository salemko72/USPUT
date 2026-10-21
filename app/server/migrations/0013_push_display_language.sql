-- Preserve existing subscriptions and delivery foreign keys while adding variants.
ALTER TABLE push_subscriptions ADD COLUMN display_language TEXT NOT NULL DEFAULT '' CHECK(display_language IN ('','bhs','en','hr','sr-Latn'));
