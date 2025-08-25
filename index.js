const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { nanoid } = require('nanoid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// 用一个对象来存储所有房间的信息
const rooms = {};

// 提供前端静态文件
app.use(express.static('public'));

io.on('connection', (socket) => {
  
  // 创建新房间
  socket.on('create room', (data) => {
    const roomId = nanoid(6); 
    rooms[roomId] = {
      name: data.roomName,
      password: data.password,
      users: {},
      messages: [] // 【新增】用于存储消息，为点赞功能服务
    };
    socket.emit('room created', roomId);
  });

  // 检查房间是否存在和密码是否正确
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

  // 用户加入房间
  socket.on('join room', (data) => {
    const { roomId, username, password } = data;
    const room = rooms[roomId];

    if (!room) {
      return socket.emit('login failed', '房间不存在或已解散。');
    }
    if (room.password && room.password !== password) {
      return socket.emit('login failed', '房间密码错误！');
    }
    if (Object.values(room.users).includes(username)) {
      return socket.emit('nickname taken');
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;
    room.users[socket.id] = username;

    socket.emit('login success', room.name);

    socket.to(roomId).emit('user joined', username);
    io.to(roomId).emit('update user list', Object.values(room.users));
  });

  // 【已修改】处理聊天消息，为其增加唯一ID和点赞列表
  socket.on('chat message', (msg) => {
    if (socket.username && socket.roomId) {
        const room = rooms[socket.roomId];
        if (room) {
            const messageData = {
                id: nanoid(8), // 为消息生成一个8位数的唯一ID
                username: socket.username,
                msg,
                likes: [] // 初始化一个空数组来存放点赞的用户
            };
            
            if (!room.messages) room.messages = [];
            room.messages.push(messageData); // 将消息存入房间历史记录

            io.to(socket.roomId).emit('chat message', messageData); // 广播完整的消息对象
        }
    }
  });

  // 【新增】处理点赞/取消点赞逻辑
  socket.on('toggle like', (messageId) => {
    if (socket.username && socket.roomId) {
        const room = rooms[socket.roomId];
        // 确保房间和消息历史存在
        if (room && room.messages) {
            const message = room.messages.find(m => m.id === messageId);
            if (message) {
                const userIndex = message.likes.indexOf(socket.username);
                if (userIndex > -1) {
                    // 如果用户已点赞，则移除用户名，实现取消点赞
                    message.likes.splice(userIndex, 1);
                } else {
                    // 如果用户未点赞，则添加用户名
                    message.likes.push(socket.username);
                }
                // 向房间内所有客户端广播这条消息的点赞更新
                io.to(socket.roomId).emit('update likes', {
                    messageId: message.id,
                    likes: message.likes
                });
            }
        }
    }
  });

  // 处理私信
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

  // 处理断开连接
  socket.on('disconnect', () => {
    if (socket.username && socket.roomId) {
      const room = rooms[socket.roomId];
      if (room && room.users[socket.id]) { // 增加一个判断，防止出错
        delete room.users[socket.id];
        if (Object.keys(room.users).length === 0) {
          delete rooms[socket.roomId];
          console.log(`Room ${socket.roomId} is empty and has been closed.`);
        } else {
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
