const https = require('https');
const config = require('./config.json');

const functions = {
  get_online: async (client, guildId) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const online = guild.members.cache.filter(m => !m.user.bot && (m.presence?.status === "online" || m.presence?.status === "idle" || m.presence?.status === "dnd"));
      const names = online.map(m => m.user.username).slice(0, 20);
      return JSON.stringify({ count: online.size, users: names });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  },
  get_recent: async (client, guildId, channel = "general", limit = 10) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      const ch = guild?.channels?.cache?.find(c => c.name.includes(channel));
      if (!ch) return JSON.stringify({ error: "no channel" });
      const msgs = await ch.messages.fetch({ limit: Math.min(limit, 20) });
      const data = msgs.filter(m => !m.author.bot).map(m => ({ user: m.author.username, text: m.content.substring(0, 200), time: m.createdAt.toISOString() }));
      return JSON.stringify({ count: data.length, messages: data.reverse() });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  },
  get_user: async (client, guildId, username) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const member = guild.members.cache.find(m => m.user.username.toLowerCase().includes(username.toLowerCase()) || m.displayName.toLowerCase().includes(username.toLowerCase()));
      if (!member) return JSON.stringify({ error: "not found" });
      const roles = member.roles.cache.filter(r => r.name !== "@everyone").map(r => r.name);
      return JSON.stringify({ username: member.user.username, displayName: member.displayName, joined: member.joinedAt?.toISOString(), roles, isBot: member.user.bot });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  },
  get_stats: async (client, guildId) => {
    try {
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return JSON.stringify({ error: "no guild" });
      await guild.members.fetch();
      const total = guild.memberCount;
      const humans = guild.members.cache.filter(m => !m.user.bot).size;
      const bots = guild.members.cache.filter(m => m.user.bot).size;
      const online = guild.members.cache.filter(m => !m.user.bot && m.presence?.status !== "offline").size;
      return JSON.stringify({ total, humans, bots, online });
    } catch(e) { return JSON.stringify({ error: e.message }); }
  },
};

const tools = Object.entries(functions).map(([name, fn]) => ({
  type: "function",
  function: { name, description: `Obtiene ${name.replace(/_/g, " ")} del servidor Discord`, parameters: { type: "object", properties: {} } }
}));

async function callAI(msgs, sys, client, guildId) {
  return new Promise(async (resolve) => {
    if (!config.aiKey) return resolve(null);
    const allMsgs = [{ role: "system", content: sys || "" }, ...msgs];

    async function makeRequest(messages, isLoop = false) {
      return new Promise(r => {
        const d = JSON.stringify({ model: "moonshot-v1-8k", messages, tools: isLoop ? [] : tools, tool_choice: "auto", max_tokens: 300, temperature: 0.7 });
        const req = https.request({ hostname: "api.moonshot.ai", path: "/v1/chat/completions", method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.aiKey } }, res => {
          let b = ""; res.on("data", c => b += c); res.on("end", () => { try { r(JSON.parse(b)); } catch { r(null); } });
        });
        req.on("error", () => r(null)); req.setTimeout(25000, () => { req.destroy(); r(null); }); req.write(d); req.end();
      });
    }

    let result = await makeRequest(allMsgs);
    if (!result) return resolve(null);

    // Si la IA quiere llamar una función
    if (result.choices?.[0]?.message?.tool_calls) {
      const msg = result.choices[0].message;
      allMsgs.push({ role: "assistant", content: null, tool_calls: msg.tool_calls });

      for (const call of msg.tool_calls) {
        const fn = functions[call.function.name];
        if (fn) {
          try {
            const args = JSON.parse(call.function.arguments || "{}");
            const output = await fn(client, guildId, args.channel, args.limit, args.username);
            allMsgs.push({ role: "tool", tool_call_id: call.id, content: output });
          } catch(e) {
            allMsgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: e.message }) });
          }
        }
      }

      // Segunda llamada con los datos
      const final = await makeRequest(allMsgs, true);
      resolve(final?.choices?.[0]?.message?.content || null);
    } else {
      resolve(result.choices?.[0]?.message?.content || null);
    }
  });
}

module.exports = { callAI };
