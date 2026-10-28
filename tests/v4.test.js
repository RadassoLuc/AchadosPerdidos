import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { agoraBelem, iniciar, jpegDeTeste, usuarioLogado } from './helpers.js';

const ctx = await iniciar();
test.after(() => ctx.fechar());
const jpg = { raw: jpegDeTeste(), headers: { 'content-type': 'image/jpeg' } };

test('foto de perfil: envia, aparece para outros usuários logados, troca e remove', async () => {
  const ana = await usuarioLogado(ctx, { nome: 'Ana Lima' });
  const bia = await usuarioLogado(ctx, { nome: 'Bia Costa' });
  assert.equal((await ana.req('POST', '/api/eu/avatar', undefined, { raw: Buffer.from('nao e jpeg'), headers: { 'content-type': 'image/jpeg' } })).status, 415);
  assert.equal((await ana.req('POST', '/api/eu/avatar', undefined, { raw: jpegDeTeste(), headers: { 'content-type': 'image/png' } })).status, 415);
  const up = await ana.req('POST', '/api/eu/avatar', undefined, jpg);
  assert.equal(up.status, 200, JSON.stringify(up.dados));
  assert.match(up.dados.avatar, /^\/uploads\/[0-9a-f]{32}\.jpg$/);
  assert.equal((await bia.get(up.dados.avatar)).status, 200); // outro usuário logado vê
  assert.equal((await fetch(ctx.base + up.dados.avatar)).status, 401); // visitante não vê
  const eu = (await ana.get('/api/auth/eu')).dados.usuario;
  assert.equal(eu.avatar, up.dados.avatar);
  const arq = path.join(ctx.app.config.uploadDir, up.dados.avatar.split('/').pop());
  assert.ok(existsSync(arq));
  const up2 = await ana.req('POST', '/api/eu/avatar', undefined, jpg);
  assert.ok(!existsSync(arq), 'foto antiga deve ser apagada');
  assert.equal((await ana.req('DELETE', '/api/eu/avatar')).status, 200);
  assert.equal((await ana.get('/api/auth/eu')).dados.usuario.avatar, null);
  assert.ok(!existsSync(path.join(ctx.app.config.uploadDir, up2.dados.avatar.split('/').pop())));
});

