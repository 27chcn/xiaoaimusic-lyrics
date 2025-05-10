const socket = io();

// DOM Elements
const coverImg = document.getElementById('cover');
const songTitle = document.getElementById('song-title');
const artistName = document.getElementById('artist');
const progressBar = document.getElementById('progress');
const currentTimeEl = document.getElementById('current-time');
const durationEl = document.getElementById('duration');
const lyricsContainer = document.getElementById('lyrics');

let currentLyrics = [];
let currentLyricIndex = -1;
let lastUpdateTime = 0;  // 上次更新时间
let lastPosition = 0;    // 上次播放位置
let isPlaying = true;    // 播放状态
let updateInterval = null; // 本地更新定时器
let lastServerUpdate = Date.now(); // 上次服务器更新时间
let retryCount = 0;      // 重试次数
const MAX_RETRIES = 5;   // 最大重试次数

// 主题切换功能
const themes = ['theme-blue', 'theme-yellow', 'theme-green'];
let currentThemeIndex = 0;

document.querySelector('.theme-toggle').addEventListener('click', () => {
    // 移除当前主题
    document.body.classList.remove(themes[currentThemeIndex]);
    
    // 更新主题索引
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    
    // 添加新主题
    document.body.classList.add(themes[currentThemeIndex]);
    
    // 更新背景颜色
    const themeColors = {
        'theme-blue': {
            gradient: 'linear-gradient(135deg, #e0f7fa 0%, #b2ebf2 100%)',
            activeColor: '#0288d1'
        },
        'theme-yellow': {
            gradient: 'linear-gradient(135deg, #fffde7 0%, #fff9c4 100%)',
            activeColor: '#f57f17'
        },
        'theme-green': {
            gradient: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            activeColor: '#2e7d32'
        }
    };
    
    const currentTheme = themes[currentThemeIndex];
    document.body.style.background = themeColors[currentTheme].gradient;
    document.documentElement.style.setProperty('--active-lyric-color', themeColors[currentTheme].activeColor);
});

// Format time from milliseconds to MM:SS
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Update progress
function updateProgress(currentTime, duration) {
    // 使用 requestAnimationFrame 实现平滑更新
    requestAnimationFrame(() => {
        const progress = (currentTime / duration) * 100;
        progressBar.style.width = `${progress}%`;
        currentTimeEl.textContent = formatTime(currentTime);
        durationEl.textContent = formatTime(duration);
    });
}

// Start local time update
function startLocalUpdate() {
    if (updateInterval) return;
    
    const startTime = Date.now();
    const startPosition = lastPosition;
    
    function update() {
        if (!isPlaying) return;
        
        const now = Date.now();
        const elapsed = now - startTime;
        let currentTime = startPosition + elapsed;
        
        // 检查是否需要重新同步
        const timeSinceLastServerUpdate = now - lastServerUpdate;
        if (timeSinceLastServerUpdate > 5000) { // 如果超过5秒没有服务器更新
            stopLocalUpdate();
            return;
        }
        
        // 确保不超过总时长
        if (currentTime > lastUpdateTime) {
            currentTime = lastUpdateTime;
        }
        
        // 每秒更新一次时间显示
        const currentSeconds = Math.floor(currentTime / 1000);
        const lastSeconds = Math.floor(lastPosition / 1000);
        if (currentSeconds !== lastSeconds) {
            updateProgress(currentTime, lastUpdateTime);
        }
        
        // 更新歌词显示
        updateLyrics(currentTime);
        
        // 使用 requestAnimationFrame 实现平滑更新
        updateInterval = requestAnimationFrame(update);
    }
    
    update();
}

// Stop local time update
function stopLocalUpdate() {
    if (updateInterval) {
        cancelAnimationFrame(updateInterval);
        updateInterval = null;
    }
}

// Parse lyrics from QQ Music format
function parseLyrics(lyricsStr) {
    if (!lyricsStr) return { info: { title: '', artist: '', album: '' }, lyrics: [] };
    
    const lines = lyricsStr.split('\n');
    const parsedLyrics = [];
    let songInfo = {
        title: '',
        artist: '',
        album: ''
    };
    
    lines.forEach(line => {
        if (line.startsWith('[ti:')) {
            songInfo.title = line.slice(4, -1).trim();
        } else if (line.startsWith('[ar:')) {
            songInfo.artist = line.slice(4, -1).trim();
        } else if (line.startsWith('[al:')) {
            songInfo.album = line.slice(4, -1).trim();
        }
        
        // 修改时间戳解析逻辑
        const match = line.match(/\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/);
        if (match) {
            const [, min, sec, ms, text] = match;
            // 确保毫秒是3位数
            const msStr = ms.padEnd(3, '0');
            const time = (parseInt(min) * 60 + parseInt(sec)) * 1000 + parseInt(msStr);
            const trimmedText = text.trim();
            if (trimmedText) {
                parsedLyrics.push({ time, text: trimmedText });
            }
        }
    });
    
    // 按时间排序
    parsedLyrics.sort((a, b) => a.time - b.time);
    
    console.log('解析后的歌词:', parsedLyrics);
    return {
        info: songInfo,
        lyrics: parsedLyrics
    };
}

