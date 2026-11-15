-- 0010: per-client rate limits (launch gate). Fixed windows keyed by a salted SHA-256 of the client IP (never the raw IP)
-- plus the route bucket. Old windows are deleted by the maintenance run.
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket       text        NOT NULL,
  client_hash  text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        int         NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, client_hash, window_start)
);
CREATE INDEX IF NOT EXISTS rate_limits_window ON rate_limits (window_start);
