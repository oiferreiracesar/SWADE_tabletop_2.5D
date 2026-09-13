// ==========================================
// 1. VARIÁVEIS GLOBAIS E ESTADOS
// ==========================================
let canvas, ctx, container, texturePalette;

const tileWidth = 64;
const tileHeight = 32;

// Câmera e Responsividade
let cameraX = 0;
let cameraY = 0;
let cameraZoom = 1.0; 
const ZOOM_SPEED = 0.1;
let originX = 0; 
let originY = 0;
const keys = {}; // Estado do teclado para o WASD

const levelHeight = 48; 
let blockHeight = 48; 
const cutawayHeight = 12; 

let surfaceColor = '#1e293b'; 
let undergroundColor = '#0a0705'; 
let dirtColor = '#1e140f'; 
let roofColor = '#475569'; 
let roofPitch = 24; 

let hoverCol = -1, hoverRow = -1, hoverQuadrant = 'none';
let currentBrush = 1;
let isDragging = false, dragStartNode = null, previewWalls = [];
let isCutaway = true, isErasing = false;

let currentFloor = 0;
let mapData = {};
let map; 
let mapHistory = [];
let enclosedCache = {};

// ==========================================
// 2. GERENCIADOR DE TEXTURAS (SEU GITHUB)
// ==========================================
const textureURLs = {
    'concreto': 'https://www.transparenttextures.com/patterns/concrete-wall.png', 
    'grama': 'https://www.transparenttextures.com/patterns/grass.png',
    'madeira': 'https://www.transparenttextures.com/patterns/wood-pattern.png',
    'azulejo': 'https://www.transparenttextures.com/patterns/square-bg.png',
    'telha': 'https://www.transparenttextures.com/patterns/dark-matter.png'
};
const patterns = {};
let currentTexture = 'madeira';

// ==========================================
// 3. INICIALIZAÇÃO SEGURA E GAME LOOP
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    container = document.getElementById('canvas-container');
    texturePalette = document.getElementById('texturePalette');

    mapData[0] = createEmptyMap();
    map = mapData[0];

    // Constrói UI de Texturas de forma dinâmica
    if (texturePalette) {
        Object.keys(textureURLs).forEach(key => {
            let wrapper = document.createElement('div');
            wrapper.className = 'texture-wrapper';
            
            let btn = document.createElement('div');
            btn.className = 'texture-btn ' + (key === currentTexture ? 'selected' : '');
            btn.style.backgroundImage = `url(${textureURLs[key]})`;
            btn.onclick = () => {
                currentTexture = key;
                document.querySelectorAll('.texture-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                if(currentBrush !== 7 && currentBrush !== 8) {
                    currentBrush = 7; 
                    updateUI();
                }
            };

            let label = document.createElement('div');
            label.className = 'texture-label';
            label.innerText = key.toUpperCase();

            wrapper.appendChild(btn);
            wrapper.appendChild(label);
            texturePalette.appendChild(wrapper);
        });
    }

    // Carrega Texturas Blindado
    Object.keys(textureURLs).forEach(key => {
        let img = new Image();
        img.crossOrigin = "Anonymous";
        img.onerror = () => console.log("Textura não carregou: " + key);
        img.src = textureURLs[key];
        img.onload = () => {
            patterns[key] = ctx.createPattern(img, 'repeat');
            drawIsometricGrid(); 
        };
    });

    setupEventListeners();
    resizeCanvas();
    updateUI();
    requestAnimationFrame(gameLoop);
});

// A Função Blindada de Resolução
function resizeCanvas() {
    if (!canvas) return;
    let w = container ? container.clientWidth : window.innerWidth - 280;
    let h = container ? container.clientHeight : window.innerHeight;
    
    canvas.width = w;
    canvas.height = h;
    
    originX = canvas.width / 2;
    originY = canvas.height / 4; 
    drawIsometricGrid();
}

function gameLoop() {
    let moved = false;
    const speed = 15 / cameraZoom; 

    if (keys['w'] || keys['arrowup']) { cameraY += speed; moved = true; }
    if (keys['s'] || keys['arrowdown']) { cameraY -= speed; moved = true; }
    if (keys['a'] || keys['arrowleft']) { cameraX += speed; moved = true; }
    if (keys['d'] || keys['arrowright']) { cameraX -= speed; moved = true; }
    
    if (moved) drawIsometricGrid();
    requestAnimationFrame(gameLoop);
}

