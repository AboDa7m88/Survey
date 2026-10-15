-- The teammates a content post is assigned to.
--
-- api/db.php creates it lazily in ensureContentColumns(); this is the same
-- table to run by hand when the DB user is not allowed to CREATE.
--
-- A post is a task: whoever creates it (owner, account manager or super admin)
-- picks Super Admins and Admins to work on it with them. The owner and the
-- account managers see every post; anyone else sees the posts they created
-- and the ones listed here for them - contentVisibleSql() in api/db.php.

CREATE TABLE IF NOT EXISTS content_assignees (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  content_id INT       NOT NULL,              -- content.id
  admin_id   INT       NOT NULL,              -- admins.id
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_assignee (content_id, admin_id),
  KEY idx_admin (admin_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
