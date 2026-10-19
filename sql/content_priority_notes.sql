-- Priority and notes on a content post, set on admin-content-form.html only.
--
-- api/db.php adds both lazily via ensureContentColumns(); this is the same
-- change to run by hand when the DB user is not allowed to ALTER.
--
-- priority is low, medium or high - api/admin-content.php whitelists it.

ALTER TABLE content
  ADD COLUMN priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  ADD COLUMN notes    TEXT        NULL;
