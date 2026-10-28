# Colocando no ar (apresentação e teste com a turma)

Escolha **uma** das opções. Para um trabalho de faculdade, a **A** resolve em 10 minutos; a **B** deixa o site no ar o semestre inteiro.

| | Custo | Fica no ar quando | Dificuldade |
|---|---|---|---|
| **A. Do seu PC + túnel Cloudflare** | R$ 0 | seu PC está ligado com o programa rodando | fácil |
| **B. VPS barata + Caddy + domínio grátis** | ~US$ 4–6/mês | sempre | média |
| **C. Docker** (em qualquer VPS) | igual à B | sempre | média |

> O sistema guarda dados em **SQLite + pasta de fotos**, então precisa de **disco persistente**. Hospedagens grátis que apagam o disco a cada reinício (Render free, Vercel, Heroku) **não servem**.

## 0. Login com Google (vale para todas as opções)

1. Acesse https://console.cloud.google.com e crie um projeto ("achados-uepa").
2. **APIs e serviços → Tela de consentimento OAuth**: tipo **Externo**; nome do app; e-mail de suporte; escopos `openid`, `email`, `profile`.
   - Deixe em **Teste** e cadastre em *Usuários de teste* os e-mails que vão usar (até 100), **ou** clique em *Publicar app* (escopos básicos não exigem verificação).
3. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**. Em *URIs de redirecionamento autorizados* coloque:
   - `https://SEU-ENDERECO/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (para testar no PC)
4. Copie o *Client ID* e o *Client secret* para o `.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```
5. O sistema só aceita contas de e-mail `@uepa.br` / `@aluno.uepa.br` (e subdomínios), mesmo que o Google deixe entrar outras.

**Atenção:** o Google Workspace da UEPA pode estar configurado para **bloquear apps de terceiros**. Se aparecer "app bloqueado pelo administrador" ao entrar com @aluno.uepa.br, não é bug seu. Soluções: usar o cadastro por e-mail/senha (precisa de SMTP, veja abaixo), ou pedir à TI para liberar o Client ID. Para a apresentação, tenha as contas de demonstração (`npm run seed:demo`) como plano B.

## E-mail (só se for usar cadastro por senha)

Sem `SMTP_HOST` os e-mails são só gravados em `outbox/` (ninguém recebe). Para enviar de verdade, o Brevo tem plano grátis (300 e-mails/dia): crie conta, gere uma chave SMTP e preencha `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_SECURE=starttls`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`.
Se for **só Google**, use `PASSWORD_AUTH=false` e esqueça o e-mail.

## Opção A: do seu PC (demonstração)

```bash
cp .env.example .env
npm run seed:demo        # cria contas e itens de exemplo (anote as senhas impressas)
npm start                # deixe rodando
# em outro terminal:
cloudflared tunnel --url http://localhost:3000
```
O `cloudflared` ([download](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)) imprime um endereço `https://algo.trycloudflare.com`. Esse endereço **muda a cada vez**. Então:
1. Ponha no `.env`: `APP_URL=https://algo.trycloudflare.com` e `TRUST_PROXY=true`.
2. Adicione `https://algo.trycloudflare.com/api/auth/google/callback` nos redirecionamentos do Google.
3. Reinicie o `npm start`.

Para login com Google, isso é trabalhoso a cada sessão; na demo, as contas `seed:demo` evitam o problema.

## Opção B: VPS + Caddy (sempre no ar)

1. Crie uma VPS Ubuntu 24.04 (Hetzner, DigitalOcean, Contabo...) com 1 GB de RAM.
2. Domínio grátis: crie em https://www.duckdns.org um nome (ex.: `achados-uepa`) apontando para o IP da VPS.
3. Na VPS:
   ```bash
   apt update && apt install -y git ufw caddy
   curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
   ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   useradd -r -m -d /opt/achados achados
   git clone https://github.com/RadassoLuc/AchadosPerdidos.git /opt/achados
   cd /opt/achados && cp .env.example .env && nano .env
   mkdir -p data && chown -R achados:achados /opt/achados
   ```
4. `.env` de produção (mínimo):
   ```
   NODE_ENV=production
   PORT=3000
   HOST=127.0.0.1
   APP_URL=https://achados-uepa.duckdns.org
   TRUST_PROXY=true
   ADMIN_EMAILS=seu.email@aluno.uepa.br
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   PASSWORD_AUTH=false
   VLIBRAS=true
   ```
5. Serviço e HTTPS:
   ```bash
   cp deploy/achados.service /etc/systemd/system/ && systemctl enable --now achados
   cp deploy/Caddyfile /etc/caddy/Caddyfile   # troque o domínio dentro
   systemctl reload caddy
   ```
6. Teste: `https://SEU-DOMINIO/api/saude` deve responder `{"ok":true}`.
7. Backup diário: `crontab -e` (como root) → `0 3 * * * cd /opt/achados && BACKUP_DIR=/opt/backups node scripts/backup.js`. Baixe uma cópia de `/opt/backups` de vez em quando.
8. Para atualizar: `cd /opt/achados && git pull && systemctl restart achados`.

## Opção C: Docker

```bash
docker build -t achados .
docker run -d --name achados --restart unless-stopped -p 127.0.0.1:3000:3000 \
  -v achados-data:/app/data --env-file .env achados
```
Use o mesmo Caddy da opção B na frente (`reverse_proxy 127.0.0.1:3000`).

## Para a apresentação

- `npm run seed:demo` cria 4 contas (aluno, aluna, protocolo, admin) e 8 itens em estados variados (recusa rodar em produção sem `--force`).
- Conte a história na ordem: aluno acha item → Protocolo confirma recebimento → dono reivindica → Protocolo aprova e registra devolução.
- Teste o botão de acessibilidade (A+, contraste, VLibras) ao vivo.

## VLibras

O widget carrega de `vlibras.gov.br` (e subdomínios, de onde vêm o avatar 3D e o dicionário de sinais). Por isso, com `VLIBRAS=true` o site libera esses domínios na política de segurança (CSP), além de `'unsafe-eval'` e estilos inline, que o widget usa. O resto do site continua sem scripts inline. Se preferir a política mais rígida, `VLIBRAS_CSP=estrita`.

Se o botão azul não aparecer: abra a página **Acessibilidade** (rodapé). Ela mostra um diagnóstico do VLibras (funcionando, bloqueado, indisponível...) e o que foi bloqueado. Se ainda assim não resolver, aperte F12, aba **Console**, e copie as mensagens em vermelho. Lembre que o VLibras precisa de internet e de um navegador moderno (Chrome, Edge, Firefox).

## Checklist de segurança antes de abrir para a turma

- [ ] `NODE_ENV=production` e `APP_URL` com `https://`
- [ ] `.env` fora do GitHub (já está no `.gitignore`)
- [ ] `ADMIN_EMAILS` só com e-mails seus
- [ ] Backup rodando e testado
- [ ] Aviso de privacidade visível (já existe em `#/privacidade`)
