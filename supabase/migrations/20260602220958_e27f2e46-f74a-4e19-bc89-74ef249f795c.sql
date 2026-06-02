DROP POLICY IF EXISTS tickets_update ON public.tickets;
CREATE POLICY tickets_update ON public.tickets
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR tecnico_id = auth.uid()
    OR has_role(auth.uid(), 'tecnico'::app_role)
    OR solicitante_id = auth.uid()
  );

DROP POLICY IF EXISTS tickets_delete_admin ON public.tickets;
CREATE POLICY tickets_delete ON public.tickets
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR solicitante_id = auth.uid()
  );