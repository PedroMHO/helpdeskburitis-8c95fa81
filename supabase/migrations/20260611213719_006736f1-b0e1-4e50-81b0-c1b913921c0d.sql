
-- 1. New enum values
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'aguardando_agendamento';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'pronto_entrega';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'solicitante';

-- 2. Solicitantes table
CREATE TABLE public.solicitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  setor_id uuid REFERENCES public.setores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitantes TO authenticated;
GRANT ALL ON public.solicitantes TO service_role;
ALTER TABLE public.solicitantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "solicitantes_read" ON public.solicitantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "solicitantes_admin_write" ON public.solicitantes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER solicitantes_set_updated_at BEFORE UPDATE ON public.solicitantes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Ticket requester fields
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS solicitante_nome text;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS solicitante_ref uuid REFERENCES public.solicitantes(id) ON DELETE SET NULL;

-- 4. Technician status table
CREATE TABLE public.technician_status (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'disponivel',
  setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.technician_status TO authenticated;
GRANT ALL ON public.technician_status TO service_role;
ALTER TABLE public.technician_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "techstatus_read" ON public.technician_status FOR SELECT TO authenticated USING (true);
CREATE POLICY "techstatus_self_upsert" ON public.technician_status FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "techstatus_self_update" ON public.technician_status FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.technician_status;

-- 5. Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_read_own" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "notif_update_own" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- 6. Fan-out trigger functions
CREATE OR REPLACE FUNCTION public.notify_ticket_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END; $$;

CREATE TRIGGER tickets_notify
AFTER INSERT OR UPDATE ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.notify_ticket_changes();

-- 7. Rate limit for solicitante role (1 ticket / 30 min)
CREATE OR REPLACE FUNCTION public.enforce_solicitante_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END; $$;

CREATE TRIGGER tickets_rate_limit
BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.enforce_solicitante_rate_limit();

REVOKE EXECUTE ON FUNCTION public.notify_ticket_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_solicitante_rate_limit() FROM PUBLIC, anon, authenticated;
