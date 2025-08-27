const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3333;

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'menu.html'));
});

app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

const ROWS = 6;
const COLS = 7;
let waitingPlayer = null;
const gameRooms = {};

const createNewGameState = () => ({
    board: Array(ROWS).fill(null).map(() => Array(COLS).fill(0)),
    currentPlayer: 1,
    gameOver: false,
    winner: null,
    isDraw: false,
});

io.on('connection', (socket) => {
    console.log('Um jogador se conectou:', socket.id);

    if (waitingPlayer) {
        const roomName = `room_${socket.id}_${waitingPlayer.id}`;
        waitingPlayer.join(roomName);
        socket.join(roomName);

        gameRooms[roomName] = {
            ...createNewGameState(),
            players: { 1: waitingPlayer.id, 2: socket.id }
        };

        io.to(roomName).emit('gameStart', {
            room: roomName,
            players: gameRooms[roomName].players,
            initialState: gameRooms[roomName]
        });

        console.log(`Jogo começou na sala ${roomName} com ${waitingPlayer.id} e ${socket.id}`);
        waitingPlayer = null;
    } else {
        waitingPlayer = socket;
        socket.emit('waitingForPlayer');
        console.log('Jogador em espera:', socket.id);
    }

    socket.on('makeMove', ({ col, room }) => {
        const gameState = gameRooms[room];
        if (!gameState || gameState.gameOver) return;

        const playerNumber = Object.keys(gameState.players).find(key => gameState.players[key] === socket.id);
        if (parseInt(playerNumber) !== gameState.currentPlayer) {
            return;
        }

        let rowIndex = -1;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (gameState.board[r][col] === 0) {
                rowIndex = r;
                break;
            }
        }

        if (rowIndex !== -1) {
            gameState.board[rowIndex][col] = gameState.currentPlayer;
            const winner = checkWin(gameState.board, gameState.currentPlayer);
            const isDraw = !winner && checkDraw(gameState.board);

            if (winner) {
                gameState.gameOver = true;
                gameState.winner = gameState.currentPlayer;
            } else if (isDraw) {
                gameState.gameOver = true;
                gameState.isDraw = true;
            } else {
                gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
            }
            io.to(room).emit('updateGame', gameState);
        }
    });

    socket.on('disconnect', () => {
        console.log('Um jogador se desconectou:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }
    });
});

function checkWin(board, player) {
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            if (board[r][c] === player && board[r][c+1] === player && board[r][c+2] === player && board[r][c+3] === player) return true;
        }
    }
    // Vertical
    for (let r = 0; r <= ROWS - 4; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === player && board[r+1][c] === player && board[r+2][c] === player && board[r+3][c] === player) return true;
        }
    }
    // Diagonal (descendo)
    for (let r = 0; r <= ROWS - 4; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            if (board[r][c] === player && board[r+1][c+1] === player && board[r+2][c+2] === player && board[r+3][c+3] === player) return true;
        }
    }
    // Diagonal (subindo)
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            if (board[r][c] === player && board[r-1][c+1] === player && board[r-2][c+2] === player && board[r-3][c+3] === player) return true;
        }
    }
    return false;
}

function checkDraw(board) {
    return board[0].every(cell => cell !== 0);
}

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});