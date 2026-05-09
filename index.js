const { Client, GatewayIntentBits, EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn, execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const play = require('play-dl');
const config = require('./config.json');

function callAI(msgs, sys) {
  return new Promise(r => {
    if (!config.aiKey) return r(null);
    const d = JSON.stringify({ model: "moonshot-v1-8k", messages: [{ role: "system", content: sys || "" }, ...msgs], max_tokens: 250, temperature: 0.7 });
    const req = https.request({ hostname: "api.moonshot.ai", path: "/v1/chat/completions", method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.aiKey } }, res => {
      let b = ""; res.on("data", c => b += c); res.on("end", () => { try { const j = JSON.parse(b); r(j.choices?.[0]?.message?.content || null); } catch { r(null); } });
    });
    req.on("error", () => r(null)); req.setTimeout(12000, () => { req.destroy(); r(null); }); req.write(d); req.end();
  });
}

const convBuf = new Map();
let memDB = {};
function loadMem() { try { memDB = JSON.parse(fs.readFileSync('./memoria.json', 'utf8')); } catch { memDB = {}; } }
function saveMem() { fs.writeFile('./memoria.json', JSON.stringify(memDB, null, 2), () => {}); }
function recMem(id, name, txt) {
  if (!memDB[id]) memDB[id] = { name, topics: [], n: 0 };
  const u = memDB[id]; u.name = name; u.n++;
  const map = { arte:["dibuj","arte","comision"], musica:["musica","canción","song"], juegos:["juego","helldivers","minecraft"], pelis:["pelicula","serie","berserk","anime"] };
  for (const [t, ws] of Object.entries(map)) { if (ws.some(w => txt?.toLowerCase().includes(w)) && !u.topics.includes(t)) u.topics.push(t); }
  saveMem();
}
function memCtx(id, name) {
  const u = memDB[id]; if (!u) return "";
  const p = []; if (u.topics.length) p.push("intereses: " + u.topics.join(", ")); if (u.n > 5) p.push(u.n + " interacciones");
  return p.length ? "\n(Sobre " + name + ": " + p.join(". ") + ")" : "";
}
loadMem();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

const queue = new Map();
const dealsConfig = new Map();
function saveDeals() { const d = {}; for (const [k, v] of dealsConfig) d[k] = { ch: v.ch }; fs.writeFile('./deals.json', JSON.stringify(d), () => {}); }
function loadDeals() { try { const d = JSON.parse(fs.readFileSync('./deals.json', 'utf8')); for (const [k, v] of Object.entries(d)) dealsConfig.set(k, { ch: v.ch, int: null }); console.log(`📂 ${Object.keys(d).length} deals`); } catch {} }
let er = 20.5;
function updER() { https.get('https://open.er-api.com/v6/latest/USD', { headers: { 'User-Agent': 'CB/1' } }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => { try { const x = JSON.parse(d); if (x.rates?.MXN) er = x.rates.MXN; } catch {} }); }).on("error", () => {}); }
updER(); setInterval(updER, 6*60*60*1000);

async function fetchDeals() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1', { headers: { 'User-Agent': 'CB/1' } }, res => {
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d).slice(0,5).map(x => { const s = (parseFloat(x.salePrice)*er).toFixed(2), n = (parseFloat(x.normalPrice)*er).toFixed(2); return { t: x.title, s: `$${s} MXN`, n: `$${n} MXN`, p: Math.round(parseFloat(x.savings)), r: x.steamRatingPercent||'N/A', l: `https://www.cheapshark.com/redirect?dealID=${x.dealID}`, th: x.thumb }; })); } catch(e) { reject(e); } });
    }); req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); }); req.on('error', reject);
  });
}
function sendDeals(ch, d) { ch.send({ embeds: d.map(x => new EmbedBuilder().setColor(0x00ff00).setTitle(x.t).setURL(x.l).setThumbnail(x.th||null).addFields({name:'💵',value:`~~${x.n}~~→**${x.s}**`,inline:true},{name:'🔥',value:`${x.p}%`,inline:true},{name:'⭐',value:`${x.r}%`,inline:true}).setFooter({text:'Cerberus'}).setTimestamp()) }); }
function startDeals(g, c) { stopDeals(g); dealsConfig.get(g).int = setInterval(async () => { const ch = client.guilds.cache.get(g)?.channels.cache.get(c); if (ch) sendDeals(ch, await fetchDeals()); }, 8*60*60*1000); }
function stopDeals(g) { const c = dealsConfig.get(g); if (c?.int) { clearInterval(c.int); c.int = null; } }
async function postDeals(g, c) { try { sendDeals(c, await fetchDeals()); } catch {} }

