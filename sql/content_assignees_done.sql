-- Each teammate on a content post ticks their own part of it done.
--
-- api/db.php adds both lazily via ensureContentColumns(); this is the same
-- change to run by hand when the DB user is not allowed to ALTER.
--
-- Only the teammate on the row can change it: action=set_done in
-- api/admin-content.php updates the caller's own row and nobody else's. A
-- teammate taken off the post loses the row, and with it their tick.

ALTER TABLE content_assignees
  ADD COLUMN is_done TINYINT(1) NOT NULL DEFAULT 0 AFTER admin_id,
  ADD COLUMN done_at DATETIME   NULL              AFTER is_done;
