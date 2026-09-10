const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;

const levelHeight = 48; 
let blockHeight = 48; 
const cutawayHeight = 12; 

let surfaceColor = '#1e293b'; 
let undergroundColor = '#0a0705'; 
let dirtColor = '#1e140f'; 

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

let currentFloor = 0;
let mapData = {};
let map; 

function createEmptyMap() {
    const newMap = [];
    for (let i = 0; i < 10; i++) {
        newMap[i] = [];
        for (let j = 0; j < 10; j++) {
            newMap[i][j] = { floor: 0, wallL: 0, wallR: 0, wallWE: 0, wallNS: 0, column: 0 }; 
        }
    }
    return newMap;
}

mapData[0] = createEmptyMap();
map = mapData[0];

document.addEventListener('contextmenu', e => e.preventDefault());

function saveState() {
    const snapshot = {
        floor: currentFloor,
        data: JSON.parse(JSON.stringify(mapData)) 
    };
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

function isEnclosed(fIndex, startRow, startCol) {
    const fMap = mapData[fIndex];
    if (!fMap) return false;

    const queue = [{r: startRow, c: startCol}];
    const visited = new Set();
    visited.add(`${startRow},${startCol}`);

    while (queue.length > 0) {
        const {r, c} = queue.shift();

        if (fMap[r][c].wallWE > 0 || fMap[r][c].wallNS > 0) {
            continue;
        }

        if (fMap[r][c].wallL === 0) {
            if (c === 0) return false; 
            if (!visited.has(`${r},${c-1}`)) { visited.add(`${r},${c-1}`); queue.push({r, c: c-1}); }
        }
        if (c === 9) return false; 
        else if (fMap[r][c+1].wallL === 0) {
            if (!visited.has(`${r},${c+1}`)) { visited.add(`${r},${c+1}`); queue.push({r, c: c+1}); }
        }
        if (fMap[r][c].wallR === 0) {
            if (r === 0) return false;
            if (!visited.has(`${r-1},${c}`)) { visited.add(`${r-1},${c}`); queue.push({r: r-1, c}); }
        }
        if (r === 9) return false;
        else if (fMap[r+1][c].wallR === 0) {
            if (!visited.has(`${r+1},${c}`)) { visited.add(`${r+1},${c}`); queue.push({r: r+1, c}); }
        }
    }
    return true; 
}

function isFloorSupported(r, c) {
    if (currentFloor <= 0) return true; 
    if (!mapData[currentFloor - 1]) return false;
    const lower = mapData[currentFloor - 1][r][c];
    
    if (lower.column === 1) return true;
    
    if (lower.wallL > 0 || lower.wallR > 0 || lower.wallWE > 0 || lower.wallNS > 0) return true;
    if (c < 9 && mapData[currentFloor-1][r][c+1].wallL > 0) return true;
    if (r < 9 && mapData[currentFloor-1][r+1][c].wallR > 0) return true;

    if (isEnclosed(currentFloor - 1, r, c)) return true;

    return false;
}

function isWallSupported(r, c, side) {
    if (currentFloor <= 0) return true;
    if (!mapData[currentFloor - 1]) return false;

    const lower = mapData[currentFloor - 1][r][c];

    if (side === 'L' && lower.wallL > 0) return true;
    if (side === 'R' && lower.wallR > 0) return true;
    if (side === 'WE' && lower.wallWE > 0) return true;
    if (side === 'NS' && lower.wallNS > 0) return true;

    if (lower.column === 1) return true;

    if (side === 'L' && c > 0 && mapData[currentFloor - 1][r][c - 1].column === 1) return true;
    if (side === 'R' && r > 0 && mapData[currentFloor - 1][r - 1][c].column === 1) return true;

    if (isEnclosed(currentFloor - 1, r, c)) return true;
    if (side === 'L' && c > 0 && isEnclosed(currentFloor - 1, r, c - 1)) return true;
    if (side === 'R' && r > 0 && isEnclosed(currentFloor - 1, r - 1, c)) return true;

    return false;
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

function getFloorType(r, c, enterDir, hQuad) {
    const lowerMap = currentFloor > 0 ? mapData[currentFloor - 1] : null;
    const wWE = map[r][c].wallWE > 0 || (lowerMap && lowerMap[r][c].wallWE > 0);
    const wNS = map[r][c].wallNS > 0 || (lowerMap && lowerMap[r][c].wallNS > 0);
    
    if (wWE) {
        if (enterDir === 'NW' || enterDir === 'NE') return 2;
        if (enterDir === 'SW' || enterDir === 'SE') return 3; 
        if (enterDir === 'CLICK') {
            if (hQuad === 'NW' || hQuad === 'NE') return 2;
            if (hQuad === 'SW' || hQuad === 'SE') return 3;
        }
    }
    if (wNS) {
        if (enterDir === 'NW' || enterDir === 'SW') return 4; 
        if (enterDir === 'NE' || enterDir === 'SE') return 5; 
        if (enterDir === 'CLICK') {
            if (hQuad === 'NW' || hQuad === 'SW') return 4;
            if (hQuad === 'NE' || hQuad === 'SE') return 5;
        }
    }
    return 1; 
}

function updateFloorState(r, c, incomingType, eraseMode) {
    const current = map[r][c].floor;
    const lowerMap = currentFloor > 0 ? mapData[currentFloor - 1] : null;
    const wWE = map[r][c].wallWE > 0 || (lowerMap && lowerMap[r][c].wallWE > 0);
    const wNS = map[r][c].wallNS > 0 || (lowerMap && lowerMap[r][c].wallNS > 0);

    if (!eraseMode) {
        if (current === 0) return incomingType;
        if (current === 1) return 1; 
        if (wWE && ((current === 2 && incomingType === 3) || (current === 3 && incomingType === 2))) return 1;
        if (wNS && ((current === 4 && incomingType === 5) || (current === 5 && incomingType === 4))) return 1;
        return incomingType; 
    } else {
        if (current === 0) return 0;
        if (current === 1) {
            if (wWE) return incomingType === 2 ? 3 : 2;
            if (wNS) return incomingType === 4 ? 5 : 4;
            return 0; 
        }
        if (current === incomingType) return 0; 
        return current; 
    }
}

function floodFillFloor(startRow, startCol, paintMode, startQuad) {
    if (startRow < 0 || startRow >= 10 || startCol < 0 || startCol >= 10) return;
    
    if (paintMode === 1 && !isFloorSupported(startRow, startCol)) return;
    
    const startType = getFloorType(startRow, startCol, 'CLICK', startQuad);
    const queue = [{r: startRow, c: startCol, type: startType}];
    const visited = new Set();
    visited.add(`${startRow},${startCol}`);

    const lowerMap = currentFloor > 0 ? mapData[currentFloor - 1] : null;

    while(queue.length > 0) {
        const {r, c, type} = queue.shift();
        
        const oldFloor = map[r][c].floor;
        map[r][c].floor = updateFloorState(r, c, type, paintMode === 0);
        
        if (paintMode === 0 && oldFloor === 0) continue;
        
        const wWE = map[r][c].wallWE > 0 || (lowerMap && lowerMap[r][c].wallWE > 0);
        const wNS = map[r][c].wallNS > 0 || (lowerMap && lowerMap[r][c].wallNS > 0);
        if (wWE || wNS) continue;

        const canNW = [1, 2, 4].includes(type);
        const canNE = [1, 2, 5].includes(type);
        const canSW = [1, 3, 4].includes(type);
        const canSE = [1, 3, 5].includes(type);

        const wL = map[r][c].wallL > 0 || (lowerMap && lowerMap[r][c].wallL > 0);
        const wR = map[r][c].wallR > 0 || (lowerMap && lowerMap[r][c].wallR > 0);
        const wL_next = c < 9 && (map[r][c+1].wallL > 0 || (lowerMap && lowerMap[r][c+1].wallL > 0));
        const wR_next = r < 9 && (map[r+1][c].wallR > 0 || (lowerMap && lowerMap[r+1][c].wallR > 0));

        if (canNW && c > 0 && !wL && !visited.has(`${r},${c-1}`)) {
            if (paintMode === 0 || isFloorSupported(r, c-1)) {
                const nextType = getFloorType(r, c-1, 'SE');
                visited.add(`${r},${c-1}`);
                queue.push({r, c: c-1, type: nextType});
            }
        }
        if (canSE && c < 9 && !wL_next && !visited.has(`${r},${c+1}`)) {
            if (paintMode === 0 || isFloorSupported(r, c+1)) {
                const nextType = getFloorType(r, c+1, 'NW');
                visited.add(`${r},${c+1}`);
                queue.push({r, c: c+1, type: nextType});
            }
        }
        if (canNE && r > 0 && !wR && !visited.has(`${r-1},${c}`)) {
            if (paintMode === 0 || isFloorSupported(r-1, c)) {
                const nextType = getFloorType(r-1, c, 'SW');
                visited.add(`${r-1},${c}`);
                queue.push({r: r-1, c, type: nextType});
            }
        }
        if (canSW && r < 9 && !wR_next && !visited.has(`${r+1},${c}`)) {
            if (paintMode === 0 || isFloorSupported(r+1, c)) {
                const nextType = getFloorType(r+1, c, 'NE');
                visited.add(`${r+1},${c}`);
                queue.push({r: r+1, c, type: nextType});
            }
        }
    }
}

function updatePreview() {
    previewWalls = [];
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;

    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    if (currentBrush === 2 || (currentEraseMode && currentBrush === 2)) { 
        if (isDragging && dragStartNode && dragStartNode.type === 'wall') {
            const start = dragStartNode;
            const dR = hoverRow - start.row;
            const dC = hoverCol - start.col;

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
    else if (currentBrush === 3 || (currentEraseMode && currentBrush === 3)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);

            for (let r = minR; r <= maxR; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'L' });
            for (let c = minC; c <= maxC; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'R' });
            for (let c = minC; c <= maxC; c++) if (maxR + 1 < 10 && c < 10) previewWalls.push({ row: maxR + 1, col: c, side: 'R' });
            for (let r = minR; r <= maxR; r++) if (r < 10 && maxC + 1 < 10) previewWalls.push({ row: r, col: maxC + 1, side: 'L' });
        } else if (!isDragging) {
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            if (hoverRow + 1 < 10) previewWalls.push({ row: hoverRow + 1, col: hoverCol, side: 'R' });
            if (hoverCol + 1 < 10) previewWalls.push({ row: hoverRow, col: hoverCol + 1, side: 'L' });
        }
    }
    else if (currentBrush === 4 || (currentEraseMode && currentBrush === 4)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);
            const steps = Math.min(maxR - minR, maxC - minC); 
            
            if (steps === 0) return;

            const M_R = minR + steps;
            const M_C = minC + steps;

            const dragSE = hoverRow >= dragStartNode.row && hoverCol >= dragStartNode.col;
            const dragNW = hoverRow < dragStartNode.row && hoverCol < dragStartNode.col;
            const dragNE = hoverRow < dragStartNode.row && hoverCol >= dragStartNode.col;
            const dragSW = hoverRow >= dragStartNode.row && hoverCol < dragStartNode.col;

            if (dragSE) { 
                for (let r = minR; r <= M_R; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'L' });
                for (let c = minC; c <= M_C; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'R' });
                for (let i = 0; i <= steps; i++) if (M_R - i >= 0 && minC + i < 10) previewWalls.push({ row: M_R - i, col: minC + i, side: 'WE' });
            } 
            else if (dragNW) { 
                for (let r = minR; r <= M_R; r++) if (r < 10 && M_C + 1 < 10) previewWalls.push({ row: r, col: M_C + 1, side: 'L' });
                for (let c = minC; c <= M_C; c++) if (M_R + 1 < 10 && c < 10) previewWalls.push({ row: M_R + 1, col: c, side: 'R' });
                for (let i = 0; i <= steps; i++) if (M_R - i >= 0 && minC + i < 10) previewWalls.push({ row: M_R - i, col: minC + i, side: 'WE' });
            }
            else if (dragNE) { 
                for (let r = minR; r <= M_R; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'L' });
                for (let c = minC; c <= M_C; c++) if (M_R + 1 < 10 && c < 10) previewWalls.push({ row: M_R + 1, col: c, side: 'R' });
                for (let i = 0; i <= steps; i++) if (minR + i < 10 && minC + i < 10) previewWalls.push({ row: minR + i, col: minC + i, side: 'NS' });
            }
            else if (dragSW) { 
                for (let r = minR; r <= M_R; r++) if (r < 10 && M_C + 1 < 10) previewWalls.push({ row: r, col: M_C + 1, side: 'L' });
                for (let c = minC; c <= M_C; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'R' });
                for (let i = 0; i <= steps; i++) if (minR + i < 10 && minC + i < 10) previewWalls.push({ row: minR + i, col: minC + i, side: 'NS' });
            }
        } else if (!isDragging) {
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'WE' });
        }
    }
    else if (currentBrush === 5 || (currentEraseMode && currentBrush === 5)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);

            if (maxR - minR >= 1 && maxC - minC >= 1) {
                if (minR < 10 && minC < 10) previewWalls.push({ row: minR, col: minC, side: 'WE' }); 
                if (maxR < 10 && maxC < 10) previewWalls.push({ row: maxR, col: maxC, side: 'WE' }); 
                if (maxR < 10 && minC < 10) previewWalls.push({ row: maxR, col: minC, side: 'NS' }); 
                if (minR < 10 && maxC < 10) previewWalls.push({ row: minR, col: maxC, side: 'NS' }); 
                
                for (let r = minR + 1; r <= maxR - 1; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'L' }); 
                for (let r = minR + 1; r <= maxR - 1; r++) if (r < 10 && maxC + 1 < 10) previewWalls.push({ row: r, col: maxC + 1, side: 'L' }); 
                for (let c = minC + 1; c <= maxC - 1; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'R' }); 
                for (let c = minC + 1; c <= maxC - 1; c++) if (maxR + 1 < 10 && c < 10) previewWalls.push({ row: maxR + 1, col: c, side: 'R' }); 
            } else {
                for (let r = minR; r <= maxR; r++) if (r < 10 && minC < 10) previewWalls.push({ row: r, col: minC, side: 'L' });
                for (let c = minC; c <= maxC; c++) if (minR < 10 && c < 10) previewWalls.push({ row: minR, col: c, side: 'R' });
                for (let c = minC; c <= maxC; c++) if (maxR + 1 < 10 && c < 10) previewWalls.push({ row: maxR + 1, col: c, side: 'R' });
                for (let r = minR; r <= maxR; r++) if (r < 10 && maxC + 1 < 10) previewWalls.push({ row: r, col: maxC + 1, side: 'L' });
            }
        } else if (!isDragging) {
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            if (hoverRow + 1 < 10) previewWalls.push({ row: hoverRow + 1, col: hoverCol, side: 'R' });
            if (hoverCol + 1 < 10) previewWalls.push({ row: hoverRow, col: hoverCol + 1, side: 'L' });
        }
    }

    if (!currentEraseMode) {
        previewWalls = previewWalls.filter(p => isWallSupported(p.row, p.col, p.side));
    }
}

