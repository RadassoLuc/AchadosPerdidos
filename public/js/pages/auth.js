import { ApiError, definirSessao, meta, post } from '../api.js';
import { erroCampos, formDados, html, mostrar, ocupado, raw, toast } from '../ui.js';

function forca(s) {
  let p = 0;
  if (s.length >= 10) p++;
  if (s.length >= 14) p++;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) p++;
  if (/\d/.test(s)) p++;
  if (/[^A-Za-z0-9]/.test(s)) p++;
  return p;
}
const medidor = html`<div class="senha-forca" aria-hidden="true"><i></i></div><div class="dica">Mínimo de 10 caracteres, com letras e números. Evite usar o seu e-mail.</div>`;
function ligarMedidor(form) {
  const i = form.querySelector('.senha-forca i');
  const campo = form.querySelector('input[name="senha"], input[name="nova"]');
  if (!i || !campo) return;
  campo.addEventListener('input', () => {
    const f = forca(campo.value);
    i.style.width = `${(f / 5) * 100}%`;
    i.style.background = f <= 2 ? 'var(--verm)' : f <= 3 ? 'var(--laranja)' : 'var(--verde)';
  });
}
function enviar(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', ocupado(btn, async (e) => {
    e.preventDefault();
    erroCampos(form);
    form.querySelector('.alerta')?.remove();
    try { await fn(formDados(form), form); }
    catch (err) {
      if (!(err instanceof ApiError)) throw err;
      if (err.campos) erroCampos(form, err.campos);
      const a = document.createElement('div');
      a.className = 'alerta alerta-erro'; a.setAttribute('role', 'alert'); a.textContent = err.message;
      form.prepend(a);
      if (err.codigo === 'nao_verificado') { /* mantém a mensagem */ }
    }
  }));
}
const MSG_GOOGLE = {
  dominio: 'Use uma conta Google da UEPA (ex.: seunome@aluno.uepa.br).',
  google_negado: 'O login com Google foi cancelado.',
  google_falhou: 'Não foi possível entrar com o Google. Tente novamente.',
  suspensa: 'Conta suspensa. Procure o Protocolo.',
};
const logoGoogle = raw('<svg class="icone" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.7-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>');
async function botaoGoogle(query) {
  const m = await meta().catch(() => ({}));
  const erro = MSG_GOOGLE[query.get('erro')];
  return html`${erro ? html`<div class="alerta alerta-erro" role="alert">${erro}</div>` : ''}
    ${m.google ? html`<a class="btn btn-borda btn-bloco" href="/api/auth/google">${logoGoogle} Continuar com o Google (conta UEPA)</a>${m.senha === false ? '' : html`<p class="dica centro mt">ou use e-mail e senha</p>`}` : ''}`;
}
const aviso = (form, msg, tipo = 'ok') => { const a = document.createElement('div'); a.className = `alerta alerta-${tipo}`; a.textContent = msg; a.setAttribute('role', 'status'); form.replaceChildren(a); };

export async function entrar({ el, query, atualizarTopo }) {
  const m = await meta().catch(() => ({}));
  const google = await botaoGoogle(query);
  if (m.senha === false) {
    mostrar(el, html`<div class="auth card pad"><h1>Entrar</h1><p class="dica mb">Use a sua conta Google da UEPA (@aluno.uepa.br).</p>${google}<p class="dica">Ao entrar, você aceita os <a href="#/privacidade">termos e a política de privacidade</a>.</p></div>`);
    return;
  }
  mostrar(el, html`<div class="auth card pad"><h1>Entrar</h1><p class="dica mb">Use o seu e-mail institucional da UEPA.</p>
    ${google}
    <form id="f" novalidate>
      <div class="campo"><label for="email">E-mail</label><input id="email" name="email" type="email" autocomplete="username" required placeholder="seunome@aluno.uepa.br"></div>
      <div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="current-password" required></div>
      <button class="btn btn-azul btn-bloco" type="submit">Entrar</button>
    </form>
    <p class="mt"><a href="#/esqueci">Esqueci minha senha</a> · <a href="#/cadastro">Criar conta</a></p></div>`);
  enviar(el.querySelector('#f'), async (d) => {
    const r = await post('/api/auth/entrar', d);
    definirSessao(r);
    atualizarTopo();
    const volta = query.get('volta');
    location.hash = volta && volta.startsWith('/') && !volta.startsWith('//') ? `#${volta}` : '#/itens';
  });
}

