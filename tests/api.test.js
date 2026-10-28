import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { agoraBelem, cliente, iniciar, jpegDeTeste, usuarioLogado } from './helpers.js';
import { diasEntre, faixaDias, parseOcorrido } from '../src/lib/dates.js';
import { limparJpeg } from '../src/lib/jpeg.js';
import { criarMailer } from '../src/lib/mailer.js';

const ctx = await iniciar();
test.after(() => ctx.fechar());

async function novoAchado(c, extra = {}) {
  const up = await c.req('POST', '/api/uploads', undefined, { raw: jpegDeTeste(), headers: { 'content-type': 'image/jpeg' } });
  assert.equal(up.status, 201, JSON.stringify(up.dados));
  const r = await c.post('/api/itens', {
    tipo: 'achado', titulo: 'Garrafa azul', descricao: 'Encontrada perto da biblioteca', categoria_id: 1, local_id: 2,
    ocorrido_em: agoraBelem(-3600_000), fotos: [up.dados.id], ...extra,
  });
  return { r, up };
}

test('datas: dias de calendário em Belém e faixas', () => {
  const agora = new Date('2026-10-27T15:00:00Z'); // 12:00 em Belém
  assert.equal(diasEntre('2026-10-27T03:30:00Z', agora), 0); // 00:30 em Belém, mesmo dia
  assert.equal(diasEntre('2026-10-27T02:30:00Z', agora), 1); // 23:30 de 26/10 em Belém
  assert.equal(diasEntre('2026-10-17T15:00:00Z', agora), 10);
  assert.equal(faixaDias(7), 'recente'); assert.equal(faixaDias(8), 'atencao');
  assert.equal(faixaDias(31), 'alerta'); assert.equal(faixaDias(61), 'critico');
  assert.equal(parseOcorrido('2026-10-27T10:00').toISOString(), '2026-10-27T13:00:00.000Z');
  assert.equal(parseOcorrido('lixo'), null);
});

test('jpeg: remove EXIF/GPS e rejeita arquivos inválidos', () => {
  const { buffer } = limparJpeg(jpegDeTeste());
  assert.ok(!buffer.includes('GPSSECRET'));
  assert.ok(buffer.includes('JFIF'));
  assert.throws(() => limparJpeg(Buffer.from('<?php echo 1; ?>')), /JPEG|inválida/);
  assert.throws(() => limparJpeg(jpegDeTeste({ w: 8, h: 8 })), /pequena/);
});

test('cadastro: domínio, senha e confirmação de e-mail', async () => {
  const c = cliente(ctx.base);
  let r = await c.post('/api/auth/cadastro', { nome: 'Ana Lima', email: 'ana@gmail.com', senha: 'SenhaForte2026x', aceite: true });
  assert.equal(r.status, 422); assert.ok(r.dados.campos.email);
  r = await c.post('/api/auth/cadastro', { nome: 'Ana Lima', email: 'ana@aluno.uepa.br', senha: '12345', aceite: true });
  assert.equal(r.status, 422); assert.ok(r.dados.campos.senha);
  r = await c.post('/api/auth/cadastro', { nome: 'Ana Lima', email: 'ana@aluno.uepa.br', senha: 'SenhaForte2026x', aceite: true });
  assert.equal(r.status, 202);
  r = await c.post('/api/auth/entrar', { email: 'ana@aluno.uepa.br', senha: 'SenhaForte2026x' });
  assert.equal(r.status, 403); assert.equal(r.dados.codigo, 'nao_verificado');
  const token = ctx.emails.at(-1).text.match(/token=([\w-]+)/)[1];
  assert.equal((await c.post('/api/auth/verificar', { token })).status, 200);
  assert.equal((await c.post('/api/auth/verificar', { token })).status, 400, 'token é de uso único');
  r = await c.post('/api/auth/entrar', { email: 'ana@aluno.uepa.br', senha: 'errada-errada1' });
  assert.equal(r.status, 401); assert.equal(r.dados.erro, 'E-mail ou senha incorretos.');
  r = await c.post('/api/auth/entrar', { email: 'naoexiste@aluno.uepa.br', senha: 'errada-errada1' });
  assert.equal(r.dados.erro, 'E-mail ou senha incorretos.', 'mensagem igual para e-mail inexistente');
  // cadastro repetido não revela que o e-mail existe
  r = await c.post('/api/auth/cadastro', { nome: 'Ana Lima', email: 'ana@aluno.uepa.br', senha: 'SenhaForte2026x', aceite: true });
  assert.equal(r.status, 202);
  const salvo = ctx.app.db.prepare('SELECT senha_hash FROM usuarios WHERE email=?').get('ana@aluno.uepa.br');
  assert.ok(salvo.senha_hash.startsWith('scrypt$'));
});

