-- Execute este arquivo no SQL Editor do projeto Supabase antes da primeira importação.
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(), file_name text not null,
  row_count integer not null check (row_count > 0), period_start date, period_end date,
  imported_at timestamptz not null default now()
);
create table if not exists public.elite_couriers (
  courier_id text primary key, created_at timestamptz not null default now()
);
create table if not exists public.delivery_records (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  period_date date, period_label text, courier_id text not null, courier_name text not null,
  market text, sub_market text,
  accepted_completed_orders numeric not null default 0 check (accepted_completed_orders >= 0),
  payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists delivery_records_courier_idx on public.delivery_records (courier_id);
create index if not exists delivery_records_period_idx on public.delivery_records (period_date);
create or replace view public.ranking as
select d.courier_id, max(d.courier_name) as courier_name,
  sum(d.accepted_completed_orders) as total_orders,
  round(sum(d.accepted_completed_orders * case when e.courier_id is null then 1 else 1.5 end), 1) as total_points,
  (e.courier_id is not null) as is_elite
from public.delivery_records d left join public.elite_couriers e on e.courier_id = d.courier_id
group by d.courier_id, e.courier_id;
alter table public.import_batches enable row level security;
alter table public.elite_couriers enable row level security;
alter table public.delivery_records enable row level security;
-- Política inicial para viabilizar o /admin. Antes de expor esta rota, substitua por autenticação.
create policy "public reads import batches" on public.import_batches for select using (true);
create policy "public creates import batches" on public.import_batches for insert with check (true);
create policy "public reads elite list" on public.elite_couriers for select using (true);
create policy "public manages elite list" on public.elite_couriers for all using (true) with check (true);
create policy "public reads delivery records" on public.delivery_records for select using (true);
create policy "public creates delivery records" on public.delivery_records for insert with check (true);
grant usage on schema public to anon, authenticated;
grant select, insert on public.import_batches to anon, authenticated;
grant select, insert, update, delete on public.elite_couriers to anon, authenticated;
grant select, insert on public.delivery_records to anon, authenticated;
grant select on public.ranking to anon, authenticated;
