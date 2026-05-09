require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const axios = require('axios')

const app = express()
app.use(cors())
app.use(express.json())

const nowPlaying = {}
const users = {}
const spotifyTokens = {}
const activeSource = {}

// 로블록스 OAuth 로그인
app.get('/auth/login', (req, res) => {
    const params = new URLSearchParams({
        client_id: process.env.ROBLOX_CLIENT_ID,
        redirect_uri: 'https://api.ksmusic.shop/auth/callback',
        response_type: 'code',
        scope: 'openid profile',
    })
    res.redirect(`https://apis.roblox.com/oauth/v1/authorize?${params}`)
})

// 로블록스 OAuth 콜백
app.get('/auth/callback', async (req, res) => {
    const { code } = req.query
    try {
        const tokenRes = await axios.post('https://apis.roblox.com/oauth/v1/token', new URLSearchParams({
            client_id: process.env.ROBLOX_CLIENT_ID,
            client_secret: process.env.ROBLOX_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: 'https://api.ksmusic.shop/auth/callback',
            code,
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })

        const { access_token } = tokenRes.data
        const userRes = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        })

        const { sub: userId, name: username, picture: avatar } = userRes.data
        users[userId] = { username, avatar }
        nowPlaying[userId] = { title: '', artist: '', albumArt: '', current: '0:00', total: '0:00', isPlaying: false }

        const token = jwt.sign({ userId, username, avatar }, process.env.JWT_SECRET)
        res.redirect(`https://www.ksmusic.shop/dashboard?token=${token}`)
    } catch (err) {
        console.error(err.response?.data || err.message)
        res.status(500).send('인증 실패')
    }
})

// JWT 검증 미들웨어
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1]
    if (!token) return res.sendStatus(401)
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET)
        next()
    } catch {
        res.sendStatus(401)
    }
}

// 유튜브 뮤직 nowplaying 저장
app.post('/nowplaying', authMiddleware, (req, res) => {
    const { title, artist, albumArt, current, total, isPlaying } = req.body
    const { userId } = req.user
    if (activeSource[userId] === 'spotify') return res.sendStatus(200)

    const prev = nowPlaying[userId] || {}
    if (title !== prev.title || artist !== prev.artist) {
        nowPlaying[userId] = {
            title,
            artist,
            albumArt: albumArt || '',
            current: current || '0:00',
            total: total || '0:00',
            isPlaying: isPlaying ?? true,
            titleShort: title.length > 20 ? title.slice(0, 20) + '...' : title,
            artistShort: artist.length > 20 ? artist.slice(0, 20) + '...' : artist,
        }
        console.log(`🎵 ${req.user.username} | ${artist} - ${title}`)
    } else {
        if (nowPlaying[userId]) {
            nowPlaying[userId].current = current || '0:00'
            nowPlaying[userId].total = total || '0:00'
            nowPlaying[userId].isPlaying = isPlaying ?? true
        }
    }
    res.sendStatus(200)
})

// 재생 시간만 업데이트
app.post('/nowplaying/time', authMiddleware, (req, res) => {
    const { current, total, isPlaying } = req.body
    const { userId } = req.user
    if (nowPlaying[userId]) {
        nowPlaying[userId].current = current || '0:00'
        nowPlaying[userId].total = total || '0:00'
        nowPlaying[userId].isPlaying = isPlaying ?? true
    }
    res.sendStatus(200)
})

// 대시보드용
app.get('/me', authMiddleware, (req, res) => {
    const { userId, username, avatar } = req.user
    const np = nowPlaying[userId] || { title: '', artist: '', albumArt: '', current: '0:00', total: '0:00', isPlaying: false }
    res.json({
        userId,
        username,
        avatar,
        nowPlaying: {
            title: np.title,
            artist: np.artist,
            albumArt: np.albumArt,
            current: np.current,
            total: np.total,
            isPlaying: np.isPlaying
        }
    })
})

// 로블록스용
app.get('/nowplaying/:userId', (req, res) => {
    const data = nowPlaying[req.params.userId]
    if (!data) return res.json({ title: '', artist: '' })
    res.json({ title: data.titleShort, artist: data.artistShort })
})

