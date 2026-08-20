-- Fully flexible per-prospect timelines (founder directive 2026-07-12).
-- The scheduled `messages` rows ARE the timeline: each row snapshots what it
-- needs at enrollment (intent/template) and carries its own text once the
-- contractor edits it. The campaign in /campaign is only the template new
-- prospects inherit; sequence_overrides is retired (rows carry the override).

alter table public.messages
  add column if not exists step_intent text,
  add column if not exists step_template text,
  add column if not exists body_is_custom boolean not null default false;