function getQ(g) { if (!queue.has(g.id)) queue.set(g.id, { conn: null, player: createAudioPlayer(), songs: [], vol: 0.5, proc: null }); return queue.get(g.id); }
async function playSong(g, ch) {
  const q = getQ(g); if (!q.songs.length) { q.conn?.destroy(); q.proc?.kill(); queue.delete(g.id); return; }
  const s = q.songs[0];
  try {
    if (q.proc) q.proc.kill();
    const yt = spawn('yt-dlp', ['-f', 'bestaudio', '-o', '-', s.u], { stdio: ['ignore','pipe','ignore'] });
    const ff = spawn('ffmpeg', ['-i','pipe:0','-f','s16le','-ar','48000','-ac','2','pipe:1'], { stdio: ['pipe','pipe','ignore'] });
    yt.stdout.pipe(ff.stdin); q.proc = { yt, ff };
    const r = createAudioResource(ff.stdout, { inputType: StreamType.Raw, inlineVolume: true }); r.volume.setVolume(q.vol);
    q.player.play(r); q.conn.subscribe(q.player); ch?.send(`🎵 ${s.t}`);
  } catch(e) { q.songs.shift(); playSong(g, ch); }
}
async function handlePlay(i, q) {
  const vc = i.member?.voice?.channel; const rep = t => { try { i.reply(t); } catch { i.channel?.send(t); } };
  if (!q) return rep('❌ Link?'); if (!vc) return rep('❌ Métete a voz.');
  let info; try {
    if (q.match(/youtube\.com|youtu\.be/)) info = await play.video_info(q);
    else { const r = await play.search(q, { limit: 1 }); if (!r.length) return rep('❌ No encontré.'); info = await play.video_info(r[0].url); }
  } catch { return rep('❌ Error.'); }
  const s = { t: info.video_details.title, u: info.video_details.url };
  const qq = getQ(i.guild); qq.songs.push(s);
  if (qq.songs.length === 1) {
    if (!qq.conn || qq.conn.state.status === 'destroyed') { qq.conn = joinVoiceChannel({ channelId: vc.id, guildId: i.guild.id, adapterCreator: i.guild.voiceAdapterCreator }); qq.player.on(AudioPlayerStatus.Idle, () => { qq.songs.shift(); playSong(i.guild, i.channel); }); qq.player.on('error', () => { qq.songs.shift(); playSong(i.guild, i.channel); }); }
    playSong(i.guild, i.channel);
  } else rep(`📃 **Agregado:** ${s.t}`);
}

const oraculoConfig = new Map();
const respuestas = ["No sé, wey.","Interesante...","Mmm no.","JAJAJA sí.","Qué hueva.","Ni le muevas.","Buena obs.","Ay wey.","Quién?","Qué profundo."];
const cds = new Map();
async function respondOraculo(msg) {
  const txt = msg.content.trim(); if (txt.length > 500 || txt.length < 3 || msg.author.id === client.user.id) return;
  const l = cds.get(msg.author.id); if (l && Date.now()-l<3000) { try { await msg.react('⏳'); } catch {} return; }
  cds.set(msg.author.id, Date.now()); await new Promise(r => setTimeout(r, 1500+Math.random()*1500));
  if (config.aiKey) {
    recMem(msg.author.id, msg.author.username, txt); const ctx = memCtx(msg.author.id, msg.author.username);
    const ai = await callAI([...(convBuf.get(msg.author.id)||[]), {role:"user",content:txt}], "Eres Cerberus, un miembro del server Sociedad de los Mediocres en Discord. Reglas: 1) Respuestas casuales de 1-2 oraciones 2) Sin markdown 3) No des consejos médicos 4) No digas que eres IA 5) Sé natural y variado en tu forma de hablar 6) Si alguien necesita ayuda, orienta sin ser intenso 7) Puedes participar en conversaciones variadas sin forzar el tema"+ctx);
    if (ai) { convBuf.set(msg.author.id, [...(convBuf.get(msg.author.id)||[]).slice(-4),{role:"user",content:txt},{role:"assistant",content:ai}]); try { await msg.react(['🔥','💀','🚬','🤝'][Math.floor(Math.random()*4)]); } catch {} await msg.channel.send({content:ai.trim().substring(0,200),tts:true}); return; }
  }
  try { await msg.react(['🔥','💀','🚬','🤝'][Math.floor(Math.random()*4)]); } catch {} await msg.channel.send({content:respuestas[Math.floor(Math.random()*respuestas.length)],tts:true});
}

