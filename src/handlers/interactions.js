const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder
} = require('discord.js');

const db = require('../database');
const { createTranscript } = require('../transcripts');
const {
  v2Container,
  v2Payload,
  isStaff,
  canManageTicket,
  safeName
} = require('../utils');

function makePanel(config) {
  const container = new ContainerBuilder()
    .setAccentColor(config.brand.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎫 ${config.brand.name}`),
      new TextDisplayBuilder().setContent(
        'Bem-vindo à central de atendimento.\n\nSelecione abaixo a categoria que melhor descreve o seu assunto. Um canal privado será criado para você conversar com a equipe.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('### Como funciona\n- Escolha uma categoria.\n- Descreva sua solicitação no canal criado.\n- Aguarde a equipe responder.\n\n*Evite abrir tickets duplicados para o mesmo assunto.*')
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('vznticket:open')
    .setPlaceholder('Selecione uma categoria...')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(config.categories.map(category => ({
      label: category.label.slice(0, 100),
      description: (category.description || 'Abrir um ticket').slice(0, 100),
      value: category.key,
      emoji: category.emoji || '🎫'
    })));

  container.addActionRowComponents(new ActionRowBuilder().addComponents(menu));
  return v2Payload(container);
}

function makeTicketControls(ticket, config) {
  const container = new ContainerBuilder()
    .setAccentColor(config.brand.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎫 Ticket #${ticket.id}`),
      new TextDisplayBuilder().setContent(
        `**Categoria:** ${ticket.category_label}\n**Criado por:** <@${ticket.owner_id}>\n**Status:** ${ticket.status === 'open' ? '🟢 Aberto' : '🔒 Fechado'}\n\nUse os botões abaixo para gerenciar este atendimento.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder());

  if (ticket.status === 'open') {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vznticket:close').setLabel('Fechar').setEmoji('🔒').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('vznticket:rename').setLabel('Renomear').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('vznticket:add').setLabel('Adicionar pessoa').setEmoji('➕').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('vznticket:remove').setLabel('Remover pessoa').setEmoji('➖').setStyle(ButtonStyle.Secondary)
      )
    );
  } else {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('vznticket:reopen').setLabel('Reabrir').setEmoji('🔓').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('vznticket:delete').setLabel('Excluir canal').setEmoji('🗑️').setStyle(ButtonStyle.Danger)
      )
    );
  }

  return v2Payload(container);
}

async function replyPrivate(interaction, text) {
  const container = v2Container('Vzn Ticket', text);
  return interaction.reply(v2Payload(container, { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }));
}

function getTicket(channelId) {
  return db.prepare('SELECT * FROM tickets WHERE channel_id = ?').get(channelId);
}

function getCategory(config, key) {
  return config.categories.find(category => category.key === key);
}

function canStaffManage(member, ticket, category, config) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleIds = [
    ...(config.defaults.staffRoleIds || []),
    ...(category?.staffRoleIds || [])
  ];
  return roleIds.some(id => member.roles?.cache?.has(id));
}

async function logToChannel(guild, config, message, attachment) {
  const channelId = config.defaults.logChannelId || config.defaults.transcriptChannelId;
  if (!channelId) return;
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return;
  await channel.send({
    content: message,
    files: attachment ? [attachment] : [],
    allowedMentions: { parse: [] }
  }).catch(console.error);
}

async function openTicket(interaction, config, category) {
  const active = db.prepare(
    "SELECT COUNT(*) AS count FROM tickets WHERE guild_id = ? AND owner_id = ? AND status = 'open'"
  ).get(interaction.guildId, interaction.user.id).count;

  if (active >= Number(config.defaults.maxOpenTicketsPerUser || 3)) {
    return replyPrivate(interaction, `Você já tem **${active} tickets abertos**, que é o limite configurado.`);
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const parentId = category.categoryId || config.defaults.ticketCategoryId || undefined;
  const staffRoleIds = [...new Set([
    ...(config.defaults.staffRoleIds || []),
    ...(category.staffRoleIds || [])
  ])];

  const permissionOverwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    ...staffRoleIds.map(id => ({
      id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }))
  ];

  const previous = db.prepare(
    'SELECT id FROM tickets ORDER BY id DESC LIMIT 1'
  ).get();
  const ticketId = (previous?.id || 0) + 1;
  const channel = await interaction.guild.channels.create({
    name: `ticket-${String(ticketId).padStart(4, '0')}-${safeName(interaction.user.username).slice(0, 30)}`,
    type: ChannelType.GuildText,
    parent: parentId,
    topic: `Vzn Ticket #${ticketId} | owner:${interaction.user.id} | category:${category.key}`,
    permissionOverwrites,
    reason: `Ticket aberto por ${interaction.user.tag} (${category.label})`
  });

  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO tickets (id, guild_id, channel_id, owner_id, category_key, category_label, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(ticketId, interaction.guildId, channel.id, interaction.user.id, category.key, category.label, createdAt);

  const ticket = getTicket(channel.id);
  await channel.send({
    content: `<@${interaction.user.id}> ${staffRoleIds.map(id => `<@&${id}>`).join(' ')}`.trim(),
    allowedMentions: { users: [interaction.user.id], roles: staffRoleIds }
  });

  const welcome = new ContainerBuilder()
    .setAccentColor(config.brand.color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${category.emoji || '🎫'} ${category.label}`),
      new TextDisplayBuilder().setContent(
        `Olá, <@${interaction.user.id}>! Seu ticket foi criado.\n\n${config.defaults.supportMessage}\n\n**Dica:** envie todas as informações relevantes em uma única mensagem, se possível.`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder());

  await channel.send(v2Payload(welcome));
  await channel.send(makeTicketControls(ticket, config));

  await interaction.editReply({
    content: `✅ Seu ticket foi criado: ${channel}`
  });

  await logToChannel(
    interaction.guild,
    config,
    `🎫 Ticket **#${ticket.id}** aberto por ${interaction.user.tag} · Categoria: **${category.label}** · ${channel}`
  );
}

