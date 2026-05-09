const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn, execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const play = require('play-dl');
const config = require('./config.json');

// === IA DeepSeek ===
function callDeepSeek(messages, system) {
  return new Promise((resolve) => {
    if (!config.deepseekKey) return resolve(null);
    const data = JSON.stringify({ model: "deepseek-chat", messages: [{ role: "system", content: system || "Eres un miembro mas de un server de Discord." }, ...messages], max_tokens: 200, temperature: 0.8 });
    const req = https.request({ hostname: "api.deepseek.com", path: "/v1/chat/completions", method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.deepseekKey } }, (res) => {
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { const r = JSON.parse(d); resolve(r.choices?.[0]?.message?.content || null); } catch { resolve(null); } });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.write(data); req.end();
  });
}

// === MEMORIA ===
const convBuf = new Map();
let memoryDB = {};
function loadMem() { try { memoryDB = JSON.parse(fs.readFileSync('./memoria.json', 'utf8')); } catch { memoryDB = {}; } }
function saveMem() { fs.writeFile('./memoria.json', JSON.stringify(memoryDB, null, 2), () => {}); }
function recMem(uid, uname, txt) {
  if (!memoryDB[uid]) memoryDB[uid] = { uname, topics: [], first: new Date().toISOString(), n: 0 };
  const u = memoryDB[uid]; u.uname = uname; u.n++;
  const map = { arte:["dibuj","arte","comision"], musica:["musica","canción","song"], juegos:["juego","helldivers","minecraft","steam","gaming"], pelis:["pelicula","serie","berserk","anime","touhou"] };
  for (const [t, ws] of Object.entries(map)) { if (ws.some(w => txt?.toLowerCase().includes(w)) && !u.topics.includes(t)) u.topics.push(t); }
  saveMem();
}
function memCtx(uid, uname) {
  const u = memoryDB[uid]; if (!u) return "";
  const p = []; if (u.topics.length) p.push("intereses: " + u.topics.join(", ")); if (u.n > 5) p.push("interacciones: " + u.n);
  return p.length ? "\n(Sobre " + uname + ": " + p.join(". ") + ")" : "";
}
loadMem();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const queue = new Map();
const dealsConfig = new Map();
function saveDeals() { const d = {}; for (const [k, v] of dealsConfig) d[k] = { channelId: v.channelId }; fs.writeFile('./deals_data.json', JSON.stringify(d), () => {}); }
function loadDeals() { try { const d = JSON.parse(fs.readFileSync('./deals_data.json', 'utf8')); for (const [k, v] of Object.entries(d)) dealsConfig.set(k, { channelId: v.channelId, interval: null }); console.log(`📂 ${Object.keys(d).length} deals cargadas`); } catch {} }

let er = 20.5;
function updateER() {
  https.get('https://open.er-api.com/v6/latest/USD', { headers: { 'User-Agent': 'CerberusBot/1.0' } }, (res) => {
    let d = ''; res.on('data', c => d += c); res.on('end', () => { try { const r = JSON.parse(d); if (r.rates?.MXN) er = r.rates.MXN; } catch {} });
  }).on('error', () => {});
}
updateER(); setInterval(updateER, 6 * 60 * 60 * 1000);

async function fetchDeals() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1', { headers: { 'User-Agent': 'CerberusBot/1.0' } }, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve(JSON.parse(d).slice(0, 5).map(x => { const m = (parseFloat(x.salePrice) * er).toFixed(2), n = (parseFloat(x.normalPrice) * er).toFixed(2); return { title: x.title, sale: `$${m} MXN`, normal: `$${n} MXN`, savings: Math.round(parseFloat(x.savings)), rating: x.steamRatingPercent || 'N/A', link: `https://www.cheapshark.com/redirect?dealID=${x.dealID}`, thumb: x.thumb }; })); } catch(e) { reject(e); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function sendDealsEmbed(ch, deals) {
  ch.send({ embeds: deals.map(d => new EmbedBuilder().setColor(0x00ff00).setTitle(d.title).setURL(d.link).setThumbnail(d.thumb || null).addFields({ name: '💵', value: `~~${d.normal}~~→**${d.sale}**`, inline: true }, { name: '🔥', value: `${d.savings}%`, inline: true }, { name: '⭐', value: `${d.rating}%`, inline: true }).setFooter({ text: 'Cerberus' }).setTimestamp()) });
}

