-- 1) Restrict what ticket requesters (solicitantes) may change on their own tickets.
DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'tecnico'::app_role)
    OR has_role(auth.uid(), 'atendente'::app_role)
    OR tecnico_id = auth.uid()
    OR solicitante_id = auth.uid()
  )
  WITH CHECK (
    -- Staff roles and the assigned technician may change any field.
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'tecnico'::app_role)
    OR has_role(auth.uid(), 'atendente'::app_role)
    OR tecnico_id = auth.uid()
    -- A solicitante may keep updating their own ticket only while it stays
    -- in the same status and keeps the same technician assignment, so they
    -- cannot self-close, reassign, or escalate the ticket.
    OR (
      solicitante_id = auth.uid()
      AND status = (SELECT t.status FROM public.tickets t WHERE t.id = tickets.id)
      AND tecnico_id IS NOT DISTINCT FROM (SELECT t.tecnico_id FROM public.tickets t WHERE t.id = tickets.id)
    )
  );

-- 2) Revoke direct EXECUTE on SECURITY DEFINER functions that must never be
--    invoked by signed-in users via the API. Trigger functions run through
--    their triggers and cron/maintenance helpers are called server-side or by
--    other definer functions, so none of these need a direct grant.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_ticket_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_solicitante_rate_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_ticket_status_side_effects() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.promote_due_scheduled_tickets() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_scheduled_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_team(text, text, uuid) FROM PUBLIC, anon, authenticated;