async function closeTicket(interaction, config, ticket, category) {
  const allowed = canManageTicket(interaction.member, ticket, category, config);
  if (!allowed) return replyPrivate(interaction, 'Você não tem permissão para fechar este ticket.');

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const transcript = await createTranscript(interaction.channel, ticket);
  const closedAt = new Date().toISOString();

  db.prepare(
    "UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE channel_id = ?"
  ).run(closedAt, interaction.user.id, interaction.channel.id);

  await interaction.channel.permissionOverwrites.edit(ticket.owner_id, {
    SendMessages: false,
    AddReactions: false
  }).catch(() => {});

  const updated = getTicket(interaction.channel.id);
  await interaction.channel.send(makeTicketControls(updated, config));

  await logToChannel(
    interaction.guild,
    config,
    `🔒 Ticket **#${ticket.id}** fechado por ${interaction.user.tag}. Transcript anexado abaixo.`,
    transcript.attachment
  );

  await interaction.editReply({
    content: `🔒 Ticket fechado. Transcript gerado com ${transcript.messageCount} mensagens.`
  });
}

async function handleButton(interaction, config) {
  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyPrivate(interaction, 'Este canal não está registrado como ticket.');

  const category = getCategory(config, ticket.category_key);
  const staffOnly = ['vznticket:rename', 'vznticket:add', 'vznticket:remove', 'vznticket:reopen', 'vznticket:delete'].includes(interaction.customId);

  if (staffOnly && !canStaffManage(interaction.member, ticket, category, config)) {
    return replyPrivate(interaction, 'Esta ação está disponível apenas para a equipe de atendimento.');
  }

  if (interaction.customId === 'vznticket:close') {
    return closeTicket(interaction, config, ticket, category);
  }

  if (interaction.customId === 'vznticket:rename') {
    const modal = new ModalBuilder()
      .setCustomId('vznticket:rename-modal')
      .setTitle('Renomear ticket')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel('Novo nome do canal')
            .setPlaceholder('ex: ajuda-pagamento')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(80)
            .setRequired(true)
        )
      );
    return interaction.showModal(modal);
  }

  if (interaction.customId === 'vznticket:add' || interaction.customId === 'vznticket:remove') {
    const adding = interaction.customId === 'vznticket:add';
    const menu = new UserSelectMenuBuilder()
      .setCustomId(adding ? 'vznticket:add-user' : 'vznticket:remove-user')
      .setPlaceholder(adding ? 'Escolha quem adicionar' : 'Escolha quem remover')
      .setMinValues(1)
      .setMaxValues(1);

    const container = new ContainerBuilder()
      .setAccentColor(config.brand.color)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(adding ? '# ➕ Adicionar pessoa' : '# ➖ Remover pessoa'),
        new TextDisplayBuilder().setContent(
          adding ? 'Selecione uma pessoa para dar acesso a este ticket.' : 'Selecione uma pessoa para retirar o acesso a este ticket.'
        )
      )
      .addActionRowComponents(new ActionRowBuilder().addComponents(menu));

    return interaction.reply(v2Payload(container, { flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }));
  }

  if (interaction.customId === 'vznticket:reopen') {
    db.prepare("UPDATE tickets SET status = 'open', closed_at = NULL, closed_by = NULL WHERE channel_id = ?")
      .run(interaction.channelId);
    await interaction.channel.permissionOverwrites.edit(ticket.owner_id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    }).catch(() => {});
    await interaction.channel.send(makeTicketControls(getTicket(interaction.channelId), config));
    return replyPrivate(interaction, 'Ticket reaberto com sucesso.');
  }

  if (interaction.customId === 'vznticket:delete') {
    await interaction.reply({
      content: '🗑️ Canal será excluído em 5 segundos. O transcript já foi enviado ao canal de logs, se configurado.',
      flags: MessageFlags.Ephemeral
    });
    setTimeout(() => interaction.channel.delete(`Ticket #${ticket.id} excluído por ${interaction.user.tag}`).catch(() => {}), 5000);
  }
}

