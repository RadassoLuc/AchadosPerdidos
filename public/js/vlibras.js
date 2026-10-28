// VLibras: tradutor de Português para Libras do Governo Federal (https://vlibras.gov.br).
// Carregado de forma opcional: se o serviço estiver fora do ar ou bloqueado, o site continua funcionando
// e a página "Acessibilidade" mostra um diagnóstico do que aconteceu.
export const diag = { situacao: 'desligado', detalhes: [] };
const nota = (t) => { if (diag.detalhes.length < 10 && !diag.detalhes.includes(t)) diag.detalhes.push(t); };

document.addEventListener('securitypolicyviolation', (e) => {
  nota(`Bloqueado pela política de segurança (${e.violatedDirective}): ${e.blockedURI || 'inline'}`);
  if (diag.situacao === 'carregando') diag.situacao = 'bloqueado';
});

let carregado = false;
export function carregarVLibras() {
  if (carregado || document.querySelector('[vw]')) return;
  carregado = true;
  diag.situacao = 'carregando';
  const caixa = document.createElement('div');
  caixa.setAttribute('vw', '');
  caixa.className = 'enabled';
  caixa.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
  document.body.append(caixa);
  const s = document.createElement('script');
  s.src = 'https://vlibras.gov.br/app/vlibras-plugin.js';
  s.async = true;
  s.onload = () => {
    try { new window.VLibras.Widget('https://vlibras.gov.br/app'); diag.situacao = 'iniciado'; }
    catch (e) { diag.situacao = 'erro'; nota(`Erro ao iniciar: ${e.message}`); console.warn('VLibras não iniciou:', e.message); }
  };
  s.onerror = () => { diag.situacao = diag.situacao === 'bloqueado' ? 'bloqueado' : 'indisponivel'; nota('Não foi possível baixar o script do VLibras (sem internet, site fora do ar ou bloqueio de rede).'); console.warn('VLibras indisponível no momento.'); };
  document.body.append(s);
  setTimeout(() => {
    const botao = document.querySelector('[vw-access-button]');
    if (diag.situacao === 'iniciado') diag.situacao = botao && botao.children.length ? 'ok' : 'sem-botao';
    if (diag.situacao === 'sem-botao') nota('O script carregou, mas o botão do VLibras não foi criado.');
  }, 6000);
}

export const rotuloSituacao = {
  ok: 'Funcionando: o botão azul do VLibras deve estar no canto da tela.',
  iniciado: 'Iniciando…',
  carregando: 'Carregando…',
  desligado: 'Desligado neste servidor.',
  bloqueado: 'Bloqueado pela política de segurança do navegador (veja os detalhes).',
  indisponivel: 'Indisponível: o serviço do governo não respondeu.',
  'sem-botao': 'O script carregou, mas o botão não apareceu.',
  erro: 'Erro ao iniciar.',
};
