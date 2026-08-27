CREATE TABLE public.ticket_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  descricao text NOT NULL DEFAULT '',
  priority ticket_priority NOT NULL DEFAULT 'media',
  solicitante_ref uuid REFERENCES public.solicitantes(id) ON DELETE SET NULL,
  solicitante_nome text,
  status text NOT NULL DEFAULT 'aberta',
  closing_note text,
  closing_image_url text,
  closed_at timestamptz,
  closed_by uuid,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ticket_solicitacoes_ticket_idx ON public.ticket_solicitacoes(ticket_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ticket_solicitacoes TO authenticated;
GRANT ALL ON public.ticket_solicitacoes TO service_role;

ALTER TABLE public.ticket_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solic_select" ON public.ticket_solicitacoes FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tickets t WHERE t.id = ticket_solicitacoes.ticket_id AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
    OR public.has_role(auth.uid(), 'atendente')
    OR t.solicitante_id = auth.uid() OR t.tecnico_id = auth.uid() OR t.created_by = auth.uid()
  )
));

CREATE POLICY "solic_insert" ON public.ticket_solicitacoes FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.tickets t WHERE t.id = ticket_solicitacoes.ticket_id AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
    OR public.has_role(auth.uid(), 'atendente')
    OR t.solicitante_id = auth.uid() OR t.tecnico_id = auth.uid() OR t.created_by = auth.uid()
  )
));

CREATE POLICY "solic_update" ON public.ticket_solicitacoes FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tickets t WHERE t.id = ticket_solicitacoes.ticket_id AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
    OR public.has_role(auth.uid(), 'atendente') OR t.tecnico_id = auth.uid()
  )
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.tickets t WHERE t.id = ticket_solicitacoes.ticket_id AND (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'tecnico')
    OR public.has_role(auth.uid(), 'atendente') OR t.tecnico_id = auth.uid()
  )
));

CREATE POLICY "solic_delete" ON public.ticket_solicitacoes FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tickets t WHERE t.id = ticket_solicitacoes.ticket_id AND (
    public.has_role(auth.uid(), 'admin') OR t.solicitante_id = auth.uid()
  )
));

CREATE TRIGGER trg_solic_updated BEFORE UPDATE ON public.ticket_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.notify_new_solicitacao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record; msg text;
BEGIN
  SELECT titulo, tecnico_id INTO t FROM public.tickets WHERE id = NEW.ticket_id;
  msg := COALESCE(t.titulo, 'Chamado') || ': ' || LEFT(COALESCE(NEW.descricao, ''), 140);
  PERFORM public.notify_team('Nova solicitação adicionada 📝', msg, NEW.ticket_id);
  IF t.tecnico_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = t.tecnico_id AND ur.role IN ('tecnico','admin','atendente')
  ) THEN
    INSERT INTO public.notifications (user_id, type, title, body, ticket_id)
    VALUES (t.tecnico_id, 'nova_solicitacao', 'Nova solicitação no seu chamado 📝', msg, NEW.ticket_id);
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.notify_new_solicitacao() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_solic_notify AFTER INSERT ON public.ticket_solicitacoes
FOR EACH ROW EXECUTE FUNCTION public.notify_new_solicitacao();