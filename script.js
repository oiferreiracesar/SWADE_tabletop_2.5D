const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;

let blockHeight = 48; 
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
let isErasing = false;

const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = [];
    for (let j = 0; j < 10; j++) {
        map[i][j] = { floor: 0, wallL: 0, wallR: 0 }; 
    }
}

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

// ATUALIZADO: Cálculo geométrico para a Sala Retangular (Ferramenta 3)
function updatePreview() {
    previewWalls = [];
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;

    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    // Lógica da Parede Linha (2)
    if (currentBrush === 2 || (currentEraseMode && currentBrush === 2)) { 
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
    // Lógica da Sala Retangular (3)
    else if (currentBrush === 3 || (currentEraseMode && currentBrush === 3)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);

            // Perímetro Noroeste
            for (let c = minC; c <= maxC; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'L' });
            // Perímetro Nordeste
            for (let r = minR; r <= maxR; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'R' });
            // Perímetro Sudoeste
            for (let c = minC; c <= maxC; c++) if (maxR + 1 < 10 && c < 10) previewWalls.push({ row: maxR + 1, col: c, side: 'R' });
            // Perímetro Sudeste
            for (let r = minR; r <= maxR; r++) if (r < 10 && maxC + 1 < 10) previewWalls.push({ row: r, col: maxC + 1, side: 'L' });

        } else if (!isDragging) {
            // Hover simples mostra um quadrado ao redor da célula atual
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            if (hoverRow + 1 < 10) previewWalls.push({ row: hoverRow + 1, col: hoverCol, side: 'R' });
            if (hoverCol + 1 < 10) previewWalls.push({ row: hoverRow, col: hoverCol + 1, side: 'L' });
        }
    }
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
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

            if (row === hoverRow && col === hoverCol && !isDragging) {
                defineTilePath(pNorte, pLeste, pSul, pOeste);
                if (currentEraseMode) ctx.fillStyle = 'rgba(255, 50, 50, 0.2)';
                else if (currentBrush === 1) ctx.fillStyle = 'rgba(100, 255, 100, 0.2)';
                else ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                ctx.fill();
            }

            let hL = map[row][col].wallL;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hL = cutawayHeight;
            
            let hR = map[row][col].wallR;
            if (isCutaway && row > 0 && map[row - 1].floor === 1) hR = cutawayHeight;

            if (map[row][col].wallL > 0) drawFlatWall(pOeste, pNorte, hL, '#b71c1c'); 
            if (map[row][col].wallR > 0) drawFlatWall(pNorte, pLeste, hR, '#e53935'); 

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
                    if (isCutaway && row > 0 && map[row - 1].floor === 1) hGhost = cutawayHeight;
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

    // Aplicação para linha simples (brush 2) se não estiver arrastando
    if (tRow < 10 && tCol < 10 && !isDragging && currentBrush === 2) {
        if (currentEraseMode) {
            if (side === 'L') map[tRow][tCol].wallL = 0;
            if (side === 'R') map[tRow][tCol].wallR = 0;
            map[hoverRow][hoverCol].floor = 0; 
        } else {
            if (side === 'L') map[tRow][tCol].wallL = blockHeight;
            if (side === 'R') map[tRow][tCol].wallR = blockHeight;
        }
    }
}

function updateUI() {
    document.getElementById('btnPiso').classList.toggle('active', currentBrush === 1 && !isErasing);
    document.getElementById('btnParede').classList.toggle('active', currentBrush === 2 && !isErasing);
    document.getElementById('btnRoomRect').classList.toggle('active', currentBrush === 3 && !isErasing);
    document.getElementById('btnBorracha').classList.toggle('active', isErasing);
    document.getElementById('btnCutaway').innerText = isCutaway ? 'Cutaway: LIGADO (C)' : 'Cutaway: DESLIGADO (C)';
}

document.getElementById('sliderAltura').addEventListener('input', (e) => {
    blockHeight = parseInt(e.target.value);
    document.getElementById('valorAltura').innerText = blockHeight;
    updatePreview();
    drawIsometricGrid();
});

canvas.addEventListener('mousemove', (e) => {
    isErasing = e.ctrlKey || e.metaKey;
    updateUI(); 

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
    updateUI();
    saveState(); 

    if (e.shiftKey) {
        floodFillFloor(hoverRow, hoverCol, isErasing ? 0 : 1);
        drawIsometricGrid();
        return; 
    }

    isDragging = true; 
    
    if (currentBrush === 1) {
        dragStartNode = { type: 'floor', row: hoverRow, col: hoverCol, erase: isErasing };
        applySmartBrush(); 
    } else if (currentBrush === 3) {
        // Inicia arrasto de Sala Retangular
        dragStartNode = { type: 'room', row: hoverRow, col: hoverCol, erase: isErasing };
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
        // Salva paredes em lote se for Sala Retangular (3) ou Parede Linha (2)
        if ((currentBrush === 2 || currentBrush === 3) && !eraseMode) {
            saveState(); 
            previewWalls.forEach(p => {
                if (p.side === 'L') map[p.row][p.col].wallL = blockHeight;
                else map[p.row][p.col].wallR = blockHeight;
            });
        } else if (eraseMode && dragStartNode && (dragStartNode.type === 'wall' || dragStartNode.type === 'room')) {
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
    isErasing = false; 
    updateUI();
    updatePreview();
    drawIsometricGrid();
});

window.addEventListener('keydown', (e) => {
    if (e.key === 'F12' || e.key === 'F5') return;
    if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) { e.preventDefault(); return; }
    if (e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); return; }
    if (e.altKey) { e.preventDefault(); return; }

    if (e.key === 'Control' || e.key === 'Meta') {
        isErasing = true;
        updateUI();
        updatePreview();
        drawIsometricGrid();
        return;
    }

    if (e.key === 'c' || e.key === 'C') {
        isCutaway = !isCutaway;
        updateUI();
        drawIsometricGrid();
        return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        document.getElementById('btnUndo').style.backgroundColor = 'rgba(255,255,255,0.2)';
        setTimeout(() => document.getElementById('btnUndo').style.backgroundColor = '', 150);

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

    if (['1','2','3'].includes(e.key)) {
        currentBrush = parseInt(e.key);
        isDragging = false;
        dragStartNode = null;
        updateUI();
        updatePreview();
        drawIsometricGrid();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'Control' || e.key === 'Meta') {
        isErasing = false;
        updateUI();
        updatePreview();
        drawIsometricGrid();
    }
});

document.getElementById('btnPiso').addEventListener('click', () => { currentBrush = 1; updateUI(); });
document.getElementById('btnParede').addEventListener('click', () => { currentBrush = 2; updateUI(); });
document.getElementById('btnRoomRect').addEventListener('click', () => { currentBrush = 3; updateUI(); });
document.getElementById('btnCutaway').addEventListener('click', () => { isCutaway = !isCutaway; updateUI(); drawIsometricGrid(); });
document.getElementById('btnUndo').addEventListener('click', () => { 
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    window.dispatchEvent(event);
});

updateUI();
drawIsometricGrid();