test('bloqueio temporário após 5 senhas erradas', async () => {
  const u = await usuarioLogado(ctx);
  const c = cliente(ctx.base);
  for (let i = 0; i < 5; i++) await c.post('/api/auth/entrar', { email: u.email, senha: 'errada-errada1' });
  const r = await c.post('/api/auth/entrar', { email: u.email, senha: u.senha });
  assert.equal(r.status, 429, 'mesmo com a senha certa, a conta fica travada por alguns minutos');
});

test('autenticação e CSRF', async () => {
  const anon = cliente(ctx.base);
  assert.equal((await anon.get('/api/itens')).status, 401);
  assert.equal((await anon.get('/uploads/' + 'a'.repeat(32) + '.jpg')).status, 401);
  assert.equal((await anon.get('/api/publico/resumo')).status, 200);
  const u = await usuarioLogado(ctx);
  const csrf = u.csrf;
  u.semCsrf();
  const r = await u.post('/api/itens', { tipo: 'perdido' });
  assert.equal(r.status, 403); assert.equal(r.dados.codigo, 'csrf');
  u.setCsrf(csrf);
  const r2 = await u.post('/api/itens', { tipo: 'perdido' }, { headers: { origin: 'https://site-malicioso.com' } });
  assert.equal(r2.status, 403);
});

test('cabeçalhos de segurança e arquivos estáticos', async () => {
  const c = cliente(ctx.base);
  const r = await c.get('/');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  for (const p of ['/%2e%2e/server.js', '/..%2f..%2fetc/passwd', '/.env', '/src/app.js', '/data/achados.db']) {
    assert.equal((await c.get(p)).status, 404, p);
  }
});

test('achado: ciclo completo até a devolução pelo Protocolo', async () => {
  const dono = await usuarioLogado(ctx, { nome: 'Pedro Achador' });
  const protocolo = await usuarioLogado(ctx, { nome: 'Servidor Protocolo', papel: 'protocolo', dominio: 'uepa.br' });
  const reclamante = await usuarioLogado(ctx, { nome: 'Joana Dona' });

  const { r } = await novoAchado(dono);
  assert.equal(r.status, 201, JSON.stringify(r.dados));
  assert.equal(r.dados.status, 'aguardando_entrega');
  assert.match(r.dados.codigo, /^AP-\d{4}-\d{4}$/);
  assert.equal(r.dados.dias, 0);
  const id = r.dados.id;

  // não pode reivindicar antes de estar no Protocolo
  assert.equal((await reclamante.post(`/api/itens/${id}/reivindicar`, { prova: 'Tem um adesivo da UEPA na tampa' })).status, 409);
  // aluno não opera o painel do Protocolo
  assert.equal((await reclamante.get('/api/protocolo/painel')).status, 403);
  assert.equal((await reclamante.post(`/api/itens/${id}/recebido`, {})).status, 403);

  assert.equal((await protocolo.post(`/api/itens/${id}/recebido`, { local_guarda: 'Armário 2' })).status, 200);
  let det = (await reclamante.get(`/api/itens/${id}`)).dados;
  assert.equal(det.status, 'no_protocolo'); assert.equal(det.local_guarda, 'Armário 2');
  assert.ok(!JSON.stringify(det).includes('@aluno.uepa.br'), 'e-mail do autor não aparece para outros alunos');
  assert.equal(det.fotos.length, 1);
  const foto = await reclamante.get(det.fotos[0]);
  assert.equal(foto.status, 200); assert.ok(!foto.dados.includes('GPSSECRET'));

  // o autor não reivindica o próprio achado; o outro aluno reivindica
  assert.equal((await dono.post(`/api/itens/${id}/reivindicar`, { prova: 'Tem um adesivo da UEPA na tampa' })).status, 409);
  assert.equal((await reclamante.post(`/api/itens/${id}/reivindicar`, { prova: 'curta' })).status, 422);
  assert.equal((await reclamante.post(`/api/itens/${id}/reivindicar`, { prova: 'Tem um adesivo da UEPA na tampa' })).status, 201);
  assert.equal((await reclamante.post(`/api/itens/${id}/reivindicar`, { prova: 'Tem um adesivo da UEPA na tampa' })).status, 409, 'duplicada');
  det = (await protocolo.get(`/api/itens/${id}`)).dados;
  assert.equal(det.status, 'em_reclamacao'); assert.equal(det.reivindicacoes.length, 1);

  const painel = (await protocolo.get('/api/protocolo/painel')).dados;
  assert.ok(painel.reivindicacoes.some((x) => x.item_id === id));

  assert.equal((await protocolo.post(`/api/reivindicacoes/${det.reivindicacoes[0].id}/decidir`, { decisao: 'aprovar' })).status, 200);
  assert.match(ctx.emails.at(-1).subject, /aprovada/);

  const bad = await protocolo.post(`/api/itens/${id}/entregar`, { recebedor_nome: 'Jo', recebedor_documento: '1' });
  assert.equal(bad.status, 422);
  const ok = await protocolo.post(`/api/itens/${id}/entregar`, { recebedor_nome: 'Joana Dona', recebedor_documento: '202012345', reivindicacao_id: det.reivindicacoes[0].id });
  assert.equal(ok.status, 200, JSON.stringify(ok.dados));
  det = (await protocolo.get(`/api/itens/${id}`)).dados;
  assert.equal(det.status, 'devolvido');
  assert.equal(det.entrega.recebedor_nome, 'Joana Dona');
  assert.deepEqual(det.historico.map((h) => h.para), ['aguardando_entrega', 'no_protocolo', 'em_reclamacao', 'devolvido']);
  const visto = (await dono.get(`/api/itens/${id}`)).dados;
  assert.equal(visto.entrega, undefined, 'dados de quem retirou ficam só com a equipe');
  // item encerrado não volta atrás
  assert.equal((await protocolo.post(`/api/itens/${id}/recebido`, {})).status, 409);
  // histórico é imutável no banco
  assert.throws(() => ctx.app.db.prepare('DELETE FROM item_historico').run(), /imutável/);
});

