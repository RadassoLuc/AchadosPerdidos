import { ApiError, definirSessao, post } from '../api.js';
import { erroCampos, formDados, html, mostrar, ocupado, toast } from '../ui.js';

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
const aviso = (form, msg, tipo = 'ok') => { const a = document.createElement('div'); a.className = `alerta alerta-${tipo}`; a.textContent = msg; a.setAttribute('role', 'status'); form.replaceChildren(a); };

export async function entrar({ el, query, atualizarTopo }) {
  mostrar(el, html`<div class="auth card pad"><h1>Entrar</h1><p class="dica mb">Use o seu e-mail institucional da UEPA.</p>
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

export async function cadastro({ el }) {
  mostrar(el, html`<div class="auth card pad"><h1>Criar conta</h1><p class="dica mb">Só e-mails da UEPA (ex.: @aluno.uepa.br). Enviaremos um link para confirmar.</p>
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
    <h3>Quais dados coletamos</h3><p>Nome, e-mail institucional e, se você quiser, matrícula. Também registramos data e IP de ações importantes (login, publicações e decisões do Protocolo) para segurança e auditoria.</p>
    <h3>Para que usamos</h3><p>Somente para identificar quem publica e retira itens, evitar fraudes e permitir que o Protocolo confirme a entrega. Não vendemos nem compartilhamos seus dados.</p>
    <h3>O que os outros alunos veem</h3><p>Seu primeiro nome e a inicial do sobrenome. Seu e-mail e sua matrícula não aparecem. Se você avisar que achou o item de alguém, o dono recebe seu nome e e-mail para poder combinar a entrega.</p>
    <h3>Fotos</h3><p>Evite fotografar rostos e documentos legíveis. Removemos dados de localização (GPS) das imagens enviadas.</p>
    <h3>Seus direitos (LGPD)</h3><p>Você pode excluir a conta em “Minha conta”. Seus dados pessoais são anonimizados; os itens e o histórico permanecem sem identificação sua.</p>
    <h3>Boas práticas</h3><ul><li>Não descreva no anúncio detalhes que só o dono saberia (conteúdo, marcas internas): eles servem para provar que o item é seu.</li><li>Nunca envie documentos ou senhas por mensagem.</li><li>Retire seus itens somente no Protocolo.</li></ul>
    <p class="dica">Este texto é um modelo inicial e deve ser revisado pela Universidade antes do uso oficial.</p></div>`);
}
