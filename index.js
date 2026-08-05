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
const lastfmTokens = {}
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
        console.log('토큰 교환 성공')

        const userRes = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        })

        const { sub: userId, name: username, picture: avatar } = userRes.data
        console.log(`로그인 성공 | ${username} (${userId})`)

        users[userId] = { username, avatar }
        nowPlaying[userId] = { title: '', artist: '', albumArt: '', current: '0:00', total: '0:00', isPlaying: false }

        const token = jwt.sign({ userId, username, avatar }, process.env.JWT_SECRET)
        console.log(`JWT 발급 완료 | ${username}`)

        res.redirect(`https://www.ksmusic.shop/dashboard?token=${token}`)
    } catch (err) {
        console.error(`로그인 실패 | ${err.response?.data ? JSON.stringify(err.response.data) : err.message}`)
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
    if (activeSource[userId] === 'lastfm') return res.sendStatus(200)

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
        console.log(`🎵 ${req.user.username} | ${artist} - ${title}  (youtube music)`)
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
    nowPlaying[userId] = { title: '', artist: '', albumArt: '', current: '0:00', total: '0:00', isPlaying: false }
    res.sendStatus(200)
})

// Last.fm 로그인
app.get('/lastfm/login', (req, res) => {
    const token = req.query.token || req.headers.authorization?.split(' ')[1]
    if (!token) return res.sendStatus(401)
    try {
        const user = jwt.verify(token, process.env.JWT_SECRET)
        const params = new URLSearchParams({
            api_key: process.env.LASTFM_API_KEY,
            cb: `https://api.ksmusic.shop/lastfm/callback?userId=${user.userId}`
        })
        res.redirect(`https://www.last.fm/api/auth?${params}`)
    } catch {
        res.sendStatus(401)
    }
})

// Last.fm 콜백
app.get('/lastfm/callback', async (req, res) => {
    const { token, userId } = req.query

    try {
        const md5 = require('crypto')
        const sig = md5.createHash('md5')
            .update(`api_key${process.env.LASTFM_API_KEY}methodauth.getSessiontoken${token}${process.env.LASTFM_SECRET}`)
            .digest('hex')

        const sessionRes = await axios.get('https://ws.audioscrobbler.com/2.0/', {
            params: {
                method: 'auth.getSession',
                api_key: process.env.LASTFM_API_KEY,
                token,
                api_sig: sig,
                format: 'json'
            }
        })

        const { key: sessionKey, name: username } = sessionRes.data.session
        lastfmTokens[userId] = { sessionKey, username }

        res.redirect('https://www.ksmusic.shop/dashboard')
    } catch (err) {
        console.error(err.response?.data || err.message)
        res.status(500).send('Last.fm 인증 실패')
    }
})

// Last.fm 현재 재생 트랙 폴링
async function pollLastfm(userId) {
    if (activeSource[userId] !== 'lastfm') return
    const tokens = lastfmTokens[userId]
    if (!tokens) return

    try {
        const res = await axios.get('https://ws.audioscrobbler.com/2.0/', {
            params: {
                method: 'user.getRecentTracks',
                user: tokens.username,
                api_key: process.env.LASTFM_API_KEY,
                format: 'json',
                limit: 1
            }
        })

        const tracks = res.data.recenttracks?.track
        if (!tracks) return
        
        const track = Array.isArray(tracks) ? tracks[0] : tracks
        if (!track || !track['@attr']?.nowplaying) return

        const title = track.name
        const artist = track.artist['#text']
        const albumArt = track.image.find(i => i.size === 'extralarge')?.['#text'] || ''

        const prev = nowPlaying[userId] || {}
        if (title !== prev.title || artist !== prev.artist) {
            nowPlaying[userId] = {
                title, artist, albumArt,
                current: '0:00', total: '0:00', isPlaying: true,
                titleShort: title.length > 20 ? title.slice(0, 20) + '...' : title,
                artistShort: artist.length > 20 ? artist.slice(0, 20) + '...' : artist,
                source: 'lastfm'
            }
            console.log(`🎵 ${users[userId]?.username || userId} | ${artist} - ${title} (Last.fm)`)
        }
    } catch (err) {
        console.error('Last.fm 폴링 실패:', err.response?.data || err.message)
    }
}

// Last.fm 연동 여부
app.get('/lastfm/status', authMiddleware, (req, res) => {
    const { userId } = req.user
    res.json({ connected: !!lastfmTokens[userId] })
})

// 3초마다 Last.fm 폴링
setInterval(() => {
    Object.keys(lastfmTokens).forEach(userId => pollLastfm(userId))
}, 3000)