// 소스 변경
app.post('/source', authMiddleware, (req, res) => {
    const { source } = req.body
    const { userId } = req.user
    activeSource[userId] = source
    res.sendStatus(200)
})

// 스포티파이 로그인
app.get('/spotify/login', (req, res) => {
    const token = req.query.token || req.headers.authorization?.split(' ')[1]
    if (!token) return res.sendStatus(401)
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET)
        const params = new URLSearchParams({
            client_id: process.env.SPOTIFY_CLIENT_ID,
            redirect_uri: 'https://api.ksmusic.shop/spotify/callback',
            response_type: 'code',
            scope: 'user-read-currently-playing user-read-playback-state',
            state: user.userId
        })
        res.redirect(`https://accounts.spotify.com/authorize?${params}`)
    } catch {
        res.sendStatus(401)
    }
})

// 스포티파이 콜백
app.get('/spotify/callback', async (req, res) => {
    const { code, state: userId } = req.query
    try {
        const tokenRes = await axios.post('https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: 'https://api.ksmusic.shop/spotify/callback',
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
            }
        })

        const { access_token, refresh_token, expires_in } = tokenRes.data
        spotifyTokens[userId] = { access_token, refresh_token, expires_at: Date.now() + expires_in * 1000 }
        res.redirect('https://www.ksmusic.shop/dashboard')
    } catch (err) {
        console.error(err.response?.data || err.message)
        res.status(500).send('스포티파이 인증 실패')
    }
})

// 스포티파이 토큰 갱신
async function refreshSpotifyToken(userId) {
    const tokens = spotifyTokens[userId]
    if (!tokens) return null
    if (Date.now() < tokens.expires_at - 60000) return tokens.access_token

    try {
        const res = await axios.post('https://accounts.spotify.com/api/token',
            new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token,
            }), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
            }
        })
        spotifyTokens[userId].access_token = res.data.access_token
        spotifyTokens[userId].expires_at = Date.now() + res.data.expires_in * 1000
        return res.data.access_token
    } catch (err) {
        console.error('토큰 갱신 실패:', err.response?.data || err.message)
        return null
    }
}

// 스포티파이 폴링
async function pollSpotify(userId) {
    if (activeSource[userId] !== 'spotify') return
    const access_token = await refreshSpotifyToken(userId)
    if (!access_token) return

    try {
        const res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
            headers: { Authorization: `Bearer ${access_token}` }
        })
        if (res.status === 204 || !res.data) return

        const { item, is_playing, progress_ms } = res.data
        const title = item.name
        const artist = item.artists.map(a => a.name).join(', ')
        const albumArt = item.album.images[0]?.url || ''
        const current = `${Math.floor(progress_ms / 60000)}:${String(Math.floor((progress_ms % 60000) / 1000)).padStart(2, '0')}`
        const total = `${Math.floor(item.duration_ms / 60000)}:${String(Math.floor((item.duration_ms % 60000) / 1000)).padStart(2, '0')}`

        const prev = nowPlaying[userId] || {}
        if (title !== prev.title || artist !== prev.artist) {
            nowPlaying[userId] = {
                title, artist, albumArt, current, total,
                isPlaying: is_playing,
                titleShort: title.length > 20 ? title.slice(0, 20) + '...' : title,
                artistShort: artist.length > 20 ? artist.slice(0, 20) + '...' : artist,
                source: 'spotify'
            }
            console.log(`🎵 ${userId} | ${artist} - ${title} (Spotify)`)
        } else {
            nowPlaying[userId].current = current
            nowPlaying[userId].isPlaying = is_playing
        }
    } catch (err) {
        if (err.response?.status !== 204) {
            console.error('스포티파이 폴링 실패:', err.response?.data || err.message)
        }
    }
}

// 스포티파이 연동 여부
app.get('/spotify/status', authMiddleware, (req, res) => {
    const { userId } = req.user
    res.json({ connected: !!spotifyTokens[userId] })
})

// 3초마다 스포티파이 폴링
setInterval(() => {
    Object.keys(spotifyTokens).forEach(userId => pollSpotify(userId))
}, 3000)

app.listen(3000, () => {
    console.log('서버 실행 중 | http://localhost:3000')
})