function setupEventListeners() {
    window.addEventListener('resize', resizeCanvas);

    window.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || e.key === 'F5') return;
        const k = e.key.toLowerCase();
        keys[k] = true; 

        if (e.ctrlKey && e.shiftKey && ['i', 'j', 'c'].includes(k)) { e.preventDefault(); return; }
        if (e.ctrlKey && k === 'u') { e.preventDefault(); return; }
        if (e.altKey) { e.preventDefault(); return; }

        if (e.key === 'Control' || e.key === 'Meta') { isErasing = true; updateUI(); updatePreview(); drawIsometricGrid(); return; }
        if (k === 'c') { isCutaway = !isCutaway; updateUI(); drawIsometricGrid(); return; }

        if ((e.ctrlKey || e.metaKey) && k === 'z') {
            e.preventDefault();
            const btnUndo = document.getElementById('btnUndo');
            if (btnUndo) {
                btnUndo.style.backgroundColor = 'rgba(255,255,255,0.2)';
                setTimeout(() => btnUndo.style.backgroundColor = '', 150);
            }
            if (mapHistory.length > 0) {
                const previousState = mapHistory.pop();
                currentFloor = previousState.floor;
                mapData = JSON.parse(JSON.stringify(previousState.data));
                map = mapData[currentFloor];
                updateUI(); drawIsometricGrid();
            }
            return;
        }

        if (['1','2','3','6','7','8'].includes(e.key)) {
            currentBrush = parseInt(e.key);
            isDragging = false; dragStartNode = null;
            updateUI(); updatePreview(); drawIsometricGrid();
        }
    });

    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
        if (e.key === 'Control' || e.key === 'Meta') {
            isErasing = false; updateUI(); updatePreview(); drawIsometricGrid();
        }
    });

    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (e.deltaY < 0) cameraZoom = Math.min(3.0, cameraZoom + ZOOM_SPEED);
        else cameraZoom = Math.max(0.3, cameraZoom - ZOOM_SPEED);
        drawIsometricGrid();
    }, { passive: false });

    // O operador '?.addEventListener' impede o código de crashar se o botão não existir
    document.getElementById('btnZoomIn')?.addEventListener('click', () => { cameraZoom = Math.min(3.0, cameraZoom + ZOOM_SPEED); drawIsometricGrid(); });
    document.getElementById('btnZoomOut')?.addEventListener('click', () => { cameraZoom = Math.max(0.3, cameraZoom - ZOOM_SPEED); drawIsometricGrid(); });
    document.getElementById('btnRotL')?.addEventListener('click', () => { alert("A Câmera foi consertada! O giro isométrico será nosso próximo passo."); });
    document.getElementById('btnRotR')?.addEventListener('click', () => { alert("A Câmera foi consertada! O giro isométrico será nosso próximo passo."); });

    document.getElementById('btnFloorUp')?.addEventListener('click', () => changeFloor(1));
    document.getElementById('btnFloorDown')?.addEventListener('click', () => changeFloor(-1));
    document.getElementById('btnPiso')?.addEventListener('click', () => { currentBrush = 1; updateUI(); });
    document.getElementById('btnParede')?.addEventListener('click', () => { currentBrush = 2; updateUI(); });
    document.getElementById('btnRoomRect')?.addEventListener('click', () => { currentBrush = 3; updateUI(); });
    document.getElementById('btnColuna')?.addEventListener('click', () => { currentBrush = 6; updateUI(); });
    document.getElementById('btnPaintFloor')?.addEventListener('click', () => { currentBrush = 7; updateUI(); });
    document.getElementById('btnPaintWall')?.addEventListener('click', () => { currentBrush = 8; updateUI(); });
    document.getElementById('btnCutaway')?.addEventListener('click', () => { isCutaway = !isCutaway; updateUI(); drawIsometricGrid(); });
    document.getElementById('btnUndo')?.addEventListener('click', () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true })); });

    document.getElementById('sliderAltura')?.addEventListener('input', (e) => { blockHeight = parseInt(e.target.value); document.getElementById('valorAltura').innerText = blockHeight; drawIsometricGrid(); });
    document.getElementById('roofPitchSelect')?.addEventListener('change', (e) => { roofPitch = parseInt(e.target.value); drawIsometricGrid(); });
    document.getElementById('colorSurface')?.addEventListener('input', (e) => { surfaceColor = e.target.value; drawIsometricGrid(); });
    document.getElementById('colorUnderground')?.addEventListener('input', (e) => { undergroundColor = e.target.value; drawIsometricGrid(); });
    document.getElementById('colorDirt')?.addEventListener('input', (e) => { dirtColor = e.target.value; drawIsometricGrid(); });
    document.getElementById('colorRoof')?.addEventListener('input', (e) => { roofColor = e.target.value; drawIsometricGrid(); });

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseleave', () => { isDragging = false; dragStartNode = null; isErasing = false; updateUI(); updatePreview(); drawIsometricGrid(); });
}

// ==========================================
// 4. LÓGICA CORE (Mapas e Interações)
// ==========================================
function createEmptyMap() {
    const newMap = [];
    for (let i = 0; i < 10; i++) {
        newMap[i] = [];
        for (let j = 0; j < 10; j++) {
            newMap[i][j] = { 
                floor: 0, floorTex: null,
                wallL: 0, wallLTex: null,
                wallR: 0, wallRTex: null,
                wallWE: 0, wallWETex: null,
                wallNS: 0, wallNSTex: null,
                column: 0 
            }; 
        }
    }
    return newMap;
}