// Update lyrics display
function updateLyrics(currentTime) {
    if (!currentLyrics.length) return;
    
    // 查找当前应该显示的歌词
    let newIndex = currentLyrics.findIndex(lyric => lyric.time > currentTime);
    if (newIndex === -1) {
        newIndex = currentLyrics.length;
    }
    newIndex = Math.max(0, newIndex - 1);
    
    // 如果歌词没有变化，不更新
    if (newIndex === currentLyricIndex) return;
    
    currentLyricIndex = newIndex;
    
    // 使用 requestAnimationFrame 实现平滑更新
    requestAnimationFrame(() => {
        // 更新所有歌词显示
        lyricsContainer.innerHTML = currentLyrics.map((lyric, index) => `
            <li class="${index === currentLyricIndex ? 'active' : ''}">${lyric.text}</li>
        `).join('');
        
        // 获取容器和歌词行的高度
        const containerHeight = document.querySelector('.right-section').clientHeight;
        const liHeight = lyricsContainer.children[0].clientHeight;
        
        // 计算当前歌词的偏移量，使其居中
        let offset = liHeight * currentLyricIndex - containerHeight / 2 + liHeight / 2;
        
        // 限制偏移量范围
        const minOffset = 0;
        const maxOffset = lyricsContainer.scrollHeight - containerHeight;
        offset = Math.max(minOffset, Math.min(offset, maxOffset));
        
        // 使用 transform 实现滚动
        lyricsContainer.style.transform = `translateY(-${offset}px)`;
    });
}

// 重置歌词滚动位置
function resetLyricsScroll() {
    requestAnimationFrame(() => {
        lyricsContainer.style.transform = 'translateY(0)';
        currentLyricIndex = -1;
    });
}

// 生成浅色背景
function generateLightColor() {
    // 生成浅色系的 HSL 颜色
    const hue = Math.floor(Math.random() * 360); // 随机色相
    const saturation = Math.floor(Math.random() * 20) + 10; // 10-30% 的饱和度
    const lightness = Math.floor(Math.random() * 20) + 80; // 80-100% 的亮度
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// 生成对应的深色
function generateDarkColor(lightColor) {
    // 从 HSL 字符串中提取色相
    const hue = lightColor.match(/hsl\((\d+)/)[1];
    // 返回相同色相的深色
    return `hsl(${hue}, 30%, 20%)`;
}

// 更新背景和歌词颜色
function updateColors(lightColor) {
    const darkColor = generateDarkColor(lightColor);
    document.body.style.background = `linear-gradient(135deg, ${lightColor} 0%, ${lightColor} 100%)`;
    
    // 更新 CSS 变量
    document.documentElement.style.setProperty('--active-lyric-color', darkColor);
}

// Handle WebSocket events
socket.on('connect', () => {
    console.log('Connected to server');
    retryCount = 0; // 重置重试次数
    socket.emit('startPolling');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
    retryCount++;
    if (retryCount >= MAX_RETRIES) {
        console.log('达到最大重试次数，停止重试');
        socket.disconnect();
        // 可以在这里添加用户提示
        alert('无法连接到服务器，请检查服务器是否运行');
    }
});

socket.on('songUpdate', (data) => {
    // 检查是否是新歌曲
    const isNewSong = data.songInfo && data.songInfo.name !== songTitle.textContent;
    
    // Update song info
    if (data.songInfo) {
        songTitle.textContent = data.songInfo.name;
        artistName.textContent = data.songInfo.artistName;
        coverImg.src = data.songInfo.cover || 'default-cover.jpg';
        
        // 如果是新歌曲，更新背景颜色
        if (isNewSong) {
            const newLightColor = generateLightColor();
            updateColors(newLightColor);
        }
    }
    
    // Update progress
    lastUpdateTime = data.duration;
    lastPosition = data.currentTime;
    isPlaying = data.status === 1;
    lastServerUpdate = Date.now();
    
    // 控制专辑封面旋转
    const albumArt = document.querySelector('.album-art');
    if (isPlaying) {
        albumArt.classList.add('playing');
    } else {
        albumArt.classList.remove('playing');
    }
    
    updateProgress(data.currentTime, data.duration);
    
    // Update lyrics
    if (data.lyrics) {
        console.log('收到的原始歌词:', data.lyrics);
        const parsedLyrics = parseLyrics(data.lyrics);
        currentLyrics = parsedLyrics.lyrics;
        
        // If there's song information, update title and artist
        if (parsedLyrics.info.title && !data.songInfo) {
            songTitle.textContent = parsedLyrics.info.title;
        }
        if (parsedLyrics.info.artist && !data.songInfo) {
            artistName.textContent = parsedLyrics.info.artist;
        }
        
        // 如果是新歌曲，重置歌词滚动位置
        if (isNewSong) {
            resetLyricsScroll();
        }
        
        updateLyrics(data.currentTime);
    }
    
    // Start local update
    if (isPlaying) {
        startLocalUpdate();
    } else {
        stopLocalUpdate();
    }
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    stopLocalUpdate();
});

// Handle errors
socket.on('error', (error) => {
    console.error('Socket error:', error);
    stopLocalUpdate();
    retryCount++;
    if (retryCount >= MAX_RETRIES) {
        console.log('达到最大重试次数，停止重试');
        socket.disconnect();
        // 可以在这里添加用户提示
        alert('连接服务器失败，请检查服务器是否运行');
    }
});

// 播放控制函数
async function controlPlayer(action) {
    try {
        const response = await fetch('/api/player/control', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ action })
        });
        
        if (!response.ok) {
            throw new Error('播放控制失败');
        }
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('播放控制失败:', error);
    }
}

