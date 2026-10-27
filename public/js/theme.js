// Aplica o tema salvo antes de desenhar a página (evita "piscar").
try {
  const t = localStorage.getItem('tema');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.tema = t;
} catch { /* sem armazenamento: usa o tema do sistema */ }
