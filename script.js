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

let isDragging = false;
let dragStartNode = null; 
let previewWalls = [];
let isCutaway = true; 
let mapHistory = [];

// NOVO: Estado dinâmico da borracha
let isErasing = false;

const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = [];
    for (let j = 0; j < 10; j++) {
        map[i][j] = { floor: 0, wallL: 0, wallR: 0 }; 
    }
}

// BLINDAGEM: Bloqueia o clique direito do mouse em todo o documento
document.addEventListener('contextmenu', e => e.preventDefault());

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

function getTargetEdge(hRow, hCol, hQuad) {
    if (hRow < 0 || hRow >= 10 || hCol < 0 || hCol >= 10) return null;
    let tRow = hRow, tCol = hCol, side = 'L';
    if (hQuad === 'NE') side = 'R';
    else if (hQuad === 'SW') { tRow += 1; side = 'R'; }
    else if (hQuad === 'SE') { tCol += 1; side = 'L'; }
    if (tRow >= 0 && tRow < 10 && tCol >= 0 && tCol < 10) return { row: tRow, col: tCol, side };
    return null;
}

function floodFillFloor(startRow, startCol, paintMode) {
    if (startRow < 0 || startRow >= 10 || startCol < 0 || startCol >= 10) return;
    const queue = [{r: startRow, c: startCol}];
    const visited = new Set();
    visited.add(`${startRow},${startCol}`);

    while(queue.length > 0) {
        const {r, c} = queue.shift();
        map[r][c].floor = paintMode;

        if (c > 0 && map[r][c].wallL === 0 && !visited.has(`${r},${c-1}`)) {
            visited.add(`${r},${c-1}`);
            queue.push({r: r, c: c-1});
        }
        if (c < 9 && map[r][c+1].wallL === 0 && !visited.has(`${r},${c+1}`)) {
            visited.add(`${r},${c+1}`);
            queue.push({r: r, c: c+1});
        }
        if (r > 0 && map[r][c].wallR === 0 && !visited.has(`${r-1},${c}`)) {
            visited.add(`${r-1},${c}`);
            queue.push({r: r-1, c: c});
        }
        if (r < 9 && map[r+1][c].wallR === 0 && !visited.has(`${r+1},${c}`)) {
            visited.add(`${r+1},${c}`);
            queue.push({r: r+1, c: c});
        }
    }
}

function updatePreview() {
    previewWalls = [];
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;

    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    if (currentBrush === 2 || currentEraseMode) { 
        const edge = getTargetEdge(hoverRow, hoverCol, hoverQuadrant);
        if (edge) {
            if (isDragging && dragStartNode && dragStartNode.type === 'wall') {
                const start = dragStartNode;
                if (start.side === 'L') {
                    const minR = Math.min(start.row, edge.row);
                    const maxR = Math.max(start.row, edge.row);
                    for (let r = minR; r <= maxR; r++) previewWalls.push({ row: r, col: start.col, side: 'L' });
                } else {
                    const minC = Math.min(start.col, edge.col);
                    const maxC = Math.max(start.col, edge.col);
                    for (let c = minC; c <= maxC; c++) previewWalls.push({ row: start.row, col: c, side: 'R' });
                }
            } else if (!isDragging) {
                previewWalls.push(edge);
            }
        }
    }
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    
    let brushName = currentBrush === 1 ? 'Piso (Pincel/Preencher)' : 'Parede (Linha Reta)';
    if (isErasing) brushName = 'Borracha (Ctrl Segurado)';
    
    ctx.fillText('Pincel atual: ' + brushName + ' | Modo Cutaway (C): ' + (isCutaway ? 'LIGADO' : 'DESLIGADO'), 20, 30);
    ctx.fillText('1 (Piso), 2 (Parede). Segure CTRL para Apagar. Segure SHIFT para preencher.', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

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

            // Fantasma do Mouse no Piso
            if (row === hoverRow && col === hoverCol && !isDragging) {
                defineTilePath(pNorte, pLeste, pSul, pOeste);
                if (currentEraseMode) ctx.fillStyle = 'rgba(255, 50, 50, 0.2)';
                else if (currentBrush === 1) ctx.fillStyle = 'rgba(100, 255, 100, 0.2)';
                else ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fill();
            }

            let hL = blockHeight;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hL = cutawayHeight;
            
            let hR = blockHeight;
            if (isCutaway && row > 0 && map[row - 1][col].floor === 1) hR = cutawayHeight;

            if (map[row][col].wallL === 1) drawFlatWall(pOeste, pNorte, hL, '#b71c1c'); 
            if (map[row][col].wallR === 1) drawFlatWall(pNorte, pLeste, hR, '#e53935'); 

            const pL = previewWalls.find(p => p.row === row && p.col === col && p.side === 'L');
            const pR = previewWalls.find(p => p.row === row && p.col === col && p.side === 'R');

            if (pL || pR) {
                ctx.globalAlpha = 0.7;
                const ghostColor = currentEraseMode ? 'rgba(255, 50, 50, 0.8)' : 'rgba(100, 255, 100, 0.8)';
                
                if (pL) {
                    let hGhost = blockHeight;
                    if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hGhost = cutawayHeight;
                    drawFlatWall(pOeste, pNorte, hGhost, ghostColor);
                }
                if (pR) {
                    let hGhost = blockHeight;
                    if (isCutaway && row > 0 && map[row - 1][col].floor === 1) hGhost = cutawayHeight;
                    drawFlatWall(pNorte, pLeste, hGhost, ghostColor);
                }
                ctx.globalAlpha = 1.0;
            }
        }
    }
    ctx.restore();
}

