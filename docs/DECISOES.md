# Decisões e backlog

## Decisões desta versão
- **Sem dependências npm**: Node 22 já traz servidor HTTP, SQLite (`node:sqlite`), criptografia (scrypt) e testes. Menos superfície de ataque e nada para `npm install`. Se o grupo preferir Express/Fastify depois, a camada `src/routes` pode ser migrada.
- **SQLite** (mesmo banco do projeto original) com restrições fortes (STRICT, CHECK, FK, triggers). Para produção com muitos acessos simultâneos, migrar para PostgreSQL mantendo o mesmo esquema.
- **E-mail**: modo simulado em desenvolvimento; SMTP próprio (TLS/STARTTLS) em produção. Contas Google da UEPA podem usar senha de app, ou migrar para "Entrar com Google" (restringindo o domínio) no futuro.
- **Fotos**: o navegador reduz e converte para JPEG; o servidor valida a estrutura e remove metadados.

## Pendências conhecidas
- [ ] Testar envio SMTP real (só foi testado contra servidor falso).
- [ ] Editar/trocar fotos depois de publicar.
- [ ] Notificações por e-mail para o Protocolo quando houver reivindicação.
- [ ] "Entrar com Google" (conta @aluno.uepa.br).
- [ ] Etiqueta com QR Code para o item guardado.
- [ ] Sugestão automática de combinação perdido x achado.
- [ ] Ajustar a lista de locais do campus (Admin → Categorias e locais).
- [ ] Revisar o texto de privacidade com a Universidade.
- [ ] Deploy com HTTPS, `NODE_ENV=production`, `TRUST_PROXY=true` atrás do proxy e backup da pasta `data/`.
