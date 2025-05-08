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
const DEVICE_ID = '7a726fde-ca1b-4b9d-a36f-37a31bb45ac2';
const USER_ID = '2533365489';
const COOKIE = 'serviceToken=sXEJMjSdm6MHAaBJzdchB0Gr3PAFxAZoOIMAxAJH+iFokK7hK0VU0gPc4lf66K5WYpulNvGRso4D1J+vrgwFSpMgGzcKXavS26oV9Oc058Xei/9Foy8on4KK+8joDEetR6/CnrB3vxrwXja4CaV66Mqz9D4cYZrbCHL862q1kRfQ/wvF/VESlYDxFgcppjLKtJVQbbqO2BQCv4zTXWjjAb7FVoGSJWaq55hS6mPVQPrJTZ8Wo/vYtZC8sFSexrXS; hardware=L05B; deviceId=7a726fde-ca1b-4b9d-a36f-37a31bb45ac2; userId=2533365489; phoneModel=OnePlus; instanceId=65039ef1-e61f-423e-841b-4fb71414af95; sn=31834/A4SD26822';

// 获取13位时间戳
function getTimestamp() {
  return Date.now().toString();
}

async function getPlayStatus() {
  try {
    const response = await axios.post(
      'https://api2.mina.xiaoaisound.com/remote/ubus',
      new URLSearchParams({
        'deviceId': DEVICE_ID,
        'path': 'mediaplayer',
        'method': 'player_get_play_status',
        'message': '{}',
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
      const playStatus = await getPlayStatus();
      
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
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
}); 