require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const { handleInteraction } = require('./handlers/interactions');
const configPath = path.join(process.cwd(), 'config', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

if (!process.env.DISCORD_TOKEN) {
  console.error('DISCORD_TOKEN não foi definido. Copie .env.example para .env e configure o token.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Vzn Ticket conectado como ${readyClient.user.tag}`);
  console.log(`Servindo ${readyClient.guilds.cache.size} servidor(es).`);
});
client.on(Events.InteractionCreate, interaction => {
  handleInteraction(interaction, config);
});
client.on(Events.Error, error => {
  console.error('Erro do cliente Discord:', error);
});
process.on('unhandledRejection', error => {
  console.error('Promise rejeitada sem tratamento:', error);
});

client.login(process.env.DISCORD_TOKEN);