// Si mencionan a Cerberus en #general, responder
const mentionRegex = new RegExp("<@!?" + client.user.id + ">", "i");

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;
  const inOraculo = oraculoConfig.get(msg.guild?.id);
  if (inOraculo && msg.channel.id === inOraculo) return; // ya lo maneja abajo
  if (mentionRegex.test(msg.content) && msg.channel.name.includes("general")) {
    const txt = msg.content.replace(mentionRegex, "").trim();
    if (!txt) return;
    recMem(msg.author.id, msg.author.username, txt);
    const ctx = memCtx(msg.author.id, msg.author.username);
    const ai = await callAI([...((convBuf.get(msg.author.id)||[]).slice(-4)),{role:"user",content:txt}], "Eres Cerberus, miembro del server Discord. Respondes natural, casual, como un amigo. 1-2 oraciones. Sin markdown. Sin decir que eres IA o bot."+ctx);
    if (ai) { convBuf.set(msg.author.id, [...(convBuf.get(msg.author.id)||[]).slice(-4),{role:"user",content:txt},{role:"assistant",content:ai}]); await msg.reply(ai.trim().substring(0,300)); }
    return;
  }
});

const galCfg = new Map();
async function getCatGal(g) {
  const c = galCfg.get(g.id); if (c && g.channels.cache.get(c.id)) return g.channels.cache.get(c.id);
  let cat = g.channels.cache.find(x => x.name.includes("GALER")); if (!cat) cat = await g.channels.create({name:"🎨 GALERIA DE ARTE",type:ChannelType.GuildCategory});
  let d = g.channels.cache.find(x => x.name.includes("destacados")); if (!d) d = await g.channels.create({name:"🏆 destacados",type:ChannelType.GuildText,parent:cat.id});
  galCfg.set(g.id, {id:cat.id,dest:d.id}); return cat;
}
async function handleArt(i) {
  const g = i.guild, m = i.member; let r = g.roles.cache.find(x => x.name==="Artista"); if (!r) r = await g.roles.create({name:"Artista"});
  if (m.roles.cache.has(r.id)) return i.reply("Ya eres Artista."); await m.roles.add(r.id);
  const cat = await getCatGal(g); const cn = "🎨-"+m.user.username.replace(/[^a-z0-9]/gi,"").toLowerCase().substring(0,20);
  let ch = g.channels.cache.find(x => x.name===cn);
  if (!ch) ch = await g.channels.create({name:cn,type:ChannelType.GuildText,parent:cat.id,permissionOverwrites:[{id:g.roles.everyone.id,deny:["SendMessages"],allow:["ViewChannel","ReadMessageHistory","AddReactions"]},{id:m.id,allow:["SendMessages","ViewChannel","ReadMessageHistory","AttachFiles","EmbedLinks"]}]});
  i.reply("🎨 Eres **Artista**! Tu canal: "+ch);
}

const paises = [{n:"🇲🇽 México",e:"🇲🇽"},{n:"🇨🇴 Colombia",e:"🇨🇴"},{n:"🇦🇷 Argentina",e:"🇦🇷"},{n:"🇨🇱 Chile",e:"🇨🇱"},{n:"🇵🇪 Perú",e:"🇵🇪"},{n:"🇻🇪 Venezuela",e:"🇻🇪"},{n:"🇪🇨 Ecuador",e:"🇪🇨"},{n:"🇨🇺 Cuba",e:"🇨🇺"},{n:"🇩🇴 R.Dominicana",e:"🇩🇴"},{n:"🇭🇳 Honduras",e:"🇭🇳"},{n:"🇸🇻 El Salvador",e:"🇸🇻"},{n:"🇧🇴 Bolivia",e:"🇧🇴"},{n:"🇺🇾 Uruguay",e:"🇺🇾"},{n:"🇵🇾 Paraguay",e:"🇵🇾"},{n:"🇨🇷 Costa Rica",e:"🇨🇷"},{n:"🇵🇦 Panamá",e:"🇵🇦"},{n:"🇪🇸 España",e:"🇪🇸"},{n:"🇺🇸 USA",e:"🇺🇸"}];
async function handlePais(i) {
  try { await i.reply({content:"🌍 **¿De dónde eres?**",components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("p_s").setPlaceholder("Selecciona...").addOptions(paises.map(p => ({label:p.n,value:p.n,emoji:p.e}))))],ephemeral:true}); } catch(e) { console.error("p:",e.message); }
}
client.on('interactionCreate', async i => {
  if (!i.isStringSelectMenu() || i.customId!=="p_s") return;
  const g=i.guild,m=i.member,sel=i.values[0]; let r=g.roles.cache.find(x=>x.name===sel); if(!r) r=await g.roles.create({name:sel});
  for(const p of paises){const old=g.roles.cache.find(x=>x.name===p.n);if(old&&m.roles.cache.has(old.id)) await m.roles.remove(old.id);}
  await m.roles.add(r.id); await i.update({content:`✅ **${sel}**`,components:[]});
});

