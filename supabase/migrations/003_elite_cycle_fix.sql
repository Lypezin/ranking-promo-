-- Corrige o bônus quando a lista Elite é salva depois da importação.
-- A exclusão da lista inicia um novo ciclo sem alterar multiplicadores históricos.
create table if not exists public.elite_cycle_state (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null,
  backfill_completed boolean not null default false
);

insert into public.elite_cycle_state (singleton, started_at)
select true, coalesce(min(imported_at), now())
from public.import_batches
on conflict (singleton) do nothing;

alter table public.elite_cycle_state enable row level security;

create or replace function public.save_elite_couriers(p_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_records integer := 0;
begin
  insert into public.elite_couriers (courier_id)
  select distinct btrim(courier_id)
  from unnest(p_ids) as ids(courier_id)
  where nullif(btrim(courier_id), '') is not null
  on conflict (courier_id) do nothing;

  update public.delivery_records d
  set score_multiplier = 1.5
  from public.import_batches b, public.elite_cycle_state s
  where d.import_batch_id = b.id
    and s.singleton = true
    and b.imported_at >= s.started_at
    and d.courier_id = any(p_ids)
    and d.score_multiplier <> 1.5;

  get diagnostics updated_records = row_count;
  perform public.refresh_ranking_cache();
  return updated_records;
end;
$$;

create or replace function public.clear_elite_couriers()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.elite_couriers;

  insert into public.elite_cycle_state (singleton, started_at)
  values (true, now())
  on conflict (singleton) do update set started_at = excluded.started_at;

  perform public.refresh_ranking_cache();
end;
$$;

revoke all on function public.save_elite_couriers(text[]) from public;
revoke all on function public.clear_elite_couriers() from public;
grant execute on function public.save_elite_couriers(text[]) to anon, authenticated;
grant execute on function public.clear_elite_couriers() to anon, authenticated;

-- O banco atual contém apenas o ciclo de 14/09/2026 a 20/09/2026.
-- Faz o ajuste retroativo uma única vez, mesmo se o arquivo for executado novamente.
do $$
begin
  if exists (
    select 1 from public.elite_cycle_state
    where singleton = true and backfill_completed = false
  ) then
    update public.delivery_records d
    set score_multiplier = 1.5
    where exists (
      select 1 from public.elite_couriers e where e.courier_id = d.courier_id
    );

    update public.elite_cycle_state
    set backfill_completed = true
    where singleton = true;
  end if;
end;
$$;

select public.refresh_ranking_cache();
