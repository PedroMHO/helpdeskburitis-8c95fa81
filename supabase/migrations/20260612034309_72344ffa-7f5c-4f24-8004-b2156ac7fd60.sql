-- 1. Profiles: restrict full read to owner + admin
DROP POLICY IF EXISTS "profiles_select_self_or_priv" ON public.profiles;
CREATE POLICY "profiles_select_self_or_priv" ON public.profiles
  FOR SELECT TO authenticated
  USING ((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Ticket proofs: deletion requires current ticket access
DROP POLICY IF EXISTS "proofs_delete" ON storage.objects;
CREATE POLICY "proofs_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ticket-proofs'::text
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE (t.id)::text = (storage.foldername(name))[1]
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'tecnico'::app_role)
          OR has_role(auth.uid(), 'atendente'::app_role)
          OR t.solicitante_id = auth.uid()
          OR t.tecnico_id = auth.uid()
        )
    )
  );

-- 3. Realtime: remove overly broad tickets topic wildcard
DROP POLICY IF EXISTS "authenticated can receive own channel" ON realtime.messages;
CREATE POLICY "authenticated can receive own channel" ON realtime.messages
  FOR SELECT TO authenticated
  USING (
    (realtime.topic() = ('notifications:'::text || (auth.uid())::text))
    OR (realtime.topic() = 'technician_status'::text)
  );
