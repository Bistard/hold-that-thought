export const SCHEMA = `
CREATE TABLE IF NOT EXISTS segments (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  speaker TEXT
);
CREATE INDEX IF NOT EXISTS idx_segments_timestamp ON segments(timestamp);
`;
