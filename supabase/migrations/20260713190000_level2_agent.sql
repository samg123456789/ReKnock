-- Level 2 AI agent (docs/AI_AGENT_STRATEGY.md): the relay ping carries a
-- proposal - a drafted reply or a pre-filled reminder - and the contractor
-- accepts it by texting "1". The pending proposal lives on the relay session
-- so the owner's "1" can be resolved to exactly what was offered.
alter table public.relay_sessions
  add column if not exists suggested_kind text check (suggested_kind in ('reply', 'reminder')),
  add column if not exists suggested_body text,
  add column if not exists suggested_meta jsonb;
