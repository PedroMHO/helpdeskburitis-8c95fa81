DROP FUNCTION IF EXISTS public.profiles_directory();

CREATE FUNCTION public.profiles_directory()
RETURNS TABLE(id uuid, full_name text, email text, avatar_url text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, full_name, ''::text AS email, avatar_url FROM public.profiles
$$;

REVOKE EXECUTE ON FUNCTION public.profiles_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profiles_directory() TO authenticated;