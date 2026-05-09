# Cerberus Bot 🐕

Bot personal de Discord con IA, música, ofertas, roles por país, galería de arte y más.

## Funcionalidades

- **🎵 Música** — Reproduce YouTube en canales de voz (`/play`)
- **🎮 Ofertas** — Ofertas Steam en MXN cada 8h (`/deals`)
- **🤖 IA** — Chat con inteligencia artificial (`/setoraculo`)
- **🧱 Muro de Lamentos** — Canal de desahogo con IA (`/setmuro`)
- **🎨 Galería** — Sistema de arte con ranking (`/artista`)
- **🌍 Roles por país** — Select menu con banderas (`/pais`)
- **👋 Bienvenidas** — Automáticas al entrar (`/setwelcome`)
- **📖 Enciclopedia** — Perfiles que se actualizan solos (`/setenciclopedia`)

## Comandos

| Comando | Descripción |
|---------|-------------|
| `/play` | Reproducir música de YouTube |
| `/skip` | Saltar canción |
| `/stop` | Detener y salir |
| `/pause` / `/resume` | Pausar / Reanudar |
| `/queue` | Ver cola |
| `/np` | Lo que suena |
| `/volume` | Volumen 1-100 |
| `/deals` | Ofertas Steam en MXN |
| `/setdeals` | Ofertas automáticas cada 8h |
| `/setoraculo` | Chat con IA |
| `/setmuro` | Muro de lamentos |
| `/pais` | Seleccionar país |
| `/artista` | Rol de artista + canal personal |
| `/setupgaleria` | Configurar galería |
| `/setwelcome` | Bienvenidas automáticas |
| `/setenciclopedia` | Foro de perfiles |
| `/help` | Ayuda |

## Configuración

1. Copia `config.example.json` como `config.json`
2. Rellena las credenciales:
   - `token`: Token de tu bot de Discord
   - `clientId`: ID de tu aplicación
   - `guildId`: ID de tu servidor
   - `deepseekKey`: API key de DeepSeek (opcional, para IA)

## Despliegue

```bash
npm install
node index.js
```

### Fly.io

```bash
fly deploy
```
