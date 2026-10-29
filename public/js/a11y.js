// Painel de acessibilidade: texto, fonte, contraste, espaçamento, links, cursor, foco, animações e leitura em voz alta.
import { html, icone, mostrar } from './ui.js';

const PADRAO = { fonte: 1, letra: 'padrao', contraste: false, espaco: false, movimento: false, links: false, cursor: false, foco: false };
const LETRAS = [
  ['padrao', 'Padrão do site'],
  ['legivel', 'Letra bem legível (Verdana/Tahoma)'],
  ['comic', 'Comic Sans (preferência pessoal)'],
];
const ler = () => { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem('a11y') || '{}') }; } catch { return { ...PADRAO }; } };
const salvar = (p) => { try { localStorage.setItem('a11y', JSON.stringify(p)); } catch { /* sem armazenamento */ } };

export function aplicar(p = ler()) {
  const h = document.documentElement.dataset;
  const set = (k, v) => (v ? (h[k] = v) : delete h[k]);
  set('fonte', p.fonte > 1 ? String(p.fonte) : '');
  set('letra', p.letra !== 'padrao' ? p.letra : '');
  set('contraste', p.contraste ? 'alto' : '');
  set('espaco', p.espaco ? 'amplo' : '');
  set('movimento', p.movimento ? 'reduzido' : '');
  set('links', p.links ? 'sublinhados' : '');
  set('cursor', p.cursor ? 'grande' : '');
  set('foco', p.foco ? 'forte' : '');
}

// ---------- Leitura em voz alta (Web Speech API do próprio navegador; não envia nada para fora) ----------
export const temVoz = () => 'speechSynthesis' in window;
let lendo = false;
export function pararLeitura() { if (temVoz()) speechSynthesis.cancel(); lendo = false; atualizarBotaoLer(); }
function pedacos(texto) {
  const partes = texto.replace(/\s+/g, ' ').match(/[^.!?;:]+[.!?;:]?/g) || [];
  const out = []; let atual = '';
  for (const p of partes) { if ((atual + p).length > 180 && atual) { out.push(atual); atual = p; } else atual += p; }
  if (atual.trim()) out.push(atual);
  return out;
}
export function lerPagina() {
  if (!temVoz()) return false;
  speechSynthesis.cancel();
  const alvo = document.getElementById('conteudo');
  const texto = alvo?.innerText?.trim();
  if (!texto) return false;
  const voz = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt-br')) || speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('pt'));
  const fila = pedacos(texto);
  lendo = true; atualizarBotaoLer();
  fila.forEach((t, n) => {
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-BR'; if (voz) u.voice = voz; u.rate = 0.95;
    if (n === fila.length - 1) u.onend = () => { lendo = false; atualizarBotaoLer(); };
    u.onerror = () => { lendo = false; atualizarBotaoLer(); };
    speechSynthesis.speak(u);
  });
  return true;
}
function atualizarBotaoLer() {
  const b = document.getElementById('a11y-ler'); if (!b) return;
  b.textContent = lendo ? 'Parar leitura' : 'Ouvir esta página';
  b.setAttribute('aria-pressed', String(lendo));
}
window.addEventListener('hashchange', () => { if (lendo) pararLeitura(); });

let painel = null;
let gatilho = null;

function fechar() {
  if (!painel) return;
  painel.remove(); painel = null;
  document.removeEventListener('keydown', teclas, true);
  document.removeEventListener('pointerdown', fora, true);
  gatilho?.setAttribute('aria-expanded', 'false');
  gatilho?.focus();
}
function teclas(e) {
  if (e.key === 'Escape') { e.preventDefault(); fechar(); return; }
  if (e.key !== 'Tab' || !painel) return;
  const foc = [...painel.querySelectorAll('button, input, a[href]')].filter((x) => !x.disabled);
  const primeiro = foc[0], ultimo = foc.at(-1);
  if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
}
function fora(e) { if (painel && !painel.contains(e.target) && !gatilho?.contains(e.target)) fechar(); }

const opcao = (p, chave, texto) => html`<label class="a11y-opcao"><input type="checkbox" data-opcao="${chave}" ${p[chave] ? 'checked' : ''}> ${texto}</label>`;

