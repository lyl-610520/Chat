const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
// 【新增】从环境变量读取房间密码，如果没有则使用 '123' 作为默认密码
const ROOM_PASSWORD = process.env.ROOM_PASSWORD || '123';

// 提供前端静态文件
app.use(express.static('public'));

// 获取当前所有在线用户的列表
function getOnlineUsers() {
    const users = [];
    // io.sockets.sockets 是一个 Map，存储了所有连接的 socket
    for (const [id, socket] of io.sockets.sockets) {
        if (socket.username) {
            users.push(socket.username);
        }
    }
    return users;
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // 【已重构】监听新用户加入，增加密码验证和全新的用户状态管理
  socket.on('new user', (data) => {
    // 验证密码
    if (data.password !== ROOM_PASSWORD) {
        socket.emit('login failed', '房间密码错误！');
        return;
    }
    // 检查用户名是否已经被使用
    if (getOnlineUsers().includes(data.username)) {
      socket.emit('nickname taken');
      return;
    }

    // 验证通过，将用户名直接附加到 socket 对象上
    socket.username = data.username;

    socket.emit('login success');
    socket.broadcast.emit('user joined', socket.username);
    io.emit('update user list', getOnlineUsers());
  });

  // 【已重构】监听公共聊天消息，从 socket 对象获取用户名
  socket.on('chat message', (msg) => {
    if (socket.username) {
        io.emit('chat message', { username: socket.username, msg });
    }
  });

  // 【已重构】监听私聊消息，通过遍历 socket 查找目标用户
  socket.on('private message', (data) => {
    if (!socket.username) return;

    let targetSocket = null;
    for (const [id, sk] of io.sockets.sockets) {
        if (sk.username === data.to) {
            targetSocket = sk;
            break;
        }
    }

    if (targetSocket) {
      const messageData = {
          from: socket.username,
          to: data.to,
          msg: data.msg
      };
      targetSocket.emit('private message', messageData);
      socket.emit('private message', messageData); // 也发给自己
    }
  });

  // 【已重构】监听用户断开连接，从 socket 对象获取用户名
  socket.on('disconnect', () => {
    if (socket.username) {
      console.log('User disconnected:', socket.username);
      io.emit('user left', socket.username);
      io.emit('update user list', getOnlineUsers());
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}. Room password is: ${ROOM_PASSWORD}`);
});
