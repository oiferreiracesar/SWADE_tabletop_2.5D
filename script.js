const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;
const blockHeight = 48; 
const cutawayHeight = 12; 

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

function gridToScreen(row, col) {
    const x = (col - row) * (tileWidth / 2);
    const y = (col + row) * (tileHeight / 2);
    return { x, y };
}

function defineTilePath(pNorte, pLeste, pSul, pOeste) {
    ctx.beginPath();
    ctx.moveTo(pNorte.x, pNorte.y);
    ctx.lineTo(pLeste.x, pLeste.y);
    ctx.lineTo(pSul.x, pSul.y);
    ctx.lineTo(pOeste.x, pOeste.y);
    ctx.closePath();
}

function drawFlatWall(p1, p2, height, color) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); 
    ctx.lineTo(p2.x, p2.y); 
    ctx.lineTo(p2.x, p2.y - height); 
    ctx.lineTo(p1.x, p1.y - height); 
    ctx.closePath();
    
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#222'; 
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

    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            
            const pNorte = gridToScreen(row, col);
            const pLeste = gridToScreen(row, col + 1);
            const pSul   = gridToScreen(row + 1, col + 1);
            const pOeste = gridToScreen(row + 1, col);

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

            // CORREÇÃO: Lógica de Cutaway com eixos mapeados corretamente
            let hL = blockHeight;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hL = cutawayHeight;
            
            let hR = blockHeight;
            if (isCutaway && row > 0 && map[row - 1][col].floor === 1) hR = cutawayHeight;

            if (map[row][col].wallL === 1) {
                drawFlatWall(pOeste, pNorte, hL, '#b71c1c'); 
            }
            
            if (map[row][col].wallR === 1) {
                drawFlatWall(pNorte, pLeste, hR, '#e53935'); 
            }

            if (row === hoverRow && col === hoverCol) {
                defineTilePath(pNorte, pLeste, pSul, pOeste);
                ctx.fillStyle = (currentBrush === 1) ? 'rgba(100, 200, 100, 0.3)' : 'rgba(255, 255, 255, 0.1)';
                ctx.fill();

                if (currentBrush === 2 || currentBrush === 0) {
                    ctx.globalAlpha = 0.5;
                    let targetRow = row, targetCol = col, side = 'L';
                    // CORREÇÃO: O mapeamento das bordas vizinhas foi consertado
                    if (hoverQuadrant === 'NE') side = 'R';
                    else if (hoverQuadrant === 'SW') { targetRow = row + 1; side = 'R'; } 
                    else if (hoverQuadrant === 'SE') { targetCol = col + 1; side = 'L'; } 
                    
                    if (targetRow < 10 && targetCol < 10) {
                        const tgtNorte = gridToScreen(targetRow, targetCol);
                        const tgtLeste = gridToScreen(targetRow, targetCol + 1);
                        const tgtOeste = gridToScreen(targetRow + 1, targetCol);
                        
                        let hGhost = blockHeight;
                        if (isCutaway) {
                            if (side === 'L' && targetCol > 0 && map[targetRow][targetCol - 1].floor === 1) hGhost = cutawayHeight;
                            if (side === 'R' && targetRow > 0 && map[targetRow - 1][targetCol].floor === 1) hGhost = cutawayHeight;
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
    
    // CORREÇÃO: O redirecionamento matemático agora encontra o parceiro geométrico exato
    if (hoverQuadrant === 'NE') side = 'R';
    else if (hoverQuadrant === 'SW') { tRow += 1; side = 'R'; }
    else if (hoverQuadrant === 'SE') { tCol += 1; side = 'L'; }

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