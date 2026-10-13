-- The ranking cache is refreshed through PostgREST with the anon role, whose
-- default statement_timeout is short. Scope a longer limit to this one RPC;
-- do not increase the timeout for every public API request.
create or replace function public.refresh_ranking_cache()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '45s'
as $$
begin
  truncate table public.ranking_cache;

  insert into public.ranking_cache (
    courier_id, courier_name, total_orders, total_points, is_elite, position, updated_at
  )
  with totals as materialized (
    select
      d.courier_id,
      max(d.courier_name) as courier_name,
      sum(d.accepted_completed_orders) as total_orders,
      round(sum(d.accepted_completed_orders * d.score_multiplier), 1) as total_points
    from public.delivery_records d
    group by d.courier_id
  ), ranked as (
    select
      t.courier_id,
      t.courier_name,
      t.total_orders,
      t.total_points,
      (e.courier_id is not null) as is_elite,
      row_number() over (order by t.total_points desc, t.courier_name asc) as position
    from totals t
    left join public.elite_couriers e on e.courier_id = t.courier_id
  )
  select
    courier_id,
    courier_name,
    total_orders,
    total_points,
    is_elite,
    position,
    now()
  from ranked;
end;
$$;

revoke all on function public.refresh_ranking_cache() from public;
grant execute on function public.refresh_ranking_cache() to anon, authenticated;
