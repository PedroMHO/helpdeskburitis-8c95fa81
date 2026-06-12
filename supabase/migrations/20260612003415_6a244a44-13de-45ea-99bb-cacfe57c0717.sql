-- 1. New ticket status: Pendente de Conclusão
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'pendente_conclusao';

-- 2. Sector link on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS setor_id uuid REFERENCES public.setores(id) ON DELETE SET NULL;

-- 3. Tighten solicitante isolation (also match created_by)
DROP POLICY IF EXISTS tickets_select ON public.tickets;
CREATE POLICY tickets_select ON public.tickets
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'tecnico'::app_role)
  OR has_role(auth.uid(), 'atendente'::app_role)
  OR solicitante_id = auth.uid()
  OR tecnico_id = auth.uid()
  OR created_by = auth.uid()
);

-- 4. Side effect: técnico liberado quando chamado entra em manutenção
CREATE OR REPLACE FUNCTION public.handle_ticket_status_side_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_ticket_status_side_effects ON public.tickets;
CREATE TRIGGER trg_ticket_status_side_effects
AFTER UPDATE OF status ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.handle_ticket_status_side_effects();

REVOKE EXECUTE ON FUNCTION public.handle_ticket_status_side_effects() FROM PUBLIC, anon, authenticated;

-- 5. Automação: chamados agendados viram "Aberto" (aguardando) ao chegar o dia
CREATE OR REPLACE FUNCTION public.promote_due_scheduled_tickets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.tickets
    SET status = 'aguardando'
    WHERE status = 'agendado'
      AND scheduled_at IS NOT NULL
      AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
          <= (now() AT TIME ZONE 'America/Sao_Paulo')::date;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_due_scheduled_tickets() FROM PUBLIC, anon, authenticated;

-- Schedule the automation every 15 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule('promote-scheduled-tickets');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'promote-scheduled-tickets',
  '*/15 * * * *',
  $$SELECT public.promote_due_scheduled_tickets();$$
);