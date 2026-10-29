import { ApiError, get, meta, patch, post, prepararFoto, enviarFoto, sessao } from '../api.js';
import { avatar, cartaoItem, dataHora, erroCampos, formDados, html, icone, mostrar, ocupado, seloDias, toast } from '../ui.js';

const opcoes = (lista, sel) => lista.map((o) => html`<option value="${o.id}" ${sel == o.id ? 'selected' : ''}>${o.nome}</option>`);

// ---------------------------------------------------------------- Lista
export async function lista({ el, query }) {
  const m = await meta();
  const f = {
    q: query.get('q') || '', tipo: query.get('tipo') || '', categoria: query.get('categoria') || '', local: query.get('local') || '',
    grupo: query.get('grupo') || 'ativos', ordem: query.get('ordem') || 'recentes', pagina: Number(query.get('pagina')) || 1,
  };
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== 0));
  qs.set('por_pagina', '12');
  const r = await get(`/api/itens?${qs}`);
  const paginas = Math.max(1, Math.ceil(r.total / r.por_pagina));
  mostrar(el, html`<div class="wrap">
    <div class="titulo-pagina"><div><h1>Itens</h1><span class="dica">${r.total} ${r.total === 1 ? 'resultado' : 'resultados'}</span></div>
      <div class="abas" role="group" aria-label="Tipo">
        ${[['', 'Todos'], ['perdido', 'Perdidos'], ['achado', 'Achados']].map(([v, t]) => html`<button type="button" data-tipo="${v}" aria-pressed="${f.tipo === v}">${t}</button>`)}
      </div></div>
    <form class="card filtros" id="filtros">
      <div class="campo"><label for="q">Buscar</label><input id="q" name="q" type="search" value="${f.q}" maxlength="60" placeholder="Ex.: garrafa, AP-2026-0012"></div>
      <div class="campo"><label for="categoria">Categoria</label><select id="categoria" name="categoria"><option value="">Todas</option>${opcoes(m.categorias, f.categoria)}</select></div>
      <div class="campo"><label for="local">Local</label><select id="local" name="local"><option value="">Todos</option>${opcoes(m.locais, f.local)}</select></div>
      <div class="campo"><label for="grupo">Situação</label><select id="grupo" name="grupo">
        ${[['ativos', 'Em aberto'], ['resolvidos', 'Resolvidos'], ['todos', 'Todos']].map(([v, t]) => html`<option value="${v}" ${f.grupo === v ? 'selected' : ''}>${t}</option>`)}</select></div>
      <div class="campo"><label for="ordem">Ordenar</label><select id="ordem" name="ordem">
        <option value="recentes" ${f.ordem === 'recentes' ? 'selected' : ''}>Mais recentes</option><option value="mais_dias" ${f.ordem === 'mais_dias' ? 'selected' : ''}>Mais dias parado</option></select></div>
    </form>
    ${r.itens.length ? html`<div class="grade">${r.itens.map(cartaoItem)}</div>` : html`<div class="vazio card"><p>Nenhum item encontrado com esses filtros.</p><a class="btn btn-ouro" href="#/novo">${icone('plus')} Postar item</a></div>`}
    ${paginas > 1 ? html`<nav class="paginacao" aria-label="Paginação"><button class="btn btn-borda btn-sm" data-pg="${f.pagina - 1}" ${f.pagina <= 1 ? 'disabled' : ''}>Anterior</button>
      <span>Página ${f.pagina} de ${paginas}</span><button class="btn btn-borda btn-sm" data-pg="${f.pagina + 1}" ${f.pagina >= paginas ? 'disabled' : ''}>Próxima</button></nav>` : ''}
  </div>`);
  const ir = (mud) => {
    const novo = { ...f, ...mud };
    if (!('pagina' in mud)) novo.pagina = 1;
    const p = new URLSearchParams(Object.entries(novo).filter(([k, v]) => v !== '' && !(k === 'pagina' && v === 1) && !(k === 'grupo' && v === 'ativos') && !(k === 'ordem' && v === 'recentes')));
    location.hash = `#/itens${p.size ? `?${p}` : ''}`;
  };
  const form = el.querySelector('#filtros');
  form.addEventListener('submit', (e) => e.preventDefault());
  form.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => ir({ [s.name]: s.value })));
  let t;
  form.q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => ir({ q: form.q.value.trim() }), 450); });
  el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => ir({ tipo: b.dataset.tipo })));
  el.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => ir({ pagina: Number(b.dataset.pg) })));
  if (document.activeElement === document.body && f.q) form.q.focus();
}

