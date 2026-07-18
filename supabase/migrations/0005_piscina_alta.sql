-- Register the Piscina Alta project (owner referenced it in a live capture).

do $$
declare
  v_user uuid;
  v_pool uuid;
begin
  select id into v_user from voice_inbox.users order by created_at limit 1;

  insert into voice_inbox.projects (user_id, name, slug, description, status, execution_mode)
  values (v_user, 'Piscina Alta', 'piscina-alta',
    'Piscina Alta – Calarossa: the Sardinia pool/property project (Calarossa, Sardinia Sun Escape context). Tasks, works, bookings and coordination — Michela is a key contact.',
    'active', 'capture_only')
  on conflict (user_id, slug) do nothing;

  select id into v_pool from voice_inbox.projects where user_id = v_user and slug = 'piscina-alta';

  insert into voice_inbox.project_aliases (project_id, alias, normalised_alias, alias_type)
  select * from (values
    (v_pool, 'Piscina Alta', 'piscina alta', 'name'),
    (v_pool, 'Piscina', 'piscina', 'short'),
    (v_pool, 'Calarossa pool', 'calarossa pool', 'alt')
  ) as t(project_id, alias, normalised_alias, alias_type)
  where not exists (
    select 1 from voice_inbox.project_aliases pa
    where pa.project_id = t.project_id and pa.normalised_alias = t.normalised_alias
  );
end $$;
