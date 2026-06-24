-- ============================================
-- Helpdesk - Estrutura completa do banco (schema public)
-- Gerado para importar em outro projeto Supabase
-- ============================================

SET statement_timeout = 0;
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== ENUM TYPES =====
DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'tecnico', 'usuario', 'atendente', 'solicitante'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_priority AS ENUM ('baixa', 'media', 'alta'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.ticket_status AS ENUM ('aguardando', 'em_atendimento', 'finalizado', 'agendado', 'em_manutencao', 'aguardando_agendamento', 'pronto_entrega', 'pendente_conclusao'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== TABLES =====
CREATE TABLE IF NOT EXISTS public.bairros (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "cidade_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.cidades (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notifications (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "ticket_id" uuid,
  "read" boolean DEFAULT false NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.profiles (
  "id" uuid NOT NULL,
  "full_name" text DEFAULT ''::text NOT NULL,
  "email" text DEFAULT ''::text NOT NULL,
  "cargo_setor" text,
  "avatar_url" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "setor_id" uuid
);

CREATE TABLE IF NOT EXISTS public.setores (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "bairro_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.solicitantes (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "nome" text NOT NULL,
  "setor_id" uuid,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.technician_status (
  "user_id" uuid NOT NULL,
  "status" text DEFAULT 'disponivel'::text NOT NULL,
  "setor_id" uuid,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ticket_history (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL,
  "from_status" public.ticket_status,
  "to_status" public.ticket_status NOT NULL,
  "changed_by" uuid NOT NULL,
  "note" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.tickets (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "titulo" text NOT NULL,
  "descricao" text DEFAULT ''::text NOT NULL,
  "status" public.ticket_status DEFAULT 'aguardando'::ticket_status NOT NULL,
  "priority" public.ticket_priority DEFAULT 'media'::ticket_priority NOT NULL,
  "solicitante_id" uuid NOT NULL,
  "tecnico_id" uuid,
  "created_by" uuid NOT NULL,
  "cidade_id" uuid,
  "bairro_id" uuid,
  "setor_id" uuid,
  "closing_note" text,
  "closing_image_url" text,
  "closed_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "scheduled_at" timestamptz,
  "closed_by" uuid,
  "solicitante_nome" text,
  "solicitante_ref" uuid,
  "reminded_24h" boolean DEFAULT false NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "role" public.app_role NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

-- ===== CONSTRAINTS =====
ALTER TABLE bairros ADD CONSTRAINT bairros_cidade_id_fkey FOREIGN KEY (cidade_id) REFERENCES cidades(id) ON DELETE CASCADE;
ALTER TABLE bairros ADD CONSTRAINT bairros_pkey PRIMARY KEY (id);
ALTER TABLE cidades ADD CONSTRAINT cidades_pkey PRIMARY KEY (id);
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE profiles ADD CONSTRAINT profiles_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES setores(id) ON DELETE SET NULL;
ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);
ALTER TABLE setores ADD CONSTRAINT setores_bairro_id_fkey FOREIGN KEY (bairro_id) REFERENCES bairros(id) ON DELETE CASCADE;
ALTER TABLE setores ADD CONSTRAINT setores_pkey PRIMARY KEY (id);
ALTER TABLE solicitantes ADD CONSTRAINT solicitantes_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES setores(id) ON DELETE CASCADE;
ALTER TABLE solicitantes ADD CONSTRAINT solicitantes_pkey PRIMARY KEY (id);
ALTER TABLE technician_status ADD CONSTRAINT technician_status_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE technician_status ADD CONSTRAINT technician_status_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES setores(id) ON DELETE SET NULL;
ALTER TABLE technician_status ADD CONSTRAINT technician_status_pkey PRIMARY KEY (user_id);
ALTER TABLE ticket_history ADD CONSTRAINT ticket_history_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE ticket_history ADD CONSTRAINT ticket_history_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
ALTER TABLE ticket_history ADD CONSTRAINT ticket_history_pkey PRIMARY KEY (id);
ALTER TABLE tickets ADD CONSTRAINT tickets_setor_id_fkey FOREIGN KEY (setor_id) REFERENCES setores(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_bairro_id_fkey FOREIGN KEY (bairro_id) REFERENCES bairros(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_cidade_id_fkey FOREIGN KEY (cidade_id) REFERENCES cidades(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_solicitante_ref_fkey FOREIGN KEY (solicitante_ref) REFERENCES solicitantes(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE tickets ADD CONSTRAINT tickets_solicitante_id_fkey FOREIGN KEY (solicitante_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE tickets ADD CONSTRAINT tickets_tecnico_id_fkey FOREIGN KEY (tecnico_id) REFERENCES profiles(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
ALTER TABLE user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);

-- ===== INDEXES =====
-- ===== FUNCTIONS =====
CREATE OR REPLACE FUNCTION public.enforce_solicitante_rate_limit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF public.has_role(NEW.created_by, 'solicitante') THEN
    IF EXISTS (
      SELECT 1 FROM public.tickets
      WHERE created_by = NEW.created_by
        AND created_at > now() - interval '30 minutes'
    ) THEN
      RAISE EXCEPTION 'rate_limit: aguarde 30 minutos entre chamados';
    END IF;
  END IF;
  RETURN NEW;
END; $function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  admin_count INT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.email, ''));

  SELECT COUNT(*) INTO admin_count FROM public.user_roles WHERE role = 'admin';
  IF admin_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'usuario');
  END IF;
  RETURN NEW;
END; $function$
;
CREATE OR REPLACE FUNCTION public.handle_ticket_status_side_effects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'em_manutencao'
     AND OLD.status = 'em_atendimento'
     AND NEW.tecnico_id IS NOT NULL THEN
    UPDATE public.technician_status
      SET status = 'disponivel', setor_id = NULL, updated_at = now()
      WHERE user_id = NEW.tecnico_id;
  END IF;
  RETURN NEW;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$function$
;
CREATE OR REPLACE FUNCTION public.notify_team(_title text, _body text, _ticket uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
  SELECT DISTINCT ur.user_id, 'agendado_alerta', _title, _body, _ticket
  FROM public.user_roles ur
  WHERE ur.role IN ('tecnico','admin','atendente');
$function$
;
CREATE OR REPLACE FUNCTION public.notify_ticket_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
    SELECT DISTINCT ur.user_id, 'novo_chamado', 'Novo chamado aberto', NEW.titulo, NEW.id
    FROM public.user_roles ur
    WHERE ur.role IN ('tecnico','admin');
  ELSIF TG_OP = 'UPDATE' AND NEW.status = 'finalizado' AND OLD.status IS DISTINCT FROM 'finalizado' THEN
    INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
    SELECT DISTINCT ur.user_id, 'finalizado', 'Chamado finalizado', NEW.titulo, NEW.id
    FROM public.user_roles ur
    WHERE ur.role = 'atendente';
  END IF;
  RETURN NEW;
END; $function$
;
CREATE OR REPLACE FUNCTION public.profiles_directory()
 RETURNS TABLE(id uuid, full_name text, email text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, full_name, ''::text AS email FROM public.profiles
$function$
;
CREATE OR REPLACE FUNCTION public.promote_due_scheduled_tickets()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, titulo FROM public.tickets
    WHERE status = 'agendado'
      AND scheduled_at IS NOT NULL
      AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
          <= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  LOOP
    UPDATE public.tickets SET status = 'aguardando' WHERE id = r.id;
    PERFORM public.notify_team('Chamado agendado chegou ao dia 📅', r.titulo, r.id);
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.send_scheduled_reminders()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id, titulo, scheduled_at
    FROM public.tickets
    WHERE status = 'agendado'
      AND scheduled_at IS NOT NULL
      AND reminded_24h = false
      AND scheduled_at <= now() + interval '24 hours'
      AND scheduled_at > now()
  LOOP
    PERFORM public.notify_team(
      'Chamado agendado em 24h ⏰',
      r.titulo,
      r.id
    );
    UPDATE public.tickets SET reminded_24h = true WHERE id = r.id;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $function$
;
CREATE OR REPLACE FUNCTION public.technicians_directory()
 RETURNS TABLE(id uuid, full_name text, setor_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT DISTINCT p.id, p.full_name, p.setor_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role IN ('tecnico','admin')
$function$
;

-- ===== TRIGGERS =====
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER solicitantes_set_updated_at BEFORE UPDATE ON public.solicitantes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tickets_notify AFTER INSERT OR UPDATE ON public.tickets FOR EACH ROW EXECUTE FUNCTION notify_ticket_changes();
CREATE TRIGGER tickets_rate_limit BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION enforce_solicitante_rate_limit();
CREATE TRIGGER trg_ticket_status_side_effects AFTER UPDATE OF status ON public.tickets FOR EACH ROW EXECUTE FUNCTION handle_ticket_status_side_effects();

-- ===== ROW LEVEL SECURITY =====
ALTER TABLE public.bairros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technician_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===== POLICIES =====
CREATE POLICY bairros_admin ON public.bairros AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY bairros_select ON public.bairros AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY cidades_admin ON public.cidades AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY cidades_select ON public.cidades AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY notif_read_own ON public.notifications AS PERMISSIVE FOR SELECT TO authenticated USING ((auth.uid() = user_id));
CREATE POLICY notif_update_own ON public.notifications AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY profiles_insert_admin ON public.profiles AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(), 'admin'::app_role) OR (id = auth.uid())));
CREATE POLICY profiles_select_self_or_priv ON public.profiles AS PERMISSIVE FOR SELECT TO authenticated USING (((id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));
CREATE POLICY profiles_update_admin ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY profiles_update_own ON public.profiles AS PERMISSIVE FOR UPDATE TO authenticated USING ((id = auth.uid()));
CREATE POLICY setores_admin ON public.setores AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY setores_select ON public.setores AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY solicitantes_admin_write ON public.solicitantes AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY solicitantes_read ON public.solicitantes AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY techstatus_read ON public.technician_status AS PERMISSIVE FOR SELECT TO authenticated USING (true);
CREATE POLICY techstatus_self_update ON public.technician_status AS PERMISSIVE FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));
CREATE POLICY techstatus_self_upsert ON public.technician_status AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));
CREATE POLICY history_insert ON public.ticket_history AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (((changed_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM tickets t
  WHERE ((t.id = ticket_history.ticket_id) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (t.solicitante_id = auth.uid()) OR (t.tecnico_id = auth.uid())))))));
CREATE POLICY history_select ON public.ticket_history AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM tickets t
  WHERE ((t.id = ticket_history.ticket_id) AND (has_role(auth.uid(), 'admin'::app_role) OR (t.solicitante_id = auth.uid()) OR (t.tecnico_id = auth.uid()) OR has_role(auth.uid(), 'tecnico'::app_role))))));