const welcomeConfig = new Map();
function saveWel() { const d={}; for(const [k,v] of welcomeConfig) d[k]=v; fs.writeFile('./wel.json',JSON.stringify(d),()=>{}); }
function loadWel() { try{const d=JSON.parse(fs.readFileSync('./wel.json','utf8'));for(const [k,v] of Object.entries(d)) welcomeConfig.set(k,v);console.log(`📂 ${Object.keys(d).length} bienvenidas`);}catch{} }
client.on('guildMemberAdd',async m=>{if(m.user.bot)return;const id=welcomeConfig.get(m.guild.id);if(!id)return;const ch=m.guild.channels.cache.get(id);if(!ch)return;await ch.send(["🔥 Llegó "+m+"!","🫡 "+m+" bienvenido.",m+" se unió."][Math.floor(Math.random()*3)]);try{await m.send("🤝 Bienvenido a **"+m.guild.name+"**! Pásate por #🎭-roles.");}catch{}});

const encCfg = new Map();
function saveEnc(){const d={};for(const [k,v] of encCfg)d[k]=v;fs.writeFile('./enc.json',JSON.stringify(d),()=>{});}
function loadEnc(){try{const d=JSON.parse(fs.readFileSync('./enc.json','utf8'));for(const [k,v] of Object.entries(d)) encCfg.set(k,v);console.log(`📂 ${Object.keys(d).length} enciclopedias`);}catch{}}
async function updateEnc(gid){const c=encCfg.get(gid);if(!c)return;const g=client.guilds.cache.get(gid);if(!g)return;const f=g.channels.cache.get(c.f);if(!f)return;try{const gen=g.channels.cache.find(x=>x.name.includes("general"));if(!gen)return;const msgs=await gen.messages.fetch({limit:100});const act={};msgs.forEach(m=>{if(m.author.bot)return;if(!act[m.author.id])act[m.author.id]={n:m.author.username,topics:[],c:0};act[m.author.id].c++;const t=m.content.toLowerCase();if(/dibuj|arte/.test(t))act[m.author.id].topics.push("arte");if(/jueg|game|helldivers/.test(t))act[m.author.id].topics.push("gaming");if(/musica|canción/.test(t))act[m.author.id].topics.push("música");if(/pelicula|serie|berserk/.test(t))act[m.author.id].topics.push("pelis");});const threads=await f.threads.fetchActive();for(const[,u]of Object.entries(act)){if(u.c<3)continue;const t=threads.threads.find(x=>x.name.includes(u.n));if(!t)continue;const s=t.starterMessage||await t.fetchStarterMessage();if(!s||s.author.id!==client.user.id)continue;const top=[...new Set(u.topics)].join(", ");const date=new Date().toLocaleDateString("es-MX",{day:"numeric",month:"short"});const line=`\n📊 **${date}:** ${u.c} msgs · ${top||"variado"}`;if(!s.content.includes(line.trim()))await s.edit(s.content+line);}}catch(e){console.error(e.message);}}
function startEnc(gid){const c=encCfg.get(gid);if(!c)return;if(c.int)clearInterval(c.int);c.int=setInterval(()=>updateEnc(gid),3*24*60*60*1000);}

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  const id = oraculoConfig.get(msg.guild?.id);
  if (id && msg.channel.id === id) { await respondOraculo(msg); return; }
  const gc = galCfg.get(msg.guild?.id);
  if (gc) { const cat = msg.guild?.channels.cache.get(gc.id); if (cat && msg.channel.parentId === cat.id && msg.channel.id !== gc.dest && (msg.attachments.size > 0 || msg.content.length > 0)) { setTimeout(async () => { for (const e of ["🎨","✨","🔥","💀","🧠","🤝","❤️"]) { try { await msg.react(e); } catch {} } }, 500); } }
});