test('validações do cadastro de item', async () => {
  const u = await usuarioLogado(ctx);
  const base = { tipo: 'perdido', titulo: 'Carteira preta', descricao: 'Carteira de couro preta com documentos', categoria_id: 3, local_id: 1, ocorrido_em: agoraBelem(-60_000) };
  assert.equal((await u.post('/api/itens', { ...base, titulo: 'ab' })).status, 422);
  assert.equal((await u.post('/api/itens', { ...base, ocorrido_em: agoraBelem(3 * 86400_000) })).status, 422, 'futuro');
  assert.equal((await u.post('/api/itens', { ...base, ocorrido_em: '2020-01-01T10:00' })).status, 422, 'antigo demais');
  assert.equal((await u.post('/api/itens', { ...base, categoria_id: 999 })).status, 422);
  assert.equal((await u.post('/api/itens', { ...base, descricao: 'curta' })).status, 422);
  assert.equal((await u.post('/api/itens', { ...base, tipo: 'achado', fotos: [] })).status, 422, 'achado exige foto');
  assert.equal((await u.post('/api/itens', { ...base, fotos: [99999] })).status, 422, 'foto de outra pessoa/inexistente');
  const ok = await u.post('/api/itens', base);
  assert.equal(ok.status, 201);
  assert.equal(ok.dados.status, 'aberto');
  // texto com HTML é guardado como texto (a tela escapa na saída)
  const xss = await u.post('/api/itens', { ...base, titulo: '<img src=x onerror=alert(1)>' });
  assert.equal(xss.status, 201); assert.equal(xss.dados.titulo, '<img src=x onerror=alert(1)>');
  // campos extras (ex.: status, autor_id) são ignorados
  const mass = await u.post('/api/itens', { ...base, status: 'devolvido', autor_id: 1 });
  assert.equal(mass.dados.status, 'aberto');
});