function startDealsTimer(gid, cid) {
  stopDealsTimer(gid);
  dealsConfig.get(gid).interval = setInterval(async () => { const g = client.guilds.cache.get(gid); const c = g?.channels.cache.get(cid); if (c) await postDeals(gid, c); else stopDealsTimer(gid); }, 8 * 60 * 60 * 1000);
}
function stopDealsTimer(gid) { const c = dealsConfig.get(gid); if (c?.interval) { clearInterval(c.interval); c.interval = null; } }
async function postDeals(gid, ch) { try { const d = await fetchDeals(); sendDealsEmbed(ch, d); } catch(e) { console.error(e.message); } }

function getQ(g) { if (!queue.has(g.id)) queue.set(g.id, { conn: null, player: createAudioPlayer(), songs: [], vol: 0.5, proc: null }); return queue.get(g.id); }

async function playSong(g, ch) {
  const q = getQ(g); if (q.songs.length === 0) { q.conn?.destroy(); q.proc?.kill(); queue.delete(g.id); return; }
  const s = q.songs[0];
  try {
    if (q.proc) q.proc.kill();
    const yt = spawn('yt-dlp', ['-f', 'bestaudio', '-o', '-', s.url], { stdio: ['ignore', 'pipe', 'ignore'] });
    const ff = spawn('ffmpeg', ['-i', 'pipe:0', '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    yt.stdout.pipe(ff.stdin); q.proc = { yt, ff };
    const r = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true }); r.volume.setVolume(q.vol);
    q.player.play(r); q.conn.subscribe(q.player);
    ch?.send(`🎵 **Sonando:** ${s.title}`);
  } catch(e) { console.error(e.message); q.songs.shift(); playSong(g, ch); }
}

async function handlePlay(msg, qry) {
  const vc = msg.member?.voice?.channel; const r = (t) => { try { msg.reply(t); } catch { msg.channel?.send(t); } };
  if (!qry) return r('Pon un link.'); if (!vc) return r('Métete a voz.');
  const q = getQ(msg.guild); await r('🔍 Buscando...');
  let s; const i = await play.video_info(qry.match(/youtube\.com|youtu\.be/) ? qry : (await play.search(qry, { limit: 1 }))[0]?.url);
  if (!i) return r('No encontré.'); s = { title: i.video_details.title, url: i.video_details.url };
  q.songs.push(s);
  if (q.songs.length === 1) {
    if (!q.conn || q.conn.state.status === 'destroyed') { q.conn = joinVoiceChannel({ channelId: vc.id, guildId: msg.guild.id, adapterCreator: msg.guild.voiceAdapterCreator }); q.player.on(AudioPlayerStatus.Idle, () => { q.songs.shift(); playSong(msg.guild, msg.channel); }); q.player.on('error', () => { q.songs.shift(); playSong(msg.guild, msg.channel); }); }
    playSong(msg.guild, msg.channel);
  } else r(`📃 **Agregado:** ${s.title}`);
}

function handleCmd(msg, cmd, args) {
  const q = getQ(msg.guild); const r = (t) => { try { msg.reply(t); } catch { msg.channel?.send(t); } };
  switch (cmd) {
    case 'skip': { if (q.songs.length === 0) return r('Nada sonando.'); q.player.stop(); r('⏭️'); break; }
    case 'stop': { q.songs = []; q.player.stop(); q.conn?.destroy(); q.proc?.kill(); queue.delete(msg.guild.id); r('⏹️'); break; }
    case 'queue': { if (q.songs.length === 0) return r('Cola vacía.'); r(`**Cola:**\n` + q.songs.map((s, i) => `${i === 0 ? '▶️' : '📃'} ${i+1}. ${s.title}`).join('\n')); break; }
    case 'pause': { q.player.pause(); r('⏸️'); break; } case 'resume': { q.player.unpause(); r('▶️'); break; }
    case 'np': { if (q.songs.length === 0) return r('Nada.'); r(`🎵 ${q.songs[0].title}`); break; }
    case 'volume': { const v = parseInt(args?.[0] ?? 50); if (isNaN(v) || v < 1 || v > 100) return r('1-100'); q.vol = v / 100; r(`🔊 ${v}%`); break; }
    case 'help': { r('/play /skip /stop /pause /resume /queue /np /volume /deals /pais /artista'); break; }
  }
}