// ---------------------------------------------------------------- Detalhe
export async function detalhe({ el, params }) {
  const id = params[0];
  const i = await get(`/api/itens/${id}`);
  const eu = sessao.usuario;
  const equipe = eu.papel === 'protocolo' || eu.papel === 'admin';
  const meu = i.meu;
  const aberto = !['devolvido', 'destinado', 'cancelado', 'removido', 'encontrado', 'expirado'].includes(i.status);
  const pendentes = (i.reivindicacoes || []).filter((r) => ['pendente', 'aprovada'].includes(r.status));
  const podeReivindicar = i.tipo === 'achado' && ['no_protocolo', 'em_reclamacao'].includes(i.status) && !meu && !i.minha_reivindicacao?.status?.match(/pendente|aprovada/);
  const rv = i.minha_reivindicacao;

  mostrar(el, html`<div class="wrap"><div class="titulo-pagina"><div>
      <a href="#/itens">← Voltar para os itens</a>
      <h1>${i.titulo}</h1>
      <div class="meta"><span class="selo selo-${i.tipo}">${i.tipo === 'achado' ? 'Achado' : 'Perdido'}</span> <span class="selo selo-status">${i.status_rotulo}</span> ${seloDias(i)} <span class="mono">${i.codigo}</span></div>
    </div></div>
    <div class="detalhe">
      <div class="galeria">
        <div class="principal" id="principal">${i.fotos.length ? html`<img src="${i.fotos[0]}" alt="Foto de ${i.titulo}">` : icone(i.categoria.icone, 'grande')}</div>
        ${i.fotos.length > 1 ? html`<div class="mini">${i.fotos.map((f, n) => html`<button type="button" data-foto="${f}" aria-current="${n === 0}" aria-label="Foto ${n + 1}"><img src="${f}" alt=""></button>`)}</div>` : ''}
        <div class="card pad mt"><h2 class="h3">Linha do tempo</h2>
          <ul class="linha-tempo">${i.historico.map((h) => html`<li><b>${h.rotulo}</b> <span class="dica">${dataHora(h.em)} · ${h.por}</span>${h.nota ? html`<div class="dica">${h.nota}</div>` : ''}</li>`)}</ul></div>
      </div>
      <div>
        <div class="card pad ficha">
          ${i.descricao ? html`<p>${i.descricao}</p>` : ''}
          <dl>
            <dt>${i.tipo === 'achado' ? 'Achado em' : 'Perdido em'}</dt><dd>${dataHora(i.ocorrido_em)}</dd>
            <dt>Local</dt><dd>${i.local.nome}${i.local_detalhe ? ` — ${i.local_detalhe}` : ''}</dd>
            <dt>Categoria</dt><dd>${i.categoria.nome}</dd>
            <dt>Publicado por</dt><dd class="autor">${avatar({ nome: i.autor, avatar: i.autor_avatar }, 'sm')} ${i.autor}</dd>
            ${i.local_guarda ? html`<dt>Guardado em</dt><dd>Protocolo — ${i.local_guarda}</dd>` : ''}
          </dl>
          ${i.tipo === 'achado' && ['aguardando_entrega'].includes(i.status) ? html`<div class="alerta alerta-info">Este item ainda <b>não foi confirmado no Protocolo</b>. Se ele é seu, vá até lá para conferir.</div>` : ''}
          ${i.tipo === 'achado' && ['no_protocolo', 'em_reclamacao'].includes(i.status) ? html`<div class="alerta alerta-info">${icone('pin')} Este item está no <b>Protocolo</b>. Leve um documento com foto para retirar.</div>` : ''}
          ${rv ? html`<div class="alerta ${rv.status === 'aprovada' ? 'alerta-ok' : rv.status === 'rejeitada' ? 'alerta-erro' : 'alerta-info'}">Sua reivindicação: <b>${{ pendente: 'em análise', aprovada: 'aprovada — vá ao Protocolo', rejeitada: 'não aprovada', cancelada: 'cancelada' }[rv.status]}</b>${rv.nota_decisao ? ` · ${rv.nota_decisao}` : ''}
            ${rv.status === 'pendente' ? html`<div class="acoes"><button class="btn btn-borda btn-sm" id="cancelar-rv">Cancelar reivindicação</button></div>` : ''}</div>` : ''}
          <div class="acoes" id="acoes">
            ${podeReivindicar ? html`<button class="btn btn-ouro" data-abrir="reivindicar">É meu!</button>` : ''}
            ${i.tipo === 'perdido' && i.status === 'aberto' && !meu ? html`<button class="btn btn-ouro" data-abrir="aviso">Achei este item</button>` : ''}
            ${meu && i.tipo === 'perdido' && i.status === 'aberto' ? html`<button class="btn btn-azul" id="encontrado">Já encontrei ${icone('check')}</button>` : ''}
            ${meu && aberto && ['aguardando_entrega', 'aberto'].includes(i.status) ? html`<button class="btn btn-borda" data-abrir="editar">Editar</button>` : ''}
            ${meu && ((i.tipo === 'perdido' && i.status === 'aberto') || i.status === 'aguardando_entrega') ? html`<button class="btn btn-borda" id="cancelar">Cancelar publicação</button>` : ''}
            ${!meu ? html`<button class="btn btn-borda btn-sm" data-abrir="denuncia">Denunciar</button>` : ''}
          </div>
          <div id="painel-acao"></div>
        </div>
        ${meu && i.avisos?.length ? html`<div class="card pad mt"><h2 class="h3">Avisos recebidos</h2>${i.avisos.map((a) => html`<div class="painel-acao"><div class="pessoa">${avatar(a, 'md')}<div><b>${a.nome}</b> <span class="dica">${dataHora(a.criado_em)}</span></div></div><p>${a.mensagem}</p><a href="mailto:${a.email}">${a.email}</a></div>`)}</div>` : ''}
        ${equipe ? html`<div class="card pad mt"><h2 class="h3">${icone('shield')} Área do Protocolo</h2><div id="equipe"></div></div>` : ''}
      </div>
    </div></div>`);

  const painel = el.querySelector('#painel-acao');
  const recarregar = () => detalhe({ el, params });
  const falhar = (e, form) => { if (e instanceof ApiError) { if (e.campos && form) erroCampos(form, e.campos); toast(e.message, 'erro'); } else throw e; };
  const formulario = (titulo, campos, rotulo, fn, cls = 'btn-azul') => {
    mostrar(painel, html`<form class="painel-acao" novalidate><h2 class="h3">${titulo}</h2>${campos}<button class="btn ${cls}" type="submit">${rotulo}</button></form>`);
    const form = painel.querySelector('form');
    form.addEventListener('submit', ocupado(form.querySelector('button'), async (e) => {
      e.preventDefault(); erroCampos(form);
      try { const msg = await fn(formDados(form)); toast(msg || 'Pronto!', 'ok'); await recarregar(); } catch (err) { falhar(err, form); }
    }));
    form.querySelector('input,textarea')?.focus();
  };
  const campo = (nome, rotulo, tipo = 'input', extra = '', dica = '') => html`<div class="campo"><label for="c-${nome}">${rotulo}</label>${tipo === 'textarea' ? html`<textarea id="c-${nome}" name="${nome}" maxlength="500"></textarea>` : html`<input id="c-${nome}" name="${nome}" maxlength="100">`}${dica ? html`<div class="dica">${dica}</div>` : ''}</div>`;

  el.querySelectorAll('[data-foto]').forEach((b) => b.addEventListener('click', () => {
    el.querySelector('#principal').innerHTML = `<img src="${b.dataset.foto}" alt="Foto ampliada">`;
    el.querySelectorAll('[data-foto]').forEach((x) => x.setAttribute('aria-current', String(x === b)));
  }));
  el.querySelectorAll('[data-abrir]').forEach((b) => b.addEventListener('click', async () => {
    const a = b.dataset.abrir;
    if (a === 'reivindicar') formulario('Provar que é seu', campo('prova', 'Descreva algo que não aparece na foto', 'textarea', '', 'Ex.: marca, riscos, adesivos, o que tem dentro. O Protocolo vai conferir.'), 'Enviar reivindicação', async (d) => (await post(`/api/itens/${id}/reivindicar`, { prova: d.prova })).mensagem, 'btn-ouro');
    if (a === 'aviso') formulario('Avisar o dono', campo('mensagem', 'Onde está o item?', 'textarea', '', 'Seu nome e e-mail serão enviados ao dono. Se puder, deixe o item no Protocolo.'), 'Enviar aviso', async (d) => (await post(`/api/itens/${id}/avisos`, { mensagem: d.mensagem })).mensagem, 'btn-ouro');
    if (a === 'denuncia') formulario('Denunciar publicação', campo('motivo', 'Qual é o problema?', 'textarea'), 'Enviar denúncia', async (d) => (await post(`/api/itens/${id}/denunciar`, { motivo: d.motivo })).mensagem, 'btn-perigo');
    if (a === 'editar') await formEditar(painel, i, id, recarregar);
  }));
  el.querySelector('#encontrado')?.addEventListener('click', async () => {
    if (!confirm('Marcar como encontrado? O anúncio será encerrado.')) return;
    try { await post(`/api/itens/${id}/encontrado`, {}); toast('Que bom! Anúncio encerrado.', 'ok'); recarregar(); } catch (e) { falhar(e); }
  });
  el.querySelector('#cancelar')?.addEventListener('click', async () => {
    if (!confirm('Cancelar esta publicação?')) return;
    try { await post(`/api/itens/${id}/cancelar`, {}); toast('Publicação cancelada.'); recarregar(); } catch (e) { falhar(e); }
  });
  el.querySelector('#cancelar-rv')?.addEventListener('click', async () => {
    try { await post(`/api/reivindicacoes/${rv.id}/cancelar`, {}); toast('Reivindicação cancelada.'); recarregar(); } catch (e) { falhar(e); }
  });

  if (equipe) equipeUI(el.querySelector('#equipe'), i, id, pendentes, recarregar, falhar, eu);
}

