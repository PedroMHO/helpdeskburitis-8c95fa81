-- avatars: authenticated can read all, write own folder (folder = user id)
CREATE POLICY "avatars_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY "avatars_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "avatars_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ticket-proofs: authenticated can read and upload
CREATE POLICY "proofs_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'ticket-proofs');
CREATE POLICY "proofs_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ticket-proofs');
CREATE POLICY "proofs_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'ticket-proofs' AND owner = auth.uid());
CREATE POLICY "proofs_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ticket-proofs' AND owner = auth.uid());