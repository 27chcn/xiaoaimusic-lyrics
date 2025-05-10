const express = require('express');
const axios = require('axios');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configuration
const DEVICE_ID = '';
const USER_ID = '';
const COOKIE = 'serviceToken=';
// 获取13位时间戳
function getTimestamp() {
  return Date.now().toString();
}

async function getPlayStatus(method,message) {
  try {
    const response = await axios.post(
      'https://api2.mina.xiaoaisound.com/remote/ubus',
      new URLSearchParams({
        'deviceId': DEVICE_ID,
        'path': 'mediaplayer',
        'method': method,
        'message': message,
        'requestId': getTimestamp(),
        'timestamp': getTimestamp()
      }),
      {
        headers: {
          'Cookie': COOKIE
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('获取播放状态失败:', error.message);
    return null;
  }
}

async function getLyrics(originSongId) {
  try {
    const response = await axios.get('https://coreapi.mina.xiaoaisound.com/music/qq/lyric', {
      params: {
        'userId': USER_ID,
        'originSongId': originSongId,
        'requestId': getTimestamp(),
        'timestamp': getTimestamp()
      },
      headers: {
        'Cookie': COOKIE
      }
    });
    return response.data;
  } catch (error) {
    console.error('获取歌词失败:', error.message);
    return null;
  }
}

async function getSongInfo(audioId) {
  try {
    const response = await axios.post(
      'https://coreapi.mina.xiaoaisound.com/aivs3/audio/info/v2',
      new URLSearchParams({
        'audioIdList': `[${audioId}]`,
        'requestId': getTimestamp(),
        'timestamp': getTimestamp()
      }),
      {
        headers: {
          'Cookie': COOKIE
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('获取歌曲信息失败:', error.message);
    return null;
  }
}

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('客户端已连接');
  
  let interval;
  let lastSongId = null; // 用于跟踪上一首歌曲的ID
  let lastPosition = 0;  // 用于跟踪上次播放位置
  
  socket.on('startPolling', () => {
    interval = setInterval(async () => {
      const playStatus = await getPlayStatus('player_get_play_status','{}');
      
      // 检查播放状态数据是否有效
      if (!playStatus || !playStatus.data || !playStatus.data.info) {
        console.log('无效的播放状态数据');
        return;
      }

      const info = JSON.parse(playStatus.data.info);
      
      // 检查播放详情是否存在
      if (!info || !info.play_song_detail) {
        console.log('没有正在播放的歌曲');
        return;
      }

      const currentSong = info.play_song_detail;
      
      // 检查当前歌曲信息是否完整
      if (!currentSong.audio_id || !currentSong.position) {
        console.log('当前歌曲信息不完整:', currentSong);
        return;
      }

      // 检查是否需要发送更新
      const positionChanged = Math.abs(currentSong.position - lastPosition) >= 1000; // 如果位置变化超过1秒
      const songChanged = lastSongId !== currentSong.audio_id;

      if (songChanged || positionChanged) {
        // 更新上次位置
        lastPosition = currentSong.position;

        // 如果歌曲ID没有变化，只更新进度
        if (!songChanged) {
          socket.emit('songUpdate', {
            status: info.status,
            currentTime: currentSong.position || 0,
            duration: currentSong.duration || 0,
            songInfo: null,
            lyrics: null
          });
          return;
        }

        // 歌曲发生变化，更新lastSongId
        lastSongId = currentSong.audio_id;

        try {
          const [songInfo] = await Promise.all([
            getSongInfo(currentSong.audio_id),
          ]);
          const [lyrics] = await Promise.all([
            getLyrics(songInfo.data[0].cpId),
          ]);
          console.log('获取到的歌词信息:', lyrics);
          console.log('获取到的歌曲ID:', songInfo.data[0].cpId);
          
          socket.emit('songUpdate', {
            status: info.status,
            currentTime: currentSong.position || 0,
            duration: currentSong.duration || 0,
            songInfo: songInfo?.data?.[0] || null,
            lyrics: lyrics?.data || null
          });
        } catch (error) {
          console.error('获取歌曲信息或歌词时出错:', error.message);
        }
      }
    }, 1000); // 改为1秒轮询一次
  });
  
  socket.on('stopPolling', () => {
    if (interval) {
      clearInterval(interval);
    }
  });
  
  socket.on('disconnect', () => {
    if (interval) {
      clearInterval(interval);
    }
    console.log('客户端已断开连接');
  });

  socket.on('playSong', async (data) => {
    try {
        const { audio_id, id, duration_in_ms } = data;
        const audioid = new URL(audio_id).searchParams.get('audioId');
        const music = JSON.stringify({
              "payload": {
                  "audio_items": [{
                      "item_id": {
                          "audio_id": audioid,
                          "cp": {
                              "album_id": "-1",
                              "episode_index": 0,
                              "id": id,
                              "name": "xiaowei"
                          }
                      },
                      "offset": -1,
                      "stream": {
                          "authentication": true,
                          "duration_in_ms": duration_in_ms,
                          "offset_in_ms": 0,
                          "redirect": false,
                          "url": `https://resource.ai.xiaomi.com/cp_resource_locator/c/v3/ai_music_search?audioId=${audioid}`
                      }
                  }],
                  "audio_type": "MUSIC",
                  "list_params": {
                      "listId": "-1",
                      "loadmore_offset": 0,
                      "origin": "xiaowei",
                      "type": "SONGBOOK"
                  },
                  "needs_loadmore": false,
                  "play_behavior": "REPLACE_ALL"
              }
          });
        const message = JSON.stringify({
              "dialog_id": "app_android_vOQADC5gVbIisP5QUeJj",
              "loadMoreOffset": 0,
              "media": "app_android",
              "music": music,
              "startOffset": 0,
              "startaudioid": audioid
          });
        const response = await getPlayStatus('player_play_music',message);
        console.log('播放歌曲成功:', response.data);
    } catch (error) {
        console.error('播放失败:', error);
    }
});
});

// 搜索接口
app.post('/api/search', async (req, res) => {
    try {
        const { query } = req.body;
        const timestamp = Date.now();
        const requestId = Math.random().toString(36).substring(2, 15);
        
        const response = await axios.post(
            'https://coreapi.mina.xiaoaisound.com/music/search',
            new URLSearchParams({
                'query': query,
                'queryType': '1',
                'offset': '0',
                'count': '30',
                'supportPayment': 'true',
                'requestId': requestId,
                'timestamp': timestamp.toString()
            }),
            {
              headers: {
                'Cookie': COOKIE
              }
            }
        );
        
        res.json(response.data);
    } catch (error) {
        console.error('搜索失败:', error);
        res.status(500).json({ error: '搜索失败' });
    }
});

// 播放控制接口
app.post('/api/player/control', async (req, res) => {
    try {
        const { action } = req.body;
        const response = await getPlayStatus('player_play_operation','{"action":'+action+',"media":"app_android"}');
        res.json(response.data);
    } catch (error) {
        console.error('播放控制失败:', error);
        res.status(500).json({ error: '播放控制失败' });
    }
});

// 音量控制接口
app.post('/api/player/volume', async (req, res) => {
    try {
        const { volume } = req.body;
        const response = await getPlayStatus('player_set_volume','{"volume":'+volume+',"media":"app_android"}');
        res.json(response.data);
    } catch (error) {
        console.error('音量控制失败:', error);
        res.status(500).json({ error: '音量控制失败' });
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
}); 