function renderCell(row, col, fIndex, isGhost, activeEraseMode = false, applyCutaway = false, showActiveTools = false) {
    const targetMap = mapData[fIndex];
    if (!targetMap || !targetMap[row]) return;

    ctx.save();
    
    const distance = fIndex - currentFloor;
    ctx.translate(0, -distance * levelHeight);

    const pNorte = gridToScreen(row, col);
    const pLeste = gridToScreen(row, col + 1);
    const pSul   = gridToScreen(row + 1, col + 1);
    const pOeste = gridToScreen(row + 1, col);

    const hasContent = targetMap[row][col].floor > 0 || targetMap[row][col].wallL > 0 || targetMap[row][col].wallR > 0 || targetMap[row][col].wallWE > 0 || targetMap[row][col].wallNS > 0 || targetMap[row][col].column > 0;
    
    let shouldDrawGrid = false;

    // ATUALIZADO: A grade segue puramente as regras de Z-Sorting (Profundidade)
    if (fIndex === currentFloor) {
        if (currentFloor <= 0) {
            shouldDrawGrid = true; 
        } else {
            const supp = isFloorSupported(row, col);
            shouldDrawGrid = hasContent || supp; 
        }
    } else if (fIndex < currentFloor) {
        shouldDrawGrid = hasContent;
    } else if (fIndex > currentFloor) {
        shouldDrawGrid = false;
    }

    let isDirt = false;
    if (fIndex <= 0) {
        if (targetMap[row][col].floor === 0 && !isEnclosed(fIndex, row, col)) {
            isDirt = true;
        }
    }

    if (isDirt) {
        ctx.fillStyle = dirtColor; 
        ctx.beginPath();
        ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
        ctx.closePath();
        ctx.fill();
    } else if (targetMap[row][col].floor > 0) {
        ctx.fillStyle = isGhost ? 'rgba(120, 120, 120, 0.3)' : 'rgba(100, 200, 100, 0.6)'; 
        ctx.beginPath();
        if (targetMap[row][col].floor === 1) { 
            ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
        } else if (targetMap[row][col].floor === 2) { 
            ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pOeste.x, pOeste.y);
        } else if (targetMap[row][col].floor === 3) { 
            ctx.moveTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y); ctx.lineTo(pLeste.x, pLeste.y);
        } else if (targetMap[row][col].floor === 4) { 
            ctx.moveTo(pOeste.x, pOeste.y); ctx.lineTo(pNorte.x, pNorte.y); ctx.lineTo(pSul.x, pSul.y);
        } else if (targetMap[row][col].floor === 5) { 
            ctx.moveTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pNorte.x, pNorte.y);
        }
        ctx.closePath();
        ctx.fill(); 
    }
    
    if (shouldDrawGrid) {
        ctx.beginPath();
        ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
        ctx.closePath();
        ctx.strokeStyle = isDirt ? 'rgba(255, 255, 255, 0.03)' : (isGhost ? 'rgba(85, 85, 85, 0.15)' : '#555'); 
        ctx.stroke();
    }

    if (showActiveTools && row === hoverRow && col === hoverCol && !isDragging && currentBrush === 1) {
        const supp = isFloorSupported(row, col);
        const previewType = getFloorType(row, col, 'CLICK', hoverQuadrant);
        ctx.beginPath();
        if (previewType === 1) { 
            ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
        } else if (previewType === 2) { 
            ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pOeste.x, pOeste.y);
        } else if (previewType === 3) { 
            ctx.moveTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y); ctx.lineTo(pLeste.x, pLeste.y);
        } else if (previewType === 4) { 
            ctx.moveTo(pOeste.x, pOeste.y); ctx.lineTo(pNorte.x, pNorte.y); ctx.lineTo(pSul.x, pSul.y);
        } else if (previewType === 5) { 
            ctx.moveTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pNorte.x, pNorte.y);
        }
        ctx.closePath();
        
        if (!supp && !activeEraseMode) ctx.fillStyle = 'rgba(255, 50, 50, 0.3)';
        else if (activeEraseMode) ctx.fillStyle = 'rgba(255, 50, 50, 0.2)';
        else ctx.fillStyle = 'rgba(100, 255, 100, 0.2)';
        ctx.fill();
    }

    let hL = targetMap[row][col].wallL;
    if (applyCutaway && hL > 0) hL = cutawayHeight;
    let hR = targetMap[row][col].wallR;
    if (applyCutaway && hR > 0) hR = cutawayHeight;

    if (hL > 0) drawFlatWall(pOeste, pNorte, hL, isGhost ? 'rgba(90, 90, 90, 0.5)' : '#b71c1c'); 
    if (hR > 0) drawFlatWall(pNorte, pLeste, hR, isGhost ? 'rgba(110, 110, 110, 0.5)' : '#e53935'); 

    let hWE = targetMap[row][col].wallWE;
    if (applyCutaway && hWE > 0) hWE = cutawayHeight;
    let hNS = targetMap[row][col].wallNS;
    if (applyCutaway && hNS > 0) hNS = cutawayHeight;

    if (hWE > 0) drawFlatWall(pOeste, pLeste, hWE, isGhost ? 'rgba(100, 100, 100, 0.5)' : '#d32f2f'); 
    if (hNS > 0) drawFlatWall(pNorte, pSul, hNS, isGhost ? 'rgba(80, 80, 80, 0.5)' : '#c62828'); 

    if (targetMap[row][col].column === 1) {
        let colH = blockHeight;
        if (applyCutaway) colH = cutawayHeight;
        const cx = pNorte.x;
        const cy = pNorte.y + (tileHeight / 2);
        
        ctx.fillStyle = isGhost ? 'rgba(130, 130, 130, 0.5)' : '#a3a3a3';
        ctx.strokeStyle = isGhost ? 'transparent' : '#555';
        
        ctx.beginPath();
        ctx.moveTo(cx, cy - colH - 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx - 6, cy - colH);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = isGhost ? 'rgba(100, 100, 100, 0.5)' : '#777';
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 6, cy);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        
        ctx.fillStyle = isGhost ? 'rgba(110, 110, 110, 0.5)' : '#888';
        ctx.beginPath();
        ctx.moveTo(cx, cy - colH + 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 4);
        ctx.closePath(); ctx.fill(); ctx.stroke();
    }

    if (showActiveTools && isCutaway && currentBrush === 6 && row === hoverRow && col === hoverCol && !isDragging) {
        const supp = isFloorSupported(row, col);
        let colH = blockHeight;
        if (applyCutaway) colH = cutawayHeight;
        const cx = pNorte.x;
        const cy = pNorte.y + (tileHeight / 2);
        
        let ghostColor = activeEraseMode ? 'rgba(255, 50, 50, 0.8)' : 'rgba(100, 255, 100, 0.8)';
        if (!supp && !activeEraseMode) ghostColor = 'rgba(255, 50, 50, 0.4)'; 
        
        ctx.fillStyle = ghostColor;
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 6, cy); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - colH + 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - colH - 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx - 6, cy - colH); ctx.closePath(); ctx.fill();
    }

    if (showActiveTools && isCutaway) {
        const ghosts = previewWalls.filter(p => p.row === row && p.col === col);
        if (ghosts.length > 0) {
            ctx.globalAlpha = 0.7;
            const ghostColor = activeEraseMode ? 'rgba(255, 50, 50, 0.8)' : 'rgba(100, 255, 100, 0.8)';
            
            ghosts.forEach(p => {
                let hGhost = blockHeight;
                if (applyCutaway) hGhost = cutawayHeight;

                if (p.side === 'L') drawFlatWall(pOeste, pNorte, hGhost, ghostColor);
                else if (p.side === 'R') drawFlatWall(pNorte, pLeste, hGhost, ghostColor);
                else if (p.side === 'WE') drawFlatWall(pOeste, pLeste, hGhost, ghostColor);
                else if (p.side === 'NS') drawFlatWall(pNorte, pSul, hGhost, ghostColor);
            });
            ctx.globalAlpha = 1.0;
        }
    }

    ctx.restore();
}

