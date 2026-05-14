const { EmbedBuilder, ChannelType, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { callAI } = require('./ai.js');
const { recMem, memCtx, addConv, getConv } = require('./memory.js');
const https = require('https');
const fs = require('fs');

// === DEALS ===
let er = 20.5;
function updER() { https.get('https://open.er-api.com/v6/latest/USD', { headers: { 'User-Agent': 'CB/1' } }, r => { let d = ""; r.on("data", c => d += c); r.on("end", () => { try { const x = JSON.parse(d); if (x.rates?.MXN) er = x.rates.MXN; } catch {} }); }).on("error", () => {}); }
updER(); setInterval(updER, 6*60*60*1000);

async function fetchDeals() {
  return new Promise((resolve, reject) => {
    const req = https.get('https://www.cheapshark.com/api/1.0/deals?storeID=1&onSale=1', { headers: { 'User-Agent': 'CB/1' } }, res => {
      let d = ""; res.on("data", c => d += c); res.on("end", () => { try { resolve(JSON.parse(d).slice(0,5).map(x => { const s=(parseFloat(x.salePrice)*er).toFixed(2), n=(parseFloat(x.normalPrice)*er).toFixed(2); return { t:x.t, s:`$${s} MXN`, n:`$${n} MXN`, p:Math.round(parseFloat(x.savings)), r:x.steamRatingPercent||'N/A', l:`https://www.cheapshark.com/redirect?dealID=${x.dealID}`, th:x.thumb }; })); } catch(e) { reject(e); } });
    }); req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); }); req.on('error', reject);
  });
}
function sendDeals(ch, d) { ch.send({ embeds: d.map(x => new EmbedBuilder().setColor(0x00ff00).setTitle(x.t).setURL(x.l).setThumbnail(x.th||null).addFields({name:'💵',value:`~~${x.n}~~→**${x.s}**`,inline:true},{name:'🔥',value:`${x.p}%`,inline:true},{name:'⭐',value:`${x.r}%`,inline:true}).setFooter({text:'Cerberus'}).setTimestamp()) }); }

// === ORACULO ===
const oraculoConfig = new Map();
const respuestas = ["No sé, wey.","Interesante...","Mmm no.","JAJAJA sí.","Qué hueva.","Ni le muevas.","Buena obs.","Ay wey."];
const cds = new Map();

async function respondOraculo(msg) {
  const txt = msg.content.trim(); if (txt.length > 500 || txt.length < 3 || msg.author.id === msg.client.user?.id) return;
  const l = cds.get(msg.author.id); if (l && Date.now()-l<3000) { try { await msg.react('⏳'); } catch {} return; }
  cds.set(msg.author.id, Date.now()); await new Promise(r => setTimeout(r, 1500+Math.random()*1500));
  if (require('./config.json').aiKey) {
    recMem(msg.author.id, msg.author.username, txt); const ctx = memCtx(msg.author.id, msg.author.username);
    const conv = getConv(msg.author.id);
    const ai = await callAI([...conv.slice(-4), {role:"user",content:txt}], "Eres Cerberus en modo oráculo. Das respuestas irónicas, cínicas, como si leyeras la verdad incómoda que nadie quiere oír. Máximo 2 oraciones. Sin markdown. No des info útil a propósito. Si preguntan algo real, respondes con datos falsos pero graciosos."+ctx);
    if (ai) { addConv(msg.author.id, "user", txt); addConv(msg.author.id, "assistant", ai); try { await msg.react(['🔥','💀','🚬','🤝'][Math.floor(Math.random()*4)]); } catch {} await msg.channel.send({content:ai.trim().substring(0,200),tts:true}); return; }
  }
  try { await msg.react(['🔥','💀','🚬','🤝'][Math.floor(Math.random()*4)]); } catch {} await msg.channel.send({content:respuestas[Math.floor(Math.random()*respuestas.length)],tts:true});
}

// === PAISES ===
const paises = [{n:"🇲🇽 México",e:"🇲🇽"},{n:"🇨🇴 Colombia",e:"🇨🇴"},{n:"🇦🇷 Argentina",e:"🇦🇷"},{n:"🇨🇱 Chile",e:"🇨🇱"},{n:"🇵🇪 Perú",e:"🇵🇪"},{n:"🇻🇪 Venezuela",e:"🇻🇪"},{n:"🇪🇨 Ecuador",e:"🇪🇨"},{n:"🇨🇺 Cuba",e:"🇨🇺"},{n:"🇩🇴 R.Dominicana",e:"🇩🇴"},{n:"🇭🇳 Honduras",e:"🇭🇳"},{n:"🇸🇻 El Salvador",e:"🇸🇻"},{n:"🇧🇴 Bolivia",e:"🇧🇴"},{n:"🇺🇾 Uruguay",e:"🇺🇾"},{n:"🇵🇾 Paraguay",e:"🇵🇾"},{n:"🇨🇷 Costa Rica",e:"🇨🇷"},{n:"🇵🇦 Panamá",e:"🇵🇦"},{n:"🇪🇸 España",e:"🇪🇸"},{n:"🇺🇸 USA",e:"🇺🇸"}];