// 播放控制按钮事件监听器
document.addEventListener('DOMContentLoaded', () => {
    // 播放/暂停按钮
    const playPauseBtn = document.querySelector('.play-pause');
    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', () => {
            if (isPlaying) {
                controlPlayer('pause');
                isPlaying=false;
            }else {
                controlPlayer('play');
                isPlaying=true;
            }
        });
    }

    // 上一首按钮
    const prevBtn = document.querySelector('.prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            controlPlayer('prev');
        });
    }

    // 下一首按钮
    const nextBtn = document.querySelector('.next');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            controlPlayer('next');
        });
    }

    // 专辑封面点击事件
    const albumArt = document.querySelector('.album-art');
    if (albumArt) {
        albumArt.addEventListener('click', () => {
            const action = isPlaying ? 'pause' : 'play';
            controlPlayer(action);
        });
    }
});

// 搜索功能
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
            try {
                const response = await fetch('/api/search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ query })
                });
                
                const data = await response.json();
                if (data.code === 0 && data.data.songList) {
                    // 显示搜索结果
                    searchResults.innerHTML = data.data.songList.map(song => `
                        <div class="search-result-item" 
                            data-audio-id="${song.playUrl}"
                            data-song-id="${song.originSongID}"
                            data-duration="${song.duration}">
                            ${song.name} - ${song.artist.name}
                        </div>
                    `).join('');
                    searchResults.classList.add('active');
                }
            } catch (error) {
                console.error('搜索失败:', error);
            }
        }
    }
});

// 点击搜索结果
searchResults.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item');
    if (item) {
        const audio_id = item.dataset.audioId;
        const id = item.dataset.songId;
        const duration_in_ms = parseInt(item.dataset.duration);
        console.log('播放歌曲:', { audio_id, id, duration_in_ms });
        
        if (!audio_id || !id) {
            console.error('无法获取歌曲ID:', { audio_id, id });
            return;
        }
        
        // 发送播放请求到服务器
        socket.emit('playSong', { 
            audio_id,
            id,
            duration_in_ms
        });
        
        // 隐藏搜索结果
        searchResults.classList.remove('active');
        // 清空搜索框
        searchInput.value = '';
    }
});

// 点击其他地方关闭搜索结果
document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
        searchResults.classList.remove('active');
    }
});

// 音量控制
const volumeControl = document.querySelector('.volume-control');
const volumeIcon = document.querySelector('.volume-icon');
const volumeRange = document.querySelector('.volume-range');
let isVolumeSliderVisible = false;

volumeIcon.addEventListener('click', () => {
    isVolumeSliderVisible = !isVolumeSliderVisible;
    const volumeSlider = document.querySelector('.volume-slider');
    volumeSlider.style.width = isVolumeSliderVisible ? '100px' : '0';
});

let volumeTimeout;
volumeRange.addEventListener('input', (e) => {
    const volume = e.target.value;
    
    // 防抖处理
    clearTimeout(volumeTimeout);
    volumeTimeout = setTimeout(() => {
        fetch('/api/player/volume', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ volume: parseInt(volume) })
        });
    }, 200);
}); 