async function handleSelect(interaction, config) {
  if (interaction.customId === 'vznticket:open') {
    const category = getCategory(config, interaction.values[0]);
    if (!category) return replyPrivate(interaction, 'Essa categoria não existe na configuração.');
    return openTicket(interaction, config, category);
  }

  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyPrivate(interaction, 'Este canal não está registrado como ticket.');
  const category = getCategory(config, ticket.category_key);

  if (!canStaffManage(interaction.member, ticket, category, config)) {
    return replyPrivate(interaction, 'Somente a equipe pode alterar os participantes deste ticket.');
  }

  const userId = interaction.values[0];
  if (userId === ticket.owner_id && interaction.customId === 'vznticket:remove-user') {
    return replyPrivate(interaction, 'O autor do ticket não pode ser removido do próprio atendimento.');
  }

  if (interaction.customId === 'vznticket:add-user') {
    await interaction.channel.permissionOverwrites.edit(userId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });
    db.prepare(`
      INSERT OR REPLACE INTO ticket_members (channel_id, user_id, added_by, added_at)
      VALUES (?, ?, ?, ?)
    `).run(interaction.channelId, userId, interaction.user.id, new Date().toISOString());
    await interaction.channel.send(`➕ <@${userId}> foi adicionado ao ticket por <@${interaction.user.id}>.`);
    return replyPrivate(interaction, `Acesso concedido a <@${userId}>.`);
  }

  if (interaction.customId === 'vznticket:remove-user') {
    await interaction.channel.permissionOverwrites.delete(userId).catch(() => {});
    db.prepare('DELETE FROM ticket_members WHERE channel_id = ? AND user_id = ?')
      .run(interaction.channelId, userId);
    await interaction.channel.send(`➖ <@${userId}> teve o acesso removido por <@${interaction.user.id}>.`);
    return replyPrivate(interaction, `Acesso removido de <@${userId}>.`);
  }
}

async function handleModal(interaction, config) {
  if (interaction.customId !== 'vznticket:rename-modal') return;
  const ticket = getTicket(interaction.channelId);
  if (!ticket) return replyPrivate(interaction, 'Este canal não está registrado como ticket.');

  const category = getCategory(config, ticket.category_key);
  if (!canStaffManage(interaction.member, ticket, category, config)) {
    return replyPrivate(interaction, 'Somente a equipe pode renomear este ticket.');
  }

  const name = safeName(interaction.fields.getTextInputValue('name'));
  await interaction.channel.setName(name);
  await interaction.reply({
    content: `✏️ Canal renomeado para **#${name}**.`,
    flags: MessageFlags.Ephemeral
  });
}

async function handleCommand(interaction, config) {
  if (interaction.commandName === 'ticket-painel') {
    await interaction.channel.send(makePanel(config));
    return interaction.reply({ content: 'Painel de tickets publicado.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'ticket-config') {
    const categories = config.categories.map(c => `${c.emoji || '🎫'} **${c.label}** — \`${c.key}\``).join('\n');
    return replyPrivate(interaction,
      `**Marca:** ${config.brand.name}\n**Limite por usuário:** ${config.defaults.maxOpenTicketsPerUser}\n**Canal de logs:** ${config.defaults.logChannelId || 'Não configurado'}\n\n**Categorias**\n${categories}`
    );
  }

  if (interaction.commandName === 'ticket-stats') {
    const totals = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed
      FROM tickets WHERE guild_id = ?
    `).get(interaction.guildId);

    return replyPrivate(interaction,
      `## 📊 Estatísticas\n- **Total:** ${totals.total || 0}\n- **Abertos:** ${totals.open || 0}\n- **Fechados:** ${totals.closed || 0}`
    );
  }
}

async function handleInteraction(interaction, config) {
  try {
    if (interaction.isChatInputCommand()) return await handleCommand(interaction, config);
    if (interaction.isButton()) return await handleButton(interaction, config);
    if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) return await handleSelect(interaction, config);
    if (interaction.isModalSubmit()) return await handleModal(interaction, config);
  } catch (error) {
    console.error('Erro ao processar interação:', error);
    const message = 'Ocorreu um erro ao processar esta ação. Verifique os logs do bot.';
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
}

module.exports = { handleInteraction };
