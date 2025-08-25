const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 【已重构】用一个对象来存储所有房间的信息
const rooms = {};

// 提供前端静态文件
app.use(express.static('public'));

io.on('connection', (socket) => {
  
  // 【新增】创建新房间
  socket.on('create room', (data) => {
    const roomId = nanoid(6); // 生成一个6位的随机房间ID
    rooms[roomId] = {
      name: data.roomName,
      password: data.password, // 如果密码为空字符串，则为公开房间
      users: {}
    };
    socket.emit('room created', roomId);
  });

  // 【新增】检查房间是否存在和密码是否正确
  socket.on('join check', (roomId) => {
    if (rooms[roomId]) {
      socket.emit('room exists', {
        name: rooms[roomId].name,
        hasPassword: !!rooms[roomId].password
      });
    } else {
      socket.emit('room not found');
    }
  });

  // 【已重构】用户加入房间
  socket.on('join room', (data) => {
    const { roomId, username, password } = data;
    const room = rooms[roomId];

    // 各种验证
    if (!room) {
      return socket.emit('login failed', '房间不存在或已解散。');
    }
    if (room.password && room.password !== password) {
      return socket.emit('login failed', '房间密码错误！');
    }
    if (Object.values(room.users).includes(username)) {
      return socket.emit('nickname taken');
    }

    // 验证通过
    socket.join(roomId); // 让 socket 加入 Socket.IO 的房间
    socket.roomId = roomId; // 在 socket 上存储房间ID
    socket.username = username; // 在 socket 上存储用户名
    room.users[socket.id] = username; // 在我们的房间对象里也存一份

    socket.emit('login success', room.name);

    // 【关键】只向该房间广播消息
    socket.to(roomId).emit('user joined', username);
    io.to(roomId).emit('update user list', Object.values(room.users));
  });

  // 【已重构】处理聊天消息
  socket.on('chat message', (msg) => {
    if (socket.username && socket.roomId) {
      io.to(socket.roomId).emit('chat message', { username: socket.username, msg });
    }
  });

  // 【已重构】处理私信
  socket.on('private message', (data) => {
    const { to, msg } = data;
    const room = rooms[socket.roomId];
    if (!socket.username || !room) return;

    let targetSocketId = null;
    for (const id in room.users) {
      if (room.users[id] === to) {
        targetSocketId = id;
        break;
      }
    }
    
    if (targetSocketId) {
      const messageData = { from: socket.username, to, msg };
      io.to(targetSocketId).emit('private message', messageData);
      socket.emit('private message', messageData);
    }
  });

  // 【已重构】处理断开连接
  socket.on('disconnect', () => {
    if (socket.username && socket.roomId) {
      const room = rooms[socket.roomId];
      if (room) {
        delete room.users[socket.id];
        // 如果房间空了，可以选择解散房间
        if (Object.keys(room.users).length === 0) {
          delete rooms[socket.roomId];
          console.log(`Room ${socket.roomId} is empty and has been closed.`);
        } else {
          // 否则，更新房间内的用户列表
          io.to(socket.roomId).emit('user left', socket.username);
          io.to(socket.roomId).emit('update user list', Object.values(room.users));
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