function drawIsometricGrid() {
    ctx.fillStyle = currentFloor >= 0 ? surfaceColor : undergroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(originX, originY);

    const floors = Object.keys(mapData).map(Number).sort((a, b) => a - b);
    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            
            for (const f of floors) {
                if (currentFloor < 0 && f >= 0) {
                    continue;
                }
                
                if (currentFloor >= 0 && f < 0) {
                    continue;
                }

                if (f < currentFloor) {
                    renderCell(row, col, f, true, false, false, false);
                } 
                else if (f === currentFloor) {
                    renderCell(row, col, f, false, currentEraseMode, isCutaway, true);
                } 
                else if (f > currentFloor && !isCutaway) {
                    renderCell(row, col, f, false, false, false, false);
                }
            }

        }
    }

    ctx.restore();
}

function applySmartBrush() {
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    const currentEraseMode = isDragging ? dragStartNode.erase : isErasing;

    if (!isCutaway) return; 

    if (currentBrush === 1) { 
        if (!currentEraseMode && !isFloorSupported(hoverRow, hoverCol)) return;
        const type = getFloorType(hoverRow, hoverCol, 'CLICK', hoverQuadrant);
        map[hoverRow][hoverCol].floor = updateFloorState(hoverRow, hoverCol, type, currentEraseMode); 
        return; 
    }
    
    if (currentBrush === 6) {
        if (!currentEraseMode && !isFloorSupported(hoverRow, hoverCol)) return;
        map[hoverRow][hoverCol].column = currentEraseMode ? 0 : 1;
        return;
    }

    if (currentEraseMode && isDragging && dragStartNode && dragStartNode.type === 'floor') {
        const type = getFloorType(hoverRow, hoverCol, 'CLICK', hoverQuadrant);
        map[hoverRow][hoverCol].floor = updateFloorState(hoverRow, hoverCol, type, true);
        return;
    }

    let tRow = hoverRow, tCol = hoverCol, side = 'L';
    if (hoverQuadrant === 'NE') side = 'R';
    else if (hoverQuadrant === 'SW') { tRow += 1; side = 'R'; }
    else if (hoverQuadrant === 'SE') { tCol += 1; side = 'L'; }

    if (tRow < 10 && tCol < 10 && !isDragging && currentBrush === 2) {
        if (!currentEraseMode && !isWallSupported(tRow, tCol, side)) return;

        if (currentEraseMode) {
            if (side === 'L') map[tRow][tCol].wallL = 0;
            if (side === 'R') map[tRow][tCol].wallR = 0;
        } else {
            if (side === 'L') map[tRow][tCol].wallL = blockHeight;
            if (side === 'R') map[tRow][tCol].wallR = blockHeight;
        }
    }
}

