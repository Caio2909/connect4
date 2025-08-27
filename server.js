// Importa as bibliotecas necessárias
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

// Configuração do servidor
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3333; // O host pode definir a porta

// Serve os arquivos estáticos da pasta 'public'
app.use(express.static('public'));

// --- Lógica do Jogo no Servidor ---
const ROWS = 6;
const COLS = 7;
let waitingPlayer = null;
const gameRooms = {};

// Função para criar um novo estado de jogo
const createNewGameState = () => ({
    board: Array(ROWS).fill(null).map(() => Array(COLS).fill(0)),
    currentPlayer: 1, // Jogador 1 sempre começa
    gameOver: false,
    winner: null,
    isDraw: false,
});

// Lida com as conexões dos jogadores
io.on('connection', (socket) => {
    console.log('Um jogador se conectou:', socket.id);

    if (waitingPlayer) {
        // Se já existe um jogador esperando, cria uma sala e começa o jogo
        const roomName = `room_${socket.id}_${waitingPlayer.id}`;

        // Adiciona ambos os jogadores à sala
        waitingPlayer.join(roomName);
        socket.join(roomName);

        // Armazena o estado do jogo para esta sala
        gameRooms[roomName] = {
            ...createNewGameState(),
            players: { 1: waitingPlayer.id, 2: socket.id }
        };

        // Informa aos jogadores que o jogo começou
        io.to(roomName).emit('gameStart', {
            room: roomName,
            players: gameRooms[roomName].players,
            initialState: gameRooms[roomName]
        });

        console.log(`Jogo começou na sala ${roomName} com ${waitingPlayer.id} e ${socket.id}`);
        waitingPlayer = null; // Reseta o jogador em espera
    } else {
        // Se não há ninguém esperando, este jogador se torna o 'waitingPlayer'
        waitingPlayer = socket;
        socket.emit('waitingForPlayer');
        console.log('Jogador em espera:', socket.id);
    }

    // Lida com a jogada de um jogador
    socket.on('makeMove', ({ col, room }) => {
        const gameState = gameRooms[room];
        if (!gameState || gameState.gameOver) return;

        // Verifica se é a vez do jogador que fez a jogada
        const playerNumber = Object.keys(gameState.players).find(key => gameState.players[key] === socket.id);
        if (parseInt(playerNumber) !== gameState.currentPlayer) {
            return; // Não é a vez deste jogador
        }

        // Encontra a linha disponível na coluna
        let rowIndex = -1;
        for (let r = ROWS - 1; r >= 0; r--) {
            if (gameState.board[r][col] === 0) {
                rowIndex = r;
                break;
            }
        }

        if (rowIndex !== -1) {
            // Atualiza o tabuleiro
            gameState.board[rowIndex][col] = gameState.currentPlayer;

            // Verifica vitória ou empate
            const winner = checkWin(gameState.board, gameState.currentPlayer);
            const isDraw = !winner && checkDraw(gameState.board);

            if (winner) {
                gameState.gameOver = true;
                gameState.winner = gameState.currentPlayer;
            } else if (isDraw) {
                gameState.gameOver = true;
                gameState.isDraw = true;
            } else {
                // Passa a vez para o próximo jogador
                gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
            }

            // Envia o estado atualizado para todos na sala
            io.to(room).emit('updateGame', gameState);
        }
    });

    // Lida com a desconexão de um jogador
    socket.on('disconnect', () => {
        console.log('Um jogador se desconectou:', socket.id);
        // Se o jogador que desconectou estava esperando, limpa a espera
        if (waitingPlayer && waitingPlayer.id === socket.id) {
            waitingPlayer = null;
        }

        // Adicional: notificar o outro jogador que o oponente desconectou
        // (Isso pode ser implementado depois)
    });
});


// --- Funções de Lógica do Jogo (movidas para o servidor) ---
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


// Inicia o servidor
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
