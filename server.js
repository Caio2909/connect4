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
    currentPlayer: Math.random() < 0.5 ? 1 : 2,
    gameOver: false,
    winner: null,
    isDraw: false,
    winningLine: [], // Adicionado para armazenar as peças vencedoras
});

io.on('connection', (socket) => {
    console.log('Um jogador se conectou:', socket.id);

    if (waitingPlayer) {
        const roomName = `room_${socket.id}_${waitingPlayer.id}`;
        waitingPlayer.join(roomName);
        socket.join(roomName);

        gameRooms[roomName] = {
            ...createNewGameState(),
            players: { 1: waitingPlayer.id, 2: socket.id },
            playAgain: { 1: false, 2: false }
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
            const winInfo = checkWin(gameState.board, gameState.currentPlayer); // Retorna informações da vitória
            const isDraw = !winInfo.isWin && checkDraw(gameState.board);

            if (winInfo.isWin) {
                gameState.gameOver = true;
                gameState.winner = gameState.currentPlayer;
                gameState.winningLine = winInfo.line; // Armazena a linha vencedora
            } else if (isDraw) {
                gameState.gameOver = true;
                gameState.isDraw = true;
            } else {
                gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
            }
            io.to(room).emit('updateGame', gameState);
        }
    });
    socket.on('playAgain', ({ room }) => {
        const gameState = gameRooms[room];
        if (!gameState) return;

        const playerNumber = Object.keys(gameState.players).find(key => gameState.players[key] === socket.id);
        gameState.playAgain[playerNumber] = true;

        if (Object.values(gameState.playAgain).every(v => v)) {
            const newGameState = {
                ...createNewGameState(),
                players: gameState.players,
                playAgain: { 1: false, 2: false }
            };
            gameRooms[room] = newGameState;
            io.to(room).emit('restartGame', newGameState);
        }
    });

    socket.on('disconnect', () => {
        console.log('Um jogador se desconectou:', socket.id);
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }

        for (const room in gameRooms) {
            const gameState = gameRooms[room];
            const playerNumber = Object.keys(gameState.players).find(key => gameState.players[key] === socket.id);
            if (playerNumber) {
                socket.to(room).emit('playerLeft');
                delete gameRooms[room];
                break;
            }
        }
    });
});

function checkWin(board, player) {
    // Horizontal
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            if (board[r][c] === player && board[r][c+1] === player && board[r][c+2] === player && board[r][c+3] === player) {
                return { isWin: true, line: [{row: r, col: c}, {row: r, col: c+1}, {row: r, col: c+2}, {row: r, col: c+3}] };
            }
        }
    }
    // Vertical
    for (let r = 0; r <= ROWS - 4; r++) {
        for (let c = 0; c < COLS; c++) {
            if (board[r][c] === player && board[r+1][c] === player && board[r+2][c] === player && board[r+3][c] === player) {
                return { isWin: true, line: [{row: r, col: c}, {row: r+1, col: c}, {row: r+2, col: c}, {row: r+3, col: c}] };
            }
        }
    }
    // Diagonal (descendo)
    for (let r = 0; r <= ROWS - 4; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            if (board[r][c] === player && board[r+1][c+1] === player && board[r+2][c+2] === player && board[r+3][c+3] === player) {
                return { isWin: true, line: [{row: r, col: c}, {row: r+1, col: c+1}, {row: r+2, col: c+2}, {row: r+3, col: c+3}] };
            }
        }
    }
    // Diagonal (subindo)
    for (let r = 3; r < ROWS; r++) {
        for (let c = 0; c <= COLS - 4; c++) {
            if (board[r][c] === player && board[r-1][c+1] === player && board[r-2][c+2] === player && board[r-3][c+3] === player) {
                return { isWin: true, line: [{row: r, col: c}, {row: r-1, col: c+1}, {row: r-2, col: c+2}, {row: r-3, col: c+3}] };
            }
        }
    }
    return { isWin: false, line: [] };
}

function checkDraw(board) {
    return board[0].every(cell => cell !== 0);
}

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});