const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameState = {
    status: 'waiting', // waiting, countdown, racing, finished
    text: 'Học tập là hạt giống của kiến thức, kiến thức là hạt giống của hạnh phúc.',
    duration: 60,
    endTime: null,
    students: {}
};

let raceTimer = null;
let countdownTimer = null;

io.on('connection', (socket) => {
    console.log(`Người dùng kết nối: ${socket.id}`);
    socket.emit('update-state', gameState);

    socket.on('join-game', (data) => {
        gameState.students[socket.id] = {
            id: socket.id,
            name: data.name,
            className: data.className,
            avatar: data.avatar || '🦊',
            level: data.level || 1,
            progress: 0,
            wpm: 0,
            accuracy: 100,
            finished: false
        };
        io.emit('update-state', gameState);
    });

    socket.on('typing-progress', (data) => {
        if (gameState.students[socket.id] && gameState.status === 'racing') {
            gameState.students[socket.id].progress = data.progress;
            gameState.students[socket.id].wpm = data.wpm;
            gameState.students[socket.id].accuracy = data.accuracy;
            
            if (data.progress >= 100 && !gameState.students[socket.id].finished) {
                gameState.students[socket.id].finished = true;
            }
            io.emit('update-state', gameState);
        }
    });

    // Bắt đầu thi: Đếm ngược 3 giây đồng bộ chuẩn server
    socket.on('start-race', (config) => {
        gameState.text = config.text || gameState.text;
        gameState.duration = config.duration || 60;
        
        for (let id in gameState.students) {
            gameState.students[id].progress = 0;
            gameState.students[id].wpm = 0;
            gameState.students[id].accuracy = 100;
            gameState.students[id].finished = false;
        }

        gameState.status = 'countdown';
        io.emit('update-state', gameState);

        if (raceTimer) clearTimeout(raceTimer);
        if (countdownTimer) clearTimeout(countdownTimer);

        // Sau 3 giây chuyển sang trạng thái đua chính thức
        countdownTimer = setTimeout(() => {
            gameState.status = 'racing';
            gameState.endTime = Date.now() + (gameState.duration * 1000);
            io.emit('update-state', gameState);

            // Tự động kết thúc khi hết giờ
            raceTimer = setTimeout(() => {
                if (gameState.status === 'racing') {
                    gameState.status = 'finished';
                    io.emit('update-state', gameState);
                }
            }, gameState.duration * 1000);
        }, 3000);
    });

    socket.on('finish-race', () => {
        if (raceTimer) clearTimeout(raceTimer);
        if (countdownTimer) clearTimeout(countdownTimer);
        gameState.status = 'finished';
        io.emit('update-state', gameState);
    });

    // Giáo viên bấm reset toàn bộ phòng về sảnh chờ cho 40 máy (giữ nguyên level)
    socket.on('teacher-reset-room', () => {
        if (raceTimer) clearTimeout(raceTimer);
        if (countdownTimer) clearTimeout(countdownTimer);
        gameState.status = 'waiting';
        gameState.endTime = null;
        for (let id in gameState.students) {
            gameState.students[id].progress = 0;
            gameState.students[id].wpm = 0;
            gameState.students[id].accuracy = 100;
            gameState.students[id].finished = false;
            gameState.students[id].level = gameState.students[id].level || 1;
        }
        io.emit('update-state', gameState);
    });

    // Giáo viên xóa/đá học sinh vi phạm quy tắc đặt tên
    socket.on('kick-student', (studentSocketId) => {
        io.to(studentSocketId).emit('kicked-out', 'Bạn đã bị giáo viên xóa khỏi phòng vì tên không đúng quy tắc!');
        delete gameState.students[studentSocketId];
        io.emit('update-state', gameState);
    });

    socket.on('leave-room', () => {
        delete gameState.students[socket.id];
        io.emit('update-state', gameState);
    });

    socket.on('disconnect', () => {
        delete gameState.students[socket.id];
        io.emit('update-state', gameState);
    });
});

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Đấu trường đang chạy tại: http://localhost:${PORT}`);
});