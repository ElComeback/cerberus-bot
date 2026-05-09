const https = require('https');
const config = require('./config.json');

const functions = {
  get_online: async ({ client, guildId }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const online = guild.members.cache.filter(m => !m.user.bot && (m.presence?.status === "online" || m.presence?.status === "idle" || m.presence?.status === "dnd"));
      const names = online.map(m => m.user.username).slice(0, 20);
      return JSON.stringify({ count: online.size, users: names });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  get_recent: async ({ client, guildId, channel, limit }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      const ch = guild?.channels?.cache?.find(c => c.name.includes(channel || "general"));
      if (!ch) return JSON.stringify({ error: "no channel" });
      const msgs = await ch.messages.fetch({ limit: Math.min(limit || 10, 20) });
      const data = msgs.filter(m => !m.author.bot).map(m => ({ user: m.author.username, text: m.content.substring(0, 200), time: m.createdAt.toISOString() }));
      return JSON.stringify({ count: data.length, messages: data.reverse() });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  get_user: async ({ client, guildId, username }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username?.toLowerCase()) || m.displayName.toLowerCase().includes(username?.toLowerCase()));
      if (!member) return JSON.stringify({ error: "not found" });
      const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);
      return JSON.stringify({ username: member.user.username, displayName: member.displayName, joined: member.joinedAt?.toISOString(), roles, isBot: member.user.bot });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  get_stats: async ({ client, guildId }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const total = guild.memberCount;
      const humans = guild.members.cache.filter(m => !m.user.bot).size;
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const online = guild.members.cache.filter(m => !m.user.bot && m.presence?.status !== "offline").size;
      return JSON.stringify({ total, humans, bots, online });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  createChannel: async ({ client, guildId, name, type, category }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      const chType = type === "voice" ? 2 : 0;
      let parent = null;
      if (category) parent = guild.channels.cache.find(c => c.type === 4 && c.name.toLowerCase().includes(category.toLowerCase()));
      const ch = await guild.channels.create({ name, type: chType, parent: parent?.id });
      return JSON.stringify({ success: true, id: ch.id, name: ch.name });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  deleteChannel: async ({ client, guildId, name }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      const ch = guild.channels.cache.find(c => c.name.includes(name));
      if (!ch) return JSON.stringify({ error: "channel not found" });
      await ch.delete();
      return JSON.stringify({ success: true });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  assignRole: async ({ client, guildId, username, roleName }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username?.toLowerCase()) || m.displayName.toLowerCase().includes(username?.toLowerCase()));
      if (!member) return JSON.stringify({ error: "user not found" });
      let role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName?.toLowerCase());
      if (!role) role = guild.roles.cache.find(r => r.name.toLowerCase().includes(roleName?.toLowerCase()));
      if (!role) return JSON.stringify({ error: "role not found" });
      await member.roles.add(role.id);
      return JSON.stringify({ success: true, user: member.user.username, role: role.name });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  removeRole: async ({ client, guildId, username, roleName }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username?.toLowerCase()) || m.displayName.toLowerCase().includes(username?.toLowerCase()));
      if (!member) return JSON.stringify({ error: "user not found" });
      let role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName?.toLowerCase());
      if (!role) role = guild.roles.cache.find(r => r.name.toLowerCase().includes(roleName?.toLowerCase()));
      if (!role) return JSON.stringify({ error: "role not found" });
      await member.roles.remove(role.id);
      return JSON.stringify({ success: true, user: member.user.username, role: role.name });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  createRole: async ({ client, guildId, name, color, hoist }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      const role = await guild.roles.create({ name, color: parseInt(color?.replace('#', '') || "0", 16), hoist: !!hoist });
      return JSON.stringify({ success: true, id: role.id, name: role.name });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  deleteRole: async ({ client, guildId, name }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      const role = guild.roles.cache.find(r => r.name.toLowerCase().includes(name?.toLowerCase()));
      if (!role) return JSON.stringify({ error: "role not found" });
      await role.delete();
      return JSON.stringify({ success: true });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },

  sendMessage: async ({ client, guildId, channel, message }) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      const ch = guild.channels.cache.find(c => c.name.includes(channel));
      if (!ch) return JSON.stringify({ error: "channel not found" });
      await ch.send(message);
      return JSON.stringify({ success: true });
    } catch (e) { return JSON.stringify({ error: e.message }); }
  },
};