function equipeUI(box, i, id, pendentes, recarregar, falhar, eu) {
  const secoes = [];
  if (i.tipo === 'achado' && i.status === 'aguardando_entrega') secoes.push(html`<form data-f="recebido" class="painel-acao"><b>Confirmar recebimento</b><div class="campo"><label for="lg">Onde ficou guardado?</label><input id="lg" name="local_guarda" maxlength="60" placeholder="Ex.: Armário 2, prateleira de cima"></div><button class="btn btn-azul btn-sm" type="submit">Item recebido</button></form>`);
  if (i.reivindicacoes?.length) secoes.push(html`<div class="painel-acao"><b>Reivindicações</b>${i.reivindicacoes.map((r) => html`<div class="mini-item">${avatar(r, 'lg', true)}<div><b>${r.nome}</b> <span class="dica">${r.matricula ? `mat. ${r.matricula} · ` : ''}${r.email}</span><p>“${r.prova}”</p><span class="selo selo-status">${r.status}</span>
      ${r.status === 'pendente' ? html`<div class="acoes"><button class="btn btn-azul btn-sm" data-dec="aprovar" data-rv="${r.id}">Aprovar</button><button class="btn btn-borda btn-sm" data-dec="rejeitar" data-rv="${r.id}">Rejeitar</button></div>` : ''}</div></div>`)}</div>`);
  if (i.tipo === 'achado' && ['aguardando_entrega', 'no_protocolo', 'em_reclamacao'].includes(i.status))
    secoes.push(html`<form data-f="entregar" class="painel-acao"><b>Registrar devolução</b>
      <div class="campo"><label for="rn">Nome de quem retirou</label><input id="rn" name="recebedor_nome" maxlength="100"></div>
      <div class="campo"><label for="rd">Documento / matrícula conferido</label><input id="rd" name="recebedor_documento" maxlength="30"></div>
      ${pendentes.length ? html`<div class="campo"><label for="rr">Reivindicação</label><select id="rr" name="reivindicacao_id"><option value="">Nenhuma (retirada direta)</option>${pendentes.map((r) => html`<option value="${r.id}">${r.nome}</option>`)}</select></div>` : ''}
      <div class="campo"><label for="rno">Observação</label><input id="rno" name="nota" maxlength="300"></div>
      <button class="btn btn-ouro btn-sm" type="submit">Dar baixa: devolvido</button></form>`);
  if (i.tipo === 'achado' && i.status === 'no_protocolo' && i.elegivel_destino)
    secoes.push(html`<form data-f="destinar" class="painel-acao"><b>Destinar item</b> <span class="dica">(passou do prazo de retenção)</span>
      <div class="campo"><label for="dd">Destino</label><select id="dd" name="destino"><option value="doacao">Doação</option><option value="descarte">Descarte</option><option value="guarda_institucional">Guarda institucional</option></select></div>
      <div class="campo"><label for="dn">Justificativa</label><input id="dn" name="nota" maxlength="300"></div><button class="btn btn-borda btn-sm" type="submit">Registrar destinação</button></form>`);
  if (eu.papel === 'admin' && ['aguardando_entrega', 'no_protocolo', 'em_reclamacao', 'aberto'].includes(i.status))
    secoes.push(html`<form data-f="remover" class="painel-acao"><b>Remover (moderação)</b><div class="campo"><label for="rm">Motivo</label><input id="rm" name="motivo" maxlength="300"></div><button class="btn btn-perigo btn-sm" type="submit">Remover item</button></form>`);
  if (eu.papel === 'admin' && i.status !== 'devolvido')
    secoes.push(html`<form data-f="apagar" class="painel-acao perigo"><b>Apagar definitivamente</b><p class="dica">Para trotes e conteúdo impróprio: some da lista, fotos e histórico são excluídos e <b>não dá para desfazer</b>. Só o registro na auditoria permanece.</p><div class="campo"><label for="ap">Motivo</label><input id="ap" name="motivo" maxlength="200"></div><button class="btn btn-perigo btn-sm" type="submit">Apagar de vez</button></form>`);
  if (i.entrega) secoes.push(html`<div class="alerta alerta-ok">Entregue a <b>${i.entrega.recebedor_nome}</b> (${i.entrega.recebedor_documento}) em ${dataHora(i.entrega.criado_em)}.</div>`);
  mostrar(box, secoes.length ? html`${secoes}` : html`<p class="dica">Nenhuma ação pendente para este item.</p>`);

  const rotas = { recebido: ['recebido', 'Recebimento confirmado.'], entregar: ['entregar', 'Devolução registrada.'], destinar: ['destinar', 'Destinação registrada.'], remover: ['../admin/itens/:id/remover', 'Item removido.'], apagar: ['../admin/itens/:id/apagar', 'Item apagado definitivamente.'] };
  box.querySelectorAll('form[data-f]').forEach((form) => form.addEventListener('submit', ocupado(form.querySelector('button'), async (e) => {
    e.preventDefault(); erroCampos(form);
    const [rota, ok] = rotas[form.dataset.f];
    if (form.dataset.f === 'apagar' && !confirm('Apagar DEFINITIVAMENTE este item? Isso não pode ser desfeito.')) return;
    const dados = formDados(form);
    for (const k of Object.keys(dados)) if (dados[k] === '') delete dados[k];
    try {
      await post(rota.startsWith('../') ? `/api/${rota.slice(3).replace(':id', id)}` : `/api/itens/${id}/${rota}`, dados);
      toast(ok, 'ok');
      if (form.dataset.f === 'apagar') location.hash = '#/itens'; else recarregar();
    } catch (err) { falhar(err, form); }
  })));
  box.querySelectorAll('[data-dec]').forEach((b) => b.addEventListener('click', async () => {
    try { await post(`/api/reivindicacoes/${b.dataset.rv}/decidir`, { decisao: b.dataset.dec }); toast('Decisão registrada.', 'ok'); recarregar(); } catch (err) { falhar(err); }
  }));
}

