import { createServer } from 'node:http';
import { readFile, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { abrirBanco } from './db.js';
import { loadConfig } from './config.js';
import { criarMailer } from './lib/mailer.js';
import { HttpError } from './lib/validate.js';
import { sha256 } from './lib/crypto.js';
import { nowIso } from './lib/dates.js';
import {
  cabecalhosSeguranca, criarLimitador, criarRoteador, enviarJson, ipDe, lerCookies, lerJson,
} from './lib/http.js';
import authRoutes, { nomeCookie } from './routes/auth.js';
import itemRoutes from './routes/items.js';
import uploadRoutes from './routes/uploads.js';
import protocoloRoutes from './routes/protocolo.js';
import adminRoutes from './routes/admin.js';

const HANDLED = Symbol('handled');
const SEM_CSRF = new Set(['/api/auth/entrar', '/api/auth/cadastro', '/api/auth/verificar', '/api/auth/esqueci', '/api/auth/redefinir']);
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

export function criarApp(overrides = {}, log = console) {
  const config = loadConfig(overrides);
  const db = abrirBanco(config.dbPath);
  const mailer = criarMailer(config, log);
  const limitador = criarLimitador(config.rateLimit);
  const r = criarRoteador();

  const d = { db, config, mailer, limitador };
  d.auditar = (ctx, acao, alvo = '', detalhe = '', usuarioId) => {
    db.prepare('INSERT INTO auditoria (usuario_id, acao, alvo, detalhe, ip) VALUES (?,?,?,?,?)')
      .run(usuarioId ?? ctx.usuario?.id ?? null, acao, String(alvo).slice(0, 80), String(detalhe).slice(0, 300), ctx.ip);
  };
  authRoutes(r, d);
  itemRoutes(r, d); // define d.mudarStatus / d.carregar usados pelas demais
  uploadRoutes(r, d);
  protocoloRoutes(r, d);
  adminRoutes(r, d);

  function carregarSessao(req) {
    const token = lerCookies(req)[nomeCookie(config)];
    if (!token || token.length > 100) return null;
    const s = db.prepare(`SELECT s.id sid, s.csrf, s.expira_em, u.* FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?`).get(sha256(token));
    if (!s) return null;
    if (s.expira_em < nowIso() || s.bloqueado) {
      db.prepare('DELETE FROM sessoes WHERE id = ?').run(s.sid);
      return null;
    }
    const { sid, csrf, expira_em, ...usuario } = s;
    return { usuario, sessao: { id: sid, csrf } };
  }

  async function servirEstatico(req, res, caminho) {
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
    let rel;
    try { rel = decodeURIComponent(caminho); } catch { throw new HttpError(400, 'Caminho inválido.'); }
    if (rel.includes('\0')) throw new HttpError(400, 'Caminho inválido.');
    if (rel === '/' || rel === '') rel = '/index.html';
    const abs = path.resolve(config.publicDir, '.' + rel);
    if (abs !== config.publicDir && !abs.startsWith(config.publicDir + path.sep)) throw new HttpError(404, 'Não encontrado.');
    const st = await stat(abs).catch(() => null);
    if (!st || !st.isFile() || path.basename(abs).startsWith('.')) throw new HttpError(404, 'Não encontrado.');
    const tipo = TIPOS[path.extname(abs).toLowerCase()];
    if (!tipo) throw new HttpError(404, 'Não encontrado.');
    const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag }); return res.end(); }
    const buf = await readFile(abs);
    res.writeHead(200, { 'Content-Type': tipo, 'Content-Length': buf.length, ETag: etag, 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  async function tratar(req, res) {
    cabecalhosSeguranca(res, config.production);
    const url = new URL(req.url, 'http://local');
    const caminho = url.pathname;
    const ip = ipDe(req, config.trustProxy);
    try {
      if (!caminho.startsWith('/api/') && !caminho.startsWith('/uploads/')) return await servirEstatico(req, res, caminho);

      const achada = r.achar(req.method === 'HEAD' ? 'GET' : req.method, caminho);
      if (!achada.handler) {
        throw new HttpError(achada.naoPermitido ? 405 : 404, achada.naoPermitido ? 'Método não permitido.' : 'Não encontrado.');
      }
      const ctx = { req, res, ip, params: achada.params, query: url.searchParams, status: 200, handled: HANDLED, usuario: null, sessao: null };
      ctx.json = () => lerJson(req);
      const sess = carregarSessao(req);
      if (sess) { ctx.usuario = sess.usuario; ctx.sessao = sess.sessao; }

      const op = achada.opts;
      if (op.auth) {
        if (!ctx.usuario) throw new HttpError(401, 'Entre para continuar.', { codigo: 'nao_autenticado' });
        if (Array.isArray(op.auth) && !op.auth.includes(ctx.usuario.papel)) throw new HttpError(403, 'Você não tem permissão para isso.');
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        const origem = req.headers.origin;
        if (origem) {
          let host = '';
          try { host = new URL(origem).host; } catch { /* inválida */ }
          if (host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
        }
        if (ctx.sessao && !SEM_CSRF.has(caminho)) {
          const enviado = String(req.headers['x-csrf-token'] || '');
          if (!enviado || enviado !== ctx.sessao.csrf) throw new HttpError(403, 'Sessão expirada. Recarregue a página.', { codigo: 'csrf' });
        }
      }
      const resultado = await achada.handler(ctx);
      if (resultado === HANDLED) return;
      enviarJson(res, ctx.status, resultado ?? { ok: true });
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError) {
        if (e.retryAfter) res.setHeader('Retry-After', String(e.retryAfter));
        const corpo = { erro: e.message };
        if (e.campos) corpo.campos = e.campos;
        if (e.codigo) corpo.codigo = e.codigo;
        if (caminho.startsWith('/api/') || caminho.startsWith('/uploads/')) return enviarJson(res, e.status, corpo);
        res.writeHead(e.status, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(e.message);
      }
      log.error?.('[erro]', req.method, caminho, e);
      enviarJson(res, 500, { erro: 'Erro interno. Tente novamente em instantes.' });
    }
  }

  // ---------- Manutenção ----------
  async function manutencao() {
    const agora = nowIso();
    db.prepare('DELETE FROM sessoes WHERE expira_em < ?').run(agora);
    db.prepare('DELETE FROM tokens_email WHERE expira_em < ?').run(new Date(Date.now() - 7 * 86_400_000).toISOString());
    d.rotinaExpiracao();
    const velhas = db.prepare('SELECT id, arquivo FROM item_fotos WHERE item_id IS NULL AND criado_em < ?').all(new Date(Date.now() - 86_400_000).toISOString());
    for (const f of velhas) {
      await unlink(path.join(config.uploadDir, f.arquivo)).catch(() => {});
      db.prepare('DELETE FROM item_fotos WHERE id = ?').run(f.id);
    }
    for (const email of config.adminEmails) db.prepare("UPDATE usuarios SET papel='admin' WHERE email=? AND verificado_em IS NOT NULL").run(email);
  }
  manutencao().catch((e) => log.error?.('[manutenção]', e));
  const timer = setInterval(() => manutencao().catch((e) => log.error?.('[manutenção]', e)), 6 * 3_600_000);
  timer.unref();

  const server = createServer((req, res) => { tratar(req, res); });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return {
    server, db, config, mailer, d,
    manutencao,
    close: () => new Promise((resolve) => { clearInterval(timer); server.close(() => { db.close(); resolve(); }); server.closeAllConnections?.(); }),
  };
}
