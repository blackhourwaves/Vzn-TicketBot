const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  PermissionFlagsBits
} = require('discord.js');

function v2Container(title, body, color = 0x5865F2) {
  return new ContainerBuilder()
    .setAccentColor(color)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${title}`),
      new TextDisplayBuilder().setContent(body)
    )
    .addSeparatorComponents(new SeparatorBuilder());
}

function v2Payload(container, extra = {}) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
    ...extra
  };
}

function isStaff(member, config) {
  if (!member) return false;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleIds = [
    ...(config.defaults.staffRoleIds || [])
  ];
  return roleIds.some(id => member.roles?.cache?.has(id));
}

function canManageTicket(member, ticket, category, config) {
  if (!member) return false;
  if (member.id === ticket.owner_id) return true;
  if (member.permissions?.has(PermissionFlagsBits.Administrator)) return true;
  const roleIds = [
    ...(config.defaults.staffRoleIds || []),
    ...(category?.staffRoleIds || [])
  ];
  return roleIds.some(id => member.roles?.cache?.has(id));
}

function safeName(value) {
  return String(value || 'ticket')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'ticket';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

module.exports = {
  v2Container,
  v2Payload,
  isStaff,
  canManageTicket,
  safeName,
  escapeHtml
};
