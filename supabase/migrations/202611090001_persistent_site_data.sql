-- Persistent application state for Vimessias Play.
-- The Node server uses the Supabase service-role key; it must never be sent to a browser.

create table if not exists public.app_state (
  state_key text primary key check (length(state_key) between 1 and 80),
  state_value jsonb not null,
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
revoke all on table public.app_state from anon, authenticated;
grant all on table public.app_state to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values
  ('forum-uploads','forum-uploads',false,4194304,array['image/jpeg','image/png','image/webp','image/gif']),
  ('profile-banners','profile-banners',false,4194304,array['image/jpeg','image/png'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