CREATE POLICY tickets_delete ON public.tickets AS PERMISSIVE FOR DELETE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR (solicitante_id = auth.uid())));
CREATE POLICY tickets_insert ON public.tickets AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = auth.uid()));
CREATE POLICY tickets_select ON public.tickets AS PERMISSIVE FOR SELECT TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (solicitante_id = auth.uid()) OR (tecnico_id = auth.uid()) OR (created_by = auth.uid())));
CREATE POLICY tickets_update ON public.tickets AS PERMISSIVE FOR UPDATE TO authenticated USING ((has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (tecnico_id = auth.uid()) OR (solicitante_id = auth.uid())));
CREATE POLICY roles_admin_all ON public.user_roles AS PERMISSIVE FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY roles_select_own ON public.user_roles AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR has_role(auth.uid(), 'admin'::app_role)));

-- ===== GRANTS =====
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bairros TO authenticated;
GRANT ALL ON public.bairros TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cidades TO authenticated;
GRANT ALL ON public.cidades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.setores TO authenticated;
GRANT ALL ON public.setores TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitantes TO authenticated;
GRANT ALL ON public.solicitantes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_status TO authenticated;
GRANT ALL ON public.technician_status TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_history TO authenticated;
GRANT ALL ON public.ticket_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tickets TO authenticated;
GRANT ALL ON public.tickets TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