// === ORÁCULO ===
const oraculoConfig = new Map();
const respuestas = ["No sé, wey.","Interesante... cuenta más.","Mmm, no me convence.","JAJAJAJA sí.","Qué hueva.","Nombre, ni le muevas.","Buena observación.","Ay wey, ya empezaste.","Alguien dijo mi nombre?","Qué profundo... o no."];
const cooldowns = new Map();
async function responderOraculo(msg) {
  const txt = msg.content.trim(); if (txt.length > 500 || txt.length < 3 || msg.author.id === client.user.id) return;
  const last = cooldowns.get(msg.author.id); if (last && Date.now() - last < 3000) { try { await msg.react('⏳'); } catch {} return; }
  cooldowns.set(msg.author.id, Date.now()); await new Promise(r => setTimeout(r, 1500 + Math.random() * 1500));
  if (config.deepseekKey) {
    recMem(msg.author.id, msg.author.username, txt);
    const ctx = memCtx(msg.author.id, msg.author.username);
    const ai = await callDeepSeek([...((convBuf.get(msg.author.id) || [])), { role: "user", content: txt }], "Eres Cerberus. 1) 1-2 oraciones 2) NO markdown 3) NO consejos 4) Slang mexicano 5) NO digas que eres IA" + ctx);
    if (ai) { convBuf.set(msg.author.id, [...(convBuf.get(msg.author.id) || []).slice(-4), { role: "user", content: txt }, { role: "assistant", content: ai }]); try { await msg.react(['🔥','💀','🚬','🤝'][Math.floor(Math.random()*4)]); } catch {} await msg.channel.send({ content: ai.trim().substring(0, 200), tts: true }); return; }
  }
  try { await msg.react(['🔥','💀','🚬','🤝'][Math.floor(Math.random()*4)]); } catch {} await msg.channel.send({ content: respuestas[Math.floor(Math.random() * respuestas.length)], tts: true });
}

client.on('messageCreate', async (msg) => {
  if (msg.author.bot) return; const id = oraculoConfig.get(msg.guild?.id); if (id && msg.channel.id === id) { await responderOraculo(msg); return; }
  const gc = galeriaConfig.get(msg.guild?.id); if (gc) { const cat = msg.guild?.channels.cache.get(gc.categoriaId); if (cat && msg.channel.parentId === cat.id && msg.channel.id !== gc.destacadosId && (msg.attachments.size > 0 || msg.content.length > 0)) { setTimeout(async () => { for (const e of ["🎨","✨","🔥","💀","🧠","🤝","❤️"]) { try { await msg.react(e); } catch {} } }, 500); } }
});

// === WELCOME ===
const welcomeConfig = new Map();
function saveWel() { const d = {}; for (const [k, v] of welcomeConfig) d[k] = v; fs.writeFile('./welcome_data.json', JSON.stringify(d), () => {}); }
function loadWel() { try { const d = JSON.parse(fs.readFileSync('./welcome_data.json', 'utf8')); for (const [k, v] of Object.entries(d)) welcomeConfig.set(k, v); console.log(`📂 ${Object.keys(d).length} bienvenidas`); } catch {} }

client.on('guildMemberAdd', async (m) => {
  if (m.user.bot) return; const id = welcomeConfig.get(m.guild.id); if (!id) return; const ch = m.guild.channels.cache.get(id); if (!ch) return;
  const msgs = [`🔥 Llegó ${m}! Pásate por #🎭-roles.`,`🫡 ${m} bienvenido.`,`${m} se unió. Ponte tu rol en #🎭-roles.`];
  await ch.send(msgs[Math.floor(Math.random() * msgs.length)]);
  try { await m.send(`🤝 Bienvenido a **${m.guild.name}**! Pásate por #🎭-roles.`); } catch {}
});

// === PAISES ===
const paises = [
  { n: "🇲🇽 México", e: "🇲🇽" }, { n: "🇨🇴 Colombia", e: "🇨🇴" }, { n: "🇦🇷 Argentina", e: "🇦🇷" }, { n: "🇨🇱 Chile", e: "🇨🇱" },
  { n: "🇵🇪 Perú", e: "🇵🇪" }, { n: "🇻🇪 Venezuela", e: "🇻🇪" }, { n: "🇪🇨 Ecuador", e: "🇪🇨" }, { n: "🇨🇺 Cuba", e: "🇨🇺" },
  { n: "🇩🇴 R.Dominicana", e: "🇩🇴" }, { n: "🇭🇳 Honduras", e: "🇭🇳" }, { n: "🇸🇻 El Salvador", e: "🇸🇻" }, { n: "🇧🇴 Bolivia", e: "🇧🇴" },
  { n: "🇺🇾 Uruguay", e: "🇺🇾" }, { n: "🇵🇾 Paraguay", e: "🇵🇾" }, { n: "🇨🇷 Costa Rica", e: "🇨🇷" }, { n: "🇵🇦 Panamá", e: "🇵🇦" },
  { n: "🇪🇸 España", e: "🇪🇸" }, { n: "🇺🇸 USA", e: "🇺🇸" },
];

