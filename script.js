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
        // ATUALIZADO: Novas arestas diagonais WE (Oeste-Leste) e NS (Norte-Sul)
        map[i][j] = { floor: 0, wallL: 0, wallR: 0, wallWE: 0, wallNS: 0 }; 
    }
}

document.addEventListener('contextmenu', e => e.preventDefault());

function saveState() {
    const snapshot = [];
    for (let i = 0; i < 10; i++) {
        snapshot[i] = [];
        for (let j = 0; j < 10; j++) {
            snapshot[i][j] = { 
                floor: map[i][j].floor, 
                wallL: map[i][j].wallL, 
                wallR: map[i][j].wallR,
                wallWE: map[i][j].wallWE,
                wallNS: map[i][j].wallNS
            };
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

        // TRAVA DE SEGURANÇA: Diagonais bloqueiam o avanço da tinta para não vazar
        if (map[r][c].wallWE > 0 || map[r][c].wallNS > 0) continue;

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

    // Lógica da Parede Flex (2) - Desenha Reto OU Diagonal dependendo do mouse
    if (currentBrush === 2 || (currentEraseMode && currentBrush === 2)) { 
        if (isDragging && dragStartNode && dragStartNode.type === 'wall') {
            const start = dragStartNode;
            const dR = hoverRow - start.row;
            const dC = hoverCol - start.col;

            // Detecta se o arraste forma uma diagonal perfeita (ex: +2, +2)
            if (Math.abs(dR) === Math.abs(dC) && dR !== 0) {
                const steps = Math.abs(dR);
                const rDir = dR > 0 ? 1 : -1;
                const cDir = dC > 0 ? 1 : -1;
                for (let i = 0; i <= steps; i++) {
                    const r = start.row + (i * rDir);
                    const c = start.col + (i * cDir);
                    if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                        if (rDir === cDir) previewWalls.push({ row: r, col: c, side: 'NS' });
                        else previewWalls.push({ row: r, col: c, side: 'WE' });
                    }
                }
            } 
            // Se não for diagonal perfeita, trava em reta (horizontal ou vertical)
            else if (Math.abs(dR) >= Math.abs(dC)) {
                const minR = Math.min(start.row, hoverRow);
                const maxR = Math.max(start.row, hoverRow);
                for (let r = minR; r <= maxR; r++) if (r < 10) previewWalls.push({ row: r, col: start.col, side: 'L' });
            } else {
                const minC = Math.min(start.col, hoverCol);
                const maxC = Math.max(start.col, hoverCol);
                for (let c = minC; c <= maxC; c++) if (c < 10) previewWalls.push({ row: start.row, col: c, side: 'R' });
            }
        } else if (!isDragging) {
            const edge = getTargetEdge(hoverRow, hoverCol, hoverQuadrant);
            if (edge) previewWalls.push(edge);
        }
    } 
    // Lógica da Sala Retangular (3)
    else if (currentBrush === 3 || (currentEraseMode && currentBrush === 3)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);

            for (let c = minC; c <= maxC; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'L' });
            for (let r = minR; r <= maxR; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'R' });
            for (let c = minC; c <= maxC; c++) if (maxR + 1 < 10 && c < 10) previewWalls.push({ row: maxR + 1, col: c, side: 'R' });
            for (let r = minR; r <= maxR; r++) if (r < 10 && maxC + 1 < 10) previewWalls.push({ row: r, col: maxC + 1, side: 'L' });
        } else if (!isDragging) {
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            if (hoverRow + 1 < 10) previewWalls.push({ row: hoverRow + 1, col: hoverCol, side: 'R' });
            if (hoverCol + 1 < 10) previewWalls.push({ row: hoverRow, col: hoverCol + 1, side: 'L' });
        }
    }
    // NOVA: Lógica da Sala Triangular (4)
    else if (currentBrush === 4 || (currentEraseMode && currentBrush === 4)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);
            const dR = maxR - minR;
            const dC = maxC - minC;

            // Só desenha triângulo se a caixa formada for perfeitamente quadrada
            if (dR === dC && dR > 0) {
                for (let r = minR; r <= maxR; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'L' });
                for (let c = minC; c <= maxC; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'R' });
                // Hipotenusa
                for (let i = 0; i <= dR; i++) {
                    const r = maxR - i;
                    const c = minC + i;
                    if (r >= 0 && r < 10 && c >= 0 && c < 10) previewWalls.push({ row: r, col: c, side: 'WE' });
                }
            } else {
                // Fallback de UI para caso o usuário não consiga puxar o quadrado perfeito
                for (let c = minC; c <= maxC; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'L' });
                for (let r = minR; r <= maxR; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'R' });
                for (let c = minC; c <= maxC; c++) if (maxR + 1 < 10 && c < 10) previewWalls.push({ row: maxR + 1, col: c, side: 'R' });
                for (let r = minR; r <= maxR; r++) if (r < 10 && maxC + 1 < 10) previewWalls.push({ row: r, col: maxC + 1, side: 'L' });
            }
        } else if (!isDragging) {
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'WE' });
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

            // Renderiza as paredes de trás
            let hL = map[row][col].wallL;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hL = cutawayHeight;
            let hR = map[row][col].wallR;
            if (isCutaway && row > 0 && map[row - 1].floor === 1) hR = cutawayHeight;

            if (hL > 0) drawFlatWall(pOeste, pNorte, hL, '#b71c1c'); 
            if (hR > 0) drawFlatWall(pNorte, pLeste, hR, '#e53935'); 

            // Renderiza Diagonais (Após paredes traseiras da mesma célula)
            let hWE = map[row][col].wallWE;
            if (isCutaway && row > 0 && map[row - 1][col].floor === 1) hWE = cutawayHeight;
            let hNS = map[row][col].wallNS;
            if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hNS = cutawayHeight;

            if (hWE > 0) drawFlatWall(pOeste, pLeste, hWE, '#d32f2f'); 
            if (hNS > 0) drawFlatWall(pNorte, pSul, hNS, '#c62828'); 

            // FANTASMAS DA PRÉVIA
            const ghosts = previewWalls.filter(p => p.row === row && p.col === col);
            if (ghosts.length > 0) {
                ctx.globalAlpha = 0.7;
                const ghostColor = currentEraseMode ? 'rgba(255, 50, 50, 0.8)' : 'rgba(100, 255, 100, 0.8)';
                
                ghosts.forEach(p => {
                    let hGhost = blockHeight;
                    if (p.side === 'L') {
                        if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hGhost = cutawayHeight;
                        drawFlatWall(pOeste, pNorte, hGhost, ghostColor);
                    } else if (p.side === 'R') {
                        if (isCutaway && row > 0 && map[row - 1].floor === 1) hGhost = cutawayHeight;
                        drawFlatWall(pNorte, pLeste, hGhost, ghostColor);
                    } else if (p.side === 'WE') {
                        if (isCutaway && row > 0 && map[row - 1].floor === 1) hGhost = cutawayHeight;
                        drawFlatWall(pOeste, pLeste, hGhost, ghostColor);
                    } else if (p.side === 'NS') {
                        if (isCutaway && col > 0 && map[row][col - 1].floor === 1) hGhost = cutawayHeight;
                        drawFlatWall(pNorte, pSul, hGhost, ghostColor);
                    }
                });
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
    document.getElementById('btnRoomTri').classList.toggle('active', currentBrush === 4 && !isErasing);
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
    } else if (currentBrush === 3 || currentBrush === 4) {
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
        if ([2, 3, 4].includes(currentBrush) && !eraseMode) {
            saveState(); 
            previewWalls.forEach(p => {
                if (p.side === 'L') map[p.row][p.col].wallL = blockHeight;
                else if (p.side === 'R') map[p.row][p.col].wallR = blockHeight;
                else if (p.side === 'WE') map[p.row][p.col].wallWE = blockHeight;
                else if (p.side === 'NS') map[p.row][p.col].wallNS = blockHeight;
            });
        } else if (eraseMode && dragStartNode && (dragStartNode.type === 'wall' || dragStartNode.type === 'room')) {
            saveState();
            previewWalls.forEach(p => {
                if (p.side === 'L') map[p.row][p.col].wallL = 0;
                else if (p.side === 'R') map[p.row][p.col].wallR = 0;
                else if (p.side === 'WE') map[p.row][p.col].wallWE = 0;
                else if (p.side === 'NS') map[p.row][p.col].wallNS = 0;
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
                    map[r][c].wallWE = previousState[r][c].wallWE;
                    map[r][c].wallNS = previousState[r][c].wallNS;
                }
            }
            drawIsometricGrid();
        }
        return;
    }

    if (['1','2','3','4'].includes(e.key)) {
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
document.getElementById('btnRoomTri').addEventListener('click', () => { currentBrush = 4; updateUI(); });
document.getElementById('btnCutaway').addEventListener('click', () => { isCutaway = !isCutaway; updateUI(); drawIsometricGrid(); });
document.getElementById('btnUndo').addEventListener('click', () => { 
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    window.dispatchEvent(event);
});

updateUI();
drawIsometricGrid();