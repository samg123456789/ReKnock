-- One-time feature tour: durable per-company flag. The dashboard previously
-- inferred "seen" from an events lookup whose write was fire-and-forget, so
-- any failed insert made the tour reappear every login. The column is the
-- source of truth; the event row remains audit trail.
alter table public.companies add column if not exists feature_tour_done_at timestamptz;

-- Backfill: anyone who already completed the tour keeps it dismissed.
update public.companies c
set feature_tour_done_at = e.first_done
from (
  select company_id, min(created_at) as first_done
  from public.events
  where type = 'feature_tour_done'
  group by company_id
) e
where e.company_id = c.id and c.feature_tour_done_at is null;
