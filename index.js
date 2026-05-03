const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors())  // 이거 추가
app.use(express.json())

let nowPlaying = { title: '', artist: '' }

app.post('/nowplaying', (req, res) => {
    const { title, artist } = req.body
    
    if (title !== nowPlaying.title || artist !== nowPlaying.artist) {
        nowPlaying = {
            title: title.length > 20 ? title.slice(0, 20) + '...' : title,
            artist: artist.length > 20 ? artist.slice(0, 20) + '...' : artist
        }
        console.log(`🎵 트랙 변경 | ${nowPlaying.artist} - ${nowPlaying.title}`)
    }
    
    res.sendStatus(200)
})

app.get('/nowplaying', (req, res) => {
    console.log("get 성공", nowPlaying)
    res.json(nowPlaying)
})

app.listen(3000, () => {
    console.log('Server is running on port 3000')
})