function desenhar() {
  const p = ler();
  mostrar(painel, html`<h2 id="a11y-titulo">${icone('shield')} Acessibilidade</h2>
    ${temVoz() ? html`<button type="button" class="btn btn-azul btn-sm btn-bloco" id="a11y-ler" aria-pressed="${lendo}">${lendo ? 'Parar leitura' : 'Ouvir esta página'}</button><p class="dica">Leitura em voz alta, feita pelo seu navegador. Também funciona com leitores de tela (NVDA, JAWS, VoiceOver, TalkBack).</p>` : ''}
    <fieldset><legend>Tamanho do texto</legend>
      <div class="a11y-fonte">
        <button type="button" class="btn btn-borda btn-sm" data-fonte="-1" aria-label="Diminuir texto" ${p.fonte <= 1 ? 'disabled' : ''}>A−</button>
        <span class="nivel" aria-live="polite">Nível ${p.fonte} de 4</span>
        <button type="button" class="btn btn-borda btn-sm" data-fonte="1" aria-label="Aumentar texto" ${p.fonte >= 4 ? 'disabled' : ''}>A+</button>
      </div></fieldset>
    <fieldset><legend>Tipo de letra</legend>
      ${LETRAS.map(([v, t]) => html`<label class="a11y-opcao"><input type="radio" name="letra" value="${v}" ${p.letra === v ? 'checked' : ''}> ${t}</label>`)}
      <p class="dica">Cada pessoa lê melhor de um jeito. Experimente e fique com a que for mais confortável para você.</p>
    </fieldset>
    <fieldset><legend>Exibição</legend>
      ${opcao(p, 'contraste', 'Alto contraste')}
      ${opcao(p, 'espaco', 'Mais espaço entre letras, palavras e linhas')}
      ${opcao(p, 'links', 'Sublinhar todos os links')}
      ${opcao(p, 'foco', 'Destacar mais o item selecionado (teclado)')}
      ${opcao(p, 'cursor', 'Cursor do mouse grande')}
      ${opcao(p, 'movimento', 'Reduzir animações')}
    </fieldset>
    <p class="dica">Tradução em Libras: use o botão azul do VLibras, no canto da tela.</p>
    <div class="acoes"><button type="button" class="btn btn-borda btn-sm" data-reset>Restaurar padrão</button>
      <a class="btn btn-azul btn-sm" href="#/acessibilidade" data-fechar>Saiba mais</a>
      <button type="button" class="btn btn-borda btn-sm" data-fechar>Fechar</button></div>`);
  painel.querySelectorAll('[data-fonte]').forEach((b) => b.addEventListener('click', () => {
    const q = ler(); q.fonte = Math.min(4, Math.max(1, q.fonte + Number(b.dataset.fonte))); salvar(q); aplicar(q); desenhar();
    painel.querySelector(`[data-fonte="${b.dataset.fonte}"]:not(:disabled)`)?.focus();
  }));
  painel.querySelectorAll('[data-opcao]').forEach((c) => c.addEventListener('change', () => { const q = ler(); q[c.dataset.opcao] = c.checked; salvar(q); aplicar(q); }));
  painel.querySelectorAll('input[name="letra"]').forEach((c) => c.addEventListener('change', () => { const q = ler(); q.letra = c.value; salvar(q); aplicar(q); }));
  painel.querySelector('#a11y-ler')?.addEventListener('click', () => { if (lendo) pararLeitura(); else { fechar(); lerPagina(); } });
  painel.querySelector('[data-reset]').addEventListener('click', () => { salvar({ ...PADRAO }); aplicar({ ...PADRAO }); desenhar(); painel.querySelector('button, input')?.focus(); });
  painel.querySelectorAll('[data-fechar]').forEach((b) => b.addEventListener('click', fechar));
}

export function alternarPainel(botao) {
  gatilho = botao;
  if (painel) return fechar();
  painel = document.createElement('div');
  painel.className = 'card a11y-painel';
  painel.setAttribute('role', 'dialog');
  painel.setAttribute('aria-labelledby', 'a11y-titulo');
  document.body.append(painel);
  desenhar();
  botao.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', teclas, true);
  document.addEventListener('pointerdown', fora, true);
  painel.querySelector('button:not(:disabled), input')?.focus();
}
