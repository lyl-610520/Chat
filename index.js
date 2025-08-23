const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 存储在线用户
const users = {};

// 提供前端静态文件
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 监听新用户加入
  socket.on('new user', (username) => {
    users[socket.id] = username;
    // 广播新用户加入的消息
    io.emit('user joined', username);
    // 更新所有客户端的在线用户列表
    io.emit('update user list', Object.values(users));
  });

  // 监听聊天消息
  socket.on('chat message', (msg) => {
    const username = users[socket.id] || 'Anonymous';
    // 广播消息给所有客户端
    io.emit('chat message', { username, msg });
  });

  // 监听用户断开连接
  socket.on('disconnect', () => {
    const username = users[socket.id];
    if (username) {
      console.log('User disconnected:', username);
      delete users[socket.id];
      // 广播用户离开的消息
      io.emit('user left', username);
      // 更新所有客户端的在线用户列表
      io.emit('update user list', Object.values(users));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
