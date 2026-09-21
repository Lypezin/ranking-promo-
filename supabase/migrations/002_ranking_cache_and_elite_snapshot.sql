-- Aplique esta migração antes de apagar a lista Elite atual.
-- Ela grava o multiplicador dos registros existentes e preserva a pontuação histórica.
create extension if not exists pg_trgm;

alter table public.delivery_records
  add column if not exists score_multiplier numeric not null default 1;

alter table public.delivery_records
  drop constraint if exists delivery_records_score_multiplier_check;

alter table public.delivery_records
  add constraint delivery_records_score_multiplier_check
  check (score_multiplier in (1, 1.5));

-- Snapshot da lista Elite atual nos dados já importados.
update public.delivery_records d
set score_multiplier = 1.5
where exists (
  select 1 from public.elite_couriers e where e.courier_id = d.courier_id
);

create index if not exists delivery_records_ranking_idx
  on public.delivery_records (courier_id) include (courier_name, accepted_completed_orders, score_multiplier);

create or replace view public.ranking as
select
  d.courier_id,
  max(d.courier_name) as courier_name,
  sum(d.accepted_completed_orders) as total_orders,
  round(sum(d.accepted_completed_orders * d.score_multiplier), 1) as total_points,
  bool_or(e.courier_id is not null) as is_elite
from public.delivery_records d
left join public.elite_couriers e on e.courier_id = d.courier_id
group by d.courier_id;

create table if not exists public.ranking_cache (
  courier_id text primary key,
  courier_name text not null,
  total_orders numeric not null default 0,
  total_points numeric not null default 0,
  is_elite boolean not null default false,
  position bigint not null,
  updated_at timestamptz not null default now()
);

create unique index if not exists ranking_cache_position_idx on public.ranking_cache (position);
create index if not exists ranking_cache_name_trgm_idx on public.ranking_cache using gin (courier_name gin_trgm_ops);

alter table public.ranking_cache enable row level security;

drop policy if exists "public reads ranking cache" on public.ranking_cache;
create policy "public reads ranking cache" on public.ranking_cache for select using (true);

grant select on public.ranking_cache to anon, authenticated;
grant insert (score_multiplier) on public.delivery_records to anon, authenticated;

create or replace function public.refresh_ranking_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  truncate table public.ranking_cache;

  insert into public.ranking_cache (
    courier_id, courier_name, total_orders, total_points, is_elite, position, updated_at
  )
  with totals as (
    select
      d.courier_id,
      max(d.courier_name) as courier_name,
      sum(d.accepted_completed_orders) as total_orders,
      round(sum(d.accepted_completed_orders * d.score_multiplier), 1) as total_points,
      bool_or(e.courier_id is not null) as is_elite
    from public.delivery_records d
    left join public.elite_couriers e on e.courier_id = d.courier_id
    group by d.courier_id
  )
  select
    courier_id,
    courier_name,
    total_orders,
    total_points,
    is_elite,
    row_number() over (order by total_points desc, courier_name asc),
    now()
  from totals;
end;
$$;

revoke all on function public.refresh_ranking_cache() from public;
grant execute on function public.refresh_ranking_cache() to anon, authenticated;

select public.refresh_ranking_cache();