-- ===== AUTH TRIGGER (cria profile + role no signup) =====
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== STORAGE BUCKETS =====
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars','avatars',false),
  ('ticket-proofs','ticket-proofs',false)
ON CONFLICT (id) DO NOTHING;

-- ===== STORAGE POLICIES =====
DROP POLICY IF EXISTS avatars_delete ON storage.objects; CREATE POLICY avatars_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS avatars_insert ON storage.objects; CREATE POLICY avatars_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS avatars_read ON storage.objects; CREATE POLICY avatars_read ON storage.objects FOR SELECT TO authenticated USING ((bucket_id = 'avatars'::text));
DROP POLICY IF EXISTS avatars_update ON storage.objects; CREATE POLICY avatars_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
DROP POLICY IF EXISTS proofs_delete ON storage.objects; CREATE POLICY proofs_delete ON storage.objects FOR DELETE TO authenticated USING (((bucket_id = 'ticket-proofs'::text) AND (EXISTS ( SELECT 1
   FROM tickets t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (t.solicitante_id = auth.uid()) OR (t.tecnico_id = auth.uid())))))));
DROP POLICY IF EXISTS proofs_insert ON storage.objects; CREATE POLICY proofs_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'ticket-proofs'::text) AND (EXISTS ( SELECT 1
   FROM tickets t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (t.solicitante_id = auth.uid()) OR (t.tecnico_id = auth.uid())))))));
DROP POLICY IF EXISTS proofs_read ON storage.objects; CREATE POLICY proofs_read ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'ticket-proofs'::text) AND (EXISTS ( SELECT 1
   FROM tickets t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (t.solicitante_id = auth.uid()) OR (t.tecnico_id = auth.uid())))))));
DROP POLICY IF EXISTS proofs_update ON storage.objects; CREATE POLICY proofs_update ON storage.objects FOR UPDATE TO authenticated USING (((bucket_id = 'ticket-proofs'::text) AND (EXISTS ( SELECT 1
   FROM tickets t
  WHERE (((t.id)::text = (storage.foldername(objects.name))[1]) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'tecnico'::app_role) OR has_role(auth.uid(), 'atendente'::app_role) OR (t.solicitante_id = auth.uid()) OR (t.tecnico_id = auth.uid())))))));
