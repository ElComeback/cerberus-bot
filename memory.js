const fs = require('fs');

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

function addConv(uid, role, content) {
  const b = convBuf.get(uid) || []; b.push({ role, content }); if (b.length > 6) b.splice(0, b.length - 6); convBuf.set(uid, b);
}

function getConv(uid) { return convBuf.get(uid) || []; }

module.exports = { loadMem, recMem, memCtx, addConv, getConv, saveMem };
