/**
 * roblox-http — YouTube Music bridge server
 *
 * Exposes a local HTTP API so Roblox games can search YouTube Music and
 * retrieve audio stream URLs via HttpService.
 *
 * Endpoints
 * ---------
 * GET /search?q=<query>&limit=<n>
 *   Search YouTube Music.  Returns JSON array of track objects.
 *
 * GET /stream?url=<youtube-music-url>
 *   Returns a JSON object with a short-lived audio stream URL for the
 *   given track.  Roblox can play this URL directly with a Sound object.
 *
 * GET /health
 *   Simple liveness check — returns { ok: true }.
 */

"use strict";

const express = require("express");
const playdl = require("play-dl");

const PORT = process.env.PORT || 8963;

const app = express();

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Validate that a string looks like a YouTube / YouTube Music URL.
 * Accepted hosts: youtube.com, www.youtube.com, music.youtube.com, youtu.be
 */
function isYouTubeUrl(str) {
  try {
    const url = new URL(str);
    return /^(www\.|music\.)?youtube\.com$|^youtu\.be$/.test(url.hostname);
  } catch {
    return false;
  }
}

// ── routes ───────────────────────────────────────────────────────────────────

/**
 * GET /health
 */
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * GET /search?q=<query>[&limit=<1-25>]
 *
 * Searches YouTube Music and returns track metadata.
 */
app.get("/search", async (req, res) => {
  const query = req.query.q;
  if (!query || typeof query !== "string" || query.trim() === "") {
    return res.status(400).json({ error: "Missing or empty query parameter 'q'" });
  }

  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 25) : 5;

  try {
    const results = await playdl.search(query.trim(), {
      source: { youtube: "music" },
      limit,
    });

    const tracks = results.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      durationSeconds: t.durationInSec,
      thumbnail: t.thumbnails?.[0]?.url ?? null,
      artist: t.channel?.name ?? null,
    }));

    return res.json(tracks);
  } catch (err) {
    console.error("[search] error:", err);
    return res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

/**
 * GET /stream?url=<youtube-music-url>
 *
 * Returns a short-lived audio stream URL for the given track.
 * The client (Roblox Sound object) can load this URL directly.
 */
app.get("/stream", async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Missing query parameter 'url'" });
  }
  if (!isYouTubeUrl(url)) {
    return res.status(400).json({ error: "Invalid URL — must be a YouTube or YouTube Music link" });
  }

  try {
    const info = await playdl.video_info(url);
    const formats = info.format.filter(
      (f) => f.mimeType && f.mimeType.startsWith("audio/") && f.url
    );
    if (formats.length === 0) {
      return res.status(404).json({ error: "No audio formats available for this track" });
    }

    // Prefer the format with the highest audio bitrate.
    // When bitrate is unavailable for all formats, fall back to opus > aac/mp4a
    // and then to content-length as a rough proxy for quality.
    const codecRank = (mimeType) => {
      if (/opus/i.test(mimeType)) return 2;
      if (/aac|mp4a/i.test(mimeType)) return 1;
      return 0;
    };
    formats.sort((a, b) => {
      const bitrateDiff = (b.bitrate ?? 0) - (a.bitrate ?? 0);
      if (bitrateDiff !== 0) return bitrateDiff;
      const codecDiff = codecRank(b.mimeType) - codecRank(a.mimeType);
      if (codecDiff !== 0) return codecDiff;
      return (b.contentLength ?? 0) - (a.contentLength ?? 0);
    });
    const best = formats[0];

    return res.json({
      id: info.video_details.id,
      title: info.video_details.title,
      url: info.video_details.url,
      durationSeconds: info.video_details.durationInSec,
      streamUrl: best.url,
      mimeType: best.mimeType,
      bitrate: best.bitrate ?? null,
    });
  } catch (err) {
    console.error("[stream] error:", err);
    return res.status(500).json({ error: "Failed to retrieve stream info", detail: err.message });
  }
});

// ── start ─────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`roblox-http listening on http://127.0.0.1:${PORT}`);
});

module.exports = { app, server };
