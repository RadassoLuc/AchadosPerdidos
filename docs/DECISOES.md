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

## v3: Google, acessibilidade e deploy

- **Login com Google (OIDC + PKCE)**: o `id_token` vem direto do endpoint de token do Google via TLS (OIDC Core 3.1.3.7), por isso as claims são validadas sem verificar assinatura: iss, aud, exp, nonce, email_verified e domínio institucional. Conta criada já verificada, com `senha_hash='google$sem-senha'`.
- **PASSWORD_AUTH=false**: desliga cadastro/login por senha (rotas respondem 404) para operar só com Google e sem SMTP.
- **Acessibilidade**: VLibras + painel próprio (fonte, contraste, espaçamento, sem animação), foco/ARIA nos erros, contraste revisado. VLibras exige liberar `vlibras.gov.br` na CSP; `CSP_EXTRA_SCRIPT_SRC` é a válvula de escape.
- **Hospedagem**: SQLite + fotos em disco exigem disco persistente; por isso VPS/Docker/túnel, não plataformas efêmeras.
- **HOST**: em VPS com proxy, escutar só em 127.0.0.1.

## v4: foto de perfil, apagar postagens, mais acessibilidade

- **Foto de perfil (opcional)**: recortada em 256 px no navegador, sanitizada (sem EXIF/GPS) e servida só para quem está logado. Aparece no topo, em "Publicado por" e, para o Protocolo, nas reivindicações. Ajuda a conferir quem retira o item, mas **não prova identidade sozinha** (qualquer um pode subir a foto de outra pessoa): o documento continua obrigatório na devolução.
- **Apagar postagem de vez (admin)**: remove item, fotos, histórico, reivindicações, avisos e denúncias; só a auditoria guarda o registro (quem, quando, motivo). Itens "devolvido" não podem ser apagados (são registro oficial do Protocolo). Técnica: `PRAGMA defer_foreign_keys` + trigger do histórico que só bloqueia exclusão enquanto o item existe (migração v2).
- **Categorias e locais**: renomear, desativar e remover (só sem itens vinculados).
- **Fontes**: as pesquisas não mostram benefício de uma fonte específica (nem Comic Sans) para autismo/TDAH/dislexia; o que tem respaldo é mais espaçamento entre letras. Oferecemos Padrão, Verdana/Tahoma e Comic Sans como escolha individual, sem prometer efeito clínico.
- **Baixa visão/cegueira**: leitura da página em voz alta (Web Speech do navegador), sublinhar links, foco forte, cursor grande, anúncio de troca de página para leitor de tela, hierarquia de títulos corrigida.
- **VLibras**: CSP ampliada só quando ele está ligado; página Acessibilidade mostra diagnóstico.