async function handlePais(i) {
  try { await i.reply({content:"🌍 **¿De dónde eres?**",components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId("p_s").setPlaceholder("Selecciona...").addOptions(paises.map(p => ({label:p.n,value:p.n,emoji:p.e}))))],ephemeral:true}); } catch(e) { console.error("p:",e.message); }
}

async function handlePaisSelect(i) {
  const g=i.guild,m=i.member,sel=i.values[0]; let r=g.roles.cache.find(x=>x.name===sel); if(!r) r=await g.roles.create({name:sel});
  for(const p of paises){const old=g.roles.cache.find(x=>x.name===p.n);if(old&&m.roles.cache.has(old.id)) await m.roles.remove(old.id);}
  await m.roles.add(r.id); await i.update({content:`✅ **${sel}**`,components:[]});
}

// === GALERIA ===
const galCfg = new Map();
async function getCatGal(g) {
  const c = galCfg.get(g.id); if (c && g.channels.cache.get(c.id)) return g.channels.cache.get(c.id);
  let cat = g.channels.cache.find(x => x.name.includes("GALER")); if (!cat) cat = await g.channels.create({name:"🎨 GALERIA DE ARTE",type:ChannelType.GuildCategory});
  let d = g.channels.cache.find(x => x.name.includes("destacados")); if (!d) d = await g.channels.create({name:"🏆 destacados",type:ChannelType.GuildText,parent:cat.id});
  galCfg.set(g.id, {id:cat.id,dest:d.id}); return cat;
}

async function handleArt(i) {
  const g=i.guild,m=i.member; let r=g.roles.cache.find(x=>x.name==="Artista"); if(!r) r=await g.roles.create({name:"Artista"});
  if(m.roles.cache.has(r.id)) return i.reply("Ya eres Artista."); await m.roles.add(r.id);
  const cat=await getCatGal(g); const cn="🎨-"+m.user.username.replace(/[^a-z0-9]/gi,"").toLowerCase().substring(0,20);
  let ch=g.channels.cache.find(x=>x.name===cn);
  if(!ch) ch=await g.channels.create({name:cn,type:ChannelType.GuildText,parent:cat.id,permissionOverwrites:[{id:g.roles.everyone.id,deny:["SendMessages"],allow:["ViewChannel","ReadMessageHistory","AddReactions"]},{id:m.id,allow:["SendMessages","ViewChannel","ReadMessageHistory","AttachFiles","EmbedLinks"]}]});
  i.reply("🎨 Eres **Artista**! Tu canal: "+ch);
}

// === WELCOME ===
const welcomeConfig = new Map();
function saveWel() { const d={}; for(const [k,v] of welcomeConfig) d[k]=v; fs.writeFile('./data/wel.json',JSON.stringify(d),()=>{}); }
function loadWel() { try{const d=JSON.parse(fs.readFileSync('./data/wel.json','utf8'));for(const [k,v] of Object.entries(d)) welcomeConfig.set(k,v);console.log(`📂 ${Object.keys(d).length} bienvenidas`);}catch{} }

// === ENCICLOPEDIA ===
const encCfg = new Map();
function saveEnc(){const d={};for(const [k,v] of encCfg)d[k]=v;fs.writeFile('./data/enc.json',JSON.stringify(d),()=>{});}
function loadEnc(){try{const d=JSON.parse(fs.readFileSync('./data/enc.json','utf8'));for(const [k,v] of Object.entries(d)) encCfg.set(k,v);console.log(`📂 ${Object.keys(d).length} enciclopedias`);}catch{}}

async function updateEnc(gid, client){const c=encCfg.get(gid);if(!c)return;const g=client.guilds.cache.get(gid);if(!g)return;const f=g.channels.cache.get(c.f);if(!f)return;try{const gen=g.channels.cache.find(x=>x.name.includes("general"));if(!gen)return;const msgs=await gen.messages.fetch({limit:100});const act={};msgs.forEach(m=>{if(m.author.bot)return;if(!act[m.author.id])act[m.author.id]={n:m.author.username,topics:[],c:0};act[m.author.id].c++;const t=m.content.toLowerCase();if(/dibuj|arte/.test(t))act[m.author.id].topics.push("arte");if(/jueg|game|helldivers/.test(t))act[m.author.id].topics.push("gaming");if(/musica|canción/.test(t))act[m.author.id].topics.push("música");if(/pelicula|serie|berserk/.test(t))act[m.author.id].topics.push("pelis");});const threads=await f.threads.fetchActive();for(const[,u]of Object.entries(act)){if(u.c<3)continue;const t=threads.threads.find(x=>x.name.includes(u.n));if(!t)continue;const s=t.starterMessage||await t.fetchStarterMessage();if(!s||s.author.id!==client.user.id)continue;const top=[...new Set(u.topics)].join(", ");const date=new Date().toLocaleDateString("es-MX",{day:"numeric",month:"short"});const line=`\n📊 **${date}:** ${u.c} msgs · ${top||"variado"}`;if(!s.content.includes(line.trim()))await s.edit(s.content+line);}}catch(e){console.error(e.message);}}
function startEnc(gid,client){const c=encCfg.get(gid);if(!c)return;if(c.int)clearInterval(c.int);c.int=setInterval(()=>updateEnc(gid,client),3*24*60*60*1000);}