function applySmartBrush() {
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    
    const currentEraseMode = isDragging ? dragStartNode.erase : isErasing;

    if (currentBrush === 1) { 
        map[hoverRow][hoverCol].floor = currentEraseMode ? 0 : 1; 
        return; 
    }
    
    if (currentEraseMode && isDragging && dragStartNode && dragStartNode.type === 'floor') {
        map[hoverRow][hoverCol].floor = 0;
        return;
    }

    let tRow = hoverRow, tCol = hoverCol, side = 'L';
    if (hoverQuadrant === 'NE') side = 'R';
    else if (hoverQuadrant === 'SW') { tRow += 1; side = 'R'; }
    else if (hoverQuadrant === 'SE') { tCol += 1; side = 'L'; }

    if (tRow < 10 && tCol < 10 && !isDragging) {
        if (currentEraseMode) {
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
    // Atualiza estado do Ctrl para garantir precisão
    isErasing = e.ctrlKey || e.metaKey;

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

    if (isDragging) {
        if (currentBrush === 1 || (dragStartNode && dragStartNode.erase && dragStartNode.type === 'floor')) {
            applySmartBrush(); 
        }
    }

    updatePreview();
    drawIsometricGrid();
});

canvas.addEventListener('mousedown', (e) => { 
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    
    isErasing = e.ctrlKey || e.metaKey;
    saveState(); 

    // ATUALIZADO: Flood Fill apaga quando o Ctrl também está segurado
    if (e.shiftKey) {
        floodFillFloor(hoverRow, hoverCol, isErasing ? 0 : 1);
        drawIsometricGrid();
        return; 
    }

    isDragging = true; 
    
    if (currentBrush === 1) {
        dragStartNode = { type: 'floor', row: hoverRow, col: hoverCol, erase: isErasing };
        applySmartBrush(); 
    } else {
        const edge = getTargetEdge(hoverRow, hoverCol, hoverQuadrant);
        if (edge) dragStartNode = { type: 'wall', row: edge.row, col: edge.col, side: edge.side, erase: isErasing };
        else if (isErasing) {
            dragStartNode = { type: 'floor', row: hoverRow, col: hoverCol, erase: isErasing };
            applySmartBrush();
        }
    }
    
    updatePreview();
    drawIsometricGrid(); 
});

canvas.addEventListener('mouseup', () => { 
    if (isDragging) {
        const eraseMode = dragStartNode.erase;
        if (currentBrush === 2 && !eraseMode) {
            saveState(); 
            previewWalls.forEach(p => {
                if (p.side === 'L') map[p.row][p.col].wallL = 1;
                else map[p.row][p.col].wallR = 1;
            });
        } else if (eraseMode && dragStartNode && dragStartNode.type === 'wall') {
            saveState();
            previewWalls.forEach(p => {
                if (p.side === 'L') map[p.row][p.col].wallL = 0;
                else map[p.row][p.col].wallR = 0;
            });
        }
    }
    isDragging = false; 
    dragStartNode = null;
    updatePreview();
    drawIsometricGrid();
});

canvas.addEventListener('mouseleave', () => { 
    isDragging = false; 
    dragStartNode = null;
    isErasing = false; // Solta a borracha por segurança
    updatePreview();
    drawIsometricGrid();
});

// BLINDAGEM DO TECLADO: Impede atalhos de desenvolvedor
window.addEventListener('keydown', (e) => {
    // Permite uso de F12 e recarregamento da página (F5)
    if (e.key === 'F12' || e.key === 'F5') return;

    // Bloqueia inspecionar elemento e console (Ctrl+Shift+I / J / C)
    if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault(); return;
    }
    // Bloqueia exibir código fonte (Ctrl+U)
    if (e.ctrlKey && e.key.toLowerCase() === 'u') {
        e.preventDefault(); return;
    }
    // Bloqueia teclas com Alt
    if (e.altKey) {
        e.preventDefault(); return;
    }

    // Ctrl ou Meta ativam a borracha no jogo
    if (e.key === 'Control' || e.key === 'Meta') {
        isErasing = true;
        updatePreview();
        drawIsometricGrid();
        return;
    }

    if (e.key === 'c' || e.key === 'C') {
        isCutaway = !isCutaway;
        drawIsometricGrid();
        return;
    }

    // Permite Ctrl+Z para desfazer ações
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

    // Atalhos das ferramentas (agora sem o 0)
    if (['1','2'].includes(e.key)) {
        currentBrush = parseInt(e.key);
        isDragging = false;
        dragStartNode = null;
        updatePreview();
        drawIsometricGrid();
    }
});

window.addEventListener('keyup', (e) => {
    // Desliga a borracha quando solta a tecla
    if (e.key === 'Control' || e.key === 'Meta') {
        isErasing = false;
        updatePreview();
        drawIsometricGrid();
    }
});

drawIsometricGrid();