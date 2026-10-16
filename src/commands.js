const {
  SlashCommandBuilder,
  PermissionFlagsBits
} = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('ticket-painel')
    .setDescription('Publica o painel de abertura de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('ticket-config')
    .setDescription('Mostra a configuração atual do sistema de tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('ticket-stats')
    .setDescription('Mostra estatísticas dos tickets')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
];

module.exports = commands.map(command => command.toJSON());
