const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');
const config = require('./config.json');
const { handlePlay, handleCmd } = require('./music.js');
const { loadMem } = require('./memory.js');
const admin = require('./admin.js');
const {
  fetchDeals, sendDeals, er,
  oraculoConfig, respondOraculo,
  handlePais, handlePaisSelect,
  getCatGal, handleArt,
  welcomeConfig, saveWel, loadWel,
  encCfg, saveEnc, loadEnc, updateEnc, startEnc,
} = require('./features.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });

// === MENSAJES (solo owner) ===
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  // Oráculo
  const oid = oraculoConfig.get(msg.guild?.id);
  if (oid && msg.channel.id === oid) { await respondOraculo(msg); return; }

  // Galería - auto-reacciones
  const gc = require('./features.js').galCfg.get(msg.guild?.id);
  if (gc) { const cat = msg.guild?.channels.cache.get(gc.id); if (cat && msg.channel.parentId === cat.id && msg.channel.id !== gc.dest && (msg.attachments.size > 0 || msg.content.length > 0)) { setTimeout(async () => { for (const e of ["🎨","✨","🔥","💀","🧠","🤝","❤️"]) { try { await msg.react(e); } catch {} } }, 500); } }

  // Solo el owner puede dar órdenes
  if (msg.author.id !== config.ownerId) return;

  const txt = msg.content.trim();
  if (!txt || txt.length < 2) return;

  const g = msg.guild;
  if (!g) return;

  // ===== COMANDOS DE ADMIN =====
  try {
    // Crear canal: "crea un canal texto llamado memes en general"
    let m = txt.match(/crea?(?: un)? canal(?:\s+texto|\s+voz)?\s+(?:llamado|llamada|para|con nombre|)\s*[#]?(.+?)(?:\s+en\s+(.+))?$/i);
    if (m) {
      const name = m[1].trim().toLowerCase().replace(/\s+/g, '-');
      const type = txt.includes("voz") ? "voice" : "text";
      const cat = m[2]?.trim();
      const r = await admin.createChannel(g, name, type, cat);
      return msg.reply(r.success ? `✅ Canal ${r.name} creado` : `❌ ${r.error}`);
    }

    // Eliminar canal: "elimina canal #nombre" / "borra el canal nombre"
    m = txt.match(/(?:elimina|borra|quita)\s+(?:el\s+)?(?:canal\s+)?[#]?(.+)/i);
    if (m) {
      const name = m[1].trim();
      const r = await admin.deleteChannel(g, name);
      return msg.reply(r.success ? `✅ Canal eliminado` : `❌ ${r.error}`);
    }

    // Asignar rol: "asigna rol Admin a user" / "pon rol Admin a user"
    m = txt.match(/(?:asigna|pon|da)\s+(?:rol\s+)?(.+?)\s+(?:a\s+)(.+)/i);
    if (m) {
      const roleName = m[1].trim();
      const username = m[2].trim();
      const r = await admin.assignRole(g, username, roleName);
      return msg.reply(r.success ? `✅ Rol **${r.role}** asignado a ${r.user}` : `❌ ${r.error}`);
    }

    // Quitar rol: "quita rol Admin a user" / "saca rol Admin de user"
    m = txt.match(/(?:quita|saca|remueve)\s+(?:rol\s+)?(.+?)\s+(?:a\s+|de\s+)(.+)/i);
    if (m) {
      const roleName = m[1].trim();
      const username = m[2].trim();
      const r = await admin.removeRole(g, username, roleName);
      return msg.reply(r.success ? `✅ Rol **${r.role}** quitado de ${r.user}` : `❌ ${r.error}`);
    }

    // Crear rol: "crea rol Admin #FF0000"
    m = txt.match(/crea?(?:\s+un)?\s+rol\s+(.+?)(?:\s+(#[A-Fa-f0-9]{6}))?\s*$/i);
    if (m) {
      const name = m[1].trim();
      const color = m[2] || null;
      const r = await admin.createRole(g, name, color);
      return msg.reply(r.success ? `✅ Rol **${r.name}** creado` : `❌ ${r.error}`);
    }

    // Eliminar rol: "elimina rol Admin"
    m = txt.match(/(?:elimina|borra|quita)\s+(?:el\s+)?(?:rol\s+)?(.+)/i);
    if (m) {
      const name = m[1].trim();
      const r = await admin.deleteRole(g, name);
      return msg.reply(r.success ? `✅ Rol eliminado` : `❌ ${r.error}`);
    }

    // Decir en canal: "di hola en #general" / "manda mensaje a #general diciendo hola"
    m = txt.match(/(?:di|dile|diles?|manda|envía)\s+(.+?)\s+(?:en\s+|a\s+|en\s+el\s+canal\s+)[#]?(.+)/i);
    if (m) {
      const message = m[1].trim();
      const chName = m[2].trim();
      const ch = g.channels.cache.find(c => c.name.includes(chName));
      if (!ch) return msg.reply("❌ Canal no encontrado");
      await ch.send(message);
      return msg.reply("✅ Mensaje enviado");
    }

    // Quién está online
    if (/online|conectados|en línea/i.test(txt) && /qui[ée]n|cu[aá]ntos|lista/i.test(txt)) {
      const r = await admin.getOnline(g);
      if (r.count === 0) return msg.reply("🦗 Nadie online.");
      return msg.reply(`🟢 **${r.count}** online: ${r.users.join(", ")}`);
    }

    // Info de usuario
    m = txt.match(/(?:info|datos|qu[eé]n es)\s+(.+)/i);
    if (m) {
      const username = m[1].trim();
      const r = await admin.getUser(g, username);
      if (r.error) return msg.reply(`❌ ${r.error}`);
      return msg.reply(`👤 **${r.username}** (${r.displayName})\n📅 ${r.joined?.slice(0,10) || "?"}\n🎭 ${r.roles.join(", ") || "sin roles"}`);
    }

    // Estadísticas
    if (/stats|estad[ií]sticas|miembros/i.test(txt) && !/info|datos|online/i.test(txt)) {
      const r = await admin.getStats(g);
      return msg.reply(`📊 **${g.name}**\n👥 Total: ${r.total}\n🧑 Humanos: ${r.humans}\n🤖 Bots: ${r.bots}\n🟢 Online: ${r.online}`);
    }
  } catch (e) {
    msg.reply(`❌ Error: ${e.message}`);
  }
});

// === INTERACCIONES ===
client.on('interactionCreate', async i => {
  if (!i.isChatInputCommand()) {
    if (i.isStringSelectMenu() && i.customId === "p_s") await handlePaisSelect(i);
    return;
  }
  switch (i.commandName) {
    case 'play': await handlePlay(i, i.options.getString('query')); break;
    case 'skip': case 'stop': case 'pause': case 'resume': case 'queue': case 'np': case 'volume': handleCmd(i, i.commandName, [i.options.getInteger('nivel')]); break;
    case 'help': i.reply('/play /skip /stop /pause /resume /queue /np /volume /deals /setdeals /stopdeals /pais /artista /setupgaleria /setwelcome /stopwelcome /setoraculo /stoporaculo /setmuro /stopmuro /setenciclopedia /stopenciclopedia /updateenciclopedia /motw /setmotw /stopmotw'); break;
    case 'deals': await i.deferReply(); try { const d = await fetchDeals(); i.editReply({ embeds: d.map(x => new EmbedBuilder().setColor(0x00ff00).setTitle(x.t).setURL(x.l).setThumbnail(x.th||null).addFields({name:'💵',value:`~~${x.n}~~→**${x.s}**`,inline:true},{name:'🔥',value:`${x.p}%`,inline:true},{name:'⭐',value:`${x.r}%`,inline:true}).setFooter({text:'Cerberus'}).setTimestamp()) }); } catch(e) { i.editReply('❌ '+e.message); } break;
    case 'setdeals': { const ch=i.options.getChannel('canal'); require('./features.js').dealsConfig.set(i.guildId,{ch:ch.id}); require('./features.js').saveDeals(); require('./features.js').startDeals(i.guildId,ch.id); i.reply(`✅ Deals en ${ch}`); await require('./features.js').postDeals(i.guildId,ch,client); break; }
    case 'stopdeals': { require('./features.js').stopDeals(i.guildId); require('./features.js').dealsConfig.delete(i.guildId); require('./features.js').saveDeals(); i.reply('⏹️'); break; }
    case 'setoraculo': { const c=i.options.getChannel('canal'); if(c.type!==0)return i.reply('❌'); oraculoConfig.set(i.guildId,c.id); i.reply(`🤫 ${c}`); break; }
    case 'stoporaculo': { oraculoConfig.delete(i.guildId); i.reply('🤫'); break; }
    case 'setmuro': { const c=i.options.getChannel('canal'); if(c.type!==0)return i.reply('❌'); oraculoConfig.set(i.guildId,c.id); i.reply('🧱'); break; }
    case 'stopmuro': { oraculoConfig.delete(i.guildId); i.reply('🧱'); break; }
    case 'setenciclopedia': { const f=i.options.getChannel('canal'); if(f.type!==15)return i.reply('❌'); encCfg.set(i.guildId,{f:f.id}); saveEnc(); startEnc(i.guildId,client); i.reply(`📖 ${f}`); await updateEnc(i.guildId,client); break; }
    case 'stopenciclopedia': { const c=encCfg.get(i.guildId); if(c?.int)clearInterval(c.int); encCfg.delete(i.guildId); saveEnc(); i.reply('⏹️'); break; }
    case 'updateenciclopedia': { i.reply('📖'); await updateEnc(i.guildId,client); break; }
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
        i.editReply(txt);
      }).catch(e => { i.editReply('❌ '+e.message).catch(()=>{}); });
      break;
    }
    default: i.reply('❌ Desconocido');
  }
});

// === BIENVENIDAS ===
client.on('guildMemberAdd', async m => {
  if (m.user.bot) return;
  const id = welcomeConfig.get(m.guild.id); if (!id) return;
  const ch = m.guild.channels.cache.get(id); if (!ch) return;
  await ch.send(["🔥 Llegó "+m+"!","🫡 "+m+" bienvenido.",m+" se unió."][Math.floor(Math.random()*3)]);
  try { await m.send("🤝 Bienvenido a **"+m.guild.name+"**! Pásate por #🎭-roles."); } catch {}
});

// === READY ===
client.on('ready', () => {
  console.log(`✅ Cerberus online como ${client.user.tag}`);
  try { console.log(`✅ yt-dlp: ${execSync('yt-dlp --version').toString().trim()}`); } catch {}
  loadMem(); loadWel(); loadEnc();
  for (const [k] of encCfg) startEnc(k, client);
  // MOTW automático los domingos
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
        const s=Object.entries(c).sort((a,b)=>b[1]-a[1]); if (!s.length) continue;
        let txt=`🏆 **Miembro de la Semana**\n🥇 ${s[0][0]}: ${s[0][1]} msgs`;
        if(s[1])txt+=`\n🥈 ${s[1][0]}: ${s[1][1]}`; if(s[2])txt+=`\n🥉 ${s[2][0]}: ${s[2][1]}`;
        await ch.send(txt);
      } catch(e) { console.error("MOTW:", e.message); }
    }
  };
  const a=new Date(); const d=new Date(a);
  d.setDate(d.getDate()+(7-d.getDay())%7); d.setHours(12,0,0,0);
  if (d<=a) d.setDate(d.getDate()+7);
  setTimeout(()=>{runMOTW();setInterval(runMOTW,7*24*60*60*1000);}, d-a);
  console.log(`🏆 MOTW: ${d.toLocaleDateString()}`);
});

client.login(config.token);
require('http').createServer((_, r) => { r.writeHead(200); r.end('OK'); }).listen(process.env.PORT || 8080);
