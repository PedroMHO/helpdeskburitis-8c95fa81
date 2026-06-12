-- 1. Restrict tickets_select to authenticated role only
DROP POLICY IF EXISTS tickets_select ON public.tickets;
CREATE POLICY tickets_select ON public.tickets
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'tecnico'::app_role)
    OR has_role(auth.uid(), 'atendente'::app_role)
    OR (solicitante_id = auth.uid())
    OR (tecnico_id = auth.uid())
    OR (created_by = auth.uid())
  );

-- 2. Mirror proofs_read access check in proofs_update (verify current ticket access)
DROP POLICY IF EXISTS proofs_update ON storage.objects;
CREATE POLICY proofs_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ticket-proofs'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = (storage.foldername(objects.name))[1]
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'tecnico'::app_role)
          OR has_role(auth.uid(), 'atendente'::app_role)
          OR t.solicitante_id = auth.uid()
          OR t.tecnico_id = auth.uid()
        )
    )
  );