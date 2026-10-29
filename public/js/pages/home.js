import { get, meta, sessao } from '../api.js';
import { cartaoItem, html, icone, mostrar } from '../ui.js';

const FAQ = [
  ['Preciso pagar ou negociar algo?', 'Não. Aqui ninguém compra nem vende: você só avisa que perdeu ou achou algo, e a devolução acontece no Protocolo da faculdade.'],
  ['Achei um objeto. O que eu faço?', 'Tire uma foto, publique como “Achei” informando onde e quando encontrou e leve o item ao Protocolo. Assim o dono sabe onde buscar.'],
  ['Como provo que o item é meu?', 'Clique em “É meu!” e descreva algo que não aparece na foto (marca, riscos, conteúdo). O Protocolo confere e entrega mediante documento com foto.'],
  ['Meu telefone ou e-mail fica público?', 'Não. Seus dados de contato não aparecem para outros alunos. Só o Protocolo e quem você avisar em um anúncio de perdido recebem seu nome e e-mail.'],
  ['O que acontece com itens que ninguém busca?', 'Depois de um prazo definido pela faculdade (hoje, 90 dias), o Protocolo pode destinar o item para doação ou descarte, sempre com registro.'],
];

export default async function home({ el }) {
  const logado = !!sessao.usuario;
  const [resumo, m, recentes] = await Promise.all([
    get('/api/publico/resumo').catch(() => ({ achados_ativos: 0, perdidos_ativos: 0, devolvidos: 0 })),
    meta().catch(() => ({ categorias: [] })),
    logado ? get('/api/itens?por_pagina=8').catch(() => ({ itens: [] })) : Promise.resolve(null),
  ]);
  mostrar(el, html`
  <section class="hero"><div class="wrap">
    <div>
      <span class="etiqueta">${icone('shield')} Exclusivo para a comunidade UEPA</span>
      <h1>Perdeu algo na UEPA? <em>Vamos achar juntos.</em></h1>
      <p class="lead">Publique o que você perdeu ou achou, acompanhe há quantos dias o item está parado e retire no Protocolo. Chega de se perder em grupo de WhatsApp.</p>
      <form class="busca-hero" id="busca" role="search">
        <input name="q" type="search" placeholder="Garrafa, carregador, chave, documento…" aria-label="Buscar itens" maxlength="60">
        <button class="btn btn-ouro" type="submit">${icone('search')} Buscar</button>
      </form>
      <div class="atalhos">
        <a class="btn btn-borda btn-sm btn-claro" href="#/novo?tipo=perdido">Perdi algo</a>
        <a class="btn btn-borda btn-sm btn-claro" href="#/novo?tipo=achado">Achei algo</a>
      </div>
    </div>
    <div class="mock" aria-hidden="true">
      <div class="m m1"><div class="foto">${icone('bottle')}</div><b>Garrafa azul</b><span>Biblioteca · <span class="dias dias-recente">Há 2 dias</span></span></div>
      <div class="m m2"><div class="foto">${icone('card')}</div><b>Carteira preta</b><span>Pátio · <span class="dias dias-atencao">Há 12 dias</span></span></div>
      <div class="m m3"><div class="foto">${icone('key')}</div><b>Chaveiro com 3 chaves</b><span>Laboratórios · <span class="dias dias-alerta">Há 35 dias</span></span></div>
    </div>
  </div></section>

  <div class="faixa-wrap"><div class="faixa"><div class="wrap">
    <div><strong>${resumo.achados_ativos}</strong><span>${resumo.achados_ativos === 1 ? 'achado aguardando dono' : 'achados aguardando dono'}</span></div>
    <div><strong>${resumo.perdidos_ativos}</strong><span>${resumo.perdidos_ativos === 1 ? 'item sendo procurado' : 'itens sendo procurados'}</span></div>
    <div><strong>${resumo.devolvidos}</strong><span>${resumo.devolvidos === 1 ? 'item devolvido' : 'itens devolvidos'}</span></div>
  </div></div></div>

  ${recentes ? html`<section class="secao wrap"><h2>Publicados recentemente</h2><p class="sub">Veja se o que você procura já apareceu por aqui.</p>
    ${recentes.itens.length ? html`<div class="grade">${recentes.itens.map(cartaoItem)}</div><p class="centro mt"><a class="btn btn-azul" href="#/itens">Ver todos os itens ${icone('arrow')}</a></p>`
      : html`<div class="vazio">Ainda não há itens. Seja o primeiro a publicar!</div>`}</section>` : ''}

  <section class="secao wrap"><h2>Como funciona</h2><p class="sub">Três passos simples, sem burocracia.</p>
    <div class="passos">
      <div class="card passo"><div class="n">1</div><h2 class="h3">Publique com foto</h2><p>Perdeu ou achou algo? Tire uma foto, diga onde e quando foi e publique em menos de um minuto.</p></div>
      <div class="card passo"><div class="n">2</div><h2 class="h3">Deixe no Protocolo</h2><p>Quem achou entrega o item no Protocolo. O sistema mostra há quantos dias ele está lá.</p></div>
      <div class="card passo"><div class="n">3</div><h2 class="h3">Retire com segurança</h2><p>O dono clica em “É meu!”, o Protocolo confere e registra a devolução com data e documento.</p></div>
    </div></section>

  <section class="secao wrap sem-topo"><h2>Navegue por categoria</h2><p class="sub">Encontre mais rápido filtrando pelo tipo de objeto.</p>
    <div class="cats">${m.categorias.map((c) => html`<a class="card cat" href="#/itens?categoria=${c.id}"><span class="ic">${icone(c.icone)}</span>${c.nome}</a>`)}</div></section>

  <section class="secao wrap faq sem-topo"><h2>Perguntas frequentes</h2><p class="sub">Tudo o que você precisa saber antes de usar.</p>
    <div class="estreito">${FAQ.map(([q, a]) => html`<details class="card"><summary>${q}</summary><p>${a}</p></details>`)}</div></section>

  <section class="wrap"><div class="cta"><div><h2>Viu algo por aí?</h2><p>Publique agora e ajude alguém a recuperar o que perdeu.</p></div>
    <a class="btn btn-ouro" href="#/novo">${icone('plus')} Postar item</a></div></section>`);

  el.querySelector('#busca').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = new FormData(e.target).get('q').toString().trim();
    location.hash = `#/itens${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  });
}
