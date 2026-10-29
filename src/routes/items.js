import { diasEntre, faixaDias, nowIso, parseOcorrido } from '../lib/dates.js';
import { HttpError, normalizarBusca, validar } from '../lib/validate.js';
import { transacao } from '../db.js';

const HORA = 3_600_000, DIA = 24 * HORA;

export const ROTULOS = {
  aguardando_entrega: 'Aguardando entrega ao Protocolo', no_protocolo: 'No Protocolo', em_reclamacao: 'Em reclamação',
  devolvido: 'Devolvido ao dono', destinado: 'Destinado', cancelado: 'Cancelado', removido: 'Removido',
  aberto: 'Procurando', encontrado: 'Encontrado', expirado: 'Expirado',
};
const FINAIS = new Set(['devolvido', 'destinado', 'cancelado', 'removido', 'encontrado', 'expirado']);
const TRANSICOES = {
  achado: {
    aguardando_entrega: ['no_protocolo', 'devolvido', 'cancelado', 'removido'],
    no_protocolo: ['em_reclamacao', 'devolvido', 'destinado', 'removido'],
    em_reclamacao: ['no_protocolo', 'devolvido', 'removido'],
  },
  perdido: { aberto: ['encontrado', 'cancelado', 'expirado', 'removido'] },
};
const ATIVOS_SQL = `((i.tipo='achado' AND i.status IN ('aguardando_entrega','no_protocolo','em_reclamacao')) OR (i.tipo='perdido' AND i.status='aberto'))`;

const nomeCurto = (n) => {
  const p = n.split(' ').filter(Boolean);
  return p.length > 1 && !n.startsWith('Usuário removido') ? `${p[0]} ${p[p.length - 1][0]}.` : n;
};
const ehEquipe = (u) => u && (u.papel === 'protocolo' || u.papel === 'admin');
const codigoDe = (id, criado) => `AP-${new Date(criado).getUTCFullYear()}-${String(id).padStart(4, '0')}`;

