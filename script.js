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
let hoverQuadrant = 'none';
let currentBrush = 1;
let isPainting = false;

// NOVO: Histórico para o Desfazer (Ctrl+Z)
let mapHistory = [];

const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = [];
    for (let j = 0; j < 10; j++) {
        map[i][j] = { floor: 0, wall: 0 }; 
    }
}

// NOVO: Clona o mapa atual e salva na memória antes de qualquer modificação
function saveState() {
    const snapshot = [];
    for (let i = 0; i < 10; i++) {
        snapshot[i] = [];
        for (let j = 0; j < 10; j++) {
            snapshot[i][j] = { floor: map[i][j].floor, wall: map[i][j].wall };
        }
    }
    mapHistory.push(snapshot);
    if (mapHistory.length > 30) {
        mapHistory.shift(); // Mantém apenas os últimos 30 passos
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

function getWallCoords(row, col, type) {
    const x = (col - row) * (tileWidth / 2);
    const y = (col + row) * (tileHeight / 2);
    if (type === 'left') return [x - 2, y - 1, x + 2, y + 1, x - 30, y + 17, x - 34, y + 15];
    return [x + 2, y - 1, x + 34, y + 15, x + 30, y + 17, x - 2, y + 1]; 
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let brushName = currentBrush === 0 ? 'Borracha' : (currentBrush === 1 ? 'Piso' : 'Parede 4 Cantos (Fina)');
    ctx.fillText('Pincel atual: ' + brushName, 20, 30);
    ctx.fillText('Tecle 1 (Piso), 2 (Parede) ou 0 (Borracha) | Aperte Ctrl+Z para desfazer', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const x = (col - row) * (tileWidth / 2);
            const y = (col + row) * (tileHeight / 2);

            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
            ctx.lineTo(x, y + tileHeight); ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
            ctx.closePath();
            
            if (map[row][col].floor === 1) { ctx.fillStyle = 'rgba(100, 200, 100, 0.6)'; ctx.fill(); }
            ctx.strokeStyle = '#555'; ctx.stroke();

            if (map[row][col].wall === 1 || map[row][col].wall === 3) drawPrism(...getWallCoords(row, col, 'left'), blockHeight);
            if (map[row][col].wall === 2 || map[row][col].wall === 3) drawPrism(...getWallCoords(row, col, 'right'), blockHeight);

            if (row === hoverRow && col === hoverCol) {
                defineTilePath(row, col);
                ctx.fillStyle = (currentBrush === 1) ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)';
                ctx.fill();

                if (currentBrush === 2 || currentBrush === 0) {
                    ctx.globalAlpha = 0.5;
                    let targetRow = row, targetCol = col, side = 'left';
                    if (hoverQuadrant === 'NE') side = 'right';
                    else if (hoverQuadrant === 'SW') { targetRow = row + 1; side = 'left'; }
                    else if (hoverQuadrant === 'SE') { targetCol = col + 1; side = 'right'; }
                    
                    if (targetRow < 10 && targetCol < 10) {
                        drawPrism(...getWallCoords(targetRow, targetCol, side), blockHeight);
                    }
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }
    ctx.restore();
}

function applySmartWall() {
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    
    if (currentBrush === 1) { map[hoverRow][hoverCol].floor = 1; return; }
    
    let tRow = hoverRow, tCol = hoverCol, side = 'left';
    if (hoverQuadrant === 'NE') side = 'right';
    else if (hoverQuadrant === 'SW') { tRow += 1; side = 'left'; }
    else if (hoverQuadrant === 'SE') { tCol += 1; side = 'right'; }

    if (tRow < 10 && tCol < 10) {
        if (currentBrush === 0) {
            if (side === 'left') map[tRow][tCol].wall = (map[tRow][tCol].wall === 3) ? 2 : (map[tRow][tCol].wall === 1 ? 0 : map[tRow][tCol].wall);
            else map[tRow][tCol].wall = (map[tRow][tCol].wall === 3) ? 1 : (map[tRow][tCol].wall === 2 ? 0 : map[tRow][tCol].wall);
            map[hoverRow][hoverCol].floor = 0; 
        } else if (currentBrush === 2) {
            if (side === 'left') map[tRow][tCol].wall = (map[tRow][tCol].wall === 2) ? 3 : 1;
            else map[tRow][tCol].wall = (map[tRow][tCol].wall === 1) ? 3 : 2;
        }
    }
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const adjX = (e.clientX - rect.left) - originX;
    const adjY = (e.clientY - rect.top) - originY;

    hoverCol = -1; hoverRow = -1; hoverQuadrant = 'none';

    ctx.save();
    ctx.translate(originX, originY);
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            defineTilePath(row, col);
            if (ctx.isPointInPath(e.clientX - rect.left, e.clientY - rect.top)) {
                hoverRow = row; hoverCol = col;
                const cX = (col - row) * (tileWidth / 2);
                const cY = (col + row) * (tileHeight / 2) + (tileHeight / 2);
                if (adjX < cX && adjY < cY) hoverQuadrant = 'NW';
                else if (adjX >= cX && adjY < cY) hoverQuadrant = 'NE';
                else if (adjX < cX && adjY >= cY) hoverQuadrant = 'SW';
                else hoverQuadrant = 'SE';
            }
        }
    }
    ctx.restore();

    if (isPainting) applySmartWall();
    drawIsometricGrid();
});

// Atualizado: Salva o estado antes de começar a pintar
canvas.addEventListener('mousedown', () => { 
    saveState(); 
    isPainting = true; 
    applySmartWall(); 
    drawIsometricGrid(); 
});

canvas.addEventListener('mouseup', () => { isPainting = false; });
canvas.addEventListener('mouseleave', () => { isPainting = false; });

// Atualizado: Lê o Ctrl+Z para restaurar o estado
window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (mapHistory.length > 0) {
            const previousState = mapHistory.pop();
            for (let r = 0; r < 10; r++) {
                for (let c = 0; c < 10; c++) {
                    map[r][c].floor = previousState[r][c].floor;
                    map[r][c].wall = previousState[r][c].wall;
                }
            }
            drawIsometricGrid();
        }
        return;
    }

    if (['0','1','2'].includes(e.key)) currentBrush = parseInt(e.key);
    drawIsometricGrid();
});

drawIsometricGrid();