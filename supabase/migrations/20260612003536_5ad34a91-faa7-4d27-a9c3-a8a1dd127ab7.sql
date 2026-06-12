CREATE OR REPLACE FUNCTION public.technicians_directory()
RETURNS TABLE(id uuid, full_name text, setor_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.full_name, p.setor_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('tecnico','admin')
$$;

REVOKE EXECUTE ON FUNCTION public.technicians_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.technicians_directory() TO authenticated;