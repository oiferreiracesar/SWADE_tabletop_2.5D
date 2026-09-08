const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;
const blockHeight = 48;

let hoverCol = -1;
let hoverRow = -1;
let hoverSide = 'none'; // Novo: sabe se está na esquerda ou direita do losango
let currentBrush = 1;
let isPainting = false;

const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = [];
    for (let j = 0; j < 10; j++) {
        map[i][j] = { floor: 0, wall: 0 }; 
    }
}

function defineTilePath(row, col) {
    const x = (col - row) * (tileWidth / 2);
    const y = (col + row) * (tileHeight / 2);
    const h = map[row][col].wall > 0 ? blockHeight : 0;

    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2 - h);
    ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
    ctx.lineTo(x, y + tileHeight);
    ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
    ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2 - h);
    ctx.closePath();
}

function drawPrism(x0, y0, x1, y1, x2, y2, x3, y3, h) {
    ctx.beginPath(); ctx.moveTo(x0, y0 - h); ctx.lineTo(x1, y1 - h); ctx.lineTo(x2, y2 - h); ctx.lineTo(x3, y3 - h); ctx.closePath();
    ctx.fillStyle = '#e57373'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x3, y3 - h); ctx.lineTo(x2, y2 - h); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath();
    ctx.fillStyle = '#b71c1c'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x2, y2 - h); ctx.lineTo(x1, y1 - h); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.closePath();
    ctx.fillStyle = '#f44336'; ctx.fill(); ctx.stroke();
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let brushName = 'Borracha';
    if (currentBrush === 1) brushName = 'Piso (Verde)';
    if (currentBrush === 2) brushName = 'Parede Inteligente';
    ctx.fillText('Pincel atual: ' + brushName, 20, 30);
    ctx.fillText('Tecle 1 (Piso), 2 (Parede Inteligente) ou 0 (Borracha) | Aponte para a borda!', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const x = (col - row) * (tileWidth / 2);
            const y = (col + row) * (tileHeight / 2);

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
            ctx.lineTo(x, y + tileHeight);
            ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
            ctx.closePath();
            
            if (map[row][col].floor === 1) {
                ctx.fillStyle = 'rgba(100, 200, 100, 0.6)';
                ctx.fill();
            }
            ctx.strokeStyle = '#555';
            ctx.stroke();

            if (map[row][col].wall === 1 || map[row][col].wall === 3) {
                drawPrism(x, y, x + 8, y + 4, x - 24, y + 20, x - 32, y + 16, blockHeight);
            }
            if (map[row][col].wall === 2 || map[row][col].wall === 3) {
                drawPrism(x, y, x + 32, y + 16, x + 24, y + 20, x - 8, y + 4, blockHeight);
            }

            // Efeito visual com suporte para o "Fantasma" da parede
            if (row === hoverRow && col === hoverCol) {
                defineTilePath(row, col);
                ctx.fillStyle = (currentBrush === 1) ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.25)';
                ctx.fill();

                if (currentBrush === 2) {
                    ctx.globalAlpha = 0.5; // Deixa transparente
                    if (hoverSide === 'left') {
                        drawPrism(x, y, x + 8, y + 4, x - 24, y + 20, x - 32, y + 16, blockHeight);
                    } else if (hoverSide === 'right') {
                        drawPrism(x, y, x + 32, y + 16, x + 24, y + 20, x - 8, y + 4, blockHeight);
                    }
                    ctx.globalAlpha = 1.0; // Restaura opacidade para o resto do jogo
                }
            }
        }
    }
    ctx.restore();
}

function applyBrush() {
    if (hoverRow >= 0 && hoverRow < 10 && hoverCol >= 0 && hoverCol < 10) {
        if (currentBrush === 0) {
            map[hoverRow][hoverCol].floor = 0;
            map[hoverRow][hoverCol].wall = 0;
        } else if (currentBrush === 1) {
            map[hoverRow][hoverCol].floor = 1;
        } else if (currentBrush === 2) {
            // Aplica a parede baseado na metade em que o mouse está
            if (hoverSide === 'left') {
                if (map[hoverRow][hoverCol].wall === 2) map[hoverRow][hoverCol].wall = 3;
                else if (map[hoverRow][hoverCol].wall !== 3) map[hoverRow][hoverCol].wall = 1;
            } else if (hoverSide === 'right') {
                if (map[hoverRow][hoverCol].wall === 1) map[hoverRow][hoverCol].wall = 3;
                else if (map[hoverRow][hoverCol].wall !== 3) map[hoverRow][hoverCol].wall = 2;
            }
        }
    }
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Converte a posição X do mouse para saber se está na esquerda ou direita do losango
    const adjX = mouseX - originX;

    hoverCol = -1;
    hoverRow = -1;
    hoverSide = 'none';

    ctx.save();
    ctx.translate(originX, originY);
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            defineTilePath(row, col);
            if (ctx.isPointInPath(mouseX, mouseY)) {
                hoverRow = row;
                hoverCol = col;
                
                // Calcula o centro do losango específico que está sob o mouse
                const tileCenterX = (col - row) * (tileWidth / 2);
                hoverSide = (adjX < tileCenterX) ? 'left' : 'right';
            }
        }
    }
    ctx.restore();

    if (isPainting) {
        applyBrush();
    }
    drawIsometricGrid();
});

canvas.addEventListener('mousedown', () => {
    isPainting = true;
    applyBrush();
    drawIsometricGrid();
});

canvas.addEventListener('mouseup', () => { isPainting = false; });
canvas.addEventListener('mouseleave', () => { isPainting = false; });

window.addEventListener('keydown', (e) => {
    if (e.key === '0') currentBrush = 0;
    if (e.key === '1') currentBrush = 1;
    if (e.key === '2') currentBrush = 2;
    drawIsometricGrid();
});

drawIsometricGrid();