client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) {
    if (i.isStringSelectMenu() && i.customId==="p_s") {
      const g=i.guild,m=i.member,sel=i.values[0]; let r=g.roles.cache.find(x=>x.name===sel); if(!r) r=await g.roles.create({name:sel});
      for(const p of paises){const old=g.roles.cache.find(x=>x.name===p.n);if(old&&m.roles.cache.has(old.id)) await m.roles.remove(old.id);}
      await m.roles.add(r.id); await i.update({content:`✅ **${sel}**`,components:[]});
    }
    return;
  }
  switch (i.commandName) {
    case 'play': await handlePlay(i, i.options.getString('query')); break;
    case 'skip': { const q = getQ(i.guild); if (!q.songs.length) return i.reply('❌'); q.player.stop(); i.reply('⏭️'); break; }
    case 'stop': { const q = getQ(i.guild); q.songs = []; q.player.stop(); q.conn?.destroy(); q.proc?.kill(); queue.delete(i.guild.id); i.reply('⏹️'); break; }
    case 'pause': { getQ(i.guild).player.pause(); i.reply('⏸️'); break; }
    case 'resume': { getQ(i.guild).player.unpause(); i.reply('▶️'); break; }
    case 'queue': { const q = getQ(i.guild); if (!q.songs.length) return i.reply('Cola vacía.'); i.reply(`**Cola:**\n${q.songs.map((s,j)=>`${j===0?'▶️':'📃'} ${j+1}. ${s.t}`).join('\n')}`); break; }
    case 'np': { const q = getQ(i.guild); if (!q.songs.length) return i.reply('Nada.'); i.reply(`🎵 ${q.songs[0].t}`); break; }
    case 'volume': { const v = i.options.getInteger('nivel'); if (v < 1 || v > 100) return i.reply('1-100'); getQ(i.guild).vol = v/100; i.reply(`🔊 ${v}%`); break; }
    case 'help': i.reply('/play /skip /stop /pause /resume /queue /np /volume /deals /pais /artista /motw'); break;
    case 'deals': { await i.deferReply(); try { const d = await fetchDeals(); i.editReply({ embeds: d.map(x => new EmbedBuilder().setColor(0x00ff00).setTitle(x.t).setURL(x.l).setThumbnail(x.th||null).addFields({name:'💵',value:`~~${x.n}~~→**${x.s}**`,inline:true},{name:'🔥',value:`${x.p}%`,inline:true},{name:'⭐',value:`${x.r}%`,inline:true}).setFooter({text:'Cerberus'}).setTimestamp()) }); } catch(e) { i.editReply('❌ '+e.message); } break; }
    case 'setdeals': { const ch=i.options.getChannel('canal'); dealsConfig.set(i.guildId,{ch:ch.id}); saveDeals(); startDeals(i.guildId,ch.id); i.reply(`✅ Deals en ${ch}`); await postDeals(i.guildId,ch); break; }
    case 'stopdeals': { stopDeals(i.guildId); dealsConfig.delete(i.guildId); saveDeals(); i.reply('⏹️'); break; }
    case 'setoraculo': { const c=i.options.getChannel('canal'); if(c.type!==0)return i.reply('❌'); oraculoConfig.set(i.guildId,c.id); i.reply(`🤫 ${c}`); break; }
    case 'stoporaculo': { oraculoConfig.delete(i.guildId); i.reply('🤫'); break; }
    case 'setmuro': { const c=i.options.getChannel('canal'); if(c.type!==0)return i.reply('❌'); oraculoConfig.set(i.guildId,c.id); i.reply('🧱'); break; }
    case 'stopmuro': { oraculoConfig.delete(i.guildId); i.reply('🧱'); break; }
    case 'setenciclopedia': { const f=i.options.getChannel('canal'); if(f.type!==15)return i.reply('❌'); encCfg.set(i.guildId,{f:f.id}); saveEnc(); startEnc(i.guildId); i.reply(`📖 ${f}`); await updateEnc(i.guildId); break; }
    case 'stopenciclopedia': { const c=encCfg.get(i.guildId); if(c?.int)clearInterval(c.int); encCfg.delete(i.guildId); saveEnc(); i.reply('⏹️'); break; }
    case 'updateenciclopedia': { i.reply('📖'); await updateEnc(i.guildId); break; }
    case 'setwelcome': { const c=i.options.getChannel('canal'); if(c.type!==0)return i.reply('❌'); welcomeConfig.set(i.guildId,c.id); saveWel(); i.reply(`✅ ${c}`); break; }
    case 'stopwelcome': { welcomeConfig.delete(i.guildId); saveWel(); i.reply('⏹️'); break; }
    case 'artista': await handleArt(i); break;
    case 'setupgaleria': await getCatGal(i.guild); i.reply('🎨'); break;
    case 'pais': await handlePais(i); break;
    case 'motw': {
      i.reply('🏆 Dame un segundo...').then(async () => {
        const g=i.guild; const gen=g.channels.cache.find(c=>c.name.includes("general"));
        if(!gen){i.editReply('❌ No #general');return;}
        let all=[]; let b=await gen.messages.fetch({limit:100}); all=[...b.values()];
        if (b.size===100) { const m=await gen.messages.fetch({limit:100,before:b.last().id}); all=[...all,...m.values()]; }
        const c={}; all.forEach(m=>{if(!m.author.bot&&m.content.trim())c[m.author.username]=(c[m.author.username]||0)+1;});
        const s=Object.entries(c).sort((a,b)=>b[1]-a[1]);
        if(!s.length){i.editReply('❌ Sin datos');return;}
        let txt=`🏆 **Miembro de la Semana**\n🥇 ${s[0][0]}: ${s[0][1]} msgs`;
        if(s[1])txt+=`\n🥈 ${s[1][0]}: ${s[1][1]}`; if(s[2])txt+=`\n🥉 ${s[2][0]}: ${s[2][1]}`;
        const p=all[all.length-1]; txt+=`\n📅 ${p.createdAt.toLocaleDateString()} → ${all[0].createdAt.toLocaleDateString()}`;
        i.editReply(txt);
      }).catch(e => { i.editReply('❌ '+e.message).catch(()=>{}); });
      break;
    }
    default: i.reply('❌ Desconocido');
  }
});

