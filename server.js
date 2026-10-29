import { criarApp } from './src/app.js';

const app = criarApp();
app.server.listen(app.config.port, app.config.host, () => {
  console.log(`Achados e Perdidos UEPA rodando em ${app.config.appUrl.startsWith('http://localhost') ? `http://localhost:${app.config.port}` : app.config.appUrl}`);
  if (!app.config.smtp) console.log('Modo e-mail: SIMULADO (os e-mails aparecem aqui no terminal e na pasta outbox/).');
  if (!app.config.adminEmails.length) console.log('Dica: defina ADMIN_EMAILS no .env para criar o primeiro administrador.');
});
for (const sinal of ['SIGINT', 'SIGTERM']) process.on(sinal, () => app.close().then(() => process.exit(0)));
