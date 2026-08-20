-- Soft delete for prospects. Deleting from the UI only stamps deleted_at:
-- the row, its quotes, and its append-only message ledger stay in the
-- database permanently (the TCPA defense file never loses records). All
-- customer-facing queries filter deleted_at IS NULL; there is no hard-delete
-- code path.
alter table prospects add column if not exists deleted_at timestamptz;