async function handlePais(i) {
  try {
    await i.reply({ content: "🌍 **¿De dónde eres?**", components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("pais_s").setPlaceholder("Selecciona...").addOptions(paises.map(p => ({ label: p.n, value: p.n, emoji: p.e }))))], ephemeral: true });
  } catch(e) { console.error("pais:", e.message); }
}

client.on('interactionCreate', async (i) => {
  if (!i.isStringSelectMenu() || i.customId !== "pais_s") return;
  const g = i.guild; const m = i.member; const sel = i.values[0];
  let r = g.roles.cache.find(x => x.name === sel); if (!r) r = await g.roles.create({ name: sel });
  for (const p of paises) { const old = g.roles.cache.find(x => x.name === p.n); if (old && m.roles.cache.has(old.id)) await m.roles.remove(old.id); }
  await m.roles.add(r.id); await i.update({ content: `✅ **${sel}**`, components: [], ephemeral: false });
});

// === GALERIA ===
const galCfg = new Map();
async function getCatGal(g) {
  const c = galCfg.get(g.id); if (c) return g.channels.cache.get(c.id);
  let cat = g.channels.cache.find(x => x.name.includes("GALER")); if (!cat) cat = await g.channels.create({ name: "🎨 GALERIA DE ARTE", type: ChannelType.GuildCategory });
  let d = g.channels.cache.find(x => x.name.includes("destacados")); if (!d) d = await g.channels.create({ name: "🏆 destacados", type: ChannelType.GuildText, parent: cat.id });
  galCfg.set(g.id, { id: cat.id, dest: d.id }); return cat;
}

async function handleArt(i) {
  const g = i.guild; const m = i.member; let r = g.roles.cache.find(x => x.name === "Artista"); if (!r) r = await g.roles.create({ name: "Artista" });
  if (m.roles.cache.has(r.id)) return i.reply("Ya eres Artista.");
  await m.roles.add(r.id); const cat = await getCatGal(g); const cn = "🎨-" + m.user.username.replace(/[^a-z0-9]/gi, "").toLowerCase().substring(0, 20);
  let ch = g.channels.cache.find(x => x.name === cn);
  if (!ch) ch = await g.channels.create({ name: cn, type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: [{ id: g.roles.everyone.id, deny: ["SendMessages"], allow: ["ViewChannel","ReadMessageHistory","AddReactions"] }, { id: m.id, allow: ["SendMessages","ViewChannel","ReadMessageHistory","AttachFiles","EmbedLinks"] }] });
  i.reply("🎨 Eres **Artista**! Tu canal: " + ch);
}

// === ENCICLOPEDIA ===
const encCfg = new Map();
function saveEnc() { const d = {}; for (const [k, v] of encCfg) d[k] = v; fs.writeFile('./enciclopedia_data.json', JSON.stringify(d), () => {}); }
function loadEnc() { try { const d = JSON.parse(fs.readFileSync('./enciclopedia_data.json', 'utf8')); for (const [k, v] of Object.entries(d)) encCfg.set(k, v); console.log(`📂 ${Object.keys(d).length} enciclopedias`); } catch {} }

async function updateEnc(gid) {
  const c = encCfg.get(gid); if (!c) return; const g = client.guilds.cache.get(gid); if (!g) return; const f = g.channels.cache.get(c.fid); if (!f) return;
  try {
    const gen = g.channels.cache.find(x => x.name.includes("general")); if (!gen) return;
    const msgs = await gen.messages.fetch({ limit: 100 }); const act = {};
    msgs.forEach(m => { if (m.author.bot) return; if (!act[m.author.id]) act[m.author.id] = { name: m.author.username, topics: [], count: 0 }; act[m.author.id].count++; const t = m.content.toLowerCase(); if (/dibuj|arte|comision/.test(t)) act[m.author.id].topics.push("arte"); if (/jueg|game|helldivers|minecraft/.test(t)) act[m.author.id].topics.push("gaming"); if (/musica|canción|song/.test(t)) act[m.author.id].topics.push("música"); if (/pelicula|serie|berserk|anime/.test(t)) act[m.author.id].topics.push("pelis/series"); });
    const threads = await f.threads.fetchActive();
    for (const [, u] of Object.entries(act)) {
      if (u.count < 3) continue; const t = threads.threads.find(x => x.name.includes(u.name)); if (!t) continue;
      const s = t.starterMessage || await t.fetchStarterMessage(); if (!s || s.author.id !== client.user.id) continue;
      const top = [...new Set(u.topics)].join(", "); const date = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "short" });
      const line = `\n📊 **${date}:** ${u.count} msgs · ${top || "variado"}`; if (!s.content.includes(line.trim())) await s.edit(s.content + line);
    }
  } catch(e) { console.error(e.message); }
}
function startEncTimer(gid) { const c = encCfg.get(gid); if (!c) return; if (c.int) clearInterval(c.int); c.int = setInterval(() => updateEnc(gid), 3 * 24 * 60 * 60 * 1000); }