const dealsConfig = new Map();
function saveDeals() { const d={}; for(const [k,v] of dealsConfig) d[k]={ch:v.ch}; fs.writeFile("./data/deals.json",JSON.stringify(d),()=>{}); }
function loadDeals() { try{const d=JSON.parse(fs.readFileSync("./data/deals.json","utf8"));for(const [k,v] of Object.entries(d)) dealsConfig.set(k,{ch:v.ch,int:null});console.log("📂 "+Object.keys(d).length+" deals");}catch{} }
function startDeals(gid,cid,cl) { stopDeals(gid); if(!dealsConfig.get(gid)) return; dealsConfig.get(gid).int=setInterval(async ()=>{const g=cl.guilds.cache.get(gid);const c=g?.channels?.cache?.get(cid);if(c){const d=await fetchDeals();sendDeals(c,d);}},8*60*60*1000); }
function stopDeals(gid) { const c=dealsConfig.get(gid); if(c?.int){clearInterval(c.int);c.int=null;} }
async function postDeals(gid,c,cl) { try{sendDeals(c,await fetchDeals());}catch{} }
// === RITUALES SEMANALES ===
const ritualCfg = new Map();
function saveRitual() { const d={}; for(const [k,v] of ritualCfg) d[k]={ch:v.ch,last:v.last||{}}; fs.writeFile('./data/ritual.json',JSON.stringify(d),()=>{}); }
function loadRitual() { try{const d=JSON.parse(fs.readFileSync('./data/ritual.json','utf8'));for(const [k,v] of Object.entries(d)) ritualCfg.set(k,{ch:v.ch,int:null,last:v.last||{}});console.log("📂 "+Object.keys(d).length+" rituales");}catch{} }

const ritualDays = {
  1: { msg: "¿Qué hicieron este finde?", emoji: "☕" },    // Monday
  3: { msg: null, emoji: null },                           // Wednesday -> deals
  5: { msg: "¿Qué van a jugar o hacer este fin?", emoji: "🎮" }, // Friday
};

async function checkRitual(gid, client) {
  const cfg = ritualCfg.get(gid);
  if (!cfg) return;
  const now = new Date();
  const today = now.getDay(); // 0=Sun, 1=Mon...
  const todayStr = now.toISOString().slice(0, 10);

  // Monday ritual
  if (today === 1 && ritualDays[1].msg && cfg.last?.mon !== todayStr) {
    const ch = client.guilds.cache.get(gid)?.channels?.cache?.get(cfg.ch);
    if (ch) {
      const t = await ch.threads.create({ name: "☕ ¿Qué hicieron este finde?", message: { content: "¿Qué hicieron este fin de semana? Cuenten, vean, jugaron, durmieron... todo vale." }, autoArchiveDuration: 1440 });
      cfg.last = cfg.last || {}; cfg.last.mon = todayStr; saveRitual();
    }
  }

  // Wednesday -> trigger deals
  if (today === 3 && cfg.last?.wed !== todayStr) {
    const dc = dealsConfig.get(gid);
    if (dc) {
      const g = client.guilds.cache.get(gid);
      const c = g?.channels?.cache?.get(dc.ch);
      if (c) { sendDeals(c, await fetchDeals()); cfg.last = cfg.last || {}; cfg.last.wed = todayStr; saveRitual(); }
    }
  }

  // Friday ritual
  if (today === 5 && ritualDays[5].msg && cfg.last?.fri !== todayStr) {
    const ch = client.guilds.cache.get(gid)?.channels?.cache?.get(cfg.ch);
    if (ch) {
      const t = await ch.threads.create({ name: "🎮 ¿Qué van a jugar este fin?", message: { content: "¿Qué van a jugar, ver o hacer este fin de semana? Pasen el dato." }, autoArchiveDuration: 1440 });
      cfg.last = cfg.last || {}; cfg.last.fri = todayStr; saveRitual();
    }
  }
}

function startRituals(gid, client) {
  const c = ritualCfg.get(gid);
  if (!c) return;
  if (c.int) clearInterval(c.int);
  checkRitual(gid, client);
  c.int = setInterval(() => checkRitual(gid, client), 60 * 60 * 1000);
}

function stopRituals(gid) {
  const c = ritualCfg.get(gid);
  if (c?.int) { clearInterval(c.int); c.int = null; }
}

module.exports = {
  fetchDeals, sendDeals, er, dealsConfig, saveDeals, loadDeals, startDeals, stopDeals, postDeals,
  oraculoConfig, respondOraculo, respuestas, cds,
  paises, handlePais, handlePaisSelect,
  galCfg, getCatGal, handleArt,
  welcomeConfig, saveWel, loadWel,
  encCfg, saveEnc, loadEnc, updateEnc, startEnc,
  ritualCfg, saveRitual, loadRitual, startRituals, stopRituals,
};