function changeFloor(delta) {
    saveState(); 
    currentFloor += delta;
    
    if (!mapData[currentFloor]) {
        mapData[currentFloor] = createEmptyMap();
    }
    
    map = mapData[currentFloor];
    
    updateUI();
    updatePreview();
    drawIsometricGrid();
}

function updateUI() {
    document.getElementById('btnPiso').classList.toggle('active', currentBrush === 1 && !isErasing);
    document.getElementById('btnParede').classList.toggle('active', currentBrush === 2 && !isErasing);
    document.getElementById('btnRoomRect').classList.toggle('active', currentBrush === 3 && !isErasing);
    document.getElementById('btnRoomTri').classList.toggle('active', currentBrush === 4 && !isErasing);
    document.getElementById('btnRoomOct').classList.toggle('active', currentBrush === 5 && !isErasing);
    document.getElementById('btnColuna').classList.toggle('active', currentBrush === 6 && !isErasing);
    document.getElementById('btnBorracha').classList.toggle('active', isErasing);
    document.getElementById('btnCutaway').innerText = isCutaway ? 'Paredes: CORTADAS (C)' : 'Paredes: INTEIRAS (C)';

    let floorName = currentFloor === 0 ? "Térreo (0)" : (currentFloor > 0 ? `Superior (${currentFloor})` : `Subsolo (${currentFloor})`);
    document.getElementById('floorLabel').innerText = `Andar Atual: ${floorName}`;
}

