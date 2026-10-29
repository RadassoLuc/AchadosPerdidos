import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cliente, iniciar } from './helpers.js';

let claims = {};
const fake = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ id_token: `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y` })); }); });
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
const ctx = await iniciar({ PASSWORD_AUTH: 'false', GOOGLE_CLIENT_ID: 'cli', GOOGLE_CLIENT_SECRET: 's', GOOGLE_TOKEN_URL: `http://127.0.0.1:${fake.address().port}/t`, GOOGLE_AUTH_URL: 'https://g.example/a' });
test.after(async () => { await ctx.fechar(); fake.close(); });

test('com PASSWORD_AUTH=false só o Google entra; exclusão de conta pede confirmação digitada', async () => {
  const c = cliente(ctx.base);
  assert.equal((await c.get('/api/meta')).dados.senha, false);
  for (const rota of ['cadastro', 'entrar', 'esqueci', 'redefinir', 'verificar']) assert.equal((await c.post(`/api/auth/${rota}`, {})).status, 404, rota);

  const ini = await fetch(`${ctx.base}/api/auth/google`, { redirect: 'manual' });
  const url = new URL(ini.headers.get('location'));
  claims = { iss: 'accounts.google.com', aud: 'cli', exp: Math.floor(Date.now() / 1000) + 600, nonce: url.searchParams.get('nonce'), email: 'solo@aluno.uepa.br', email_verified: true, name: 'Solo Google' };
  const cookie = ini.headers.getSetCookie().map((s) => s.split(';')[0]).join('; ');
  const cb = await fetch(`${ctx.base}/api/auth/google/callback?code=1&state=${url.searchParams.get('state')}`, { redirect: 'manual', headers: { cookie } });
  const sid = cb.headers.getSetCookie().map((s) => s.split(';')[0]).find((s) => s.startsWith('ap_sid='));
  assert.ok(sid);
  const u = cliente(ctx.base);
  const eu = await (await fetch(`${ctx.base}/api/auth/eu`, { headers: { cookie: sid } })).json();
  assert.equal(eu.usuario.tem_senha, false);
  const headers = { cookie: sid, 'x-csrf-token': eu.csrf, 'content-type': 'application/json' };
  const post = (rota, corpo) => fetch(`${ctx.base}${rota}`, { method: 'POST', headers, body: JSON.stringify(corpo) });
  assert.equal((await post('/api/auth/senha', { atual: 'x', nova: 'y' })).status, 409);
  assert.equal((await post('/api/auth/excluir-conta', { confirmacao: 'talvez' })).status, 422);
  assert.equal((await post('/api/auth/excluir-conta', { confirmacao: 'EXCLUIR' })).status, 200);
  assert.match(ctx.app.db.prepare('SELECT email FROM usuarios WHERE id=?').get(eu.usuario.id).email, /excluido\.invalid$/);
  void u;
});
