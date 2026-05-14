const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { execSync } = require('child_process');
const config = require('./config.json');
const { loadMem } = require('./memory.js');
const { handlePlay, handleCmd } = require('./music.js');
const { callAI } = require('./ai.js');
const { recMem, memCtx, addConv, getConv } = require('./memory.js');
const {
  fetchDeals, sendDeals, er,
  oraculoConfig, respondOraculo,
  handlePais, handlePaisSelect,
  getCatGal, handleArt,
  welcomeConfig, saveWel, loadWel,
  encCfg, saveEnc, loadEnc, updateEnc, startEnc,
  ritualCfg, saveRitual, loadRitual, startRituals, stopRituals,
} = require('./features.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildVoiceStates] });
const channelMem = {};

// === MENSAJES ===
client.on('messageCreate', async msg => {
  if (msg.author.bot) return;

  // DEBUG: loguear mensajes en canales con "general"
  if (msg.channel.name.includes("general")) {
    const hasMention = new RegExp("<@!?" + (client.user?.id || "").toString() + ">", "i").test(msg.content);
    console.log(`[MSG] #${msg.channel.name} @${msg.author.username}: "${msg.content.substring(0,100)}" mention=${hasMention} len=${msg.content.trim().length} botReady=${!!client.user}`);
  }

  // Oráculo
  const oid = oraculoConfig.get(msg.guild?.id);
  if (oid && msg.channel.id === oid) { await respondOraculo(msg); return; }

  // Galería - auto-reacciones
  const gc = require('./features.js').galCfg.get(msg.guild?.id);
  if (gc) { const cat = msg.guild?.channels.cache.get(gc.id); if (cat && msg.channel.parentId === cat.id && msg.channel.id !== gc.dest && (msg.attachments.size > 0 || msg.content.length > 0)) { setTimeout(async () => { for (const e of ["🎨","✨","🔥","💀","🧠","🤝","❤️"]) { try { await msg.react(e); } catch {} } }, 500); } }

  // Participación orgánica en #general (sin @)
  if (client.user && msg.channel.name.includes("general")) {
    const txt = msg.content.trim();
    if (!txt || txt.length < 5) { console.log(`[SKIP] msg too short: ${txt.length}`); return; }

    // @mención explícita - responder siempre
    const isMention = new RegExp("<@!?" + client.user.id + ">", "i").test(msg.content);
    if (isMention) console.log(`[MENTION] responding to ${msg.author.username}`);

    // Pregunta sin mención - 30% de probabilidad
    const isQuestion = /[¿?]|qué|como|cómo|quien|quién|donde|dónde|cuando|cuándo|por qué|porque|pq|xq|saben|alguien|opinan/i.test(txt);

    // Conversación activa (2+ mensajes seguidos de distintos usuarios) - 10%
    const lastMsgs = msg.channel.messages?.cache?.filter(m => !m.author.bot).sort((a,b) => b.createdAt - a.createdAt);
    const activeChat = lastMsgs?.size >= 3 && new Set(lastMsgs?.map(m => m.author.id).slice(0,5)).size >= 2;

    const shouldRespond = isMention || (isQuestion && Math.random() < 0.3) || (activeChat && Math.random() < 0.08);

    if (!shouldRespond) return;

    const texto = isMention ? msg.content.replace(new RegExp("<@!?" + client.user.id + ">", "i"), "").trim() : txt;
    if (!texto) return;

    // Channel buffer - ultimos mensajes del canal
    if (!channelMem[msg.channel.id]) channelMem[msg.channel.id] = [];
    channelMem[msg.channel.id].push({ user: msg.author.username, text: texto });
    if (channelMem[msg.channel.id].length > 15) channelMem[msg.channel.id].splice(0, channelMem[msg.channel.id].length - 15);

    recMem(msg.author.id, msg.author.username, texto);
    const ctx = memCtx(msg.author.id, msg.author.username);
    const conv = getConv(msg.author.id);

    // Construir contexto del canal en formato conversacion
    const channelCtx = channelMem[msg.channel.id]?.map(m => m.user + ": " + m.text).join("\n") || "";

    const prompt = `Eres Cerberus, un wey mas del server de Discord "Sociedad de los Mediocres". No eres un bot, eres un compa que lleva años en el server.

PERSONALIDAD:
- Eres sarcástico e ingenioso como un compa latino, no como un robot tratando de ser edgy
- Dices las verdades incómodas pero sin ser un HDP todo el tiempo
- A veces haces chistes, a veces respondes normal, a veces tiras factos
- Cuando algo es absurdo lo señalas, cuando algo es genuino lo respetas
- Hablas como se habla en Discord: frases cortas, sin formalidad, cero markdown
- Te adaptas al vibe: si es chiste respondes con humor, si es debate metes cizaña, si es duda respondes con superioridad condescendiente

ESTILO:
- 1 a 3 oraciones máximo, pero varía la longitud
- Sin markdown, sin formato, sin hashtags, sin emojis de más
- Nada de "Hola!" ni "Que bueno que..." ni cortesias falsas
- Si no entiendes algo, lo dices con sarcasmo, no finges entenderlo
- Usa las herramientas del server si preguntan datos reales del server

EJEMPLOS:
- "alguien ha visto la nueva de terror?" -> "esa madre es puro jumpscare barato, no pierdan su tiempo"
- "que opinan de los tacos de canasta?" -> "obra maestra infravalorada, fight me"
- "@Cerberus cuantos hay online?" -> usas get_stats y respondes con el dato
- "no se si comprar el Helldivers" -> "si tienes con quien jugarlo si, solo es deprimente"

${ctx}

Chat reciente del canal:
${channelCtx}`;
    const ai = await callAI([...conv.slice(-4), {role:"user",content:texto}], prompt, client, msg.guild.id);
    if (ai) {
      addConv(msg.author.id, "user", texto); addConv(msg.author.id, "assistant", ai);
      console.log('[AI] reply to ' + msg.author.username + ': "' + ai.substring(0,80) + '"');
      await msg.reply(ai.trim().substring(0,300));
    } else {
      console.log('[AI] null response for ' + msg.author.username);
    }
    return;
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
    case 'help': i.reply('/play /skip /stop /pause /resume /queue /np /volume /deals /setdeals /stopdeals /pais /artista /setupgaleria /setritual /stopritual /setwelcome /stopwelcome /setoraculo /stoporaculo /setmuro /stopmuro /setenciclopedia /stopenciclopedia /updateenciclopedia /motw /setmotw /stopmotw'); break;
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
    case 'setritual': { const ch=i.options.getChannel('canal'); if(ch.type!==0)return i.reply('❌'); ritualCfg.set(i.guildId,{ch:ch.id}); saveRitual(); startRituals(i.guildId,client); i.reply(`📅 Rituales en ${ch}`); break; }
    case 'stopritual': { stopRituals(i.guildId); ritualCfg.delete(i.guildId); saveRitual(); i.reply('⏹️'); break; }
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
  try { await m.send("🤝 Bienvenido a la **Sociedad de los Mediocres**! Pásate por #🎭-roles a poner tu país, y si quieres dibujar usa /artista. Esto es relax, no hay presión."); } catch {}
});

// === READY ===
client.on('ready', () => {
  console.log(`✅ Cerberus online como ${client.user.tag}`);
  try { console.log(`✅ yt-dlp: ${execSync('yt-dlp --version').toString().trim()}`); } catch {}
  loadMem(); loadWel(); loadEnc(); loadRitual();
  for (const [k] of encCfg) startEnc(k, client);
  for (const [k] of ritualCfg) startRituals(k, client);
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
