-- Up to five images on a visual (content) record.
--
-- api/db.php adds it lazily via ensureContentColumns(); this is the same change
-- to run by hand when the DB user is not allowed to ALTER.
--
-- media_path stays, holding the first image: the thumbnails, the v1 API and
-- older code read it. Rows from before this column have it NULL, and
-- contentImages() falls back to media_path for them.

ALTER TABLE content
  ADD COLUMN media_paths TEXT NULL AFTER media_path;