// ============================================================
// 주유소 유가 공지 (로블록스 → 디스코드 중계)
//
// 로블록스 HttpService는 discord.com 을 차단하므로
// 웹훅 호출은 반드시 이 서버를 거쳐야 함
// ============================================================

const FUEL_RELAY_SECRET = process.env.FUEL_RELAY_SECRET
const FUEL_DISCORD_WEBHOOK = process.env.FUEL_DISCORD_WEBHOOK

if (!FUEL_RELAY_SECRET || !FUEL_DISCORD_WEBHOOK) {
    console.warn('⚠️  FUEL_RELAY_SECRET 또는 FUEL_DISCORD_WEBHOOK 미설정 — 유가 공지 비활성')
}

let fuelLastAnnounceAt = 0
let fuelPrevPrices = null
let fuelCurrentPrices = null

const FUEL_MIN_INTERVAL_MS = 5000

const FUEL_EMOJI = {
    gasoline: '⛽',
    diesel: '🛢️',
    lpg: '🔥',
    cng: '💨',
}

function fuelFormatWon(n) {
    return n.toLocaleString('ko-KR') + '원'
}

function fuelFormatDelta(current, previous) {
    if (previous === null || previous === undefined) return ''
    const diff = current - previous
    if (diff === 0) return ' (변동 없음)'
    const arrow = diff > 0 ? '▲' : '▼'
    return ` (${arrow} ${Math.abs(diff).toLocaleString('ko-KR')})`
}

function fuelBuildEmbed({ prices, fuelTypes, setBy }) {
    const fields = fuelTypes.map(ft => {
        const price = prices[ft.id]
        const prev = fuelPrevPrices ? fuelPrevPrices[ft.id] : null
        return {
            name: `${FUEL_EMOJI[ft.id] || '⛽'} ${ft.label}`,
            value: `**${fuelFormatWon(price)}**${fuelFormatDelta(price, prev)}`,
            inline: true,
        }
    })

    const now = new Date()
    const dateStr = now.toLocaleDateString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    })

    return {
        title: '⛽ 오늘의 유가',
        description: dateStr,
        color: 0x4a90d9,
        fields,
        footer: { text: setBy?.name ? `설정: ${setBy.name}` : '유가 정보' },
        timestamp: now.toISOString(),
    }
}

function fuelValidate(body) {
    if (!body || typeof body !== 'object') return '요청 본문 오류'
    if (body.secret !== FUEL_RELAY_SECRET) return 'unauthorized'
    if (!body.prices || typeof body.prices !== 'object') return 'prices 없음'
    if (!Array.isArray(body.fuelTypes) || body.fuelTypes.length === 0) return 'fuelTypes 없음'

    for (const ft of body.fuelTypes) {
        const v = body.prices[ft.id]
        if (typeof v !== 'number' || !Number.isFinite(v)) return `${ft.id} 값 오류`
        if (v < 0 || v > 100000) return `${ft.id} 범위 초과`
    }
    return null
}

app.post('/fuel/announce', async (req, res) => {
    if (!FUEL_RELAY_SECRET || !FUEL_DISCORD_WEBHOOK) {
        return res.status(503).json({ ok: false, error: 'not configured' })
    }

    const error = fuelValidate(req.body)
    if (error === 'unauthorized') return res.status(401).json({ ok: false })
    if (error) return res.status(400).json({ ok: false, error })

    const now = Date.now()
    if (now - fuelLastAnnounceAt < FUEL_MIN_INTERVAL_MS) {
        return res.status(429).json({ ok: false, error: 'too many requests' })
    }
    fuelLastAnnounceAt = now

    try {
        const webhookRes = await axios.post(FUEL_DISCORD_WEBHOOK, {
            embeds: [fuelBuildEmbed(req.body)]
        }, { headers: { 'Content-Type': 'application/json' } })

        fuelPrevPrices = fuelCurrentPrices
        fuelCurrentPrices = { ...req.body.prices }

        const summary = req.body.fuelTypes
            .map(ft => `${ft.label} ${req.body.prices[ft.id]}`)
            .join(' | ')
        console.log(`⛽ 유가 공지 | ${req.body.setBy?.name || '?'} | ${summary}`)

        res.json({ ok: true })
    } catch (err) {
        console.error('유가 공지 실패:', err.response?.data || err.message)
        res.status(502).json({ ok: false, error: 'discord webhook failed' })
    }
})

// 현재 유가 조회 (웹사이트나 봇 명령어용)
app.get('/fuel/current', (req, res) => {
    res.json({ ok: true, prices: fuelCurrentPrices })
})


app.listen(3000, () => {
    console.log('서버 실행 중 | http://localhost:3000')
})
