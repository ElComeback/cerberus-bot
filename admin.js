const { ChannelType } = require('discord.js');

async function createChannel(guild, name, type = "text", categoryName = null) {
  const chType = type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
  let parent = null;
  if (categoryName) parent = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes(categoryName.toLowerCase()));
  const ch = await guild.channels.create({ name, type: chType, parent: parent?.id });
  return { success: true, id: ch.id, name: ch.name };
}

async function deleteChannel(guild, name) {
  const ch = guild.channels.cache.find(c => c.name.includes(name));
  if (!ch) return { error: "channel not found" };
  await ch.delete();
  return { success: true };
}

async function assignRole(guild, username, roleName) {
  await guild.members.fetch();
  const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username.toLowerCase()) || m.displayName.toLowerCase().includes(username.toLowerCase()));
  if (!member) return { error: "user not found" };
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
  if (!role) role = guild.roles.cache.find(r => r.name.toLowerCase().includes(roleName.toLowerCase()));
  if (!role) return { error: "role not found" };
  await member.roles.add(role.id);
  return { success: true, user: member.user.username, role: role.name };
}

async function removeRole(guild, username, roleName) {
  await guild.members.fetch();
  const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username.toLowerCase()) || m.displayName.toLowerCase().includes(username.toLowerCase()));
  if (!member) return { error: "user not found" };
  let role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
  if (!role) role = guild.roles.cache.find(r => r.name.toLowerCase().includes(roleName.toLowerCase()));
  if (!role) return { error: "role not found" };
  await member.roles.remove(role.id);
  return { success: true, user: member.user.username, role: role.name };
}

async function createRole(guild, name, color, hoist = false) {
  const role = await guild.roles.create({ name, color: parseInt(color?.replace('#', '') || "0", 16), hoist });
  return { success: true, id: role.id, name: role.name };
}

async function deleteRole(guild, name) {
  const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(name.toLowerCase()));
  if (!role) return { error: "role not found" };
  await role.delete();
  return { success: true };
}

async function sendMessage(channel, message) {
  const ch = typeof channel === "string" ? null : channel;
  if (!ch) return { error: "invalid channel" };
  await ch.send(message);
  return { success: true };
}

async function getOnline(guild) {
  await guild.members.fetch();
  const online = guild.members.cache.filter(m => !m.user.bot && (m.presence?.status === "online" || m.presence?.status === "idle" || m.presence?.status === "dnd"));
  return { count: online.size, users: online.map(m => m.user.username).slice(0, 20) };
}

async function getUser(guild, username) {
  await guild.members.fetch();
  const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username.toLowerCase()) || m.displayName.toLowerCase().includes(username.toLowerCase()));
  if (!member) return { error: "not found" };
  const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);
  return { username: member.user.username, displayName: member.displayName, joined: member.joinedAt?.toISOString(), roles, isBot: member.user.bot };
}

async function getStats(guild) {
  await guild.members.fetch();
  const total = guild.memberCount;
  const humans = guild.members.cache.filter(m => !m.user.bot).size;
  const bots = guild.members.cache.filter(m => m.user.bot).size;
  const online = guild.members.cache.filter(m => !m.user.bot && m.presence?.status !== "offline").size;
  return { total, humans, bots, online };
}

async function getRecent(guild, channelName, limit = 10) {
  const ch = guild.channels.cache.find(c => c.name.includes(channelName || "general"));
  if (!ch) return { error: "no channel" };
  const msgs = await ch.messages.fetch({ limit: Math.min(limit, 20) });
  const data = msgs.filter(m => !m.author.bot).map(m => ({ user: m.author.username, text: m.content.substring(0, 200), time: m.createdAt.toISOString() }));
  return { count: data.length, messages: data.reverse() };
}

module.exports = { createChannel, deleteChannel, assignRole, removeRole, createRole, deleteRole, sendMessage, getOnline, getUser, getStats, getRecent };
