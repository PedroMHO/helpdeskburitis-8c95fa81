ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'aguardando_verificacao';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'pendente_aprovacao';