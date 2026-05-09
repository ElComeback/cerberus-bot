const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require('@discordjs/voice');
const { spawn } = require('child_process');
const play = require('play-dl');

const queue = new Map();

function getQ(g) {
  if (!queue.has(g.id)) queue.set(g.id, { conn: null, player: createAudioPlayer(), songs: [], vol: 0.5, proc: null });
  return queue.get(g.id);
}

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

async function handlePlay(i, qry) {
  const vc = i.member?.voice?.channel; const rep = t => { try { i.reply(t); } catch { i.channel?.send(t); } };
  if (!qry) return rep('❌ Link?'); if (!vc) return rep('❌ Métete a voz.');
  let info;
  try {
    if (qry.match(/youtube\.com|youtu\.be/)) info = await play.video_info(qry);
    else { const r = await play.search(qry, { limit: 1 }); if (!r.length) return rep('❌ No encontré.'); info = await play.video_info(r[0].url); }
  } catch { return rep('❌ Error.'); }
  const s = { t: info.video_details.title, u: info.video_details.url };
  const q = getQ(i.guild); q.songs.push(s);
  if (q.songs.length === 1) {
    if (!q.conn || q.conn.state.status === 'destroyed') {
      q.conn = joinVoiceChannel({ channelId: vc.id, guildId: i.guild.id, adapterCreator: i.guild.voiceAdapterCreator });
      q.player.on(AudioPlayerStatus.Idle, () => { q.songs.shift(); playSong(i.guild, i.channel); });
      q.player.on('error', () => { q.songs.shift(); playSong(i.guild, i.channel); });
    }
    playSong(i.guild, i.channel);
  } else rep(`📃 **Agregado:** ${s.t}`);
}

function handleCmd(i, cmd, args) {
  const q = getQ(i.guild); const rep = t => { try { i.reply(t); } catch { i.channel?.send(t); } };
  switch (cmd) {
    case 'skip': { if (!q.songs.length) return rep('❌'); q.player.stop(); rep('⏭️'); break; }
    case 'stop': { q.songs = []; q.player.stop(); q.conn?.destroy(); q.proc?.kill(); queue.delete(i.guild.id); rep('⏹️'); break; }
    case 'pause': { getQ(i.guild).player.pause(); rep('⏸️'); break; }
    case 'resume': { getQ(i.guild).player.unpause(); rep('▶️'); break; }
    case 'queue': { if (!q.songs.length) return rep('Cola vacía.'); rep(`**Cola:**\n${q.songs.map((s,j)=>`${j===0?'▶️':'📃'} ${j+1}. ${s.t}`).join('\n')}`); break; }
    case 'np': { if (!q.songs.length) return rep('Nada.'); rep(`🎵 ${q.songs[0].t}`); break; }
    case 'volume': const v = parseInt(args?.[0] ?? 50); if (v < 1 || v > 100) return rep('1-100'); getQ(i.guild).vol = v/100; rep(`🔊 ${v}%`); break;
  }
}

module.exports = { handlePlay, handleCmd, queue };
