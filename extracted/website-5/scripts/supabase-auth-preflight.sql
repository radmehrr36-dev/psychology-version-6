-- Read-only inspection. Run in a trusted Supabase SQL editor; do not paste secrets.
-- Compare these results and missing remote migration files before applying any SQL.
select version, name from supabase_migrations.schema_migrations order by version;

select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name in ('profiles','auth_otps','auth_rate_events','support_messages','support_replies')
order by table_name, ordinal_position;

select schemaname, tablename, rowsecurity from pg_catalog.pg_tables
where schemaname = 'public' and tablename in ('profiles','auth_otps','auth_rate_events','test_attempts','test_answers','test_results','support_messages','support_replies','psychologist_applications');

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public' and tablename in ('profiles','auth_otps','auth_rate_events','test_attempts','test_answers','test_results','support_messages','support_replies','psychologist_applications')
order by tablename,policyname;

select n.nspname as schema_name, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
       pg_catalog.pg_get_function_result(p.oid) as result_type, p.prosecdef as security_definer, p.proconfig,
       pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('handle_new_user','auth_rate_hit','admin_set_account_kind','admin_set_account_status','write_audit','start_test_attempt',
   'save_test_answer','complete_test_attempt','abandon_test_attempt','support_my_tickets','support_ticket_get',
   'support_create_ticket','support_user_reply','support_handoff','support_close_ticket')
order by p.proname,arguments;

select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name,
       pg_catalog.pg_get_triggerdef(t.oid) as definition
from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and ((n.nspname='auth' and c.relname='users') or (n.nspname='public' and c.relname='profiles'))
order by n.nspname,c.relname,t.tgname;

select schemaname,tablename,indexname,indexdef from pg_catalog.pg_indexes
where schemaname='public' and tablename in ('profiles','auth_otps','auth_rate_events') order by tablename,indexname;