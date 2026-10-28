import { ApiError, apagar, enviarAvatar, get, patch, post, prepararAvatar, sessao } from '../api.js';
import { avatar, dataHora, erroCampos, formDados, html, icone, mostrar, ocupado, seloDias, toast } from '../ui.js';

const linhaItem = (i) => html`<a class="mini-item" href="#/itens/${i.id}">
  ${i.capa ? html`<img src="${i.capa}" alt="">` : html`<span class="ph">${icone(i.categoria?.icone || 'box')}</span>`}
  <div><b>${i.titulo}</b><div class="meta"><span class="mono">${i.codigo}</span> · ${i.status_rotulo || i.status}</div></div></a>`;
const falhar = (e) => { if (e instanceof ApiError) toast(e.message, 'erro'); else throw e; };

// ------------------------------------------------------------ Meus itens
export async function meus({ el }) {
  const r = await get('/api/meus');
  mostrar(el, html`<div class="wrap"><div class="titulo-pagina"><h1>Meus itens</h1><a class="btn btn-ouro" href="#/novo">${icone('plus')} Postar item</a></div>
    ${r.itens.length ? html`<div class="grade">${r.itens.map((i) => html`<div>${''}<a class="card item" href="#/itens/${i.id}"><div class="capa">${i.capa ? html`<img src="${i.capa}" alt="">` : icone(i.categoria.icone)}<span class="selo selo-${i.tipo}">${i.tipo === 'achado' ? 'Achado' : 'Perdido'}</span>${seloDias(i)}</div>
      <div class="corpo"><h2 class="h3">${i.titulo}</h2><div class="meta"><span class="selo selo-status">${i.status_rotulo}</span> <span class="mono">${i.codigo}</span></div>
      ${i.avisos ? html`<div class="meta">${i.avisos} aviso(s) recebido(s)</div>` : ''}${i.reivindicacoes ? html`<div class="meta">${i.reivindicacoes} reivindicação(ões)</div>` : ''}</div></a></div>`)}</div>`
      : html`<div class="vazio card">Você ainda não publicou nada.</div>`}
    <h2 class="sub-titulo">Minhas reivindicações</h2>
    ${r.reivindicacoes.length ? html`<div class="card">${r.reivindicacoes.map((x) => html`<a class="mini-item" href="#/itens/${x.item_id}"><div><b>${x.titulo}</b> <span class="mono dica">${x.codigo}</span><div class="meta"><span class="selo selo-status">${x.status}</span> ${dataHora(x.criado_em)}${x.nota_decisao ? ` · ${x.nota_decisao}` : ''}</div></div></a>`)}</div>` : html`<p class="dica">Nenhuma reivindicação.</p>`}
  </div>`);
}