export async function cadastro({ el, query }) {
  if ((await meta().catch(() => ({}))).senha === false) { location.replace('#/entrar'); return; }
  const google = await botaoGoogle(query);
  mostrar(el, html`<div class="auth card pad"><h1>Criar conta</h1><p class="dica mb">Só e-mails da UEPA (ex.: @aluno.uepa.br). Enviaremos um link para confirmar.</p>
    ${google}
    <form id="f" novalidate>
      <div class="campo"><label for="nome">Nome completo</label><input id="nome" name="nome" autocomplete="name" required maxlength="100"></div>
      <div class="campo"><label for="email">E-mail institucional</label><input id="email" name="email" type="email" autocomplete="username" required placeholder="seunome@aluno.uepa.br"></div>
      <div class="campo"><label for="matricula">Matrícula <span class="dica">(opcional, ajuda o Protocolo)</span></label><input id="matricula" name="matricula" inputmode="numeric" maxlength="20" autocomplete="off"></div>
      <div class="campo"><label for="senha">Senha</label><input id="senha" name="senha" type="password" autocomplete="new-password" required>${medidor}</div>
      <div class="campo"><label class="normal"><input name="aceite" type="checkbox" class="chk" required> Li e aceito os <a href="#/privacidade">termos e a política de privacidade</a>.</label></div>
      <button class="btn btn-azul btn-bloco" type="submit">Criar conta</button>
    </form><p class="mt">Já tem conta? <a href="#/entrar">Entrar</a></p></div>`);
  const f = el.querySelector('#f');
  ligarMedidor(f);
  enviar(f, async (d) => {
    if (!d.matricula) delete d.matricula;
    d.aceite = f.querySelector('[name="aceite"]').checked;
    const r = await post('/api/auth/cadastro', d);
    aviso(f, r.mensagem);
  });
}

export async function verificar({ el, query }) {
  const token = query.get('token') || '';
  mostrar(el, html`<div class="auth card pad"><h1>Confirmando e-mail…</h1><div id="r"></div></div>`);
  const r = el.querySelector('#r');
  try {
    const x = await post('/api/auth/verificar', { token });
    mostrar(el, html`<div class="auth card pad"><h1>E-mail confirmado!</h1><div class="alerta alerta-ok">${x.mensagem}</div><a class="btn btn-azul btn-bloco" href="#/entrar">Entrar</a></div>`);
  } catch (e) { r.innerHTML = ''; mostrar(el, html`<div class="auth card pad"><h1>Link inválido</h1><div class="alerta alerta-erro">${e.message}</div><a class="btn btn-azul btn-bloco" href="#/cadastro">Fazer novo cadastro</a></div>`); }
}

export async function esqueci({ el }) {
  mostrar(el, html`<div class="auth card pad"><h1>Esqueci minha senha</h1>
    <form id="f" novalidate><div class="campo"><label for="email">E-mail institucional</label><input id="email" name="email" type="email" required autocomplete="username"></div>
    <button class="btn btn-azul btn-bloco" type="submit">Enviar link</button></form></div>`);
  const f = el.querySelector('#f');
  enviar(f, async (d) => aviso(f, (await post('/api/auth/esqueci', d)).mensagem));
}

export async function redefinir({ el, query }) {
  const token = query.get('token') || '';
  mostrar(el, html`<div class="auth card pad"><h1>Nova senha</h1>
    <form id="f" novalidate><div class="campo"><label for="senha">Nova senha</label><input id="senha" name="senha" type="password" required autocomplete="new-password">${medidor}</div>
    <button class="btn btn-azul btn-bloco" type="submit">Salvar</button></form></div>`);
  const f = el.querySelector('#f');
  ligarMedidor(f);
  enviar(f, async (d) => {
    await post('/api/auth/redefinir', { token, senha: d.senha });
    toast('Senha alterada. Entre com a nova senha.', 'ok');
    location.hash = '#/entrar';
  });
}

