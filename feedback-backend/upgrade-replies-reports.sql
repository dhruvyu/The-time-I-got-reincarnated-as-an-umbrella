-- Run once in Cloudflare D1 → umbrella-feedback → Explore Data.
-- Preserves all existing comments and ratings.
CREATE TABLE IF NOT EXISTS comment_details (
  comment_id INTEGER PRIMARY KEY,
  parent_id INTEGER,
  spoiler INTEGER NOT NULL DEFAULT 0 CHECK(spoiler IN (0,1)),
  FOREIGN KEY(comment_id) REFERENCES comments(id),
  FOREIGN KEY(parent_id) REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS comment_details_parent ON comment_details(parent_id);
CREATE TABLE IF NOT EXISTS comment_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  comment_id INTEGER NOT NULL,
  reporter_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('spam','harassment','spoiler','other')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(comment_id,reporter_hash),
  FOREIGN KEY(comment_id) REFERENCES comments(id)
);
CREATE INDEX IF NOT EXISTS comment_reports_recent ON comment_reports(created_at);