// ------------------------------------------------------------ Conta
export async function conta({ el, atualizarTopo }) {
  const u = sessao.usuario;
  mostrar(el, html`<div class="form-estreito"><h1>Minha conta</h1>
    <div class="card pad perfil"><div id="foto-perfil">${avatar(u, 'xl', true)}</div>
      <div><p><b>${u.nome}</b><br>${u.email}${u.matricula ? html`<br>Matrícula ${u.matricula}` : ''}<br><span class="selo selo-status">${u.papel}</span></p>
        <div class="botoes-foto"><label class="btn btn-borda btn-sm" for="foto-in">${icone('camera')} ${u.avatar ? 'Trocar foto' : 'Adicionar foto de perfil'}</label>
          <input id="foto-in" type="file" accept="image/*">
          ${u.avatar ? html`<button class="btn btn-borda btn-sm" type="button" id="foto-rm">Remover foto</button>` : ''}</div>
        <p class="dica">Opcional. A foto aparece nos itens que você publica e ajuda o Protocolo a conferir quem retira o item (junto com o documento). Só quem está logado a vê.</p></div></div>
    ${u.tem_senha ? html`<h2 class="sub-titulo">Alterar senha</h2>
    <form class="card pad" id="senha" novalidate>
      <div class="campo"><label for="atual">Senha atual</label><input id="atual" name="atual" type="password" autocomplete="current-password"></div>
      <div class="campo"><label for="nova">Nova senha</label><input id="nova" name="nova" type="password" autocomplete="new-password"><div class="dica">Mínimo de 10 caracteres, com letras e números.</div></div>
      <button class="btn btn-azul" type="submit">Alterar senha</button></form>` : html`<p class="dica mt">Sua conta usa o login do Google, então não há senha para alterar.</p>`}
    <h2 class="sub-titulo">Excluir conta</h2>
    <form class="card pad" id="excluir" novalidate>
      <p>Seus dados pessoais serão anonimizados. Esta ação não pode ser desfeita.</p>
      ${u.tem_senha ? html`<div class="campo"><label for="senha-ex">Confirme sua senha</label><input id="senha-ex" name="senha" type="password" autocomplete="current-password"></div>`
        : html`<div class="campo"><label for="conf-ex">Digite EXCLUIR para confirmar</label><input id="conf-ex" name="confirmacao" autocomplete="off"></div>`}
      <button class="btn btn-perigo" type="submit">Excluir minha conta</button></form></div>`);
  el.querySelector('#foto-in').addEventListener('change', async (e) => {
    const arq = e.target.files[0]; e.target.value = '';
    if (!arq) return;
    try { const r = await enviarAvatar(await prepararAvatar(arq)); sessao.usuario.avatar = r.avatar; toast('Foto atualizada.', 'ok'); atualizarTopo(); conta({ el, atualizarTopo }); }
    catch (err) { falhar(err); }
  });
  el.querySelector('#foto-rm')?.addEventListener('click', async () => {
    try { await apagar('/api/eu/avatar'); sessao.usuario.avatar = null; toast('Foto removida.'); atualizarTopo(); conta({ el, atualizarTopo }); } catch (err) { falhar(err); }
  });
  const ligar = (id, fn) => {
    const f = el.querySelector(id);
    f.addEventListener('submit', ocupado(f.querySelector('button'), async (e) => {
      e.preventDefault(); erroCampos(f);
      try { await fn(formDados(f), f); } catch (err) { if (err instanceof ApiError) { erroCampos(f, err.campos); toast(err.message, 'erro'); } else throw err; }
    }));
  };
  if (u.tem_senha) ligar('#senha', async (d, f) => { await post('/api/auth/senha', d); f.reset(); toast('Senha alterada.', 'ok'); });
  ligar('#excluir', async (d) => {
    if (!confirm('Tem certeza? Sua conta será excluída.')) return;
    await post('/api/auth/excluir-conta', d);
    sessao.usuario = null; sessao.csrf = ''; atualizarTopo(); toast('Conta excluída.'); location.hash = '#/';
  });
}

// ------------------------------------------------------------ Protocolo
export async function protocolo({ el }) {
  const p = await get('/api/protocolo/painel');
  const linha = (i, extra = '') => html`<a class="mini-item" href="#/itens/${i.id}">${i.capa ? html`<img src="${i.capa}" alt="">` : html`<span class="ph">${icone('box')}</span>`}
    <div><b>${i.titulo}</b> <span class="mono dica">${i.codigo}</span><div class="meta">${i.local}${i.local_guarda ? ` · guardado: ${i.local_guarda}` : ''} · <span class="dias dias-${i.dias <= 7 ? 'recente' : i.dias <= 30 ? 'atencao' : i.dias <= 60 ? 'alerta' : 'critico'}">${i.dias} dia(s)</span> ${extra}</div></div></a>`;
  mostrar(el, html`<div class="wrap"><div class="titulo-pagina"><div><h1>Painel do Protocolo</h1><span class="dica">Prazo de retenção: ${p.retencao_dias} dias</span></div></div>
    <div class="duas-col">
      <section><h2 class="sub-titulo">A caminho do Protocolo (${p.aguardando.length})</h2><div class="card">${p.aguardando.length ? p.aguardando.map((i) => linha(i)) : html`<p class="vazio">Nada aguardando.</p>`}</div></section>
      <section><h2 class="sub-titulo">Reivindicações a conferir (${p.reivindicacoes.length})</h2><div class="card">${p.reivindicacoes.length ? p.reivindicacoes.map((r) => html`<a class="mini-item" href="#/itens/${r.item_id}">${avatar(r, 'lg', true)}<div><b>${r.titulo}</b> <span class="mono dica">${r.codigo}</span><div class="meta">${r.nome}${r.matricula ? ` · mat. ${r.matricula}` : ''} · <span class="selo selo-status">${r.status}</span></div><div class="dica">“${r.prova}”</div></div></a>`) : html`<p class="vazio">Nenhuma reivindicação.</p>`}</div></section>
    </div>
    <h2 class="sub-titulo">Guardados no Protocolo (${p.guardados.length})</h2>
    <div class="card">${p.guardados.length ? p.guardados.map((i) => linha(i, i.elegivel_destino ? html`<span class="selo selo-status">pode destinar</span>` : i.status === 'em_reclamacao' ? html`<span class="selo selo-status">em reclamação</span>` : '')) : html`<p class="vazio">Nenhum item guardado.</p>`}</div></div>`);
}