const tools = [
  { type: "function", function: { name: "get_online", description: "Get online users in the server", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "get_recent", description: "Get recent messages from a channel", parameters: { type: "object", properties: { channel: { type: "string", description: "Channel name" }, limit: { type: "number", description: "Max messages (20)" } }, required: [] } } },
  { type: "function", function: { name: "get_user", description: "Get info about a user (roles, join date, etc)", parameters: { type: "object", properties: { username: { type: "string", description: "Username" } }, required: ["username"] } } },
  { type: "function", function: { name: "get_stats", description: "Get server statistics", parameters: { type: "object", properties: {}, required: [] } } },
  { type: "function", function: { name: "createChannel", description: "Create a text or voice channel", parameters: { type: "object", properties: { name: { type: "string", description: "Channel name" }, type: { type: "string", description: "text or voice" }, category: { type: "string", description: "Category to place it under" } }, required: ["name"] } } },
  { type: "function", function: { name: "deleteChannel", description: "Delete a channel by name", parameters: { type: "object", properties: { name: { type: "string", description: "Channel name" } }, required: ["name"] } } },
  { type: "function", function: { name: "assignRole", description: "Assign a role to a user", parameters: { type: "object", properties: { username: { type: "string", description: "Username" }, roleName: { type: "string", description: "Role name" } }, required: ["username", "roleName"] } } },
  { type: "function", function: { name: "removeRole", description: "Remove a role from a user", parameters: { type: "object", properties: { username: { type: "string", description: "Username" }, roleName: { type: "string", description: "Role name" } }, required: ["username", "roleName"] } } },
  { type: "function", function: { name: "createRole", description: "Create a new role", parameters: { type: "object", properties: { name: { type: "string", description: "Role name" }, color: { type: "string", description: "Hex color e.g. #FF0000" }, hoist: { type: "boolean", description: "Show separately in member list" } }, required: ["name"] } } },
  { type: "function", function: { name: "deleteRole", description: "Delete a role by name", parameters: { type: "object", properties: { name: { type: "string", description: "Role name" } }, required: ["name"] } } },
  { type: "function", function: { name: "sendMessage", description: "Send a message to a channel as the bot", parameters: { type: "object", properties: { channel: { type: "string", description: "Channel name" }, message: { type: "string", description: "Message content" } }, required: ["channel", "message"] } } },
];

async function callAI(msgs, sys, client, guildId) {
  return new Promise(async (resolve) => {
    if (!config.aiKey) return resolve(null);
    const allMsgs = [{ role: "system", content: sys || "" }, ...msgs];

    async function makeRequest(messages, isLoop = false) {
      return new Promise(r => {
        const d = JSON.stringify({ model: "moonshot-v1-8k", messages, tools: isLoop ? [] : tools, tool_choice: "auto", max_tokens: 500, temperature: 0.7 });
        const req = https.request({ hostname: "api.moonshot.ai", path: "/v1/chat/completions", method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.aiKey } }, res => {
          let b = ""; res.on("data", c => b += c); res.on("end", () => { try { r(JSON.parse(b)); } catch { r(null); } });
        });
        req.on("error", () => r(null)); req.setTimeout(30000, () => { req.destroy(); r(null); }); req.write(d); req.end();
      });
    }

    let result = await makeRequest(allMsgs);
    if (!result) return resolve(null);

    if (result.choices?.[0]?.message?.tool_calls) {
      const msg = result.choices[0].message;
      allMsgs.push({ role: "assistant", content: null, tool_calls: msg.tool_calls });

      for (const call of msg.tool_calls) {
        const fn = functions[call.function.name];
        if (fn) {
          try {
            const args = JSON.parse(call.function.arguments || "{}");
            const output = await fn({ client, guildId, ...args });
            allMsgs.push({ role: "tool", tool_call_id: call.id, content: output });
          } catch (e) {
            allMsgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: e.message }) });
          }
        }
      }

      const final = await makeRequest(allMsgs, true);
      resolve(final?.choices?.[0]?.message?.content || null);
    } else {
      resolve(result.choices?.[0]?.message?.content || null);
    }
  });
}

module.exports = { callAI };