test('perdido: aviso ao dono, e-mail do autor protegido, busca com aspas é segura', async () => {
  const dono = await usuarioLogado(ctx, { nome: 'Carlos Perdeu' });
  const outro = await usuarioLogado(ctx, { nome: 'Lia Achou' });
  const r = await dono.post('/api/itens', { tipo: 'perdido', titulo: 'Óculos de grau', descricao: 'Armação redonda marrom', categoria_id: 8, local_id: 1, ocorrido_em: agoraBelem(-86400_000 * 3) });
  assert.equal(r.dados.dias, 3); assert.equal(r.dados.faixa, 'recente');
  assert.equal((await dono.post(`/api/itens/${r.dados.id}/avisos`, { mensagem: 'achei sim aqui' })).status, 409);
  assert.equal((await outro.post(`/api/itens/${r.dados.id}/avisos`, { mensagem: 'Achei na sala 4, está comigo' })).status, 201);
  assert.match(ctx.emails.at(-1).to, new RegExp(dono.email.replace('.', '\\.')));
  assert.equal((await outro.get(`/api/itens/${r.dados.id}`)).dados.avisos, undefined);
  assert.equal((await dono.get(`/api/itens/${r.dados.id}`)).dados.avisos.length, 1);
  const busca = await outro.get('/api/itens?q=' + encodeURIComponent("' OR 1=1 --"));
  assert.equal(busca.status, 200); assert.equal(busca.dados.total, 0);
  const lista = await outro.get('/api/itens?tipo=perdido&q=%C3%B3culos');
  assert.ok(lista.dados.itens.some((i) => i.id === r.dados.id));
  assert.equal((await outro.post(`/api/itens/${r.dados.id}/encontrado`, {})).status, 403);
  assert.equal((await dono.post(`/api/itens/${r.dados.id}/encontrado`, {})).status, 200);
});