document.getElementById('sliderAltura').addEventListener('input', (e) => {
    blockHeight = parseInt(e.target.value);
    document.getElementById('valorAltura').innerText = blockHeight;
    updatePreview();
    drawIsometricGrid();
});

document.getElementById('colorSurface').addEventListener('input', (e) => {
    surfaceColor = e.target.value;
    drawIsometricGrid();
});
document.getElementById('colorUnderground').addEventListener('input', (e) => {
    undergroundColor = e.target.value;
    drawIsometricGrid();
});
document.getElementById('colorDirt').addEventListener('input', (e) => {
    dirtColor = e.target.value;
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
        if (currentBrush === 1 || currentBrush === 6 || (dragStartNode && dragStartNode.erase && dragStartNode.type === 'floor')) {
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
        floodFillFloor(hoverRow, hoverCol, isErasing ? 0 : 1, hoverQuadrant);
        drawIsometricGrid();
        return; 
    }

    isDragging = true; 
    
    if (currentBrush === 1 || currentBrush === 6) {
        dragStartNode = { type: currentBrush === 1 ? 'floor' : 'column', row: hoverRow, col: hoverCol, erase: isErasing };
        applySmartBrush(); 
    } else if ([3, 4, 5].includes(currentBrush)) {
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
        if ([2, 3, 4, 5].includes(currentBrush) && !eraseMode) {
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
            currentFloor = previousState.floor;
            mapData = JSON.parse(JSON.stringify(previousState.data));
            map = mapData[currentFloor];
            
            updateUI();
            drawIsometricGrid();
        }
        return;
    }

    if (['1','2','3','4','5','6'].includes(e.key)) {
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

document.getElementById('btnFloorUp').addEventListener('click', () => changeFloor(1));
document.getElementById('btnFloorDown').addEventListener('click', () => changeFloor(-1));

document.getElementById('btnPiso').addEventListener('click', () => { currentBrush = 1; updateUI(); });
document.getElementById('btnParede').addEventListener('click', () => { currentBrush = 2; updateUI(); });
document.getElementById('btnRoomRect').addEventListener('click', () => { currentBrush = 3; updateUI(); });
document.getElementById('btnRoomTri').addEventListener('click', () => { currentBrush = 4; updateUI(); });
document.getElementById('btnRoomOct').addEventListener('click', () => { currentBrush = 5; updateUI(); });
document.getElementById('btnColuna').addEventListener('click', () => { currentBrush = 6; updateUI(); });

document.getElementById('btnCutaway').addEventListener('click', () => { isCutaway = !isCutaway; updateUI(); drawIsometricGrid(); });
document.getElementById('btnUndo').addEventListener('click', () => { 
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    window.dispatchEvent(event);
});

updateUI();
drawIsometricGrid();