// ---------------------------------------------------------------- Novo / Editar
function agoraLocal() {
  const d = new Date(Date.now() - 3 * 3600_000); // horário de Belém
  return d.toISOString().slice(0, 16);
}
const paraBelem = (iso) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 16);

function camposItem(m, v = {}) {
  return html`
    <div class="campo"><label for="titulo">O que é? (título)</label><input id="titulo" name="titulo" maxlength="80" required value="${v.titulo || ''}" placeholder="Ex.: Garrafa térmica azul"></div>
    <div class="campo"><label for="categoria_id">Categoria</label><select id="categoria_id" name="categoria_id" required>${opcoes(m.categorias, v.categoria?.id)}</select></div>
    <div class="campo"><label for="local_id">Onde foi?</label><select id="local_id" name="local_id" required>${opcoes(m.locais, v.local?.id)}</select></div>
    <div class="campo"><label for="local_detalhe">Detalhe do local <span class="dica">(opcional)</span></label><input id="local_detalhe" name="local_detalhe" maxlength="120" value="${v.local_detalhe || ''}" placeholder="Ex.: sala 12, perto da escada"></div>
    <div class="campo"><label for="ocorrido_em">Data e hora</label><input id="ocorrido_em" name="ocorrido_em" type="datetime-local" required max="${agoraLocal()}" value="${v.ocorrido_em ? paraBelem(v.ocorrido_em) : agoraLocal()}"><div class="dica">Horário de Belém. É a partir daqui que contamos os dias.</div></div>`;
}

