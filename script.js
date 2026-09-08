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
let isCutaway = true; // NOVO: Controle do modo de visualização das paredes

let mapHistory = [];

// ESTRUTURA REFEITA (Ponto 1): Arestas independentes
const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = [];
    for (let j = 0; j < 10; j++) {
        map[i][j] = { floor: 0, wallL: 0, wallR: 0 }; 
    }
}

function saveState() {
    const snapshot = [];
    for (let i = 0; i < 10; i++) {
        snapshot[i] = [];
        for (let j = 0; j < 10; j++) {
            snapshot[i][j] = { floor: map[i][j].floor, wallL: map[i][j].wallL, wallR: map[i][j].wallR };
        }
    }
    mapHistory.push(snapshot);
    if (mapHistory.length > 30) mapHistory.shift();
}

// O molde do mouse agora é sempre o losango plano do chão. 
// Isso garante precisão ao clicar perto das arestas para construir/apagar.
function defineTilePath(row, col) {
    const x = (col - row) * (tileWidth / 2);
    const y = (col + row) * (tileHeight / 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
    ctx.lineTo(x, y + tileHeight);
    ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
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
    if (type === 'left') {
        return [x - 2, y - 1, x + 2, y + 1, x - 30, y + 17, x - 34, y + 15];
    }
    return [x + 2, y - 1, x + 34, y + 15, x + 30, y + 17, x - 2, y + 1]; 
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let brushName = currentBrush === 0 ? 'Borracha' : (currentBrush === 1 ? 'Piso' : 'Parede (Aresta)');
    ctx.fillText('Pincel atual: ' + brushName + ' | Modo Cutaway (Tecla C): ' + (isCutaway ? 'LIGADO' : 'DESLIGADO'), 20, 30);
    ctx.fillText('Tecle 1 (Piso), 2 (Parede), 0 (Borracha), C (Cutaway), Ctrl+Z (Desfazer)', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    // ORDENAÇÃO DE RENDERIZAÇÃO (Ponto 2): Painter's Algorithm estrito
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const x = (col - row) * (tileWidth / 2);
            const y = (col + row) * (tileHeight / 2);

            // 1. PISO
            ctx.beginPath();
            ctx.moveTo(x, y); ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
            ctx.lineTo(x, y + tileHeight); ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
            ctx.closePath();
            
            if (map[row][col].floor === 1) { 
                ctx.fillStyle = 'rgba(100, 200, 100, 0.6)'; ctx.fill(); 
            }
            ctx.strokeStyle = '#555'; ctx.stroke();

            // 2. PAREDES DE TRÁS (Noroeste / Nordeste da célula)
            
            // SISTEMA CUTAWAY (Ponto 3): Rebaixa a parede se houver piso atrás dela
            let hL = blockHeight;
            if (isCutaway && row > 0 && map[row - 1][col].floor === 1) hL = 12; // Rebaixa
            
            let hR = blockHeight;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hR = 12; // Rebaixa

            // Desenha a Parede Esquerda (se existir)
            if (map[row][col].wallL === 1) drawPrism(...getWallCoords(row, col, 'left'), hL);
            
            // Desenha a Parede Direita (se existir)
            if (map[row][col].wallR === 1) drawPrism(...getWallCoords(row, col, 'right'), hR);

            // 3. FANTASMAS E HOVER
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
                        let hGhost = blockHeight;
                        if (isCutaway) {
                            if (side === 'left' && targetRow > 0 && map[targetRow - 1][targetCol].floor === 1) hGhost = 12;
                            if (side === 'right' && targetCol > 0 && map[targetRow][targetCol - 1].floor === 1) hGhost = 12;
                        }
                        drawPrism(...getWallCoords(targetRow, targetCol, side), hGhost);
                    }
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    }
    ctx.restore();
}

function applySmartBrush() {
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    
    // Piso
    if (currentBrush === 1) { map[hoverRow][hoverCol].floor = 1; return; }
    
    // Direcionamento da Aresta (Sul/Leste redireciona para o Norte/Oeste do vizinho da frente)
    let tRow = hoverRow, tCol = hoverCol, side = 'L';
    if (hoverQuadrant === 'NE') side = 'R';
    else if (hoverQuadrant === 'SW') { tRow += 1; side = 'L'; }
    else if (hoverQuadrant === 'SE') { tCol += 1; side = 'R'; }

    if (tRow < 10 && tCol < 10) {
        if (currentBrush === 0) {
            // Borracha: Apaga a aresta focada e o piso abaixo
            if (side === 'L') map[tRow][tCol].wallL = 0;
            if (side === 'R') map[tRow][tCol].wallR = 0;
            map[hoverRow][hoverCol].floor = 0; 
        } else if (currentBrush === 2) {
            // Parede: Grava na aresta exata
            if (side === 'L') map[tRow][tCol].wallL = 1;
            if (side === 'R') map[tRow][tCol].wallR = 1;
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

    if (isPainting) applySmartBrush();
    drawIsometricGrid();
});

canvas.addEventListener('mousedown', () => { 
    saveState(); 
    isPainting = true; 
    applySmartBrush(); 
    drawIsometricGrid(); 
});

canvas.addEventListener('mouseup', () => { isPainting = false; });
canvas.addEventListener('mouseleave', () => { isPainting = false; });

window.addEventListener('keydown', (e) => {
    // Tecla C alterna o Cutaway
    if (e.key === 'c' || e.key === 'C') {
        isCutaway = !isCutaway;
        drawIsometricGrid();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (mapHistory.length > 0) {
            const previousState = mapHistory.pop();
            for (let r = 0; r < 10; r++) {
                for (let c = 0; c < 10; c++) {
                    map[r][c].floor = previousState[r][c].floor;
                    map[r][c].wallL = previousState[r][c].wallL;
                    map[r][c].wallR = previousState[r][c].wallR;
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