export default function itemRoutes(r, d) {
  const { db, config, mailer, limitador } = d;

  const SELECT = `SELECT i.*, c.nome categoria_nome, c.icone categoria_icone, l.nome local_nome, u.nome autor_nome, u.avatar autor_avatar,
    (SELECT arquivo FROM item_fotos f WHERE f.item_id = i.id ORDER BY f.ordem, f.id LIMIT 1) capa
    FROM itens i JOIN categorias c ON c.id = i.categoria_id JOIN locais l ON l.id = i.local_id JOIN usuarios u ON u.id = i.autor_id`;

  function resumo(i, viewer) {
    const fim = i.resolvido_em && FINAIS.has(i.status) ? new Date(i.resolvido_em) : new Date();
    const dias = diasEntre(i.ocorrido_em, fim);
    return {
      id: i.id, codigo: i.codigo, tipo: i.tipo, titulo: i.titulo, status: i.status, status_rotulo: ROTULOS[i.status],
      categoria: { id: i.categoria_id, nome: i.categoria_nome, icone: i.categoria_icone },
      local: { id: i.local_id, nome: i.local_nome }, local_detalhe: i.local_detalhe,
      ocorrido_em: i.ocorrido_em, dias, faixa: FINAIS.has(i.status) ? 'final' : faixaDias(dias),
      capa: i.capa ? `/uploads/${i.capa}` : null, autor: nomeCurto(i.autor_nome), autor_avatar: i.autor_avatar ? `/uploads/${i.autor_avatar}` : null,
      meu: !!viewer && viewer.id === i.autor_id, criado_em: i.criado_em,
      elegivel_destino: i.tipo === 'achado' && ['no_protocolo'].includes(i.status) && dias >= config.retentionDays,
    };
  }

  function carregar(id) {
    const i = db.prepare(`${SELECT} WHERE i.id = ?`).get(id);
    if (!i) throw new HttpError(404, 'Item não encontrado.');
    return i;
  }

  function historico(item, usuario, papel, de, para, nota = '') {
    db.prepare('INSERT INTO item_historico (item_id, de_status, para_status, usuario_id, papel, nota) VALUES (?,?,?,?,?,?)')
      .run(item.id, de, para, usuario?.id ?? null, papel, nota);
  }

  /** Única porta de entrada para mudar status: valida a transição e grava o histórico. */
  function mudarStatus(item, para, usuario, nota = '') {
    const permitidas = TRANSICOES[item.tipo][item.status] || [];
    if (!permitidas.includes(para)) throw new HttpError(409, `Não é possível passar de "${ROTULOS[item.status]}" para "${ROTULOS[para]}".`);
    const agora = nowIso();
    db.prepare('UPDATE itens SET status=?, atualizado_em=?, resolvido_em=? WHERE id=?')
      .run(para, agora, FINAIS.has(para) ? agora : null, item.id);
    historico(item, usuario, usuario?.papel ?? 'sistema', item.status, para, nota);
    item.status = para;
  }
  d.mudarStatus = mudarStatus;
  d.carregar = carregar;

  // ---------- Público (sem login): só números ----------
  r.add('GET', '/api/publico/resumo', async () => {
    const q = (sql) => db.prepare(sql).get().n;
    return {
      achados_ativos: q("SELECT count(*) n FROM itens WHERE tipo='achado' AND status IN ('aguardando_entrega','no_protocolo','em_reclamacao')"),
      perdidos_ativos: q("SELECT count(*) n FROM itens WHERE tipo='perdido' AND status='aberto'"),
      devolvidos: q("SELECT count(*) n FROM itens WHERE status IN ('devolvido','encontrado')"),
    };
  });

  r.add('GET', '/api/meta', async () => ({
    categorias: db.prepare('SELECT id, nome, icone FROM categorias WHERE ativo=1 ORDER BY id').all(),
    locais: db.prepare('SELECT id, nome FROM locais WHERE ativo=1 ORDER BY nome').all(),
    retencao_dias: config.retentionDays,
    google: !!config.google,
    senha: config.senhaAtiva,
    vlibras: config.vlibras,
  }));

  // ---------- Lista ----------
  r.add('GET', '/api/itens', async (ctx) => {
    const q = ctx.query;
    const where = [], args = [];
    const grupo = q.get('grupo') || 'ativos';
    if (grupo === 'ativos') where.push(ATIVOS_SQL);
    else if (grupo === 'resolvidos') where.push("i.status IN ('devolvido','encontrado','destinado')");
    else where.push("i.status NOT IN ('removido','cancelado')");
    if (['achado', 'perdido'].includes(q.get('tipo'))) { where.push('i.tipo = ?'); args.push(q.get('tipo')); }
    for (const [param, col] of [['categoria', 'i.categoria_id'], ['local', 'i.local_id']]) {
      if (/^\d+$/.test(q.get(param) || '')) { where.push(`${col} = ?`); args.push(Number(q.get(param))); }
    }
    const texto = normalizarBusca((q.get('q') || '').trim().slice(0, 60));
    if (texto) {
      where.push("i.busca LIKE ? ESCAPE '\\'");
      args.push(`%${texto.replace(/[\\%_]/g, '\\$&')}%`);
    }
    const porPagina = Math.min(Math.max(Number(q.get('por_pagina')) || 12, 1), 48);
    const pagina = Math.max(Number(q.get('pagina')) || 1, 1);
    const ordem = q.get('ordem') === 'mais_dias' ? 'i.ocorrido_em ASC' : 'i.ocorrido_em DESC';
    const total = db.prepare(`SELECT count(*) n FROM itens i WHERE ${where.join(' AND ')}`).get(...args).n;
    const linhas = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY ${ordem}, i.id DESC LIMIT ? OFFSET ?`)
      .all(...args, porPagina, (pagina - 1) * porPagina);
    return { itens: linhas.map((i) => resumo(i, ctx.usuario)), total, pagina, por_pagina: porPagina };
  }, { auth: true });

  // ---------- Detalhe ----------
  r.add('GET', '/api/itens/:id', async (ctx) => {
    const i = carregar(Number(ctx.params.id) || 0);
    const eu = ctx.usuario;
    const equipe = ehEquipe(eu);
    if (i.status === 'removido' && !equipe && i.autor_id !== eu.id) throw new HttpError(404, 'Item não encontrado.');
    const out = resumo(i, eu);
    out.descricao = i.descricao;
    out.fotos = db.prepare('SELECT arquivo FROM item_fotos WHERE item_id=? ORDER BY ordem, id').all(i.id).map((f) => `/uploads/${f.arquivo}`);
    out.local_guarda = ['no_protocolo', 'em_reclamacao'].includes(i.status) ? i.local_guarda : '';
    out.historico = db.prepare('SELECT de_status, para_status, papel, nota, criado_em FROM item_historico WHERE item_id=? ORDER BY id')
      .all(i.id).map((h) => ({ de: h.de_status, para: h.para_status, rotulo: ROTULOS[h.para_status], por: h.papel === 'aluno' ? 'Usuário' : h.papel === 'sistema' ? 'Sistema' : 'Protocolo', nota: h.nota, em: h.criado_em }));
    out.minha_reivindicacao = db.prepare("SELECT id, status, prova, nota_decisao, criado_em FROM reivindicacoes WHERE item_id=? AND usuario_id=? ORDER BY id DESC LIMIT 1").get(i.id, eu.id) ?? null;
    out.ja_denunciei = !!db.prepare('SELECT 1 FROM denuncias WHERE item_id=? AND usuario_id=?').get(i.id, eu.id);
    if (i.autor_id === eu.id || equipe) {
      out.avisos = db.prepare('SELECT a.id, a.mensagem, a.criado_em, u.nome, u.email, u.avatar FROM avisos a JOIN usuarios u ON u.id=a.autor_id WHERE a.item_id=? ORDER BY a.id DESC').all(i.id);
      out.total_reivindicacoes = db.prepare("SELECT count(*) n FROM reivindicacoes WHERE item_id=? AND status IN ('pendente','aprovada')").get(i.id).n;
    }
    if (equipe) {
      out.reivindicacoes = db.prepare(`SELECT rv.id, rv.status, rv.prova, rv.nota_decisao, rv.criado_em, u.nome, u.matricula, u.email, u.avatar
        FROM reivindicacoes rv JOIN usuarios u ON u.id=rv.usuario_id WHERE rv.item_id=? ORDER BY rv.id DESC`).all(i.id);
      out.entrega = db.prepare('SELECT recebedor_nome, recebedor_documento, nota, criado_em FROM entregas WHERE item_id=?').get(i.id) ?? null;
    }
    const url = (x) => ({ ...x, avatar: x.avatar ? `/uploads/${x.avatar}` : null });
    if (out.avisos) out.avisos = out.avisos.map(url);
    if (out.reivindicacoes) out.reivindicacoes = out.reivindicacoes.map(url);
    return out;
  }, { auth: true });

  // ---------- Criar ----------
  const regrasItem = {
    tipo: { enum: ['achado', 'perdido'], label: 'Tipo' },
    titulo: { min: 3, max: 80, label: 'Título' },
    descricao: { optional: true, max: 1000, multiline: true, label: 'Descrição' },
    categoria_id: { type: 'int', min: 1, label: 'Categoria' },
    local_id: { type: 'int', min: 1, label: 'Local' },
    local_detalhe: { optional: true, max: 120, label: 'Detalhe do local' },
    ocorrido_em: { max: 40, label: 'Data e hora', raw: true },
  };

  function validarOcorrido(valor) {
    const dt = parseOcorrido(valor);
    const erro = (m) => new HttpError(422, 'Confira os campos destacados.', { campos: { ocorrido_em: m } });
    if (!dt) throw erro('Data e hora inválidas.');
    if (dt.getTime() > Date.now() + 5 * 60_000) throw erro('A data não pode estar no futuro.');
    if (dt.getTime() < Date.now() - 365 * DIA) throw erro('A data é antiga demais (máximo 1 ano).');
    return dt.toISOString();
  }
  function validarRefs(b) {
    if (!db.prepare('SELECT 1 FROM categorias WHERE id=? AND ativo=1').get(b.categoria_id)) throw new HttpError(422, 'Confira os campos destacados.', { campos: { categoria_id: 'Categoria inválida.' } });
    if (!db.prepare('SELECT 1 FROM locais WHERE id=? AND ativo=1').get(b.local_id)) throw new HttpError(422, 'Confira os campos destacados.', { campos: { local_id: 'Local inválido.' } });
  }

  r.add('POST', '/api/itens', async (ctx) => {
    const corpo = await ctx.json();
    const b = validar(corpo, regrasItem);
    const fotosIds = Array.isArray(corpo.fotos) ? [...new Set(corpo.fotos.map(Number))] : [];
    if (fotosIds.length > 4 || fotosIds.some((n) => !Number.isSafeInteger(n) || n < 1)) throw new HttpError(422, 'Confira os campos destacados.', { campos: { fotos: 'Envie de 1 a 4 fotos.' } });
    if (b.tipo === 'achado' && fotosIds.length < 1) throw new HttpError(422, 'Confira os campos destacados.', { campos: { fotos: 'Tire pelo menos uma foto do item encontrado.' } });
    if (b.tipo === 'perdido' && (b.descricao || '').length < 10) throw new HttpError(422, 'Confira os campos destacados.', { campos: { descricao: 'Descreva o item (mínimo de 10 caracteres) para ajudar a identificá-lo.' } });
    b.ocorrido_em = validarOcorrido(b.ocorrido_em);
    validarRefs(b);
    const recentes = db.prepare("SELECT count(*) n FROM itens WHERE autor_id=? AND criado_em > ?").get(ctx.usuario.id, new Date(Date.now() - DIA).toISOString()).n;
    if (recentes >= 10) throw new HttpError(429, 'Limite de 10 publicações por dia atingido.');
    const status = b.tipo === 'achado' ? 'aguardando_entrega' : 'aberto';

    const id = transacao(db, () => {
      const info = db.prepare(`INSERT INTO itens (tipo, titulo, descricao, categoria_id, local_id, local_detalhe, ocorrido_em, status, autor_id)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(b.tipo, b.titulo, b.descricao ?? '', b.categoria_id, b.local_id, b.local_detalhe ?? '', b.ocorrido_em, status, ctx.usuario.id);
      const novo = Number(info.lastInsertRowid);
      const criado = db.prepare('SELECT criado_em FROM itens WHERE id=?').get(novo).criado_em;
      const codigo = codigoDe(novo, criado);
      db.prepare('UPDATE itens SET codigo=?, busca=? WHERE id=?').run(codigo, normalizarBusca(`${b.titulo} ${b.descricao ?? ''} ${codigo}`), novo);
      fotosIds.forEach((fid, ordem) => {
        const up = db.prepare('UPDATE item_fotos SET item_id=?, ordem=? WHERE id=? AND autor_id=? AND item_id IS NULL').run(novo, ordem, fid, ctx.usuario.id);
        if (up.changes !== 1) throw new HttpError(422, 'Foto inválida. Envie novamente.');
      });
      historico({ id: novo }, ctx.usuario, ctx.usuario.papel, null, status, 'Publicado');
      return novo;
    });
    d.auditar(ctx, 'item.criado', `item:${id}`);
    ctx.status = 201;
    return resumo(carregar(id), ctx.usuario);
  }, { auth: true });

  // ---------- Editar ----------
  r.add('PATCH', '/api/itens/:id', async (ctx) => {
    const i = carregar(Number(ctx.params.id) || 0);
    const equipe = ehEquipe(ctx.usuario);
    if (i.autor_id !== ctx.usuario.id && !equipe) throw new HttpError(403, 'Você não pode editar este item.');
    if (!equipe && !['aguardando_entrega', 'aberto'].includes(i.status)) throw new HttpError(409, 'Este item não pode mais ser editado.');
    if (FINAIS.has(i.status)) throw new HttpError(409, 'Item já encerrado.');
    const regras = Object.fromEntries(Object.entries(regrasItem).filter(([k]) => k !== 'tipo').map(([k, v]) => [k, { ...v, optional: true }]));
    const b = validar(await ctx.json(), regras);
    if (b.ocorrido_em) b.ocorrido_em = validarOcorrido(b.ocorrido_em);
    if (b.categoria_id || b.local_id) validarRefs({ categoria_id: b.categoria_id ?? i.categoria_id, local_id: b.local_id ?? i.local_id });
    const novo = { ...i, ...b };
    if (i.tipo === 'perdido' && (novo.descricao || '').length < 10) throw new HttpError(422, 'Confira os campos destacados.', { campos: { descricao: 'Descreva o item (mínimo de 10 caracteres).' } });
    db.prepare('UPDATE itens SET titulo=?, descricao=?, categoria_id=?, local_id=?, local_detalhe=?, ocorrido_em=?, busca=?, atualizado_em=? WHERE id=?')
      .run(novo.titulo, novo.descricao, novo.categoria_id, novo.local_id, novo.local_detalhe, novo.ocorrido_em, normalizarBusca(`${novo.titulo} ${novo.descricao} ${i.codigo}`), nowIso(), i.id);
    historico(i, ctx.usuario, ctx.usuario.papel, i.status, i.status, 'Dados editados');
    d.auditar(ctx, 'item.editado', `item:${i.id}`);
    return resumo(carregar(i.id), ctx.usuario);
  }, { auth: true });

  // ---------- Ações do dono ----------
  r.add('POST', '/api/itens/:id/cancelar', async (ctx) => {
    const i = carregar(Number(ctx.params.id) || 0);
    if (i.autor_id !== ctx.usuario.id) throw new HttpError(403, 'Apenas quem publicou pode cancelar.');
    if (i.tipo === 'achado' && i.status !== 'aguardando_entrega') throw new HttpError(409, 'O item já está com o Protocolo. Peça a baixa ao Protocolo.');
    const { nota } = validar(await ctx.json(), { nota: { optional: true, max: 200, label: 'Motivo' } });
    transacao(db, () => mudarStatus(i, 'cancelado', ctx.usuario, nota ?? ''));
    d.auditar(ctx, 'item.cancelado', `item:${i.id}`);
    return { ok: true };
  }, { auth: true });

  r.add('POST', '/api/itens/:id/encontrado', async (ctx) => {
    const i = carregar(Number(ctx.params.id) || 0);
    if (i.tipo !== 'perdido') throw new HttpError(409, 'Ação válida apenas para itens perdidos.');
    if (i.autor_id !== ctx.usuario.id && !ehEquipe(ctx.usuario)) throw new HttpError(403, 'Apenas o dono do anúncio pode marcar como encontrado.');
    const { nota } = validar(await ctx.json(), { nota: { optional: true, max: 200, label: 'Nota' } });
    transacao(db, () => mudarStatus(i, 'encontrado', ctx.usuario, nota ?? 'Dono recuperou o item'));
    d.auditar(ctx, 'item.encontrado', `item:${i.id}`);
    return { ok: true };
  }, { auth: true });

  // ---------- Qualquer aluno: "Achei isto" (item perdido) ----------
  r.add('POST', '/api/itens/:id/avisos', async (ctx) => {
    limitador.usar(`aviso:${ctx.usuario.id}`, 10, DIA);
    const i = carregar(Number(ctx.params.id) || 0);
    if (i.tipo !== 'perdido' || i.status !== 'aberto') throw new HttpError(409, 'Este anúncio não está mais aberto.');
    if (i.autor_id === ctx.usuario.id) throw new HttpError(409, 'Você não pode avisar o seu próprio anúncio.');
    const { mensagem } = validar(await ctx.json(), { mensagem: { min: 5, max: 500, multiline: true, label: 'Mensagem' } });
    db.prepare('INSERT INTO avisos (item_id, autor_id, mensagem) VALUES (?,?,?)').run(i.id, ctx.usuario.id, mensagem);
    const dono = db.prepare('SELECT nome, email FROM usuarios WHERE id=?').get(i.autor_id);
    if (!dono.email.endsWith('@excluido.invalid'))
      await mailer.enviar({ to: dono.email, subject: `Alguém pode ter achado: ${i.titulo}`, text: `Olá, ${dono.nome.split(' ')[0]}!\n\n${ctx.usuario.nome} diz que pode ter encontrado o seu item "${i.titulo}" (${i.codigo}):\n\n"${mensagem}"\n\nResponda pelo e-mail ${ctx.usuario.email} ou peça para a pessoa deixar o item no Protocolo.\n\nAcompanhe em ${config.appUrl}/#/itens/${i.id}` });
    d.auditar(ctx, 'item.aviso', `item:${i.id}`);
    ctx.status = 201;
    return { mensagem: 'Aviso enviado ao dono do anúncio. Se possível, deixe o item no Protocolo.' };
  }, { auth: true });

  // ---------- Reivindicar ("É meu!") ----------
  r.add('POST', '/api/itens/:id/reivindicar', async (ctx) => {
    limitador.usar(`reiv:${ctx.usuario.id}`, 10, DIA);
    const i = carregar(Number(ctx.params.id) || 0);
    if (i.tipo !== 'achado' || !['no_protocolo', 'em_reclamacao'].includes(i.status)) throw new HttpError(409, 'Este item não está disponível para reivindicação (ele precisa estar no Protocolo).');
    if (i.autor_id === ctx.usuario.id) throw new HttpError(409, 'Você publicou este item como achado.');
    const { prova } = validar(await ctx.json(), { prova: { min: 10, max: 500, multiline: true, label: 'Descrição de prova' } });
    const abertas = db.prepare("SELECT count(*) n FROM reivindicacoes WHERE usuario_id=? AND status='pendente'").get(ctx.usuario.id).n;
    if (abertas >= 3) throw new HttpError(409, 'Você já tem 3 reivindicações em análise.');
    if (db.prepare("SELECT 1 FROM reivindicacoes WHERE item_id=? AND usuario_id=? AND status IN ('pendente','aprovada')").get(i.id, ctx.usuario.id))
      throw new HttpError(409, 'Você já reivindicou este item.');
    transacao(db, () => {
      db.prepare('INSERT INTO reivindicacoes (item_id, usuario_id, prova) VALUES (?,?,?)').run(i.id, ctx.usuario.id, prova);
      if (i.status === 'no_protocolo') mudarStatus(i, 'em_reclamacao', ctx.usuario, 'Reivindicação aberta');
    });
    d.auditar(ctx, 'item.reivindicado', `item:${i.id}`);
    ctx.status = 201;
    return { mensagem: 'Reivindicação enviada. Vá ao Protocolo com um documento para confirmar.' };
  }, { auth: true });

  r.add('POST', '/api/reivindicacoes/:id/cancelar', async (ctx) => {
    const rv = db.prepare('SELECT * FROM reivindicacoes WHERE id=?').get(Number(ctx.params.id) || 0);
    if (!rv || rv.usuario_id !== ctx.usuario.id) throw new HttpError(404, 'Reivindicação não encontrada.');
    if (rv.status !== 'pendente') throw new HttpError(409, 'Esta reivindicação não pode mais ser cancelada.');
    transacao(db, () => {
      db.prepare("UPDATE reivindicacoes SET status='cancelada', decidido_em=? WHERE id=?").run(nowIso(), rv.id);
      voltarSeSemReivindicacao(rv.item_id, ctx.usuario);
    });
    return { ok: true };
  }, { auth: true });

  function voltarSeSemReivindicacao(itemId, usuario) {
    const item = carregar(itemId);
    const ativas = db.prepare("SELECT count(*) n FROM reivindicacoes WHERE item_id=? AND status IN ('pendente','aprovada')").get(itemId).n;
    if (!ativas && item.status === 'em_reclamacao') mudarStatus(item, 'no_protocolo', usuario, 'Sem reivindicações ativas');
  }
  d.voltarSeSemReivindicacao = voltarSeSemReivindicacao;

  // ---------- Denunciar ----------
  r.add('POST', '/api/itens/:id/denunciar', async (ctx) => {
    limitador.usar(`den:${ctx.usuario.id}`, 10, DIA);
    const i = carregar(Number(ctx.params.id) || 0);
    if (i.autor_id === ctx.usuario.id) throw new HttpError(409, 'Você não pode denunciar o seu próprio item.');
    const { motivo } = validar(await ctx.json(), { motivo: { min: 5, max: 300, multiline: true, label: 'Motivo' } });
    try {
      db.prepare('INSERT INTO denuncias (item_id, usuario_id, motivo) VALUES (?,?,?)').run(i.id, ctx.usuario.id, motivo);
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw new HttpError(409, 'Você já denunciou este item.');
      throw e;
    }
    ctx.status = 201;
    return { mensagem: 'Denúncia enviada para a moderação.' };
  }, { auth: true });

  // ---------- Meus itens ----------
  r.add('GET', '/api/meus', async (ctx) => {
    const itens = db.prepare(`${SELECT} WHERE i.autor_id=? AND i.status<>'removido' ORDER BY i.id DESC LIMIT 100`).all(ctx.usuario.id);
    const out = itens.map((i) => {
      const s = resumo(i, ctx.usuario);
      s.avisos = db.prepare('SELECT count(*) n FROM avisos WHERE item_id=?').get(i.id).n;
      s.reivindicacoes = db.prepare("SELECT count(*) n FROM reivindicacoes WHERE item_id=? AND status IN ('pendente','aprovada')").get(i.id).n;
      return s;
    });
    const reiv = db.prepare(`SELECT rv.id, rv.status, rv.nota_decisao, rv.criado_em, i.id item_id, i.titulo, i.codigo, i.status item_status
      FROM reivindicacoes rv JOIN itens i ON i.id=rv.item_id WHERE rv.usuario_id=? ORDER BY rv.id DESC LIMIT 50`).all(ctx.usuario.id);
    return { itens: out, reivindicacoes: reiv };
  }, { auth: true });

  // ---------- Rotina: expira anúncios de perdido antigos ----------
  d.rotinaExpiracao = () => {
    const limite = new Date(Date.now() - config.perdidoExpiraDias * DIA).toISOString();
    const velhos = db.prepare("SELECT i.id FROM itens i WHERE i.tipo='perdido' AND i.status='aberto' AND i.criado_em < ?").all(limite);
    for (const { id } of velhos) transacao(db, () => mudarStatus(carregar(id), 'expirado', null, `Sem novidades há ${config.perdidoExpiraDias} dias`));
    return velhos.length;
  };
}
export { ehEquipe, TRANSICOES, FINAIS };