// === SLASH COMMANDS ===
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  switch (i.commandName) {
    case 'play': await handlePlay(i, i.options.getString('query')); break;
    case 'deals': { await i.deferReply(); try { const d = await fetchDeals(); i.editReply({ embeds: d.map(x => new EmbedBuilder().setColor(0x00ff00).setTitle(x.title).setURL(x.link).setThumbnail(x.thumb||null).addFields({name:'💵',value:`~~${x.normal}~~→**${x.sale}**`,inline:true},{name:'🔥',value:`${x.savings}%`,inline:true},{name:'⭐',value:`${x.rating}%`,inline:true}).setFooter({text:'Cerberus'}).setTimestamp()) }); } catch(e) { i.editReply('❌'); } break; }
    case 'setdeals': {
      const ch = i.options.getChannel('canal'); dealsConfig.set(i.guildId, { channelId: ch.id, interval: null }); saveDeals(); startDealsTimer(i.guildId, ch.id);
      i.reply(`✅ Deals en ${ch}`); await postDeals(i.guildId, ch); break; }
    case 'stopdeals': { stopDealsTimer(i.guildId); dealsConfig.delete(i.guildId); saveDeals(); i.reply('⏹️'); break; }
    case 'setoraculo': { const c = i.options.getChannel('canal'); if (c.type !== 0) return i.reply('❌'); oraculoConfig.set(i.guildId, c.id); i.reply(`🤫 ${c}`); break; }
    case 'stoporaculo': { oraculoConfig.delete(i.guildId); i.reply('🤫'); break; }
    case 'setmuro': { const c = i.options.getChannel('canal'); if (c.type !== 0) return i.reply('❌'); oraculoConfig.set(i.guildId, c.id); i.reply('🧱'); break; }
    case 'stopmuro': { oraculoConfig.delete(i.guildId); i.reply('🧱'); break; }
    case 'setenciclopedia': {
      const f = i.options.getChannel('canal'); if (f.type !== 15) return i.reply('❌'); encCfg.set(i.guildId, { fid: f.id }); saveEnc(); startEncTimer(i.guildId);
      i.reply(`📖 ${f}`); await updateEnc(i.guildId); break; }
    case 'stopenciclopedia': { const c = encCfg.get(i.guildId); if (c?.int) clearInterval(c.int); encCfg.delete(i.guildId); saveEnc(); i.reply('⏹️'); break; }
    case 'updateenciclopedia': { i.reply('📖'); await updateEnc(i.guildId); break; }
    case 'setwelcome': { const c = i.options.getChannel('canal'); if (c.type !== 0) return i.reply('❌'); welcomeConfig.set(i.guildId, c.id); saveWel(); i.reply(`✅ ${c}`); break; }
    case 'stopwelcome': { welcomeConfig.delete(i.guildId); saveWel(); i.reply('⏹️'); break; }
    case 'artista': await handleArt(i); break;
    case 'setupgaleria': await getCatGal(i.guild); i.reply('🎨'); break;
    case 'pais': await handlePais(i); break;
    case 'volume': handleCmd(i, 'volume', [String(i.options.getInteger('nivel'))]); break;
    default: handleCmd(i, i.commandName, []);
  }
});

// === READY ===
client.on('ready', () => {
  console.log(`✅ Cerberus online como ${client.user.tag}`);
  try { console.log(`✅ yt-dlp: ${execSync('yt-dlp --version').toString().trim()}`); } catch {}
  loadDeals(); loadWel(); loadEnc(); loadMem();
  for (const [k] of dealsConfig) { const c = dealsConfig.get(k); if (c?.channelId) startDealsTimer(k, c.channelId); }
  for (const [k] of encCfg) startEncTimer(k);
});

client.login(config.token);
require('http').createServer((_, r) => { r.writeHead(200); r.end('OK'); }).listen(process.env.PORT || 8080);