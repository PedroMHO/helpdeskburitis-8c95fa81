-- Lock down SECURITY DEFINER functions that should never be called directly by users.
-- Trigger/cron/internal-helper functions still run automatically (triggers and scheduled jobs
-- execute regardless of EXECUTE grants).

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_ticket_changes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_solicitante_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_ticket_status_side_effects() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promote_due_scheduled_tickets() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.send_scheduled_reminders() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_team(text, text, uuid) FROM PUBLIC, anon, authenticated;

-- Keep functions the app legitimately calls from the client / RLS:
--   has_role(uuid, app_role)   -> evaluated inside RLS policies as the querying role
--   profiles_directory()       -> RPC used to resolve names without exposing emails
--   technicians_directory()    -> RPC used for assignment dropdowns and the status board
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profiles_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION public.technicians_directory() TO authenticated;