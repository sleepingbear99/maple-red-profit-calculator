create extension if not exists pgcrypto;

create table if not exists public.shared_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.product_overrides (
  product_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.component_overrides (
  component_id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.edit_sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists edit_sessions_active_token_idx
  on public.edit_sessions (token_hash, expires_at)
  where revoked_at is null;

create table if not exists public.pin_rate_limits (
  client_hash text primary key,
  attempt_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.shared_settings enable row level security;
alter table public.product_overrides enable row level security;
alter table public.component_overrides enable row level security;
alter table public.edit_sessions enable row level security;
alter table public.pin_rate_limits enable row level security;

drop policy if exists "public shared settings read" on public.shared_settings;
create policy "public shared settings read"
  on public.shared_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "public product overrides read" on public.product_overrides;
create policy "public product overrides read"
  on public.product_overrides for select
  to anon, authenticated
  using (true);

drop policy if exists "public component overrides read" on public.component_overrides;
create policy "public component overrides read"
  on public.component_overrides for select
  to anon, authenticated
  using (true);

revoke all on public.shared_settings, public.product_overrides, public.component_overrides from anon, authenticated;
grant select on public.shared_settings, public.product_overrides, public.component_overrides to anon, authenticated;
revoke all on public.edit_sessions, public.pin_rate_limits from anon, authenticated;

create or replace function public.merge_shared_payload(
  p_settings jsonb default null,
  p_products jsonb default '[]'::jsonb,
  p_components jsonb default '[]'::jsonb
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item jsonb;
  existing_settings jsonb;
  merged_values jsonb;
  merged_field_times jsonb;
  remote_values jsonb;
  remote_field_times jsonb;
  setting_key text;
  remote_field_time timestamptz;
  local_field_time timestamptz;
  settings_updated_at timestamptz;
begin
  if p_settings is not null then
    settings_updated_at := (p_settings ->> 'updatedAt')::timestamptz;
    select data into existing_settings
      from public.shared_settings
      where id = 'global'
      for update;

    if not found then
      insert into public.shared_settings (id, data, updated_at)
      values ('global', p_settings -> 'data', settings_updated_at);
    else
      remote_values := coalesce(p_settings -> 'data' -> 'values', '{}'::jsonb);
      remote_field_times := coalesce(p_settings -> 'data' -> 'fieldUpdatedAt', '{}'::jsonb);
      if jsonb_typeof(existing_settings -> 'values') = 'object' then
        merged_values := existing_settings -> 'values';
        merged_field_times := coalesce(existing_settings -> 'fieldUpdatedAt', '{}'::jsonb);
      else
        merged_values := coalesce(existing_settings, '{}'::jsonb);
        merged_field_times := '{}'::jsonb;
      end if;

      for setting_key in select jsonb_object_keys(remote_values)
      loop
        remote_field_time := coalesce(
          nullif(remote_field_times ->> setting_key, '')::timestamptz,
          settings_updated_at
        );
        local_field_time := coalesce(
          nullif(merged_field_times ->> setting_key, '')::timestamptz,
          '-infinity'::timestamptz
        );
        if remote_field_time > local_field_time then
          merged_values := jsonb_set(merged_values, array[setting_key], remote_values -> setting_key, true);
          merged_field_times := jsonb_set(merged_field_times, array[setting_key], to_jsonb(remote_field_time::text), true);
        end if;
      end loop;

      update public.shared_settings
      set data = jsonb_build_object('values', merged_values, 'fieldUpdatedAt', merged_field_times),
          updated_at = greatest(updated_at, settings_updated_at)
      where id = 'global';
    end if;
  end if;

  for item in select value from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    insert into public.product_overrides (product_id, data, updated_at)
    values (item ->> 'productId', item -> 'data', (item ->> 'updatedAt')::timestamptz)
    on conflict (product_id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
      where excluded.updated_at > public.product_overrides.updated_at;
  end loop;

  for item in select value from jsonb_array_elements(coalesce(p_components, '[]'::jsonb))
  loop
    insert into public.component_overrides (component_id, data, updated_at)
    values (item ->> 'componentId', item -> 'data', (item ->> 'updatedAt')::timestamptz)
    on conflict (component_id) do update
      set data = excluded.data,
          updated_at = excluded.updated_at
      where excluded.updated_at > public.component_overrides.updated_at;
  end loop;
end;
$$;

revoke all on function public.merge_shared_payload(jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.merge_shared_payload(jsonb, jsonb, jsonb) to service_role;
