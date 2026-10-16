const fs = require('node:fs/promises');
const path = require('node:path');
const { AttachmentBuilder } = require('discord.js');
const { escapeHtml } = require('./utils');
async function collectMessages(channel) {
  const all = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;

    all.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  return all.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function messageToHtml(message) {
  const avatar = message.author.displayAvatarURL({ extension: 'png', size: 64 });
  const timestamp = new Date(message.createdTimestamp).toLocaleString('pt-BR');
  const content = escapeHtml(message.content || '').replace(/\n/g, '<br>');
  const attachments = [...message.attachments.values()].map(file =>
    `<li><a href="${escapeHtml(file.url)}" target="_blank" rel="noreferrer">${escapeHtml(file.name || 'Anexo')}</a></li>`
  ).join('');
  const embeds = message.embeds.map(embed => {
    const title = embed.title ? `<strong>${escapeHtml(embed.title)}</strong>` : '';
    const description = embed.description ? `<p>${escapeHtml(embed.description)}</p>` : '';
    return `<div class="embed">${title}${description}</div>`;
  }).join('');
  return `
    <article class="message">
      <img class="avatar" src="${escapeHtml(avatar)}" alt="">
      <div class="message-body">
        <div class="meta"><strong>${escapeHtml(message.author.tag)}</strong> <span>${escapeHtml(timestamp)}</span></div>
        <div class="content">${content || '<em>Mensagem sem texto</em>'}</div>
        ${attachments ? `<ul class="attachments">${attachments}</ul>` : ''}
        ${embeds}
      </div>
    </article>`;
}

async function createTranscript(channel, ticket) {
  const messages = await collectMessages(channel);
  const transcriptDir = path.join(process.cwd(), 'transcripts');
  await fs.mkdir(transcriptDir, { recursive: true });
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Transcript — ${escapeHtml(channel.name)}</title>
<style>
:root{color-scheme:dark;--bg:#0b0e14;--panel:#111722;--line:#273244;--text:#e8edf5;--muted:#9aa8bc;--accent:#7188ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 Inter,system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:28px max(20px,calc((100% - 980px)/2));background:var(--panel);border-bottom:1px solid var(--line)}
main{max-width:980px;margin:24px auto;padding:0 16px}.pill{display:inline-block;padding:4px 10px;border:1px solid var(--line);border-radius:99px;color:var(--muted);font-size:12px}
h1{margin:0 0 8px;font-size:24px}p{margin:4px 0;color:var(--muted)}.message{display:flex;gap:12px;padding:16px 0;border-bottom:1px solid #1c2635}
.avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0}.message-body{min-width:0;flex:1}.meta{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}.meta span{font-size:12px;color:var(--muted)}
.content{overflow-wrap:anywhere;white-space:normal;margin-top:3px}.attachments{margin:8px 0;padding-left:18px}.attachments a{color:#91a5ff}.embed{border-left:3px solid var(--accent);background:#151d2a;padding:10px 12px;margin-top:8px;border-radius:4px}
footer{color:var(--muted);text-align:center;padding:28px}
</style>
</head>
<body>
<header>
  <h1>Transcript do ticket</h1>
  <p>Canal: #${escapeHtml(channel.name)} · Categoria: ${escapeHtml(ticket.category_label)}</p>
  <p>Ticket #${ticket.id} · Criado em ${escapeHtml(new Date(ticket.created_at).toLocaleString('pt-BR'))}</p>
  <span class="pill">${messages.length} mensagens</span>
</header>
<main>${messages.map(messageToHtml).join('\n') || '<p>Nenhuma mensagem encontrada.</p>'}</main>
<footer>Gerado por Vzn</footer>
</body>
</html>`;
  const filename = `ticket-${ticket.id}-${Date.now()}.html`;
  const filePath = path.join(transcriptDir, filename);
  await fs.writeFile(filePath, html, 'utf8');
  return {
    filePath,
    attachment: new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: filename }),
    messageCount: messages.length
  };
}

module.exports = { createTranscript };
