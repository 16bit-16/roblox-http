# roblox-http

A lightweight local HTTP server that lets Roblox games search and stream **YouTube Music** audio via `HttpService`.

---

## How it works

```
Roblox Studio / game server
        │
        │  HTTP  (localhost:8963)
        ▼
  roblox-http server  ──►  YouTube Music  (play-dl)
```

The server runs on the same machine as Roblox (or any machine reachable from your game server).  
Roblox scripts call the REST endpoints below to discover tracks and get short-lived audio stream URLs.

---

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- Internet access to YouTube Music

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Start the server (default port 8963)
npm start
```

To use a different port set the `PORT` environment variable before starting:

```bash
PORT=9000 npm start
```

---

## API

### `GET /health`

Liveness check.

```jsonc
// 200 OK
{ "ok": true }
```

---

### `GET /search?q=<query>[&limit=<1-25>]`

Search YouTube Music.  Returns an array of track objects.

**Example request**

```
GET http://127.0.0.1:8963/search?q=lofi+hip+hop&limit=3
```

**Example response**

```jsonc
[
  {
    "id": "jfKfPfyJRdk",
    "title": "lofi hip hop radio 📚 - beats to relax/study to",
    "url": "https://www.youtube.com/watch?v=jfKfPfyJRdk",
    "durationSeconds": 0,
    "thumbnail": "https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg",
    "artist": "Lofi Girl"
  }
]
```

---

### `GET /stream?url=<youtube-music-url>`

Get a short-lived audio stream URL for a specific track.

**Example request**

```
GET http://127.0.0.1:8963/stream?url=https%3A%2F%2Fmusic.youtube.com%2Fwatch%3Fv%3DjfKfPfyJRdk
```

**Example response**

```jsonc
{
  "id": "jfKfPfyJRdk",
  "title": "lofi hip hop radio 📚 - beats to relax/study to",
  "url": "https://music.youtube.com/watch?v=jfKfPfyJRdk",
  "durationSeconds": 0,
  "streamUrl": "https://rr1---sn-....googlevideo.com/videoplayback?...",
  "mimeType": "audio/webm; codecs=\"opus\"",
  "bitrate": 160000
}
```

> **Note:** Stream URLs expire after a few hours.  Fetch a fresh one each time you want to play a track.

---

## Roblox integration

Copy `roblox/YouTubeMusic.lua` into your Roblox project as a **ModuleScript** (e.g. under `ServerScriptService`).

```lua
local YouTubeMusic = require(game.ServerScriptService.YouTubeMusic)

-- Search
local tracks = YouTubeMusic.search("lofi hip hop", 5)
for _, track in ipairs(tracks) do
    print(track.title, track.url)
end

-- Stream the first result
local stream = YouTubeMusic.getStream(tracks[1].url)
if stream then
    local sound = Instance.new("Sound", workspace)
    sound.SoundId = stream.streamUrl
    sound:Play()
end
```

Make sure **HTTP Requests** are enabled in your game settings:  
`Game Settings → Security → Allow HTTP Requests ✓`

---

## Running tests

```bash
npm test
```

---

## License

ISC