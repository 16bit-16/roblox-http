--[[
  YouTubeMusic.lua — Roblox client module for the roblox-http server

  Usage
  -----
  Place this ModuleScript inside ServerScriptService (or wherever you keep
  shared modules).  The server must be running on the same machine as Roblox
  Studio (or on a machine whose IP is accessible from the game server).

  local YouTubeMusic = require(game.ServerScriptService.YouTubeMusic)

  -- Search for tracks
  local tracks = YouTubeMusic.search("lofi hip hop")
  for _, track in ipairs(tracks) do
      print(track.title, track.url, track.durationSeconds)
  end

  -- Get a streamable URL for the first result
  local stream = YouTubeMusic.getStream(tracks[1].url)
  if stream then
      local sound = Instance.new("Sound", workspace)
      sound.SoundId = stream.streamUrl   -- direct audio URL
      sound:Play()
  end
--]]

local HttpService = game:GetService("HttpService")

-- Change this if the server runs on a different host / port.
local BASE_URL = "http://127.0.0.1:8963"

local YouTubeMusic = {}

--- Search YouTube Music.
-- @param query   string  Search query
-- @param limit   number? Max results (1-25, default 5)
-- @return        table[] Array of track objects, or nil on failure
function YouTubeMusic.search(query, limit)
	assert(type(query) == "string" and #query > 0, "query must be a non-empty string")
	limit = limit or 5

	local url = BASE_URL .. "/search?q=" .. HttpService:UrlEncode(query)
		.. "&limit=" .. tostring(math.clamp(limit, 1, 25))

	local ok, response = pcall(function()
		return HttpService:GetAsync(url)
	end)

	if not ok then
		warn("[YouTubeMusic] search request failed:", response)
		return nil
	end

	local decodeOk, data = pcall(HttpService.JSONDecode, HttpService, response)
	if not decodeOk then
		warn("[YouTubeMusic] failed to decode search response:", data)
		return nil
	end

	return data
end

--- Get a short-lived audio stream URL for a YouTube Music track.
-- @param trackUrl  string  Full YouTube / YouTube Music URL
-- @return          table?  Stream info object, or nil on failure
function YouTubeMusic.getStream(trackUrl)
	assert(type(trackUrl) == "string" and #trackUrl > 0, "trackUrl must be a non-empty string")

	local url = BASE_URL .. "/stream?url=" .. HttpService:UrlEncode(trackUrl)

	local ok, response = pcall(function()
		return HttpService:GetAsync(url)
	end)

	if not ok then
		warn("[YouTubeMusic] stream request failed:", response)
		return nil
	end

	local decodeOk, data = pcall(HttpService.JSONDecode, HttpService, response)
	if not decodeOk then
		warn("[YouTubeMusic] failed to decode stream response:", data)
		return nil
	end

	return data
end

return YouTubeMusic
