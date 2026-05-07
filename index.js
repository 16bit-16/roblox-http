require('dotenv').config()
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const axios = require('axios')

const app = express()
app.use(cors())
app.use(express.json())

const nowPlaying = {}  // { userId: { title, artist } }
const users = {}       // { userId: { username, avatar } }

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
        // 토큰 교환
        const tokenRes = await axios.post('https://apis.roblox.com/oauth/v1/token', new URLSearchParams({
            client_id: process.env.ROBLOX_CLIENT_ID,
            client_secret: process.env.ROBLOX_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: 'https://api.ksmusic.shop/auth/callback',
            code,
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        })

        const { access_token } = tokenRes.data

        // 유저 정보 가져오기
        const userRes = await axios.get('https://apis.roblox.com/oauth/v1/userinfo', {
            headers: { Authorization: `Bearer ${access_token}` }
        })

        const { sub: userId, name: username, picture: avatar } = userRes.data

        users[userId] = { username, avatar }
        nowPlaying[userId] = { title: '', artist: '' }

        // JWT 발급
        const token = jwt.sign({ userId, username, avatar }, process.env.JWT_SECRET)

        // 프론트로 리다이렉트
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

// 긁어서 저장
app.post('/nowplaying', authMiddleware, (req, res) => {
    const { title, artist, albumArt, current, total, isPlaying } = req.body
    const { userId } = req.user

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

// 대시보드 재생 시간용
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

// 메모리 반환
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

// 로블록스용 API
app.get('/nowplaying/:userId', (req, res) => {
    const data = nowPlaying[req.params.userId]
    if (!data) return res.status(404).json({ title: '', artist: '' })
    res.json({ title: data.titleShort, artist: data.artistShort })
})

app.listen(3000, () => {
    console.log('서버 실행 중 | http://localhost:3000')
})