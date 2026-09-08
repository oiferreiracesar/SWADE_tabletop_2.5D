const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;
const blockHeight = 48; // Altura total da parede
const cutawayHeight = 12; // Altura da parede quando recortada (cutaway)

let hoverCol = -1;
let hoverRow = -1;
let hoverQuadrant = 'none';
let currentBrush = 1;
let isPainting = false;
let isCutaway = true; 

let mapHistory = [];

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

// Matemática Isométrica Correta: Transforma Grade (x,y) em Tela (Pixels)
function gridToScreen(row, col) {
    const x = (col - row) * (tileWidth / 2);
    const y = (col + row) * (tileHeight / 2);
    return { x, y };
}

// O molde para detecção do mouse contnua sendo o piso plano
function defineTilePath(pNorte, pLeste, pSul, pOeste) {
    ctx.beginPath();
    ctx.moveTo(pNorte.x, pNorte.y);
    ctx.lineTo(pLeste.x, pLeste.y);
    ctx.lineTo(pSul.x, pSul.y);
    ctx.lineTo(pOeste.x, pOeste.y);
    ctx.closePath();
}

// NOVO: Desenha a parede de um vértice ao outro, ancorada matematicamente no chão
function drawFlatWall(p1, p2, height, color) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); // Base inicial
    ctx.lineTo(p2.x, p2.y); // Base final
    ctx.lineTo(p2.x, p2.y - height); // Topo final
    ctx.lineTo(p1.x, p1.y - height); // Topo inicial
    ctx.closePath();
    
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#222'; // Linha de contorno (The Sims style)
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let brushName = currentBrush === 0 ? 'Borracha' : (currentBrush === 1 ? 'Piso' : 'Parede (Vértices)');
    ctx.fillText('Pincel atual: ' + brushName + ' | Modo Cutaway (Tecla C): ' + (isCutaway ? 'LIGADO' : 'DESLIGADO'), 20, 30);
    ctx.fillText('Tecle 1 (Piso), 2 (Parede), 0 (Borracha), C (Cutaway), Ctrl+Z (Desfazer)', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    // PAINTER'S ALGORITHM: Do fundo (row=0, col=0) para a frente (row=9, col=9)
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            
            // 1. Calcula os 4 cantos do losango atual em pixels exatos
            const pNorte = gridToScreen(row, col);
            const pLeste = gridToScreen(row, col + 1);
            const pSul   = gridToScreen(row + 1, col + 1);
            const pOeste = gridToScreen(row + 1, col);

            // 2. Desenha o Piso
            ctx.beginPath();
            ctx.moveTo(pNorte.x, pNorte.y);
            ctx.lineTo(pLeste.x, pLeste.y);
            ctx.lineTo(pSul.x, pSul.y);
            ctx.lineTo(pOeste.x, pOeste.y);
            ctx.closePath();
            
            if (map[row][col].floor === 1) { 
                ctx.fillStyle = 'rgba(100, 200, 100, 0.6)'; 
                ctx.fill(); 
            }
            ctx.strokeStyle = '#555'; 
            ctx.stroke();

            // 3. Sistema de Recorte (Cutaway Rules)
            let hL = blockHeight;
            if (isCutaway && row > 0 && map[row - 1][col].floor === 1) hL = cutawayHeight;
            
            let hR = blockHeight;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hR = cutawayHeight;

            // 4. Desenha Parede Noroeste (Vértice Oeste -> Norte)
            if (map[row][col].wallL === 1) {
                drawFlatWall(pOeste, pNorte, hL, '#b71c1c'); // Tom escuro
            }
            
            // 5. Desenha Parede Nordeste (Vértice Norte -> Leste)
            if (map[row][col].wallR === 1) {
                drawFlatWall(pNorte, pLeste, hR, '#e53935'); // Tom claro
            }

            // 6. Fantasmas e Hover (Feedback Visual)
            if (row === hoverRow && col === hoverCol) {
                defineTilePath(pNorte, pLeste, pSul, pOeste);
                ctx.fillStyle = (currentBrush === 1) ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)';
                ctx.fill();

                if (currentBrush === 2 || currentBrush === 0) {
                    ctx.globalAlpha = 0.5;
                    let targetRow = row, targetCol = col, side = 'L';
                    if (hoverQuadrant === 'NE') side = 'R';
                    else if (hoverQuadrant === 'SW') { targetRow = row + 1; side = 'L'; }
                    else if (hoverQuadrant === 'SE') { targetCol = col + 1; side = 'R'; }
                    
                    if (targetRow < 10 && targetCol < 10) {
                        const tgtNorte = gridToScreen(targetRow, targetCol);
                        const tgtLeste = gridToScreen(targetRow, targetCol + 1);
                        const tgtOeste = gridToScreen(targetRow + 1, targetCol);
                        
                        let hGhost = blockHeight;
                        if (isCutaway) {
                            if (side === 'L' && targetRow > 0 && map[targetRow - 1][targetCol].floor === 1) hGhost = cutawayHeight;
                            if (side === 'R' && targetCol > 0 && map[targetRow][targetCol - 1].floor === 1) hGhost = cutawayHeight;
                        }
                        
                        if (side === 'L') drawFlatWall(tgtOeste, tgtNorte, hGhost, '#b71c1c');
                        else drawFlatWall(tgtNorte, tgtLeste, hGhost, '#e53935');
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
    
    if (currentBrush === 1) { map[hoverRow][hoverCol].floor = 1; return; }
    
    let tRow = hoverRow, tCol = hoverCol, side = 'L';
    if (hoverQuadrant === 'NE') side = 'R';
    else if (hoverQuadrant === 'SW') { tRow += 1; side = 'L'; }
    else if (hoverQuadrant === 'SE') { tCol += 1; side = 'R'; }

    if (tRow < 10 && tCol < 10) {
        if (currentBrush === 0) {
            if (side === 'L') map[tRow][tCol].wallL = 0;
            if (side === 'R') map[tRow][tCol].wallR = 0;
            map[hoverRow][hoverCol].floor = 0; 
        } else if (currentBrush === 2) {
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
            const pN = gridToScreen(row, col);
            const pE = gridToScreen(row, col + 1);
            const pS = gridToScreen(row + 1, col + 1);
            const pW = gridToScreen(row + 1, col);
            
            defineTilePath(pN, pE, pS, pW);
            
            if (ctx.isPointInPath(e.clientX - rect.left, e.clientY - rect.top)) {
                hoverRow = row; hoverCol = col;
                // Mantém a inteligência de saber em qual das 4 bordas o mouse está mais perto
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