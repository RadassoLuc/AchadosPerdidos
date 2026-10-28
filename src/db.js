import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const ACHADO = ['aguardando_entrega', 'no_protocolo', 'em_reclamacao', 'devolvido', 'destinado', 'cancelado', 'removido'];
const PERDIDO = ['aberto', 'encontrado', 'cancelado', 'expirado', 'removido'];
const lista = (a) => a.map((s) => `'${s}'`).join(',');
const AGORA = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";

const SCHEMA = `
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL CHECK (length(nome) BETWEEN 3 AND 100),
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 6 AND 120 AND email LIKE '%_@_%._%'),
  matricula TEXT CHECK (matricula IS NULL OR (length(matricula) BETWEEN 5 AND 20 AND matricula NOT GLOB '*[^0-9]*')),
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'aluno' CHECK (papel IN ('aluno','protocolo','admin')),
  verificado_em TEXT,
  bloqueado INTEGER NOT NULL DEFAULT 0 CHECK (bloqueado IN (0,1)),
  falhas_login INTEGER NOT NULL DEFAULT 0 CHECK (falhas_login >= 0),
  bloqueado_ate TEXT,
  aceite_termos_em TEXT NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;

CREATE TABLE tokens_email (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('verificacao','redefinicao')),
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TEXT NOT NULL,
  usado_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;

CREATE TABLE sessoes (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf TEXT NOT NULL,
  expira_em TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;

CREATE TABLE categorias (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE CHECK (length(nome) BETWEEN 2 AND 40),
  icone TEXT NOT NULL DEFAULT 'box',
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
) STRICT;

CREATE TABLE locais (
  id INTEGER PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE CHECK (length(nome) BETWEEN 2 AND 60),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
) STRICT;

CREATE TABLE itens (
  id INTEGER PRIMARY KEY,
  codigo TEXT UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('achado','perdido')),
  titulo TEXT NOT NULL CHECK (length(titulo) BETWEEN 3 AND 80),
  descricao TEXT NOT NULL DEFAULT '' CHECK (length(descricao) <= 1000),
  categoria_id INTEGER NOT NULL REFERENCES categorias(id),
  local_id INTEGER NOT NULL REFERENCES locais(id),
  local_detalhe TEXT CHECK (local_detalhe IS NULL OR length(local_detalhe) <= 120),
  busca TEXT NOT NULL DEFAULT '',
  local_guarda TEXT CHECK (local_guarda IS NULL OR length(local_guarda) <= 60),
  ocorrido_em TEXT NOT NULL CHECK (ocorrido_em GLOB '????-??-??T??:??:??*Z'),
  status TEXT NOT NULL,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  resolvido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (${AGORA}),
  atualizado_em TEXT NOT NULL DEFAULT (${AGORA}),
  CHECK ((tipo = 'achado' AND status IN (${lista(ACHADO)})) OR (tipo = 'perdido' AND status IN (${lista(PERDIDO)})))
) STRICT;
CREATE INDEX idx_itens_status ON itens(status, tipo, ocorrido_em);
CREATE INDEX idx_itens_autor ON itens(autor_id);

CREATE TABLE item_fotos (
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES itens(id) ON DELETE CASCADE,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  arquivo TEXT NOT NULL UNIQUE CHECK (length(arquivo) = 36 AND arquivo NOT GLOB '*[^0-9a-f.jpg]*'),
  ordem INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;
CREATE INDEX idx_fotos_item ON item_fotos(item_id);
CREATE TRIGGER fotos_max_4 BEFORE UPDATE OF item_id ON item_fotos
WHEN NEW.item_id IS NOT NULL AND (SELECT count(*) FROM item_fotos WHERE item_id = NEW.item_id) >= 4
BEGIN SELECT RAISE(ABORT, 'máximo de 4 fotos por item'); END;

CREATE TABLE reivindicacoes (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES itens(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  prova TEXT NOT NULL CHECK (length(prova) BETWEEN 10 AND 500),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada','cancelada')),
  decidido_por INTEGER REFERENCES usuarios(id),
  decidido_em TEXT,
  nota_decisao TEXT CHECK (nota_decisao IS NULL OR length(nota_decisao) <= 300),
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;
CREATE UNIQUE INDEX uq_reivindicacao_ativa ON reivindicacoes(item_id, usuario_id) WHERE status IN ('pendente','aprovada');

CREATE TABLE avisos (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES itens(id),
  autor_id INTEGER NOT NULL REFERENCES usuarios(id),
  mensagem TEXT NOT NULL CHECK (length(mensagem) BETWEEN 5 AND 500),
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;

CREATE TABLE entregas (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL UNIQUE REFERENCES itens(id),
  reivindicacao_id INTEGER REFERENCES reivindicacoes(id),
  recebedor_nome TEXT NOT NULL CHECK (length(recebedor_nome) BETWEEN 3 AND 100),
  recebedor_documento TEXT NOT NULL CHECK (length(recebedor_documento) BETWEEN 3 AND 30),
  registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 300),
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;

CREATE TABLE item_historico (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES itens(id),
  de_status TEXT,
  para_status TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  papel TEXT,
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 300),
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;
CREATE INDEX idx_hist_item ON item_historico(item_id);
CREATE TRIGGER hist_imutavel_u BEFORE UPDATE ON item_historico BEGIN SELECT RAISE(ABORT, 'histórico é imutável'); END;
CREATE TRIGGER hist_imutavel_d BEFORE DELETE ON item_historico BEGIN SELECT RAISE(ABORT, 'histórico é imutável'); END;

CREATE TABLE denuncias (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES itens(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  motivo TEXT NOT NULL CHECK (length(motivo) BETWEEN 5 AND 300),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','procedente','improcedente')),
  resolvido_por INTEGER REFERENCES usuarios(id),
  resolvido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT (${AGORA}),
  UNIQUE (item_id, usuario_id)
) STRICT;

CREATE TABLE auditoria (
  id INTEGER PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  acao TEXT NOT NULL,
  alvo TEXT,
  detalhe TEXT,
  ip TEXT,
  criado_em TEXT NOT NULL DEFAULT (${AGORA})
) STRICT;
CREATE TRIGGER audit_imutavel_u BEFORE UPDATE ON auditoria BEGIN SELECT RAISE(ABORT, 'auditoria é imutável'); END;
CREATE TRIGGER audit_imutavel_d BEFORE DELETE ON auditoria BEGIN SELECT RAISE(ABORT, 'auditoria é imutável'); END;
`;

