# 小爱音箱歌词显示

一个实时显示小爱音箱播放歌曲歌词的网页

## 功能特点

- 实时显示当前播放歌曲信息
- 同步显示歌词
- 显示播放进度
- 自动滚动歌词

## 安装

1. 确保已安装 Node.js (推荐 v14 或更高版本)
2. 克隆此仓库
3. 安装依赖：
```bash
npm install
```

## 配置

在 `server.js` 文件中，需要配置以下信息：

- `DEVICE_ID`: 你的小爱音箱设备ID
- `USER_ID`: 你的小米账号ID
- `COOKIE`: 你的小米账号Cookie

## 运行

1. 启动服务器：
```bash
npm start
```

2. 在浏览器中访问：
```
http://localhost:3000
```

## 开发

使用以下命令启动开发模式（支持热重载）：
```bash
npm run dev
```

## 注意事项

- 请确保你的小爱音箱已连接到网络
- Cookie 可能会过期，需要定期更新
- 建议使用现代浏览器访问以获得最佳体验

## 技术栈

- Node.js
- Express
- Socket.IO
- HTML5
- CSS3
- JavaScript (ES6+) 
