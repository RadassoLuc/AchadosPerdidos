import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { criarApp } from '../src/app.js';

const silencio = process.env.TEST_VERBOSE ? console : { info() {}, error() {}, warn() {}, log() {} };

export async function iniciar(extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ap-test-'));
  const app = criarApp({ DATA_DIR: dir, RATE_LIMIT_OFF: 'true', APP_URL: 'http://localhost', ...extra }, silencio);
  const emails = [];
  app.mailer.enviar = async (m) => { emails.push(m); return true; };
  await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  return { app, base, emails, fechar: () => app.close() };
}

/** Cliente HTTP com cookie e CSRF. */
export function cliente(base) {
  let cookie = '';
  let csrf = '';
  const c = {
    async req(metodo, url, corpo, { headers = {}, raw } = {}) {
      const h = { ...headers };
      if (cookie) h.cookie = cookie;
      if (csrf && metodo !== 'GET') h['x-csrf-token'] = csrf;
      let body;
      if (raw) body = raw;
      else if (corpo !== undefined) { h['content-type'] = 'application/json'; body = JSON.stringify(corpo); }
      const res = await fetch(base + url, { method: metodo, headers: h, body, redirect: 'manual' });
      const set = res.headers.getSetCookie?.() || [];
      for (const s of set) { const par = s.split(';')[0]; if (par.endsWith('=')) cookie = ''; else cookie = par; }
      const tipo = res.headers.get('content-type') || '';
      const dados = tipo.includes('json') ? await res.json() : tipo.startsWith('image/') ? Buffer.from(await res.arrayBuffer()) : await res.text();
      return { status: res.status, dados, headers: res.headers };
    },
    get: (u, o) => c.req('GET', u, undefined, o),
    post: (u, b, o) => c.req('POST', u, b ?? {}, o),
    patch: (u, b, o) => c.req('PATCH', u, b ?? {}, o),
    setCsrf: (v) => { csrf = v; },
    semCsrf: () => { csrf = ''; },
    get csrf() { return csrf; },
  };
  return c;
}

let contador = 0;
/** Cadastra, confirma e entra. Retorna o cliente autenticado. */
export async function usuarioLogado(ctx, { nome = 'Maria Souza', papel = 'aluno', dominio = 'aluno.uepa.br' } = {}) {
  const n = ++contador;
  const email = `user${n}@${dominio}`;
  const senha = 'SenhaForte2026x';
  const c = cliente(ctx.base);
  let r = await c.post('/api/auth/cadastro', { nome, email, senha, aceite: true });
  if (r.status !== 202) throw new Error('cadastro falhou: ' + JSON.stringify(r.dados));
  const mail = ctx.emails.filter((m) => m.to === email).at(-1);
  const token = mail.text.match(/token=([\w-]+)/)[1];
  r = await c.post('/api/auth/verificar', { token });
  if (r.status !== 200) throw new Error('verificar falhou');
  if (papel !== 'aluno') ctx.app.db.prepare('UPDATE usuarios SET papel=? WHERE email=?').run(papel, email);
  r = await c.post('/api/auth/entrar', { email, senha });
  if (r.status !== 200) throw new Error('login falhou: ' + JSON.stringify(r.dados));
  c.setCsrf(r.dados.csrf);
  c.email = email;
  c.senha = senha;
  c.id = r.dados.usuario.id;
  return c;
}

/** JPEG sintético com APP1 (EXIF falso contendo "GPSSECRET") e dimensões 64x64. */
export function jpegDeTeste({ w = 64, h = 64, comExif = true } = {}) {
  const seg = (m, corpo) => Buffer.concat([Buffer.from([0xff, m]), Buffer.from([(corpo.length + 2) >> 8, (corpo.length + 2) & 255]), corpo]);
  const exif = seg(0xe1, Buffer.from('Exif\0\0GPSSECRET-lat-1.23'));
  const jfif = seg(0xe0, Buffer.from('JFIF\0\x01\x01\x00\x00\x01\x00\x01\x00\x00'));
  const sof = seg(0xc0, Buffer.from([8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]));
  const sos = seg(0xda, Buffer.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]));
  return Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, comExif ? exif : Buffer.alloc(0), sof, sos, Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]), Buffer.from([0xff, 0xd9])]);
}

export function agoraBelem(deslocMs = 0) {
  const d = new Date(Date.now() + deslocMs - 3 * 3600_000);
  return d.toISOString().slice(0, 16); // sem fuso => Belém
}