const CATEGORIAS = [
  ['Garrafa / Squeeze', 'bottle'], ['Documentos', 'doc'], ['Carteira / Cartões', 'card'],
  ['Eletrônicos', 'chip'], ['Chaves', 'key'], ['Material de estudo', 'book'],
  ['Roupas e acessórios', 'shirt'], ['Óculos', 'glasses'], ['Mochila / Bolsa', 'bag'], ['Outros', 'box'],
];
// Ajuste esta lista com os lugares reais do campus Parauapebas (ou pelo painel/SQL).
const LOCAIS = [
  'Salas de aula', 'Biblioteca', 'Pátio / Cantina', 'Laboratórios', 'Banheiros',
  'Estacionamento', 'Entrada / Portaria', 'Auditório', 'Outro local do campus',
];

const MIGRACOES = [
  {
    versao: 1,
    aplicar(db) {
      db.exec(SCHEMA);
      const c = db.prepare('INSERT INTO categorias (nome, icone) VALUES (?, ?)');
      for (const [n, i] of CATEGORIAS) c.run(n, i);
      const l = db.prepare('INSERT INTO locais (nome) VALUES (?)');
      for (const n of LOCAIS) l.run(n);
    },
  },
  {
    // v4: foto de perfil + permite apagar o histórico de um item que foi excluído de vez pelo admin.
    versao: 2,
    aplicar(db) {
      db.exec('ALTER TABLE usuarios ADD COLUMN avatar TEXT');
      db.exec('DROP TRIGGER hist_imutavel_d');
      db.exec(`CREATE TRIGGER hist_imutavel_d BEFORE DELETE ON item_historico
        WHEN EXISTS (SELECT 1 FROM itens WHERE id = OLD.item_id)
        BEGIN SELECT RAISE(ABORT, 'histórico é imutável'); END`);
    },
  },
];

export function abrirBanco(caminho) {
  if (caminho !== ':memory:') mkdirSync(path.dirname(caminho), { recursive: true });
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  const atual = db.prepare('PRAGMA user_version').get().user_version;
  for (const m of MIGRACOES.filter((x) => x.versao > atual)) {
    db.exec('BEGIN');
    try {
      m.aplicar(db);
      db.exec(`PRAGMA user_version = ${m.versao}`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

/** Executa `fn` numa transação (BEGIN IMMEDIATE evita corridas entre duas ações no mesmo item). */
export function transacao(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export const STATUS_ACHADO = ACHADO;
export const STATUS_PERDIDO = PERDIDO;
