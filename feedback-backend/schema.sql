CREATE TABLE IF NOT EXISTS ratings (
 chapter INTEGER NOT NULL CHECK(chapter BETWEEN 1 AND 10000),
 visitor_hash TEXT NOT NULL,
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(chapter,visitor_hash)
);
CREATE TABLE IF NOT EXISTS comments (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 chapter INTEGER NOT NULL CHECK(chapter BETWEEN 1 AND 10000),
 nickname TEXT NOT NULL,
 body TEXT NOT NULL,
 visitor_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS comments_public ON comments(chapter,status,created_at);
CREATE INDEX IF NOT EXISTS comments_rate ON comments(visitor_hash,created_at);