test('banco: restrições impedem estados inválidos mesmo fora da API', () => {
  const db = ctx.app.db;
  const u = db.prepare('SELECT id FROM usuarios LIMIT 1').get().id;
  const ins = (tipo, status) => db.prepare("INSERT INTO itens (tipo,titulo,categoria_id,local_id,ocorrido_em,status,autor_id) VALUES (?,?,1,1,'2026-10-01T10:00:00.000Z',?,?)").run(tipo, 'Teste item', status, u);
  assert.throws(() => ins('perdido', 'no_protocolo'), /CHECK/);
  assert.throws(() => ins('achado', 'aberto'), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO usuarios (nome,email,senha_hash,aceite_termos_em) VALUES ('Fulano Tal','Maiuscula@X.com','x','2026-01-01T00:00:00Z')").run(), /CHECK/);
  assert.throws(() => db.prepare("INSERT INTO itens (tipo,titulo,categoria_id,local_id,ocorrido_em,status,autor_id) VALUES ('achado','Teste item',999,1,'2026-10-01T10:00:00.000Z','aguardando_entrega',?)").run(u), /FOREIGN/);
});

test('destinação só depois do prazo de retenção', async () => {
  const dono = await usuarioLogado(ctx);
  const prot = await usuarioLogado(ctx, { papel: 'protocolo', dominio: 'uepa.br' });
  const { r } = await novoAchado(dono);
  await prot.post(`/api/itens/${r.dados.id}/recebido`, {});
  assert.equal((await prot.post(`/api/itens/${r.dados.id}/destinar`, { destino: 'doacao', nota: 'Doar para instituição' })).status, 409);
  ctx.app.db.prepare("UPDATE itens SET ocorrido_em=? WHERE id=?").run(new Date(Date.now() - 100 * 86400_000).toISOString(), r.dados.id);
  const lista = (await prot.get('/api/protocolo/painel')).dados;
  assert.equal(lista.guardados.find((i) => i.id === r.dados.id).elegivel_destino, true);
  assert.equal((await prot.post(`/api/itens/${r.dados.id}/destinar`, { destino: 'doacao', nota: 'Doar para instituição' })).status, 200);
});

test('admin: papéis, denúncia e remoção; aluno não acessa', async () => {
  const admin = await usuarioLogado(ctx, { papel: 'admin', dominio: 'uepa.br' });
  const aluno = await usuarioLogado(ctx);
  const outro = await usuarioLogado(ctx);
  assert.equal((await aluno.get('/api/admin/usuarios')).status, 403);
  const { r } = await novoAchado(outro);
  assert.equal((await aluno.post(`/api/itens/${r.dados.id}/denunciar`, { motivo: 'Parece anúncio falso' })).status, 201);
  assert.equal((await aluno.post(`/api/itens/${r.dados.id}/denunciar`, { motivo: 'Parece anúncio falso' })).status, 409);
  const den = (await admin.get('/api/admin/denuncias')).dados.denuncias[0];
  assert.equal((await admin.post(`/api/admin/denuncias/${den.id}/resolver`, { acao: 'remover', nota: 'Falso' })).status, 200);
  assert.equal((await aluno.get(`/api/itens/${r.dados.id}`)).status, 404, 'removido some para os demais alunos');
  assert.equal((await admin.patch(`/api/admin/usuarios/${admin.id}`, { papel: 'aluno' })).status, 409, 'não rebaixa a si mesmo');
  assert.equal((await admin.patch(`/api/admin/usuarios/${aluno.id}`, { bloqueado: true })).status, 200);
  assert.equal((await aluno.get('/api/auth/eu')).dados.usuario, null, 'sessão do bloqueado cai');
  const aud = (await admin.get('/api/admin/auditoria')).dados.registros;
  assert.ok(aud.some((a) => a.acao === 'admin.usuario_alterado'));
});

test('LGPD: excluir conta anonimiza os dados pessoais', async () => {
  const u = await usuarioLogado(ctx, { nome: 'Rita Apagar' });
  assert.equal((await u.post('/api/auth/excluir-conta', { senha: 'errada' })).status, 422);
  assert.equal((await u.post('/api/auth/excluir-conta', { senha: u.senha })).status, 200);
  const l = ctx.app.db.prepare('SELECT nome, email, matricula, bloqueado FROM usuarios WHERE id=?').get(u.id);
  assert.equal(l.nome, 'Usuário removido'); assert.match(l.email, /excluido\.invalid$/); assert.equal(l.bloqueado, 1);
});

test('recuperação de senha invalida sessões antigas', async () => {
  const u = await usuarioLogado(ctx);
  const anon = cliente(ctx.base);
  assert.equal((await anon.post('/api/auth/esqueci', { email: 'ninguem@aluno.uepa.br' })).status, 202);
  assert.equal((await anon.post('/api/auth/esqueci', { email: u.email })).status, 202);
  const token = ctx.emails.at(-1).text.match(/token=([\w-]+)/)[1];
  assert.equal((await anon.post('/api/auth/redefinir', { token, senha: 'curta' })).status, 422);
  assert.equal((await anon.post('/api/auth/redefinir', { token, senha: 'OutraSenhaBoa2026' })).status, 200);
  assert.equal((await u.get('/api/auth/eu')).dados.usuario, null);
  assert.equal((await anon.post('/api/auth/entrar', { email: u.email, senha: 'OutraSenhaBoa2026' })).status, 200);
});

test('upload recusa arquivo que não é JPEG e corpo grande demais', async () => {
  const u = await usuarioLogado(ctx);
  const falso = await u.req('POST', '/api/uploads', undefined, { raw: Buffer.from('<?php system($_GET[0]); ?>'), headers: { 'content-type': 'image/jpeg' } });
  assert.equal(falso.status, 415);
  const png = await u.req('POST', '/api/uploads', undefined, { raw: jpegDeTeste(), headers: { 'content-type': 'image/png' } });
  assert.equal(png.status, 415);
  const grande = await u.req('POST', '/api/uploads', undefined, { raw: Buffer.alloc(3 * 1024 * 1024, 1), headers: { 'content-type': 'image/jpeg' } });
  assert.equal(grande.status, 413);
});

test('e-mail via SMTP (servidor falso, com autenticação)', async () => {
  const recebido = [];
  const srv = net.createServer((s) => {
    s.write('220 fake\r\n');
    let buf = '', dados = false, corpo = '', auth = 0;
    s.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const l = buf.slice(0, i); buf = buf.slice(i + 2);
        if (dados) { if (l === '.') { dados = false; recebido.push(corpo); s.write('250 ok\r\n'); } else corpo += l + '\n'; continue; }
        recebido.push(l);
        if (auth === 1) { auth = 2; s.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (auth === 2) { auth = 0; s.write('235 ok\r\n'); }
        else if (l.startsWith('EHLO')) s.write('250 ok\r\n');
        else if (l === 'AUTH LOGIN') { auth = 1; s.write('334 VXNlcm5hbWU6\r\n'); }
        else if (l.startsWith('MAIL') || l.startsWith('RCPT')) s.write('250 ok\r\n');
        else if (l === 'DATA') { dados = true; s.write('354 go\r\n'); }
        else if (l === 'QUIT') { s.write('221 bye\r\n'); s.end(); }
      }
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const mailer = criarMailer({ smtp: { host: '127.0.0.1', port: srv.address().port, secure: 'none', user: 'u', pass: 'p' }, mailFrom: 'Teste <t@uepa.br>' }, { error() {}, info() {} });
  const ok = await mailer.enviar({ to: 'aluno@aluno.uepa.br\r\nBcc: x@y.z', subject: 'Olá ção', text: 'Corpo\n.linha com ponto' });
  srv.close();
  assert.equal(ok, true);
  assert.ok(recebido.some((l) => l.startsWith('RCPT TO:<aluno@aluno.uepa.br Bcc')), 'quebras de linha removidas do destinatário');
  assert.ok(!recebido.some((l) => l === 'Bcc: x@y.z'), 'sem injeção de cabeçalho');
});
