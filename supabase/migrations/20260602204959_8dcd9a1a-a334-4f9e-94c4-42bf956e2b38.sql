-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'tecnico', 'usuario');
CREATE TYPE public.ticket_status AS ENUM ('aguardando', 'em_atendimento', 'finalizado');
CREATE TYPE public.ticket_priority AS ENUM ('baixa', 'media', 'alta');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cargo_setor TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- LOCALIDADES
CREATE TABLE public.cidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cidades TO authenticated;
GRANT ALL ON public.cidades TO service_role;
ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.bairros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cidade_id UUID NOT NULL REFERENCES public.cidades(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bairros TO authenticated;
GRANT ALL ON public.bairros TO service_role;
ALTER TABLE public.bairros ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  bairro_id UUID NOT NULL REFERENCES public.bairros(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setores TO authenticated;
GRANT ALL ON public.setores TO service_role;
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

-- TICKETS
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  status ticket_status NOT NULL DEFAULT 'aguardando',
  priority ticket_priority NOT NULL DEFAULT 'media',
  solicitante_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tecnico_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cidade_id UUID REFERENCES public.cidades(id) ON DELETE SET NULL,
  bairro_id UUID REFERENCES public.bairros(id) ON DELETE SET NULL,
  setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL,
  closing_note TEXT,
  closing_image_url TEXT,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

-- TICKET HISTORY
CREATE TABLE public.ticket_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  from_status ticket_status,
  to_status ticket_status NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ticket_history TO authenticated;
GRANT ALL ON public.ticket_history TO service_role;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- new user trigger: create profile + default 'usuario' role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.email, ''));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'usuario');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS POLICIES
-- profiles: everyone authenticated can read profiles (needed for assignment names); update only own; admins update all
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') OR id = auth.uid());

-- user_roles: read own + admins read all; only admins write
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- localidades: all authenticated can read; only admins manage
CREATE POLICY "cidades_select" ON public.cidades FOR SELECT TO authenticated USING (true);
CREATE POLICY "cidades_admin" ON public.cidades FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "bairros_select" ON public.bairros FOR SELECT TO authenticated USING (true);
CREATE POLICY "bairros_admin" ON public.bairros FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "setores_select" ON public.setores FOR SELECT TO authenticated USING (true);
CREATE POLICY "setores_admin" ON public.setores FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- tickets
CREATE POLICY "tickets_select" ON public.tickets FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR solicitante_id = auth.uid()
  OR tecnico_id = auth.uid()
  OR public.has_role(auth.uid(), 'tecnico')
);
CREATE POLICY "tickets_insert" ON public.tickets FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid()
);
CREATE POLICY "tickets_update" ON public.tickets FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR tecnico_id = auth.uid()
  OR public.has_role(auth.uid(), 'tecnico')
);
CREATE POLICY "tickets_delete_admin" ON public.tickets FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ticket_history
CREATE POLICY "history_select" ON public.ticket_history FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND (
    public.has_role(auth.uid(), 'admin') OR t.solicitante_id = auth.uid() OR t.tecnico_id = auth.uid() OR public.has_role(auth.uid(), 'tecnico')
  ))
);
CREATE POLICY "history_insert" ON public.ticket_history FOR INSERT TO authenticated WITH CHECK (changed_by = auth.uid());