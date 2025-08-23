const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 存储在线用户，这次我们需要双向查找
const usersBySocketId = {}; // 通过 socket.id 找 username
const socketsByUsername = {}; // 通过 username 找 socket.id

// 提供前端静态文件
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 监听新用户加入
  socket.on('new user', (username) => {
    usersBySocketId[socket.id] = username;
    socketsByUsername[username] = socket.id;
    
    io.emit('user joined', username);
    io.emit('update user list', Object.values(usersBySocketId));
  });

  // 监听公共聊天消息
  socket.on('chat message', (msg) => {
    const username = usersBySocketId[socket.id] || 'Anonymous';
    io.emit('chat message', { username, msg });
  });

  // 【新增】监听私聊消息
  socket.on('private message', (data) => {
    const fromUser = usersBySocketId[socket.id];
    const targetSocketId = socketsByUsername[data.to];

    if (fromUser && targetSocketId) {
      // 发送给目标用户
      io.to(targetSocketId).emit('private message', {
        from: fromUser,
        to: data.to,
        msg: data.msg
      });
      // 也发送给自己，让自己能看到已发送的私信
      io.to(socket.id).emit('private message', {
        from: fromUser,
        to: data.to,
        msg: data.msg
      });
    }
  });

  // 监听用户断开连接
  socket.on('disconnect', () => {
    const username = usersBySocketId[socket.id];
    if (username) {
      console.log('User disconnected:', username);
      delete usersBySocketId[socket.id];
      delete socketsByUsername[username];
      
      io.emit('user left', username);
      io.emit('update user list', Object.values(usersBySocketId));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
