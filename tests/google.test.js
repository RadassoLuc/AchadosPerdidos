import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cliente, iniciar } from './helpers.js';

// Servidor "Google" falso: devolve um id_token com as claims que o teste definir.
let claims = {};
let ultimoCorpo = null;
const fake = http.createServer((req, res) => {
  let b = '';
  req.on('data', (c) => (b += c));
  req.on('end', () => {
    ultimoCorpo = new URLSearchParams(b);
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id_token: `x.${payload}.y` }));
  });
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));

const CLIENT = 'cliente-teste.apps.googleusercontent.com';
const ctx = await iniciar({
  GOOGLE_CLIENT_ID: CLIENT, GOOGLE_CLIENT_SECRET: 'segredo', GOOGLE_TOKEN_URL: `http://127.0.0.1:${fake.address().port}/token`,
  GOOGLE_AUTH_URL: 'https://accounts.example/auth', ADMIN_EMAILS: 'chefe@uepa.br',
});
test.after(async () => { await ctx.fechar(); fake.close(); });

/** Percorre o fluxo inteiro: /api/auth/google -> callback. Retorna { c, loc } */
async function fluxo(extraClaims = {}, { adulterarState = false } = {}) {
  const c = cliente(ctx.base);
  const ini = await fetch(`${ctx.base}/api/auth/google`, { redirect: 'manual' });
  assert.equal(ini.status, 302);
  const url = new URL(ini.headers.get('location'));
  assert.equal(url.origin + url.pathname, 'https://accounts.example/auth');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('hd'), '*');
  const state = url.searchParams.get('state');
  const cookie = ini.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
  claims = { iss: 'https://accounts.google.com', aud: CLIENT, exp: Math.floor(Date.now() / 1000) + 600, nonce: url.searchParams.get('nonce'), email: 'ana.google@aluno.uepa.br', email_verified: true, name: 'Ana Google', ...extraClaims };
  const cb = await fetch(`${ctx.base}/api/auth/google/callback?code=abc&state=${adulterarState ? 'forjado' : state}`, { redirect: 'manual', headers: { cookie } });
  const sess = cb.headers.getSetCookie().map((s) => s.split(';')[0]).find((s) => s.startsWith('ap_sid='));
  return { status: cb.status, loc: cb.headers.get('location'), sessao: sess, cliente: c, desafio: url.searchParams.get('code_challenge') };
}
async function eu(sessao) {
  const r = await fetch(`${ctx.base}/api/auth/eu`, { headers: { cookie: sessao } });
  return (await r.json()).usuario;
}

test('login Google: conta da UEPA entra, é criada já verificada e sem senha utilizável', async () => {
  const r = await fluxo();
  assert.equal(r.status, 302); assert.equal(r.loc, '/#/itens');
  const u = await eu(r.sessao);
  assert.equal(u.email, 'ana.google@aluno.uepa.br'); assert.equal(u.papel, 'aluno');
  assert.ok(ultimoCorpo.get('code_verifier'), 'PKCE: verifier enviado na troca do código');
  assert.equal(ultimoCorpo.get('client_secret'), 'segredo');
  const linha = ctx.app.db.prepare('SELECT senha_hash, verificado_em FROM usuarios WHERE email=?').get('ana.google@aluno.uepa.br');
  assert.ok(linha.verificado_em); assert.equal(linha.senha_hash, 'google$sem-senha');
  // não dá para entrar por senha numa conta criada pelo Google
  const c = cliente(ctx.base);
  assert.equal((await c.post('/api/auth/entrar', { email: 'ana.google@aluno.uepa.br', senha: 'google$sem-senha' })).status, 401);
  // segundo login reaproveita o mesmo usuário
  await fluxo();
  assert.equal(ctx.app.db.prepare('SELECT count(*) n FROM usuarios WHERE email=?').get('ana.google@aluno.uepa.br').n, 1);
});

test('login Google: e-mail em ADMIN_EMAILS vira admin', async () => {
  const r = await fluxo({ email: 'chefe@uepa.br', name: 'Chefe' });
  assert.equal((await eu(r.sessao)).papel, 'admin');
});

test('login Google: recusa domínio fora da UEPA, e-mail não verificado e claims inválidas', async () => {
  for (const [extra, motivo] of [
    [{ email: 'fulano@gmail.com' }, 'dominio'],
    [{ email: 'fulano@uepa.br.evil.com' }, 'dominio'],
    [{ email_verified: false }, 'google_falhou'],
    [{ aud: 'outro-cliente' }, 'google_falhou'],
    [{ iss: 'https://evil.example' }, 'google_falhou'],
    [{ exp: 10 }, 'google_falhou'],
    [{ nonce: 'errado' }, 'google_falhou'],
  ]) {
    const r = await fluxo(extra);
    assert.equal(r.status, 302);
    assert.equal(r.loc, `/#/entrar?erro=${motivo}`, JSON.stringify(extra));
    assert.equal(r.sessao, undefined, 'não cria sessão');
  }
});

test('login Google: state forjado ou reutilizado é recusado; usuário bloqueado não entra', async () => {
  assert.equal((await fluxo({}, { adulterarState: true })).loc, '/#/entrar?erro=google_falhou');
  const sem = await fetch(`${ctx.base}/api/auth/google/callback?code=abc&state=qualquer`, { redirect: 'manual' });
  assert.equal(sem.headers.get('location'), '/#/entrar?erro=google_falhou');
  const negado = await fetch(`${ctx.base}/api/auth/google/callback?error=access_denied`, { redirect: 'manual' });
  assert.equal(negado.headers.get('location'), '/#/entrar?erro=google_falhou');
  ctx.app.db.prepare("UPDATE usuarios SET bloqueado=1 WHERE email='ana.google@aluno.uepa.br'").run();
  assert.equal((await fluxo()).loc, '/#/entrar?erro=suspensa');
});

test('meta informa Google/VLibras e a CSP libera só o necessário', async () => {
  const c = cliente(ctx.base);
  const r = await c.get('/api/meta');
  assert.equal(r.dados.google, true); assert.equal(r.dados.vlibras, true);
  const csp = r.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self' https:\/\/vlibras\.gov\.br https:\/\/\*\.vlibras\.gov\.br/);
  assert.match(csp, /connect-src[^;]*\*\.vlibras\.gov\.br/);
  assert.ok(!/script-src[^;]*'unsafe-inline'/.test(csp)); // scripts inline continuam proibidos
  assert.equal((await c.get('/api/saude')).dados.ok, true);
});
