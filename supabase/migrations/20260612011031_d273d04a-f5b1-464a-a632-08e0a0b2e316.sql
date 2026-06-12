-- Alertas para chamados agendados (item 13):
-- 1) Lembrete 24h antes da data/hora agendada
-- 2) Alerta na chegada do dia (já coberto pelo flip de status; aqui notificamos)

-- Coluna de controle para evitar lembretes duplicados de 24h
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS reminded_24h boolean NOT NULL DEFAULT false;

-- Notifica equipe (tecnico/admin/atendente) sobre um chamado
CREATE OR REPLACE FUNCTION public.notify_team(_title text, _body text, _ticket uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
  SELECT DISTINCT ur.user_id, 'agendado_alerta', _title, _body, _ticket
  FROM public.user_roles ur
  WHERE ur.role IN ('tecnico','admin','atendente');
$$;

-- Dispara lembretes de 24h para chamados agendados que entram na janela
CREATE OR REPLACE FUNCTION public.send_scheduled_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE EXECUTE ON FUNCTION public.notify_team(text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.send_scheduled_reminders() FROM PUBLIC, anon, authenticated;

-- Estender a automação de virada para notificar a chegada do dia
CREATE OR REPLACE FUNCTION public.promote_due_scheduled_tickets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Agenda os lembretes de 24h a cada 15 minutos
SELECT cron.schedule(
  'send-scheduled-reminders',
  '*/15 * * * *',
  $$SELECT public.send_scheduled_reminders();$$
);