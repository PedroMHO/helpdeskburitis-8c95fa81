-- 1. Avatars: restringir leitura à pasta do próprio usuário (owner-only).
DROP POLICY IF EXISTS avatars_read ON storage.objects;
CREATE POLICY avatars_read ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'avatars'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

-- 2. Tickets: impedir que o solicitante altere campos controlados por
--    técnico/atendente/admin nos próprios chamados.
DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets
FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
  OR has_role(auth.uid(), 'atendente'::app_role)
  OR (tecnico_id = auth.uid())
  OR (solicitante_id = auth.uid())
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
  OR has_role(auth.uid(), 'atendente'::app_role)
  OR (tecnico_id = auth.uid())
  OR (
    (solicitante_id = auth.uid())
    AND status = (SELECT t.status FROM public.tickets t WHERE t.id = tickets.id)
    AND NOT (tecnico_id IS DISTINCT FROM (SELECT t.tecnico_id FROM public.tickets t WHERE t.id = tickets.id))
    AND NOT (priority IS DISTINCT FROM (SELECT t.priority FROM public.tickets t WHERE t.id = tickets.id))
    AND NOT (closing_note IS DISTINCT FROM (SELECT t.closing_note FROM public.tickets t WHERE t.id = tickets.id))
    AND NOT (closing_image_url IS DISTINCT FROM (SELECT t.closing_image_url FROM public.tickets t WHERE t.id = tickets.id))
    AND NOT (closed_at IS DISTINCT FROM (SELECT t.closed_at FROM public.tickets t WHERE t.id = tickets.id))
    AND NOT (closed_by IS DISTINCT FROM (SELECT t.closed_by FROM public.tickets t WHERE t.id = tickets.id))
  )
);