client.on('ready', () => {
  console.log(`✅ Cerberus online como ${client.user.tag}`);
  try { console.log(`✅ yt-dlp: ${execSync('yt-dlp --version').toString().trim()}`); } catch {}
  loadDeals(); loadWel(); loadEnc(); loadMem();
  for (const [k] of dealsConfig) { const c = dealsConfig.get(k); if (c?.ch) startDeals(k, c.ch); }
  for (const [k] of encCfg) startEnc(k);
  const runMOTW = async () => {
    for (const g of client.guilds.cache.values()) {
      const ch = g.channels.cache.find(x => x.name.includes("actualizaciones"));
      if (!ch) continue;
      const gen = g.channels.cache.find(x => x.name.includes("general"));
      if (!gen) continue;
      try {
        let all=[]; let b=await gen.messages.fetch({limit:100}); all=[...b.values()];
        if (b.size===100) { const m=await gen.messages.fetch({limit:100,before:b.last().id}); all=[...all,...m.values()]; }
        const c={}; all.forEach(m=>{if(!m.author.bot&&m.content.trim())c[m.author.username]=(c[m.author.username]||0)+1;});
        const s=Object.entries(c).sort((a,b)=>b[1]-a[1]);
        if (!s.length) continue;
        let txt="🏆 **Miembro de la Semana**\n🥇 "+s[0][0]+": "+s[0][1]+" msgs";
        if(s[1]) txt+="\n🥈 "+s[1][0]+": "+s[1][1]; if(s[2]) txt+="\n🥉 "+s[2][0]+": "+s[2][1];
        await ch.send(txt);
      } catch(e) { console.error("MOTW:", e.message); }
    }
  };
  const a=new Date(); const d=new Date(a);
  d.setDate(d.getDate()+(7-d.getDay())%7); d.setHours(12,0,0,0);
  if (d<=a) d.setDate(d.getDate()+7);
  setTimeout(()=>{runMOTW();setInterval(runMOTW,7*24*60*60*1000);}, d-a);
  console.log("🏆 MOTW: "+d.toLocaleDateString());
});

client.login(config.token);
require('http').createServer((_, r) => { r.writeHead(200); r.end('OK'); }).listen(process.env.PORT || 8080);