// ------------------------------------------------------------ Admin
export async function admin({ el }) {
  let q = '';
  async function desenhar() {
    const [us, dn, au, cat] = await Promise.all([get(`/api/admin/usuarios?q=${encodeURIComponent(q)}`), get('/api/admin/denuncias'), get('/api/admin/auditoria'), get('/api/admin/catalogos')]);
    mostrar(el, html`<div class="wrap"><div class="titulo-pagina"><h1>Administração</h1></div>
      <h2 class="sub-titulo">Denúncias abertas (${dn.denuncias.length})</h2>
      <div class="card">${dn.denuncias.length ? dn.denuncias.map((d) => html`<div class="mini-item"><div><a href="#/itens/${d.item_id}"><b>${d.titulo}</b></a> <span class="mono dica">${d.codigo}</span><p>“${d.motivo}” <span class="dica">— ${d.denunciante}</span></p>
        <div class="acoes"><button class="btn btn-perigo btn-sm" data-dn="${d.id}" data-acao="remover">Remover item</button><button class="btn btn-borda btn-sm" data-dn="${d.id}" data-acao="descartar">Descartar</button></div></div></div>`) : html`<p class="vazio">Nenhuma denúncia.</p>`}</div>
      <h2 class="sub-titulo">Usuários</h2>
      <form id="busca-u" class="campo"><input name="q" type="search" value="${q}" placeholder="Buscar por nome ou e-mail" aria-label="Buscar usuário por nome ou e-mail" maxlength="60"></form>
      <div class="card rolagem"><table class="tabela"><thead><tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>
        ${us.usuarios.map((u) => html`<tr><td>${u.nome}</td><td>${u.email}</td>
          <td><select data-papel="${u.id}" aria-label="Papel de ${u.nome}">${['aluno', 'protocolo', 'admin'].map((p) => html`<option ${u.papel === p ? 'selected' : ''}>${p}</option>`)}</select></td>
          <td>${u.bloqueado ? 'Bloqueado' : u.verificado_em ? 'Ativo' : 'Não confirmou e-mail'}</td>
          <td><button class="btn btn-borda btn-sm" data-bloq="${u.id}" data-v="${u.bloqueado ? 0 : 1}">${u.bloqueado ? 'Desbloquear' : 'Bloquear'}</button></td></tr>`)}</tbody></table></div>
      <h2 class="sub-titulo">Categorias e locais do campus</h2>
      <p class="dica">Renomeie, desative (some do formulário, mas itens antigos continuam) ou remova de vez (só se nenhum item usa).</p>
      <div class="uma-col">${[['categorias', 'Categorias', cat.categorias], ['locais', 'Locais do campus', cat.locais]].map(([k, t, lista]) => html`
        <section class="card pad"><h2 class="h3">${t}</h2>
          <ul class="catalogo">${lista.map((x) => html`<li class="${x.ativo ? '' : 'inativo'}">
            <input value="${x.nome}" maxlength="60" aria-label="Nome (${t.toLowerCase()})" data-nome="${k}:${x.id}">
            <span class="dica">${x.usos} ${x.usos === 1 ? 'item' : 'itens'}</span>
            <button class="btn btn-borda btn-sm" type="button" data-salvar="${k}:${x.id}">Salvar</button>
            <button class="btn btn-borda btn-sm" type="button" data-ativo="${k}:${x.id}:${x.ativo ? 0 : 1}">${x.ativo ? 'Desativar' : 'Ativar'}</button>
            <button class="btn btn-perigo btn-sm" type="button" data-remover="${k}:${x.id}" data-nomeitem="${x.nome}">Remover</button></li>`)}</ul>
          <form data-cat="${k}" class="novo-cat"><label for="novo-${k}">Adicionar</label><div class="linha-form"><input id="novo-${k}" name="nome" maxlength="60" placeholder="${k === 'locais' ? 'Ex.: Bloco B' : 'Ex.: Fones de ouvido'}"><button class="btn btn-azul btn-sm" type="submit">Adicionar</button></div></form>
        </section>`)}
      </div>
      <h2 class="sub-titulo">Auditoria (últimos 50 eventos)</h2>
      <div class="card rolagem"><table class="tabela"><thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Alvo</th><th>IP</th></tr></thead><tbody>
        ${au.registros.map((a) => html`<tr><td>${dataHora(a.criado_em)}</td><td>${a.usuario || '—'}</td><td class="mono">${a.acao}</td><td>${a.alvo}</td><td class="mono">${a.ip}</td></tr>`)}</tbody></table></div></div>`);
    el.querySelectorAll('[data-dn]').forEach((b) => b.addEventListener('click', async () => {
      try { await post(`/api/admin/denuncias/${b.dataset.dn}/resolver`, { acao: b.dataset.acao }); toast('Denúncia resolvida.', 'ok'); desenhar(); } catch (e) { falhar(e); }
    }));
    el.querySelectorAll('[data-papel]').forEach((s) => s.addEventListener('change', async () => {
      try { await patch(`/api/admin/usuarios/${s.dataset.papel}`, { papel: s.value }); toast('Papel atualizado.', 'ok'); } catch (e) { falhar(e); desenhar(); }
    }));
    el.querySelectorAll('[data-bloq]').forEach((b) => b.addEventListener('click', async () => {
      try { await patch(`/api/admin/usuarios/${b.dataset.bloq}`, { bloqueado: b.dataset.v === '1' }); desenhar(); } catch (e) { falhar(e); }
    }));
    el.querySelector('#busca-u').addEventListener('submit', (e) => { e.preventDefault(); q = new FormData(e.target).get('q').toString().trim(); desenhar(); });
    el.querySelectorAll('form[data-cat]').forEach((f) => f.addEventListener('submit', async (e) => {
      e.preventDefault();
      try { await post(`/api/admin/${f.dataset.cat}`, { nome: new FormData(f).get('nome').toString().trim() }); toast('Adicionado.', 'ok'); desenhar(); } catch (err) { falhar(err); }
    }));
    el.querySelectorAll('[data-salvar]').forEach((b) => b.addEventListener('click', async () => {
      const [k, id] = b.dataset.salvar.split(':');
      try { await patch(`/api/admin/${k}/${id}`, { nome: el.querySelector(`[data-nome="${k}:${id}"]`).value.trim() }); toast('Nome atualizado.', 'ok'); desenhar(); } catch (err) { falhar(err); }
    }));
    el.querySelectorAll('[data-ativo]').forEach((b) => b.addEventListener('click', async () => {
      const [k, id, v] = b.dataset.ativo.split(':');
      try { await patch(`/api/admin/${k}/${id}`, { ativo: v === '1' }); desenhar(); } catch (err) { falhar(err); }
    }));
    el.querySelectorAll('[data-remover]').forEach((b) => b.addEventListener('click', async () => {
      const [k, id] = b.dataset.remover.split(':');
      if (!confirm(`Remover "${b.dataset.nomeitem}" de vez?`)) return;
      try { await apagar(`/api/admin/${k}/${id}`); toast('Removido.', 'ok'); desenhar(); } catch (err) { falhar(err); }
    }));
  }
  await desenhar();
}