export async function privacidade({ el }) {
  mostrar(el, html`<div class="form-estreito card pad"><h1>Privacidade e termos</h1>
    <h2 class="h3">Quais dados coletamos</h2><p>Nome, e-mail institucional e, se você quiser, matrícula. Também registramos data e IP de ações importantes (login, publicações e decisões do Protocolo) para segurança e auditoria.</p>
    <h2 class="h3">Para que usamos</h2><p>Somente para identificar quem publica e retira itens, evitar fraudes e permitir que o Protocolo confirme a entrega. Não vendemos nem compartilhamos seus dados.</p>
    <h2 class="h3">O que os outros alunos veem</h2><p>Seu primeiro nome e a inicial do sobrenome. Seu e-mail e sua matrícula não aparecem. Se você avisar que achou o item de alguém, o dono recebe seu nome e e-mail para poder combinar a entrega.</p>
    <h2 class="h3">Fotos</h2><p>Evite fotografar rostos e documentos legíveis. Removemos dados de localização (GPS) das imagens enviadas.</p>
    <h2 class="h3">Seus direitos (LGPD)</h2><p>Você pode excluir a conta em “Minha conta”. Seus dados pessoais são anonimizados; os itens e o histórico permanecem sem identificação sua.</p>
    <h2 class="h3">Boas práticas</h2><ul><li>Não descreva no anúncio detalhes que só o dono saberia (conteúdo, marcas internas): eles servem para provar que o item é seu.</li><li>Nunca envie documentos ou senhas por mensagem.</li><li>Retire seus itens somente no Protocolo.</li></ul>
    <p class="dica">Este texto é um modelo inicial e deve ser revisado pela Universidade antes do uso oficial.</p></div>`);
}

export async function acessibilidade({ el }) {
  const { diag, rotuloSituacao } = await import('../vlibras.js');
  mostrar(el, html`<div class="form-estreito card pad"><h1>Acessibilidade</h1>
    <p>O Achados e Perdidos deve poder ser usado por todas as pessoas da comunidade UEPA. Estes são os recursos disponíveis:</p>
    <h2 class="h3">Tradução em Libras</h2><p>O botão do <b>VLibras</b> (Governo Federal) aparece no canto da tela e traduz os textos da página para a Língua Brasileira de Sinais.</p>
    <div class="alerta alerta-info" id="diag-vlibras" role="status">VLibras: ${rotuloSituacao[diag.situacao] || diag.situacao}${diag.detalhes.length ? html`<ul>${diag.detalhes.map((d) => html`<li>${d}</li>`)}</ul>` : ''}</div>
    <h2 class="h3">Painel de acessibilidade</h2><p>No menu <b>Acessibilidade</b> você escolhe:</p><ul>
      <li><b>Ouvir esta página</b>: leitura em voz alta, para quem tem baixa visão, cansa ao ler ou prefere ouvir.</li>
      <li><b>Tamanho do texto</b> (até 150%) e <b>tipo de letra</b>: padrão, uma fonte bem legível ou Comic Sans.</li>
      <li><b>Alto contraste</b>, <b>sublinhar links</b>, <b>destaque forte do foco</b> (para quem navega pelo teclado) e <b>cursor grande</b>.</li>
      <li><b>Mais espaço</b> entre letras, palavras e linhas, e <b>reduzir animações</b>.</li></ul>
    <p>As escolhas ficam salvas neste navegador.</p>
    <h2 class="h3">Sobre o tipo de letra</h2><p>Pesquisas científicas ainda não mostram que uma fonte específica (nem a Comic Sans) melhore a leitura de pessoas com autismo, TDAH ou dislexia. O que os estudos apontam como útil é mais espaço entre as letras e o conforto individual. Por isso oferecemos opções e deixamos a escolha com você.</p>
    <h2 class="h3">Teclado e leitores de tela</h2><ul>
      <li>Todas as funções podem ser usadas só com o teclado (<kbd>Tab</kbd>, <kbd>Shift</kbd>+<kbd>Tab</kbd>, <kbd>Enter</kbd> e <kbd>Esc</kbd>).</li>
      <li>Há um link “Pular para o conteúdo” no início da página.</li>
      <li>A cada troca de tela o leitor de tela anuncia o título da nova página e o foco vai para o conteúdo.</li>
      <li>Fotos têm texto alternativo, campos têm rótulos e os erros de formulário são anunciados.</li>
      <li>O tema claro/escuro segue a preferência do seu aparelho (e pode ser trocado no menu).</li></ul>
    <h2 class="h3">Informação sem depender de cor</h2><p>O tempo que o item está parado aparece sempre em texto (“Há 12 dias”), além da cor.</p>
    <h2 class="h3">Limitações conhecidas</h2><p>Esta é uma versão de estudo: a verificação foi automática e manual, ainda sem testes com pessoas com deficiência. Foto sem descrição própria usa o título do item como texto alternativo. Se encontrar uma barreira, avise o Protocolo ou a equipe do projeto.</p></div>`);
}