test('avatar do autor aparece no item e do reivindicante para o Protocolo', async () => {
  const dono = await usuarioLogado(ctx, { nome: 'Carlos Dias' });
  await dono.req('POST', '/api/eu/avatar', undefined, jpg);
  const protocolo = await usuarioLogado(ctx, { nome: 'Pessoa Protocolo', papel: 'protocolo', dominio: 'uepa.br' });
  const up = await dono.req('POST', '/api/uploads', undefined, jpg);
  const it = await dono.post('/api/itens', { tipo: 'achado', titulo: 'Chave', descricao: '', categoria_id: 5, local_id: 1, ocorrido_em: agoraBelem(-3600_000), fotos: [up.dados.id] });
  assert.equal(it.status, 201, JSON.stringify(it.dados));
  const id = it.dados.id;
  assert.equal((await protocolo.post(`/api/itens/${id}/recebido`, { local_guarda: 'Armário 1' })).status, 200);
  const aluno = await usuarioLogado(ctx, { nome: 'Davi Alves' });
  await aluno.req('POST', '/api/eu/avatar', undefined, jpg);
  assert.equal((await aluno.post(`/api/itens/${id}/reivindicar`, { prova: 'Tem um chaveiro vermelho de coração' })).status, 201);
  const det = (await protocolo.get(`/api/itens/${id}`)).dados;
  assert.match(det.autor_avatar, /^\/uploads\//);
  assert.match(det.reivindicacoes[0].avatar, /^\/uploads\//);
  const painel = (await protocolo.get('/api/protocolo/painel')).dados;
  assert.match(painel.reivindicacoes.find((x) => x.item_id === id).avatar, /^\/uploads\//);
});

test('admin: renomeia/remove categoria e local (bloqueia se em uso) e apaga postagem de vez', async () => {
  const admin = await usuarioLogado(ctx, { nome: 'Admin Geral', papel: 'admin', dominio: 'uepa.br' });
  const protocolo = await usuarioLogado(ctx, { nome: 'Outro Protocolo', papel: 'protocolo', dominio: 'uepa.br' });
  const aluno = await usuarioLogado(ctx, { nome: 'Edu Brito' });
  const outra = await usuarioLogado(ctx, { nome: 'Fabi Rocha' });

  assert.equal((await admin.post('/api/admin/categorias', { nome: 'Teste Brincadeira' })).status, 201);
  const cat = ctx.app.db.prepare("SELECT id FROM categorias WHERE nome='Teste Brincadeira'").get().id;
  assert.equal((await admin.patch(`/api/admin/categorias/${cat}`, { nome: 'Categoria Renomeada' })).status, 200);
  assert.equal((await admin.patch('/api/admin/locais/1', { nome: 'Biblioteca' })).status, 409); // nome já existe
  assert.equal((await admin.patch('/api/admin/locais/1', { nome: 'Bloco A - Salas' })).status, 200);
  assert.equal((await aluno.req('DELETE', `/api/admin/categorias/${cat}`)).status, 403); // só admin
  assert.equal((await admin.req('DELETE', `/api/admin/categorias/${cat}`)).status, 200); // sem uso: remove
  assert.equal((await admin.req('DELETE', `/api/admin/categorias/${cat}`)).status, 404);

  // item com foto, reivindicação, aviso, denúncia e histórico
  const up = await aluno.req('POST', '/api/uploads', undefined, jpg);
  const it = await aluno.post('/api/itens', { tipo: 'achado', titulo: 'Item de trote', descricao: '', categoria_id: 2, local_id: 1, ocorrido_em: agoraBelem(-3600_000), fotos: [up.dados.id] });
  const id = it.dados.id;
  await protocolo.post(`/api/itens/${id}/recebido`, {});
  await outra.post(`/api/itens/${id}/reivindicar`, { prova: 'Descrevo detalhes que só o dono sabe' });
  await outra.post(`/api/itens/${id}/denunciar`, { motivo: 'Parece uma brincadeira' });
  const foto = path.join(ctx.app.config.uploadDir, up.dados.url.split('/').pop());
  assert.ok(existsSync(foto));
  // local em uso não pode ser removido
  assert.equal((await admin.req('DELETE', '/api/admin/locais/1')).status, 409);
  assert.equal((await aluno.post(`/api/admin/itens/${id}/apagar`, { motivo: 'quero apagar' })).status, 403);
  assert.equal((await admin.post(`/api/admin/itens/${id}/apagar`, { motivo: 'x' })).status, 422);
  const ap = await admin.post(`/api/admin/itens/${id}/apagar`, { motivo: 'Trote de aluno' });
  assert.equal(ap.status, 200, JSON.stringify(ap.dados));
  const db = ctx.app.db;
  for (const t of ['itens', 'item_fotos', 'item_historico', 'reivindicacoes', 'avisos', 'denuncias', 'entregas'])
    assert.equal(db.prepare(`SELECT count(*) n FROM ${t} WHERE ${t === 'itens' ? 'id' : 'item_id'}=?`).get(id).n, 0, t);
  assert.ok(!existsSync(foto), 'arquivo da foto removido');
  assert.equal((await admin.get(`/api/itens/${id}`)).status, 404);
  assert.match(db.prepare("SELECT detalhe FROM auditoria WHERE acao='admin.item_apagado' ORDER BY id DESC").get().detalhe, /Item de trote.*Trote de aluno/);
  // histórico segue imutável para itens que existem
  const outro = await aluno.post('/api/itens', { tipo: 'perdido', titulo: 'Perdi algo', descricao: 'Perdi uma capa azul de caderno', categoria_id: 2, local_id: 2, ocorrido_em: agoraBelem(-3600_000), fotos: [] });
  assert.equal(outro.status, 201, JSON.stringify(outro.dados));
  assert.throws(() => db.prepare('DELETE FROM item_historico WHERE item_id=?').run(outro.dados.id), /imutável/);
});
