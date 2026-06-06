-- 1. Profiles: restrict full read (incl. email) to owner + admin/atendente
DROP POLICY IF EXISTS profiles_select_auth ON public.profiles;
CREATE POLICY profiles_select_self_or_priv ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'atendente'::app_role)
  );

-- Safe name directory (no emails) for all authenticated users
CREATE OR REPLACE FUNCTION public.profiles_directory()
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, ''::text AS email FROM public.profiles
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_directory() TO authenticated;

-- 2. Ticket history insert: require access to the referenced ticket
DROP POLICY IF EXISTS history_insert ON public.ticket_history;
CREATE POLICY history_insert ON public.ticket_history
  FOR INSERT TO authenticated
  WITH CHECK (
    changed_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id = ticket_history.ticket_id
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'tecnico'::app_role)
          OR has_role(auth.uid(), 'atendente'::app_role)
          OR t.solicitante_id = auth.uid()
          OR t.tecnico_id = auth.uid()
        )
    )
  );

-- 3. Storage: restrict ticket-proofs read/insert to ticket-related users
DROP POLICY IF EXISTS proofs_read ON storage.objects;
DROP POLICY IF EXISTS proofs_insert ON storage.objects;

CREATE POLICY proofs_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-proofs'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'tecnico'::app_role)
          OR has_role(auth.uid(), 'atendente'::app_role)
          OR t.solicitante_id = auth.uid()
          OR t.tecnico_id = auth.uid()
        )
    )
  );

CREATE POLICY proofs_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ticket-proofs'
    AND EXISTS (
      SELECT 1 FROM public.tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          has_role(auth.uid(), 'admin'::app_role)
          OR has_role(auth.uid(), 'tecnico'::app_role)
          OR has_role(auth.uid(), 'atendente'::app_role)
          OR t.solicitante_id = auth.uid()
          OR t.tecnico_id = auth.uid()
        )
    )
  );

-- 4. Remove direct execute on internal trigger helper functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;