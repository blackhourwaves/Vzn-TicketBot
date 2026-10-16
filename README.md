# Bot demonstrativo de Ticket.

Sistema de tickets para o seu servidor do Discord, inclui painéis interativos, categorias, permissões, gerenciamento de participantes e transcripts via HTML.

> Projeto comunitário de exemplo. Configure e teste em um servidor privado antes de usar em produção.

## Recursos

- Painel de abertura com menu de categorias.
- Criação de canais privados e roteamento por categoria.
- Controle de permissões para autor, bot e cargos da equipe.
- Fechar, reabrir, renomear, adicionar e remover participantes.
- Transcript HTML com mensagens, autores, horários, anexos e embeds.
- Banco SQLite para salvar tickets e participantes.
- Comandos `/ticket-painel`, `/ticket-config` e `/ticket-stats`.
- Limite configurável de tickets abertos por usuário.
- Estrutura simples, `.env` e logs básicos.

## Requisitos

- Node.js 20.11 ou superior.
- npm.
- Uma bot criado no [Discord Developer Portal](https://discord.com/developers/applications).

## Instalação

1. Baixe/clonе o projeto.
2. Instale as dependências:

   ```bash
   npm install
   ```

3. Copie `.env.example` para `.env` e preencha:

   ```env
   DISCORD_TOKEN=token_do_bot
   CLIENT_ID=id_da_aplicacao
   GUILD_ID=id_do_servidor
   ```

4. No Discord Developer Portal, habilite os intents necessários. O bot usa `Guilds`, `GuildMessages` e `MessageContent` para construir transcripts.
5. Convide o bot com os escopos `bot` e `applications.commands`. Permissões recomendadas: View Channels, Send Messages, Read Message History, Manage Channels, Manage Messages, Attach Files e Embed Links.
6. Registre os comandos:

   ```bash
   npm run deploy
   ```

7. Inicie:

   ```bash
   npm start
   ```

8. No servidor, use `/ticket-painel` para publicar o painel.

## Configuração

Edite `config/config.json`.

- `brand.name`: nome mostrado nos painéis.
- `brand.color`: cor de destaque em decimal.
- `defaults.ticketCategoryId`: ID da categoria do Discord usada como padrão.
- `defaults.staffRoleIds`: IDs dos cargos que podem gerenciar tickets.
- `defaults.logChannelId`: canal que recebe logs e transcripts como anexos.
- `defaults.transcriptChannelId`: alternativa ao canal de logs se `logChannelId` estiver vazio.
- `defaults.maxOpenTicketsPerUser`: limite de tickets abertos por usuário.
- `categories`: categorias do painel. `categoryId` define a categoria do Discord para os canais daquele tipo; `staffRoleIds` define cargos específicos para a categoria.

Deixe IDs vazios (`""`) ou listas vazias (`[]`) quando não quiser configurar um valor. Para obter IDs, ative o Modo Desenvolvedor no Discord e use **Copiar ID**.

## Comandos

| Comando | Função |
|---|---|
| `/ticket-painel` | Publica o painel interativo |
| `/ticket-config` | Mostra a configuração atual |
| `/ticket-stats` | Mostra estatísticas dos tickets |

Os comandos são registrados no servidor definido por `GUILD_ID`, o que facilita testes. Para registrar comandos globalmente, altere `src/deploy-commands.js` para usar `Routes.applicationCommands(CLIENT_ID)`.

## Como funciona

- O usuário escolhe uma categoria no painel.
- O bot cria um canal privado e grava o ticket no SQLite.
- O painel de controle do ticket oferece as ações disponíveis.
- Ao fechar, o bot gera um HTML e envia ao canal de logs configurado.
- O ticket fechado fica no servidor e pode ser reaberto pela equipe. Ao excluir o canal, o registro do ticket permanece para fins de estatística.

## Estrutura

```text
vzn-ticket/
├── config/
│   └── config.json
├── src/
│   ├── handlers/
│   │   └── interactions.js
│   ├── commands.js
│   ├── database.js
│   ├── deploy-commands.js
│   ├── index.js
│   ├── transcripts.js
│   └── utils.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Segurança e produção

- **Nunca** envie `.env`, tokens ou credenciais para ninguém.
- Configure permissões de cargos e categorias antes de abrir o painel ao público.
- Restrinja o acesso ao canal de logs/transcripts: eles podem conter dados privados.
- Faça backups periódicos da pasta `data/`.
- Teste fechamento, reabertura, exclusão, anexos e cargos em um servidor de teste.
