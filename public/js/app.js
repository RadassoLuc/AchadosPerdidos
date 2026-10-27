import { carregarSessao, sessao, post } from './api.js';
import { html, icone, mostrar, raw, toast } from './ui.js';

const rotas = [
  { re: /^\/$/, mod: () => import('./pages/home.js') },
  { re: /^\/itens$/, mod: () => import('./pages/itens.js'), exp: 'lista', login: true },
  { re: /^\/itens\/(\d+)$/, mod: () => import('./pages/itens.js'), exp: 'detalhe', login: true },
  { re: /^\/novo$/, mod: () => import('./pages/itens.js'), exp: 'novo', login: true },
  { re: /^\/meus$/, mod: () => import('./pages/painel.js'), exp: 'meus', login: true },
  { re: /^\/conta$/, mod: () => import('./pages/painel.js'), exp: 'conta', login: true },
  { re: /^\/protocolo$/, mod: () => import('./pages/painel.js'), exp: 'protocolo', login: true, papeis: ['protocolo', 'admin'] },
  { re: /^\/admin$/, mod: () => import('./pages/painel.js'), exp: 'admin', login: true, papeis: ['admin'] },
  { re: /^\/entrar$/, mod: () => import('./pages/auth.js'), exp: 'entrar' },
  { re: /^\/cadastro$/, mod: () => import('./pages/auth.js'), exp: 'cadastro' },
  { re: /^\/verificar$/, mod: () => import('./pages/auth.js'), exp: 'verificar' },
  { re: /^\/esqueci$/, mod: () => import('./pages/auth.js'), exp: 'esqueci' },
  { re: /^\/redefinir$/, mod: () => import('./pages/auth.js'), exp: 'redefinir' },
  { re: /^\/privacidade$/, mod: () => import('./pages/auth.js'), exp: 'privacidade' },
];

const main = document.getElementById('conteudo');
let navAberto = false;

function desenharTopo() {
  const u = sessao.usuario;
  const atual = location.hash.slice(1).split('?')[0] || '/';
  const cur = (p) => (atual === p ? 'aria-current="page"' : '');
  const equipe = u && (u.papel === 'protocolo' || u.papel === 'admin');
  mostrar(document.getElementById('cabecalho'), html`<header class="topo"><div class="wrap">
    <a class="marca" href="#/"><img src="/logo.webp" alt="Brasão da UEPA"><span>Achados e Perdidos<small>UEPA · Campus Parauapebas</small></span></a>
    <button class="menu-btn" id="menu-btn" aria-label="Abrir menu" aria-expanded="${navAberto}">${icone('menu')}</button>
    <nav class="nav ${navAberto ? 'aberto' : ''}" id="nav" aria-label="Principal">
      <a href="#/itens" ${raw(cur('/itens'))}>Itens</a>
      ${u ? html`<a href="#/meus" ${raw(cur('/meus'))}>Meus itens</a>` : ''}
      ${equipe ? html`<a href="#/protocolo" ${raw(cur('/protocolo'))}>Protocolo</a>` : ''}
      ${u?.papel === 'admin' ? html`<a href="#/admin" ${raw(cur('/admin'))}>Admin</a>` : ''}
      <button class="link" id="tema" type="button" aria-label="Alternar tema claro/escuro">${icone('moon')}</button>
      ${u ? html`<a href="#/conta" ${raw(cur('/conta'))}>${icone('user')} ${u.nome.split(' ')[0]}</a><button class="link" id="sair" type="button">Sair</button>`
          : html`<a href="#/entrar">Entrar</a>`}
      <a class="btn btn-ouro btn-sm" href="#/novo">${icone('plus')} Postar item</a>
    </nav></div></header>`);
  document.getElementById('menu-btn').onclick = () => { navAberto = !navAberto; desenharTopo(); };
  document.getElementById('nav').addEventListener('click', (e) => { if (e.target.closest('a')) { navAberto = false; document.getElementById('nav').classList.remove('aberto'); } });
  document.getElementById('tema').onclick = () => {
    const escuro = document.documentElement.dataset.tema === 'dark' || (!document.documentElement.dataset.tema && matchMedia('(prefers-color-scheme: dark)').matches);
    const novo = escuro ? 'light' : 'dark';
    document.documentElement.dataset.tema = novo;
    try { localStorage.setItem('tema', novo); } catch { /* ok */ }
  };
  const sair = document.getElementById('sair');
  if (sair) sair.onclick = async () => { try { await post('/api/auth/sair'); } catch { /* ok */ } sessao.usuario = null; sessao.csrf = ''; toast('Você saiu da conta.'); location.hash = '#/'; desenharTopo(); };
}

function desenharRodape() {
  mostrar(document.getElementById('rodape'), html`<footer class="rodape"><div class="wrap">
    <div><h4>Achados e Perdidos UEPA</h4><p>Projeto da comunidade acadêmica do campus Parauapebas para devolver o que foi esquecido pelos corredores. Os itens achados ficam guardados no Protocolo.</p></div>
    <div><h4>Navegue</h4><a href="#/itens">Ver itens</a><a href="#/novo">Postar item</a><a href="#/meus">Meus itens</a></div>
    <div><h4>Ajuda</h4><a href="#/privacidade">Privacidade e termos</a><a href="#/esqueci">Esqueci minha senha</a></div>
    <div class="fim">Uso restrito a quem tem e-mail institucional da UEPA. Não é um site oficial da Universidade do Estado do Pará.</div>
  </div></footer>`);
}

let numero = 0;
async function navegar() {
  const eu = ++numero;
  const [caminho, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const query = new URLSearchParams(qs);
  const rota = rotas.find((r) => r.re.test(caminho));
  desenharTopo();
  if (!rota) { mostrar(main, html`<div class="vazio"><h1>Página não encontrada</h1><a class="btn btn-azul" href="#/">Voltar ao início</a></div>`); return; }
  if (rota.login && !sessao.usuario) { location.replace(`#/entrar?volta=${encodeURIComponent(location.hash.slice(1))}`); return; }
  if (rota.papeis && !rota.papeis.includes(sessao.usuario?.papel)) { mostrar(main, html`<div class="vazio"><h1>Acesso restrito</h1><p>Esta área é só para a equipe do Protocolo.</p></div>`); return; }
  mostrar(main, html`<div class="carregando">Carregando…</div>`);
  try {
    const mod = await rota.mod();
    if (eu !== numero) return;
    const params = caminho.match(rota.re).slice(1);
    await mod[rota.exp || 'default']({ el: main, params, query, atualizarTopo: desenharTopo });
  } catch (e) {
    if (eu !== numero) return;
    console.error(e);
    mostrar(main, html`<div class="vazio"><h1>Ops!</h1><p>${e.message || 'Algo deu errado.'}</p><a class="btn btn-azul" href="#/">Voltar ao início</a></div>`);
  }
  if (eu === numero) { window.scrollTo(0, 0); main.focus({ preventScroll: true }); }
}

window.addEventListener('hashchange', navegar);
window.addEventListener('sessao-expirou', () => { toast('Sua sessão expirou. Entre novamente.', 'erro'); location.hash = '#/entrar'; });
desenharRodape();
try { await carregarSessao(); } catch { /* visitante */ }
navegar();
