const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

class HelpDeskDatabase {
  constructor(userData) {
    this.userData = userData;
    this.dbPath = path.join(userData, 'helpdesk.db');
    this.attachments = path.join(userData, 'anexos');
    fs.mkdirSync(this.attachments, { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
    this.migrate();
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '', cargo_setor TEXT, avatar_path TEXT,
        setor_id TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS user_roles (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK(role IN ('admin','tecnico','atendente','usuario','solicitante')),
        UNIQUE(user_id, role)
      );
      CREATE TABLE IF NOT EXISTS cidades (id TEXT PRIMARY KEY, nome TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bairros (id TEXT PRIMARY KEY, nome TEXT NOT NULL, cidade_id TEXT NOT NULL REFERENCES cidades(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS setores (id TEXT PRIMARY KEY, nome TEXT NOT NULL, bairro_id TEXT NOT NULL REFERENCES bairros(id), created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS solicitantes (id TEXT PRIMARY KEY, nome TEXT NOT NULL, setor_id TEXT REFERENCES setores(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tickets (
        id TEXT PRIMARY KEY, titulo TEXT NOT NULL, descricao TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'aguardando' CHECK(status IN ('aguardando','aguardando_agendamento','agendado','em_atendimento','em_manutencao','pendente_conclusao','aguardando_verificacao','pendente_aprovacao','pronto_entrega','finalizado')),
        priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN ('baixa','media','alta')),
        solicitante_id TEXT NOT NULL REFERENCES users(id), solicitante_nome TEXT, solicitante_ref TEXT,
        tecnico_id TEXT REFERENCES users(id), created_by TEXT NOT NULL REFERENCES users(id),
        cidade_id TEXT, bairro_id TEXT, setor_id TEXT REFERENCES setores(id), closing_note TEXT,
        closing_image_path TEXT, closed_at TEXT, closed_by TEXT, scheduled_at TEXT,
        reminded_24h INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ticket_solicitacoes (
        id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        descricao TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'media', solicitante_ref TEXT,
        solicitante_nome TEXT, status TEXT NOT NULL DEFAULT 'aberta' CHECK(status IN ('aberta','em_atendimento','em_reparo','pronto_entrega','finalizada')),
        closing_note TEXT, closing_image_path TEXT, closed_at TEXT, closed_by TEXT,
        scheduled_at TEXT, created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ticket_history (
        id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
        from_status TEXT, to_status TEXT NOT NULL, changed_by TEXT NOT NULL REFERENCES users(id), note TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL, title TEXT NOT NULL, body TEXT, ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
        read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS technician_status (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'disponivel', setor_id TEXT, updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      CREATE INDEX IF NOT EXISTS idx_tickets_setor ON tickets(setor_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_tecnico ON tickets(tecnico_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at);
      CREATE INDEX IF NOT EXISTS idx_solicitacoes_ticket ON ticket_solicitacoes(ticket_id,status);
      CREATE INDEX IF NOT EXISTS idx_history_ticket ON ticket_history(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id,read);
    `);
  }

  hasUsers() { return this.db.prepare('SELECT COUNT(*) total FROM users').get().total > 0; }
  role(userId) { return this.db.prepare('SELECT role FROM user_roles WHERE user_id=?').get(userId)?.role || null; }
  user(userId) {
    const user = this.db.prepare('SELECT id,email,full_name,cargo_setor,avatar_path,setor_id,active FROM users WHERE id=?').get(userId);
    return user ? { ...user, role: this.role(userId) } : null;
  }
  assert(session, roles) {
    if (!session?.id) throw new Error('Sessão expirada.');
    const user = this.user(session.id);
    if (!user?.active) throw new Error('Acesso negado.');
    if (roles && !roles.includes(user.role)) throw new Error('Você não tem permissão para esta ação.');
    return user;
  }

  setup(input) {
    if (this.hasUsers()) throw new Error('A configuração inicial já foi concluída.');
    if (!input.full_name?.trim() || !input.email?.trim() || String(input.password || '').length < 8) throw new Error('Informe nome, e-mail e senha com pelo menos 8 caracteres.');
    const id = uuid(); const stamp = now();
    const tx = this.db.transaction(() => {
      this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, input.email.trim().toLowerCase(), hashPassword(input.password), input.full_name.trim(), 'Administrador', null, null, 1, stamp, stamp);
      this.db.prepare('INSERT INTO user_roles VALUES(?,?,?)').run(uuid(), id, 'admin');
    }); tx();
    return this.user(id);
  }

  login(input) {
    const row = this.db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(input.email || '').trim().toLowerCase());
    if (!row || !verifyPassword(input.password, row.password_hash)) throw new Error('E-mail ou senha inválidos.');
    return this.user(row.id);
  }

  locations(session) {
    this.assert(session);
    return {
      cidades: this.db.prepare('SELECT * FROM cidades ORDER BY nome').all(),
      bairros: this.db.prepare('SELECT * FROM bairros ORDER BY nome').all(),
      setores: this.db.prepare('SELECT * FROM setores ORDER BY nome').all(),
      solicitantes: this.db.prepare('SELECT * FROM solicitantes ORDER BY nome').all(),
    };
  }

  addLocation(session, input) {
    this.assert(session, ['admin']); const id = uuid(); const stamp = now();
    if (input.kind === 'cidade') this.db.prepare('INSERT INTO cidades VALUES(?,?,?)').run(id, input.nome.trim(), stamp);
    else if (input.kind === 'bairro') this.db.prepare('INSERT INTO bairros VALUES(?,?,?,?)').run(id, input.nome.trim(), input.parent_id, stamp);
    else if (input.kind === 'setor') this.db.prepare('INSERT INTO setores VALUES(?,?,?,?)').run(id, input.nome.trim(), input.parent_id, stamp);
    else throw new Error('Tipo de cadastro inválido.');
    return { id };
  }

  users(session) {
    this.assert(session, ['admin']);
    return this.db.prepare(`SELECT u.id,u.email,u.full_name,u.cargo_setor,u.setor_id,u.active,r.role FROM users u JOIN user_roles r ON r.user_id=u.id ORDER BY u.full_name`).all();
  }

  createUser(session, input) {
    this.assert(session, ['admin']);
    if (String(input.password || '').length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');
    const id = uuid(); const stamp = now();
    const tx = this.db.transaction(() => {
      this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, input.email.trim().toLowerCase(), hashPassword(input.password), input.full_name.trim(), input.cargo_setor || null, null, input.setor_id || null, 1, stamp, stamp);
      this.db.prepare('INSERT INTO user_roles VALUES(?,?,?)').run(uuid(), id, input.role);
    }); tx(); return this.user(id);
  }

  tickets(session) {
    const user = this.assert(session);
    const where = ['usuario','solicitante'].includes(user.role) ? 'WHERE t.created_by=? OR t.solicitante_id=?' : '';
    const args = where ? [user.id,user.id] : [];
    return this.db.prepare(`SELECT t.*,s.nome setor_nome,u.full_name tecnico_nome FROM tickets t LEFT JOIN setores s ON s.id=t.setor_id LEFT JOIN users u ON u.id=t.tecnico_id ${where} ORDER BY t.created_at DESC`).all(...args);
  }

  ticket(session, id) {
    const ticket = this.tickets(session).find((item) => item.id === id);
    if (!ticket) throw new Error('Chamado não encontrado.');
    return { ...ticket,
      solicitacoes: this.db.prepare('SELECT * FROM ticket_solicitacoes WHERE ticket_id=? ORDER BY created_at').all(id),
      history: this.db.prepare('SELECT h.*,u.full_name changed_by_name FROM ticket_history h LEFT JOIN users u ON u.id=h.changed_by WHERE ticket_id=? ORDER BY created_at DESC').all(id),
    };
  }

  createTicket(session, input) {
    const user = this.assert(session);
    if (user.role === 'solicitante') {
      const last = this.db.prepare('SELECT created_at FROM tickets WHERE created_by=? ORDER BY created_at DESC LIMIT 1').get(user.id);
      if (last && Date.now() - new Date(last.created_at).getTime() < 1800000) throw new Error('Aguarde 30 minutos entre os chamados.');
    }
    const setor = input.setor_id ? this.db.prepare('SELECT nome FROM setores WHERE id=?').get(input.setor_id) : null;
    const status = input.status || 'aguardando';
    if (status === 'aguardando' && input.setor_id) {
      const exists = this.db.prepare("SELECT id FROM tickets WHERE setor_id=? AND status NOT IN ('finalizado','agendado') LIMIT 1").get(input.setor_id);
      if (exists) throw new Error('Este setor já possui um chamado ativo. Adicione uma solicitação ao chamado existente.');
    }
    const id = uuid(); const stamp = now();
    const tx = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO tickets (id,titulo,descricao,status,priority,solicitante_id,solicitante_nome,solicitante_ref,created_by,cidade_id,bairro_id,setor_id,scheduled_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, setor?.nome || input.titulo || 'Chamado', input.descricao || '', status, input.priority || 'media', user.id, input.solicitante_nome || user.full_name, input.solicitante_ref || null, user.id, input.cidade_id || null, input.bairro_id || null, input.setor_id || user.setor_id || null, input.scheduled_at || null, stamp, stamp);
      this.db.prepare('INSERT INTO ticket_history VALUES(?,?,?,?,?,?,?)').run(uuid(), id, null, status, user.id, 'Chamado aberto', stamp);
    }); tx(); return { id };
  }

  updateTicket(session, input) {
    const user = this.assert(session); const current = this.ticket(session, input.id);
    if (['usuario','solicitante'].includes(user.role)) throw new Error('Seu cargo não pode alterar o fluxo do chamado.');
    const next = input.status || current.status; const stamp = now();
    const tx = this.db.transaction(() => {
      this.db.prepare(`UPDATE tickets SET status=?,priority=COALESCE(?,priority),tecnico_id=COALESCE(?,tecnico_id),scheduled_at=COALESCE(?,scheduled_at),closing_note=COALESCE(?,closing_note),closed_at=CASE WHEN ?='finalizado' THEN ? ELSE closed_at END,closed_by=CASE WHEN ?='finalizado' THEN ? ELSE closed_by END,updated_at=? WHERE id=?`).run(next,input.priority||null,input.tecnico_id||null,input.scheduled_at||null,input.closing_note||null,next,stamp,next,user.id,stamp,input.id);
      if (next !== current.status) this.db.prepare('INSERT INTO ticket_history VALUES(?,?,?,?,?,?,?)').run(uuid(),input.id,current.status,next,user.id,input.note||null,stamp);
    }); tx(); return this.ticket(session,input.id);
  }

  addRequest(session, input) {
    const user = this.assert(session); this.ticket(session,input.ticket_id);
    const id=uuid(), stamp=now();
    const tx=this.db.transaction(()=>{
      this.db.prepare(`INSERT INTO ticket_solicitacoes (id,ticket_id,descricao,priority,solicitante_nome,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'aberta',?,?,?)`).run(id,input.ticket_id,input.descricao,input.priority||'media',input.solicitante_nome||null,user.id,stamp,stamp);
      this.db.prepare('INSERT INTO ticket_history VALUES(?,?,?,?,?,?,?)').run(uuid(),input.ticket_id,null,'aguardando',user.id,`Nova solicitação: ${input.descricao}`,stamp);
      const recipients=this.db.prepare("SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.active=1 AND r.role IN ('admin','tecnico','atendente')").all();
      for(const recipient of recipients) this.db.prepare('INSERT INTO notifications VALUES(?,?,?,?,?,?,?,?)').run(uuid(),recipient.id,'nova_solicitacao','Nova solicitação adicionada',input.descricao,input.ticket_id,0,stamp);
    }); tx(); return {id};
  }

  updateRequest(session,input) {
    const user=this.assert(session,['admin','tecnico','atendente']);
    const current=this.db.prepare('SELECT * FROM ticket_solicitacoes WHERE id=?').get(input.id);
    if(!current) throw new Error('Solicitação não encontrada.');
    const stamp=now(), next=input.status||current.status;
    this.db.prepare(`UPDATE ticket_solicitacoes SET status=?,closing_note=COALESCE(?,closing_note),closed_at=CASE WHEN ?='finalizada' THEN ? ELSE closed_at END,closed_by=CASE WHEN ?='finalizada' THEN ? ELSE closed_by END,updated_at=? WHERE id=?`).run(next,input.closing_note||null,next,stamp,next,user.id,stamp,input.id);
    this.db.prepare('INSERT INTO ticket_history VALUES(?,?,?,?,?,?,?)').run(uuid(),current.ticket_id,current.status,next,user.id,input.note||'Solicitação atualizada',stamp);
    return {ok:true};
  }

  notifications(session) { const user=this.assert(session); return this.db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(user.id); }
  dashboard(session) {
    const rows=this.tickets(session);
    const visible=rows.filter(t=>t.status!=='em_manutencao');
    const counts={total:visible.length,aguardando:0,atendimento:0,agendados:0,finalizados:0};
    for(const t of visible){ if(t.status==='aguardando')counts.aguardando++; if(t.status==='em_atendimento')counts.atendimento++; if(t.status==='agendado')counts.agendados++; if(t.status==='finalizado')counts.finalizados++; }
    return {counts,recent:visible.slice(0,8)};
  }

  historyCount(session,input){ this.assert(session,['admin']); return this.db.prepare("SELECT COUNT(*) total FROM tickets WHERE status='finalizado' AND COALESCE(closed_at,created_at)>=? AND COALESCE(closed_at,created_at)<?").get(input.start,input.end).total; }
  purgeHistory(session,input){ this.assert(session,['admin']); const rows=this.db.prepare("SELECT id,closing_image_path FROM tickets WHERE status='finalizado' AND COALESCE(closed_at,created_at)>=? AND COALESCE(closed_at,created_at)<?").all(input.start,input.end); const tx=this.db.transaction(()=>{for(const row of rows)this.db.prepare('DELETE FROM tickets WHERE id=?').run(row.id)});tx(); for(const row of rows){if(row.closing_image_path)try{fs.unlinkSync(path.join(this.attachments,row.closing_image_path))}catch{}} return {deleted:rows.length}; }
  close(){ this.db.close(); }
}

module.exports={HelpDeskDatabase};