function handleMouseMove(e) {
    isErasing = e.ctrlKey || e.metaKey;
    updateUI(); 

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    hoverCol = -1; hoverRow = -1; hoverQuadrant = 'none';

    ctx.save();
    ctx.translate(originX + cameraX, originY + cameraY);
    ctx.scale(cameraZoom, cameraZoom);
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const pN = gridToScreen(row, col);
            const pE = gridToScreen(row, col + 1);
            const pS = gridToScreen(row + 1, col + 1);
            const pW = gridToScreen(row + 1, col);
            
            defineTilePath(pN, pE, pS, pW);
            
            if (ctx.isPointInPath(mouseX, mouseY)) {
                hoverRow = row; hoverCol = col;
                
                const cX = (col - row) * (tileWidth / 2);
                const cY = (col + row) * (tileHeight / 2) + (tileHeight / 2);
                const adjX = (mouseX - (originX + cameraX)) / cameraZoom;
                const adjY = (mouseY - (originY + cameraY)) / cameraZoom;

                if (adjX < cX && adjY < cY) hoverQuadrant = 'NW';
                else if (adjX >= cX && adjY < cY) hoverQuadrant = 'NE';
                else if (adjX < cX && adjY >= cY) hoverQuadrant = 'SW';
                else hoverQuadrant = 'SE';
            }
        }
    }
    ctx.restore();

    if (isDragging) {
        if (currentBrush === 1 || currentBrush === 6 || currentBrush === 7 || currentBrush === 8 || (dragStartNode && dragStartNode.erase && dragStartNode.type === 'floor')) {
            applySmartBrush(); 
        }
    }

    updatePreview();
    drawIsometricGrid();
}

