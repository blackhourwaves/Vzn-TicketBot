require('dotenv').config();
const { REST, Routes } = require('discord.js');
const commands = require('./commands');
const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Configure DISCORD_TOKEN, CLIENT_ID e GUILD_ID no arquivo .env.');
  process.exit(1);
}
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    console.log(`Registrando ${commands.length} comandos no servidor ${GUILD_ID}...`);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Comandos registrados com sucesso.');
  } catch (error) {
    console.error('Falha ao registrar comandos:', error);
    process.exitCode = 1;
  }
})();
