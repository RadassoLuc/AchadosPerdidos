// Aplica o tema salvo antes de desenhar a página (evita "piscar").
try {
  const t = localStorage.getItem('tema');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.tema = t;
  const a = JSON.parse(localStorage.getItem('a11y') || '{}');
  const h = document.documentElement.dataset;
  if (a.fonte > 1 && a.fonte <= 4) h.fonte = String(a.fonte);
  if (a.contraste) h.contraste = 'alto';
  if (a.espaco) h.espaco = 'amplo';
  if (a.movimento) h.movimento = 'reduzido';
} catch { /* sem armazenamento: usa o tema do sistema */ }
