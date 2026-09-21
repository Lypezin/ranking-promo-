-- Pedidos feitos em origem valem 2 pontos; pedidos normais valem 1 ponto.
-- Execute o arquivo inteiro no SQL Editor do Supabase.
alter table public.delivery_records
  add column if not exists origin text;

alter table public.delivery_records
  add column if not exists route_multiplier numeric not null default 1;

alter table public.delivery_records
  drop constraint if exists delivery_records_route_multiplier_check;

alter table public.delivery_records
  add constraint delivery_records_route_multiplier_check
  check (route_multiplier in (1, 2));

-- Recupera a origem preservada no payload das planilhas já importadas.
update public.delivery_records
set
  origin = nullif(btrim(payload ->> 'origem'), ''),
  route_multiplier = case
    when nullif(btrim(payload ->> 'origem'), '') is not null then 2
    else 1
  end;

alter table public.delivery_records
  drop constraint if exists delivery_records_route_source_check;

alter table public.delivery_records
  add constraint delivery_records_route_source_check
  check (nullif(btrim(origin), '') is null or nullif(btrim(sub_market), '') is null);

create or replace view public.ranking as
select
  d.courier_id,
  max(d.courier_name) as courier_name,
  sum(d.accepted_completed_orders) as total_orders,
  round(sum(d.accepted_completed_orders * d.route_multiplier * d.score_multiplier), 1) as total_points,
  bool_or(e.courier_id is not null) as is_elite
from public.delivery_records d
left join public.elite_couriers e on e.courier_id = d.courier_id
group by d.courier_id;

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
      round(sum(d.accepted_completed_orders * d.route_multiplier * d.score_multiplier), 1) as total_points,
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

grant insert (origin, route_multiplier) on public.delivery_records to anon, authenticated;
grant execute on function public.refresh_ranking_cache() to anon, authenticated;

select public.refresh_ranking_cache();
