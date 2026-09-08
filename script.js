const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;
const blockHeight = 32;

let hoverCol = -1;
let hoverRow = -1;
let currentBrush = 1;
let isPainting = false; // Novo: controla se o mouse está sendo arrastado

const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = new Array(10).fill(0);
}

function defineTilePath(row, col) {
    const x = (col - row) * (tileWidth / 2);
    const y = (col + row) * (tileHeight / 2);

    ctx.beginPath();
    if (map[row][col] === 2) {
        ctx.moveTo(x, y - blockHeight);
        ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2 - blockHeight);
        ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
        ctx.lineTo(x, y + tileHeight);
        ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
        ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2 - blockHeight);
    } else {
        ctx.moveTo(x, y);
        ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
        ctx.lineTo(x, y + tileHeight);
        ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
    }
    ctx.closePath();
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let brushName = 'Borracha';
    if (currentBrush === 1) brushName = 'Piso (Verde)';
    if (currentBrush === 2) brushName = 'Parede (Vermelho 3D)';
    ctx.fillText('Pincel atual: ' + brushName, 20, 30);
    ctx.fillText('Tecle 1 (Piso), 2 (Parede) ou 0 (Borracha) | Você pode clicar e arrastar!', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const x = (col - row) * (tileWidth / 2);
            const y = (col + row) * (tileHeight / 2);

            if (map[row][col] === 2) {
                ctx.beginPath();
                ctx.moveTo(x, y - blockHeight);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.lineTo(x, y + tileHeight - blockHeight);
                ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.closePath();
                ctx.fillStyle = '#e57373';
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x - tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.lineTo(x, y + tileHeight - blockHeight);
                ctx.lineTo(x, y + tileHeight);
                ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
                ctx.closePath();
                ctx.fillStyle = '#b71c1c';
                ctx.fill();
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(x, y + tileHeight - blockHeight);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
                ctx.lineTo(x, y + tileHeight);
                ctx.closePath();
                ctx.fillStyle = '#f44336';
                ctx.fill();
                ctx.stroke();

                if (row === hoverRow && col === hoverCol) {
                    defineTilePath(row, col);
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                    ctx.fill();
                }
            } else {
                defineTilePath(row, col);
                if (map[row][col] === 1) {
                    ctx.fillStyle = 'rgba(100, 200, 100, 0.6)';
                    ctx.fill();
                } else if (row === hoverRow && col === hoverCol) {
                    if (currentBrush === 1) ctx.fillStyle = 'rgba(100, 200, 100, 0.3)';
                    else if (currentBrush === 2) ctx.fillStyle = 'rgba(244, 67, 54, 0.3)';
                    else ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fill();
                }
                ctx.strokeStyle = '#555';
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    hoverCol = -1;
    hoverRow = -1;

    ctx.save();
    ctx.translate(originX, originY);
    
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            defineTilePath(row, col);
            if (ctx.isPointInPath(mouseX, mouseY)) {
                hoverRow = row;
                hoverCol = col;
            }
        }
    }
    ctx.restore();

    // Novo: Se estiver segurando o clique, pinta enquanto move
    if (isPainting && hoverRow >= 0 && hoverRow < 10 && hoverCol >= 0 && hoverCol < 10) {
        map[hoverRow][hoverCol] = currentBrush;
    }

    drawIsometricGrid();
});

// Atualizado: Liga a pintura ao abaixar o clique
canvas.addEventListener('mousedown', () => {
    isPainting = true;
    if (hoverRow >= 0 && hoverRow < 10 && hoverCol >= 0 && hoverCol < 10) {
        map[hoverRow][hoverCol] = currentBrush;
        drawIsometricGrid();
    }
});

// Novo: Desliga a pintura ao soltar o clique
canvas.addEventListener('mouseup', () => {
    isPainting = false;
});

// Novo: Desliga a pintura se o mouse sair da tela do jogo
canvas.addEventListener('mouseleave', () => {
    isPainting = false;
});

window.addEventListener('keydown', (e) => {
    if (e.key === '0') currentBrush = 0;
    if (e.key === '1') currentBrush = 1;
    if (e.key === '2') currentBrush = 2;
    drawIsometricGrid();
});

drawIsometricGrid();