async function formEditar(box, i, id, recarregar) {
  const m = await meta();
  mostrar(box, html`<form class="painel-acao" novalidate><h2 class="h3">Editar publicação</h2>${camposItem(m, i)}
    <div class="campo"><label for="descricao">Descrição</label><textarea id="descricao" name="descricao" maxlength="1000">${i.descricao}</textarea></div>
    <button class="btn btn-azul" type="submit">Salvar alterações</button></form>`);
  const form = box.querySelector('form');
  form.addEventListener('submit', ocupado(form.querySelector('button[type="submit"]'), async (e) => {
    e.preventDefault(); erroCampos(form);
    const d = formDados(form);
    d.categoria_id = Number(d.categoria_id); d.local_id = Number(d.local_id);
    try { await patch(`/api/itens/${id}`, d); toast('Alterações salvas.', 'ok'); recarregar(); }
    catch (err) { if (err instanceof ApiError) { erroCampos(form, err.campos); toast(err.message, 'erro'); } else throw err; }
  }));
}

export async function novo({ el, query }) {
  const m = await meta();
  let tipo = query.get('tipo') === 'achado' ? 'achado' : 'perdido';
  const fotos = []; // { id, url }
  mostrar(el, html`<div class="form-estreito"><h1>Postar item</h1>
    <form id="f" novalidate>
      <div class="escolha-tipo" role="group" aria-label="Tipo de publicação">
        <button type="button" data-tipo="perdido" aria-pressed="${tipo === 'perdido'}"><b>Perdi algo</b><span>Quero que me avisem se acharem.</span></button>
        <button type="button" data-tipo="achado" aria-pressed="${tipo === 'achado'}"><b>Achei algo</b><span>Vou deixar no Protocolo.</span></button>
      </div>
      <div id="aviso-tipo"></div>
      ${camposItem(m)}
      <div class="campo"><label for="descricao">Descrição</label><textarea id="descricao" name="descricao" maxlength="1000" placeholder="Cor, marca, tamanho…"></textarea>
        <div class="dica" id="dica-desc"></div></div>
      <div class="campo"><label>Fotos <span class="dica" id="dica-fotos"></span></label>
        <div class="botoes-foto">
          <label class="btn btn-borda" for="cam">${icone('camera')} Tirar foto</label>
          <label class="btn btn-borda" for="gal">${icone('image')} Escolher da galeria</label>
        </div>
        <input id="cam" type="file" accept="image/*" capture="environment"><input id="gal" type="file" accept="image/*" multiple>
        <div class="fotos-prev" id="prev"></div></div>
      <button class="btn btn-ouro btn-bloco" type="submit" id="enviar">Publicar</button>
    </form></div>`);
  const form = el.querySelector('#f');
  const prev = el.querySelector('#prev');

  function atualizarTipo() {
    el.querySelectorAll('[data-tipo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipo === tipo)));
    mostrar(el.querySelector('#aviso-tipo'), tipo === 'achado'
      ? html`<div class="alerta alerta-info">Tire a foto e <b>deixe o item no Protocolo</b>. Não descreva detalhes que só o dono saberia (ex.: o que há dentro).</div>`
      : html`<div class="alerta alerta-info">Descreva bem o item. Quem achar poderá te avisar por e-mail ou deixar no Protocolo.</div>`);
    el.querySelector('#dica-desc').textContent = tipo === 'perdido' ? 'Obrigatória (mínimo 10 caracteres).' : 'Opcional.';
    el.querySelector('#dica-fotos').textContent = tipo === 'achado' ? '(obrigatória: pelo menos 1, até 4)' : '(opcional, até 4)';
  }
  function desenharFotos() {
    mostrar(prev, html`${fotos.map((f, n) => html`<div class="f"><img src="${f.url}" alt="Pré-visualização ${n + 1}"><button type="button" data-rm="${n}" aria-label="Remover foto ${n + 1}">×</button></div>`)}`);
    prev.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { URL.revokeObjectURL(fotos[b.dataset.rm].url); fotos.splice(Number(b.dataset.rm), 1); desenharFotos(); }));
  }
  async function adicionar(arquivos) {
    for (const a of arquivos) {
      if (fotos.length >= 4) { toast('Máximo de 4 fotos.', 'erro'); break; }
      try {
        const blob = await prepararFoto(a);
        const up = await enviarFoto(blob);
        fotos.push({ id: up.id, url: URL.createObjectURL(blob) });
        desenharFotos();
      } catch (e) { toast(e.message, 'erro'); }
    }
  }
  el.querySelectorAll('[data-tipo]').forEach((b) => b.addEventListener('click', () => { tipo = b.dataset.tipo; atualizarTipo(); }));
  for (const id of ['cam', 'gal']) el.querySelector(`#${id}`).addEventListener('change', async (e) => { const arq = [...e.target.files]; e.target.value = ''; await adicionar(arq); });
  atualizarTipo();

  form.addEventListener('submit', ocupado(el.querySelector('#enviar'), async (e) => {
    e.preventDefault(); erroCampos(form);
    const d = formDados(form);
    d.tipo = tipo; d.categoria_id = Number(d.categoria_id); d.local_id = Number(d.local_id); d.fotos = fotos.map((f) => f.id);
    for (const k of ['descricao', 'local_detalhe']) if (!d[k]) delete d[k];
    try {
      const r = await post('/api/itens', d);
      toast('Publicado! Código ' + r.codigo, 'ok');
      location.hash = `#/itens/${r.id}`;
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      erroCampos(form, err.campos);
      if (err.campos?.fotos) { const p = document.createElement('div'); p.className = 'erro-campo'; p.textContent = err.campos.fotos; prev.after(p); }
      toast(err.message, 'erro');
    }
  }));
}