function handleMouseDown(e) {
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    
    isErasing = e.ctrlKey || e.metaKey;
    updateUI();
    saveState(); 

    if (e.shiftKey && currentBrush === 1) {
        if (!isErasing && !isFloorSupported(hoverRow, hoverCol)) return;
        const queue = [{r: hoverRow, c: hoverCol}];
        const visited = new Set();
        visited.add(`${hoverRow},${hoverCol}`);

        while(queue.length > 0) {
            const {r, c} = queue.shift();
            const oldFloor = map[r][c].floor;
            map[r][c].floor = isErasing ? 0 : 1;
            
            if (!isErasing && oldFloor === 0) continue;
            
            const wL = map[r][c].wallL > 0; const wR = map[r][c].wallR > 0;
            const wWE = map[r][c].wallWE > 0; const wNS = map[r][c].wallNS > 0;
            const wL_next = c < 9 && map[r][c+1].wallL > 0;
            const wR_next = r < 9 && map[r+1][c].wallR > 0;

            if (c > 0 && !wL && !wWE && !wNS && !visited.has(`${r},${c-1}`)) { visited.add(`${r},${c-1}`); queue.push({r, c: c-1}); }
            if (c < 9 && !wL_next && !wWE && !wNS && !visited.has(`${r},${c+1}`)) { visited.add(`${r},${c+1}`); queue.push({r, c: c+1}); }
            if (r > 0 && !wR && !wWE && !wNS && !visited.has(`${r-1},${c}`)) { visited.add(`${r-1},${c}`); queue.push({r: r-1, c}); }
            if (r < 9 && !wR_next && !wWE && !wNS && !visited.has(`${r+1},${c}`)) { visited.add(`${r+1},${c}`); queue.push({r: r+1, c}); }
        }
        drawIsometricGrid();
        return; 
    }

    isDragging = true; 
    
    if (currentBrush === 1 || currentBrush === 6 || currentBrush === 7 || currentBrush === 8) {
        dragStartNode = { type: currentBrush === 1 ? 'floor' : 'paint', row: hoverRow, col: hoverCol, erase: isErasing };
        applySmartBrush(); 
    } else if (currentBrush === 3) {
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
}

function handleMouseUp() {
    if (isDragging) {
        const eraseMode = dragStartNode.erase;
        if (currentBrush === 2 || currentBrush === 3) {
            if (!eraseMode) {
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
    }
    isDragging = false; 
    dragStartNode = null;
    updatePreview();
    drawIsometricGrid();
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

function drawFlatWall(p1, p2, height, baseColor, z1 = 0, z2 = 0, texPattern = null) {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y - z1); 
    ctx.lineTo(p2.x, p2.y - z2); 
    ctx.lineTo(p2.x, p2.y - height); 
    ctx.lineTo(p1.x, p1.y - height); 
    ctx.closePath();
    
    ctx.fillStyle = baseColor;
    ctx.fill();

    if (texPattern && patterns[texPattern]) {
        ctx.save();
        ctx.fillStyle = patterns[texPattern];
        ctx.fill();
        ctx.restore();

        let overlay = baseColor === '#b71c1c' ? 'rgba(0,0,0,0.5)' : 
                      baseColor === '#e53935' ? 'rgba(0,0,0,0.1)' : 
                      baseColor === '#d32f2f' ? 'rgba(0,0,0,0.4)' : 
                      'rgba(0,0,0,0.2)';
        ctx.fillStyle = overlay;
        ctx.fill();
    }

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

        if (fMap[r][c].wallWE > 0 || fMap[r][c].wallNS > 0) continue;

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

function precalculateRooms() {
    enclosedCache = {};
    const floors = Object.keys(mapData).map(Number);
    for (const f of floors) {
        for (let r = 0; r < 10; r++) {
            for (let c = 0; c < 10; c++) {
                enclosedCache[`${f},${r},${c}`] = isEnclosed(f, r, c);
            }
        }
    }
}

function getRoofZ(fIndex, x, y, pitch) {
    let minDist = Infinity;
    for (let r = -2; r <= 11; r++) {
        for (let c = -2; c <= 11; c++) {
            let isEnclosedCell = false;
            if (r >= 0 && r < 10 && c >= 0 && c < 10) {
                isEnclosedCell = enclosedCache[`${fIndex},${r},${c}`] || mapData[fIndex][r][c].floor > 0;
            }
            if (!isEnclosedCell) {
                let dx = 0;
                if (x < r) dx = r - x; else if (x > r + 1) dx = x - (r + 1);
                let dy = 0;
                if (y < c) dy = c - y; else if (y > c + 1) dy = y - (c + 1);
                let dist = Math.max(dx, dy);
                if (dist < minDist) minDist = dist;
            }
        }
    }
    return minDist * pitch;
}

function getTriangleShade(p1, p2, p3) {
    let det = (p2.x - p1.x)*(p3.y - p1.y) - (p3.x - p1.x)*(p2.y - p1.y);
    if (Math.abs(det) < 0.0001) return 'rgba(0,0,0,0)'; 
    let a = ((p2.z - p1.z)*(p3.y - p1.y) - (p3.z - p1.z)*(p2.y - p1.y)) / det; 
    let b = ((p3.z - p1.z)*(p2.x - p1.x) - (p2.z - p1.z)*(p3.x - p1.x)) / det; 

    let eps = 0.01; let nx = -a; let ny = -b;

    if (nx > eps && Math.abs(ny) <= eps) return 'rgba(255,255,255,0.15)'; 
    if (nx < -eps && Math.abs(ny) <= eps) return 'rgba(0,0,0,0.1)'; 
    if (Math.abs(nx) <= eps && ny > eps) return 'rgba(0,0,0,0.4)'; 
    if (Math.abs(nx) <= eps && ny < -eps) return 'rgba(0,0,0,0.25)'; 

    if (nx > eps && ny > eps) return 'rgba(0,0,0,0.15)';
    if (nx > eps && ny < -eps) return 'rgba(255,255,255,0.05)';
    if (nx < -eps && ny > eps) return 'rgba(0,0,0,0.3)';
    if (nx < -eps && ny < -eps) return 'rgba(0,0,0,0.2)';

    return 'rgba(255,255,255,0.05)'; 
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

function hasStructureAbove(fIndex, r, c) {
    const upper = mapData[fIndex + 1];
    if (!upper) return false;
    if (upper[r][c].floor > 0) return true;
    if (enclosedCache[`${fIndex + 1},${r},${c}`]) return true;
    return false;
}

function isFloorEmpty(fIndex) {
    const fMap = mapData[fIndex];
    if (!fMap) return true;
    for(let r=0; r<10; r++) {
        for(let c=0; c<10; c++) {
            if (fMap[r][c].floor > 0 || fMap[r][c].wallWE > 0 || fMap[r][c].wallNS > 0 || fMap[r][c].wallL > 0 || fMap[r][c].wallR > 0 || fMap[r][c].column > 0) return false;
        }
    }
    return true;
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

    if (!currentEraseMode) {
        previewWalls = previewWalls.filter(p => isWallSupported(p.row, p.col, p.side));
    }
}

// ==========================================
// 5. RENDERIZAÇÃO (A Mágica Visual)
// ==========================================
function renderCell(row, col, fIndex, isGhost, activeEraseMode = false, applyCutaway = false, showActiveTools = false, renderPass = 0) {
    const targetMap = mapData[fIndex];
    if (!targetMap || !targetMap[row]) return;

    ctx.save();
    const distance = fIndex - currentFloor;
    ctx.translate(0, -distance * levelHeight);

    const pNorte = gridToScreen(row, col);
    const pLeste = gridToScreen(row, col + 1);
    const pSul   = gridToScreen(row + 1, col + 1);
    const pOeste = gridToScreen(row + 1, col);

    if (renderPass === 0) {
        const hasContent = targetMap[row][col].floor > 0 || targetMap[row][col].wallL > 0 || targetMap[row][col].wallR > 0 || targetMap[row][col].wallWE > 0 || targetMap[row][col].wallNS > 0 || targetMap[row][col].column > 0;
        
        let shouldDrawGrid = false;
        if (fIndex === currentFloor) {
            if (currentFloor <= 0) shouldDrawGrid = true; 
            else shouldDrawGrid = hasContent || isFloorSupported(row, col); 
        } else if (fIndex < currentFloor) {
            shouldDrawGrid = hasContent;
        } else if (fIndex > currentFloor) {
            shouldDrawGrid = false;
        }

        let isDirt = false;
        if (fIndex <= 0 && targetMap[row][col].floor === 0 && !enclosedCache[`${fIndex},${row},${col}`]) isDirt = true;

        if (isDirt) {
            ctx.fillStyle = dirtColor; 
            ctx.beginPath(); ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
            ctx.closePath(); ctx.fill();
        } else if (targetMap[row][col].floor > 0) {
            ctx.beginPath(); 
            ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
            ctx.closePath(); 

            let fTex = targetMap[row][col].floorTex;
            
            if (fTex && patterns[fTex] && !isGhost && !activeEraseMode) {
                ctx.save();
                ctx.clip(); 
                ctx.translate(pNorte.x, pNorte.y); 
                ctx.scale(1, 0.5); 
                ctx.rotate(45 * Math.PI / 180); 
                ctx.fillStyle = patterns[fTex];
                ctx.fillRect(0, 0, tileWidth * 1.5, tileWidth * 1.5);
                ctx.restore();
            } else {
                ctx.fillStyle = isGhost ? 'rgba(120, 120, 120, 0.3)' : 'rgba(100, 200, 100, 0.6)'; 
                ctx.fill(); 
            }
        }
        
        if (shouldDrawGrid) {
            ctx.beginPath(); ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
            ctx.closePath(); ctx.strokeStyle = isDirt ? 'rgba(255, 255, 255, 0.03)' : (isGhost ? 'rgba(85, 85, 85, 0.15)' : 'rgba(0,0,0,0.2)'); ctx.stroke();
        }

        if (showActiveTools && row === hoverRow && col === hoverCol && !isDragging) {
            const supp = isFloorSupported(row, col);
            if (currentBrush === 1 || currentBrush === 7) {
                ctx.beginPath(); ctx.moveTo(pNorte.x, pNorte.y); ctx.lineTo(pLeste.x, pLeste.y); ctx.lineTo(pSul.x, pSul.y); ctx.lineTo(pOeste.x, pOeste.y);
                ctx.closePath();
                ctx.fillStyle = (!supp && !activeEraseMode) ? 'rgba(255, 50, 50, 0.3)' : (activeEraseMode ? 'rgba(255, 50, 50, 0.2)' : 'rgba(100, 255, 100, 0.4)');
                ctx.fill();
            }
        }

        let hL = targetMap[row][col].wallL; if (applyCutaway && hL > 0) hL = cutawayHeight;
        let hR = targetMap[row][col].wallR; if (applyCutaway && hR > 0) hR = cutawayHeight;
        let hWE = targetMap[row][col].wallWE; if (applyCutaway && hWE > 0) hWE = cutawayHeight;
        let hNS = targetMap[row][col].wallNS; if (applyCutaway && hNS > 0) hNS = cutawayHeight;

        let zL_W = 0, zL_N = 0, zR_N = 0, zR_E = 0, zWE_W = 0, zWE_E = 0, zNS_N = 0, zNS_S = 0;
        
        if (fIndex > 0) {
            let fB = fIndex - 1; 
            let checkR = (r, c) => {
                if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
                let ind = enclosedCache[`${fB},${r},${c}`] || mapData[fB][r][c].floor > 0;
                return ind && !hasStructureAbove(fB, r, c);
            };
            
            if (hL > 0 && (checkR(row, col) || checkR(row, col-1))) { zL_W = Math.min(hL, getRoofZ(fB, row+1, col, roofPitch)); zL_N = Math.min(hL, getRoofZ(fB, row, col, roofPitch)); }
            if (hR > 0 && (checkR(row, col) || checkR(row-1, col))) { zR_N = Math.min(hR, getRoofZ(fB, row, col, roofPitch)); zR_E = Math.min(hR, getRoofZ(fB, row, col+1, roofPitch)); }
            if (hWE > 0 && checkR(row, col)) { zWE_W = Math.min(hWE, getRoofZ(fB, row+1, col, roofPitch)); zWE_E = Math.min(hWE, getRoofZ(fB, row, col+1, roofPitch)); }
            if (hNS > 0 && checkR(row, col)) { zNS_N = Math.min(hNS, getRoofZ(fB, row, col, roofPitch)); zNS_S = Math.min(hNS, getRoofZ(fB, row+1, col+1, roofPitch)); }
        }

        let texL = isGhost || activeEraseMode ? null : targetMap[row][col].wallLTex;
        let texR = isGhost || activeEraseMode ? null : targetMap[row][col].wallRTex;
        let texWE = isGhost || activeEraseMode ? null : targetMap[row][col].wallWETex;
        let texNS = isGhost || activeEraseMode ? null : targetMap[row][col].wallNSTex;

        if (hL > 0) drawFlatWall(pOeste, pNorte, hL, isGhost ? 'rgba(90, 90, 90, 0.5)' : '#b71c1c', zL_W, zL_N, texL); 
        if (hR > 0) drawFlatWall(pNorte, pLeste, hR, isGhost ? 'rgba(110, 110, 110, 0.5)' : '#e53935', zR_N, zR_E, texR); 
        if (hWE > 0) drawFlatWall(pOeste, pLeste, hWE, isGhost ? 'rgba(100, 100, 100, 0.5)' : '#d32f2f', zWE_W, zWE_E, texWE); 
        if (hNS > 0) drawFlatWall(pNorte, pSul, hNS, isGhost ? 'rgba(80, 80, 80, 0.5)' : '#c62828', zNS_N, zNS_S, texNS); 

        if (showActiveTools && currentBrush === 8 && row === hoverRow && col === hoverCol && !isDragging) {
            let edge = getTargetEdge(hoverRow, hoverCol, hoverQuadrant);
            if(edge && map[edge.row][edge.col]['wall' + edge.side] > 0) {
                let pA, pB;
                if(edge.side === 'L') { pA = gridToScreen(edge.row+1, edge.col); pB = gridToScreen(edge.row, edge.col); }
                if(edge.side === 'R') { pA = gridToScreen(edge.row, edge.col); pB = gridToScreen(edge.row, edge.col+1); }
                if(edge.side === 'WE') { pA = gridToScreen(edge.row+1, edge.col); pB = gridToScreen(edge.row, edge.col+1); }
                if(edge.side === 'NS') { pA = gridToScreen(edge.row, edge.col); pB = gridToScreen(edge.row+1, edge.col+1); }
                drawFlatWall(pA, pB, blockHeight, 'rgba(255, 255, 0, 0.4)');
            }
        }

        if (targetMap[row][col].column === 1) {
            let colH = applyCutaway ? cutawayHeight : blockHeight;
            const cx = pNorte.x; const cy = pNorte.y + (tileHeight / 2);
            
            ctx.fillStyle = isGhost ? 'rgba(130, 130, 130, 0.5)' : '#a3a3a3'; ctx.strokeStyle = isGhost ? 'transparent' : '#555';
            ctx.beginPath(); ctx.moveTo(cx, cy - colH - 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx - 6, cy - colH); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = isGhost ? 'rgba(100, 100, 100, 0.5)' : '#777';
            ctx.beginPath(); ctx.moveTo(cx - 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 6, cy); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.fillStyle = isGhost ? 'rgba(110, 110, 110, 0.5)' : '#888';
            ctx.beginPath(); ctx.moveTo(cx, cy - colH + 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 4); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    } 

    else if (renderPass === 1) {
        let hideLowerRoof = false;
        if (fIndex < currentFloor && isFloorEmpty(currentFloor)) hideLowerRoof = true;
        let isIndoors = enclosedCache[`${fIndex},${row},${col}`] || targetMap[row][col].floor > 0;

        if (!isCutaway && fIndex >= 0 && !hideLowerRoof && isIndoors && !hasStructureAbove(fIndex, row, col)) {
            
            let zN = getRoofZ(fIndex, row, col, roofPitch);
            let zNE = getRoofZ(fIndex, row, col + 0.5, roofPitch);
            let zE = getRoofZ(fIndex, row, col + 1, roofPitch);
            let zSE = getRoofZ(fIndex, row + 0.5, col + 1, roofPitch);
            let zS = getRoofZ(fIndex, row + 1, col + 1, roofPitch);
            let zSW = getRoofZ(fIndex, row + 1, col + 0.5, roofPitch);
            let zW = getRoofZ(fIndex, row + 1, col, roofPitch);
            let zNW = getRoofZ(fIndex, row + 0.5, col, roofPitch);
            let zC = getRoofZ(fIndex, row + 0.5, col + 0.5, roofPitch);

            let t_pN = gridToScreen(row, col); t_pN.y -= (blockHeight + zN);
            let t_pNE = gridToScreen(row, col + 0.5); t_pNE.y -= (blockHeight + zNE);
            let t_pE = gridToScreen(row, col + 1); t_pE.y -= (blockHeight + zE);
            let t_pSE = gridToScreen(row + 0.5, col + 1); t_pSE.y -= (blockHeight + zSE);
            let t_pS = gridToScreen(row + 1, col + 1); t_pS.y -= (blockHeight + zS);
            let t_pSW = gridToScreen(row + 1, col + 0.5); t_pSW.y -= (blockHeight + zSW);
            let t_pW = gridToScreen(row + 1, col); t_pW.y -= (blockHeight + zW);
            let t_pNW = gridToScreen(row + 0.5, col); t_pNW.y -= (blockHeight + zNW);
            let t_pC = gridToScreen(row + 0.5, col + 0.5); t_pC.y -= (blockHeight + zC);

            let pN_3d = {x: row, y: col, z: zN};
            let pNE_3d = {x: row, y: col + 0.5, z: zNE};
            let pE_3d = {x: row, y: col + 1, z: zE};
            let pSE_3d = {x: row + 0.5, y: col + 1, z: zSE};
            let pS_3d = {x: row + 1, y: col + 1, z: zS};
            let pSW_3d = {x: row + 1, y: col + 0.5, z: zSW};
            let pW_3d = {x: row + 1, y: col, z: zW};
            let pNW_3d = {x: row + 0.5, y: col, z: zNW};
            let pC_3d = {x: row + 0.5, y: col + 0.5, z: zC};

            ctx.save();
            ctx.beginPath(); ctx.moveTo(pSul.x, pSul.y - blockHeight); ctx.lineTo(pLeste.x, pLeste.y - blockHeight); ctx.lineTo(pLeste.x, pLeste.y - blockHeight - 2000); ctx.lineTo(pNorte.x, pNorte.y - blockHeight - 2000); ctx.lineTo(pOeste.x, pOeste.y - blockHeight - 2000); ctx.lineTo(pOeste.x, pOeste.y - blockHeight); ctx.closePath(); ctx.clip();

            let neighborHasRoof = (r, c) => {
                if (r < 0 || r >= 10 || c < 0 || c >= 10) return false;
                let ind = enclosedCache[`${fIndex},${r},${c}`] || mapData[fIndex][r][c].floor > 0;
                return ind && !hasStructureAbove(fIndex, r, c);
            };

            const drawSkirt = (p1_2d, p2_2d, p1_3d, p2_3d, overlay) => {
                if (p1_3d.z <= 0.1 && p2_3d.z <= 0.1) return;
                ctx.fillStyle = roofColor;
                ctx.beginPath(); ctx.moveTo(p1_2d.x, p1_2d.y); ctx.lineTo(p2_2d.x, p2_2d.y); ctx.lineTo(p2_2d.x, p2_2d.y + p2_3d.z); ctx.lineTo(p1_2d.x, p1_2d.y + p1_3d.z); ctx.closePath();
                ctx.fill();

                if (patterns['telha']) { ctx.fillStyle = patterns['telha']; ctx.fill(); }

                ctx.fillStyle = overlay; ctx.fill();
                ctx.strokeStyle = roofColor; ctx.lineWidth = 1; ctx.stroke();
            };

            if (!neighborHasRoof(row - 1, col)) { drawSkirt(t_pN, t_pNE, pN_3d, pNE_3d, 'rgba(0,0,0,0.1)'); drawSkirt(t_pNE, t_pE, pNE_3d, pE_3d, 'rgba(0,0,0,0.1)'); }
            if (!neighborHasRoof(row, col + 1)) { drawSkirt(t_pE, t_pSE, pE_3d, pSE_3d, 'rgba(0,0,0,0.4)'); drawSkirt(t_pSE, t_pS, pSE_3d, pS_3d, 'rgba(0,0,0,0.4)'); }
            if (!neighborHasRoof(row + 1, col)) { drawSkirt(t_pS, t_pSW, pS_3d, pSW_3d, 'rgba(255,255,255,0.15)'); drawSkirt(t_pSW, t_pW, pSW_3d, pW_3d, 'rgba(255,255,255,0.15)'); }
            if (!neighborHasRoof(row, col - 1)) { drawSkirt(t_pW, t_pNW, pW_3d, pNW_3d, 'rgba(0,0,0,0.3)'); drawSkirt(t_pNW, t_pN, pNW_3d, pN_3d, 'rgba(0,0,0,0.3)'); }

            const drawMicroTri = (p1, p2, p3, p1_3d, p2_3d, p3_3d) => {
                let overlay = getTriangleShade(p1_3d, p2_3d, p3_3d);
                if (overlay === 'rgba(0,0,0,0)') return;

                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); 
                ctx.fillStyle = roofColor; ctx.fill();
                
                if (patterns['telha']) { ctx.fillStyle = patterns['telha']; ctx.fill(); }

                ctx.fillStyle = overlay; ctx.fill();
                ctx.strokeStyle = roofColor; ctx.lineWidth = 1; ctx.stroke();
            };

            drawMicroTri(t_pN, t_pNE, t_pC, pN_3d, pNE_3d, pC_3d);
            drawMicroTri(t_pNE, t_pE, t_pC, pNE_3d, pE_3d, pC_3d);
            drawMicroTri(t_pE, t_pSE, t_pC, pE_3d, pSE_3d, pC_3d);
            drawMicroTri(t_pSE, t_pS, t_pC, pSE_3d, pS_3d, pC_3d);
            drawMicroTri(t_pS, t_pSW, t_pC, pS_3d, pSW_3d, pC_3d);
            drawMicroTri(t_pSW, t_pW, t_pC, pSW_3d, pW_3d, pC_3d);
            drawMicroTri(t_pW, t_pNW, t_pC, pW_3d, pNW_3d, pC_3d);
            drawMicroTri(t_pNW, t_pN, t_pC, pNW_3d, pN_3d, pC_3d);
            
            ctx.restore();
        }
    }

    if (showActiveTools && currentBrush === 6 && row === hoverRow && col === hoverCol && !isDragging) {
        const supp = isFloorSupported(row, col);
        let colH = applyCutaway ? cutawayHeight : blockHeight;
        const cx = pNorte.x; const cy = pNorte.y + (tileHeight / 2);
        let ghostColor = (!supp && !activeEraseMode) ? 'rgba(255, 50, 50, 0.4)' : (activeEraseMode ? 'rgba(255, 50, 50, 0.8)' : 'rgba(100, 255, 100, 0.8)'); 
        ctx.fillStyle = ghostColor;
        ctx.beginPath(); ctx.moveTo(cx - 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 6, cy); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - colH + 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 4); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - colH - 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx - 6, cy - colH); ctx.closePath(); ctx.fill();
    }

    if (showActiveTools && renderPass === 1) {
        const ghosts = previewWalls.filter(p => p.row === row && p.col === col);
        if (ghosts.length > 0) {
            ctx.globalAlpha = 0.7;
            const ghostColor = activeEraseMode ? 'rgba(255, 50, 50, 0.8)' : 'rgba(100, 255, 100, 0.8)';
            ghosts.forEach(p => {
                let hGhost = applyCutaway ? cutawayHeight : blockHeight;
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
    if (!mapData || !mapData[currentFloor]) return;
    precalculateRooms(); 
    
    ctx.fillStyle = currentFloor >= 0 ? surfaceColor : undergroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(originX + cameraX, originY + cameraY);
    ctx.scale(cameraZoom, cameraZoom);

    const floors = Object.keys(mapData).map(Number).sort((a, b) => a - b);
    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    let renderQueue = [];
    for (const f of floors) {
        if (currentFloor < 0 && f >= 0) continue;
        if (currentFloor >= 0 && f < 0) continue;
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                renderQueue.push({ r: row, c: col, f: f });
            }
        }
    }

    renderQueue.sort((a, b) => {
        let depthA = a.r + a.c;
        let depthB = b.r + b.c;
        if (depthA !== depthB) return depthA - depthB;
        if (a.f !== b.f) return a.f - b.f;
        return a.c - b.c; 
    });

    for (const cell of renderQueue) {
        renderCell(cell.r, cell.c, cell.f, cell.f < currentFloor, currentEraseMode, isCutaway, cell.f === currentFloor, 0);
        renderCell(cell.r, cell.c, cell.f, cell.f < currentFloor, currentEraseMode, isCutaway, cell.f === currentFloor, 1);
    }

    ctx.restore();
}

function applySmartBrush() {
    if (hoverRow < 0 || hoverRow >= 10 || hoverCol < 0 || hoverCol >= 10) return;
    const currentEraseMode = isDragging ? dragStartNode.erase : isErasing;

    if (!isCutaway) return; 

    if (currentBrush === 7) { 
        if (map[hoverRow][hoverCol].floor > 0) {
            map[hoverRow][hoverCol].floorTex = currentEraseMode ? null : currentTexture;
        }
        return;
    }
    
    if (currentBrush === 8) {
        let edge = getTargetEdge(hoverRow, hoverCol, hoverQuadrant);
        if (edge && map[edge.row][edge.col]['wall' + edge.side] > 0) {
            map[edge.row][edge.col]['wall' + edge.side + 'Tex'] = currentEraseMode ? null : currentTexture;
        }
        return;
    }

    if (currentBrush === 1) { 
        if (!currentEraseMode && !isFloorSupported(hoverRow, hoverCol)) return;
        map[hoverRow][hoverCol].floor = currentEraseMode ? 0 : 1; 
        return; 
    }
    
    if (currentBrush === 6) {
        if (!currentEraseMode && !isFloorSupported(hoverRow, hoverCol)) return;
        map[hoverRow][hoverCol].column = currentEraseMode ? 0 : 1;
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
    if (!mapData[currentFloor]) mapData[currentFloor] = createEmptyMap();
    map = mapData[currentFloor];
    updateUI();
    drawIsometricGrid();
}

function updateUI() {
    document.getElementById('btnPiso')?.classList.toggle('active', currentBrush === 1 && !isErasing);
    document.getElementById('btnParede')?.classList.toggle('active', currentBrush === 2 && !isErasing);
    document.getElementById('btnRoomRect')?.classList.toggle('active', currentBrush === 3 && !isErasing);
    document.getElementById('btnColuna')?.classList.toggle('active', currentBrush === 6 && !isErasing);
    
    document.getElementById('btnPaintFloor')?.classList.toggle('active', currentBrush === 7 && !isErasing);
    document.getElementById('btnPaintWall')?.classList.toggle('active', currentBrush === 8 && !isErasing);

    document.getElementById('btnBorracha')?.classList.toggle('active', isErasing);
    
    const cutawayBtn = document.getElementById('btnCutaway');
    if (cutawayBtn) cutawayBtn.innerText = isCutaway ? 'Paredes: CORTADAS (C)' : 'Paredes: INTEIRAS (C)';

    const floorLabel = document.getElementById('floorLabel');
    if (floorLabel) floorLabel.innerText = `Andar Atual: ${currentFloor === 0 ? "Térreo (0)" : (currentFloor > 0 ? `Superior (${currentFloor})` : `Subsolo (${currentFloor})`)}`;
}