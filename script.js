const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('canvas-container');

const tileWidth = 64;
const tileHeight = 32;

// CAMERA.
// camX/camY deslocam o mapa; camZoom escala tudo em torno do centro da tela.
// Todo mundo -- desenho, clique e teste -- passa por worldParaTela/telaParaWorld,
// para nao existir duas versoes da mesma conta.
let camX = 0, camY = 0;
let camZoom = 1;
const ZOOM_MIN = 0.4, ZOOM_MAX = 2.5;

// Centro geometrico do tabuleiro no espaco projetado: gridToScreen(5,5).
const CENTRO_MAPA = { x: 0, y: 10 * 32 / 2 };

// GRADE = quantos ladrilhos o tabuleiro tem. BORDA = quantas LINHAS de celula o
// motor guarda. Sao numeros diferentes de proposito: parede mora em ARESTA, e a
// aresta leste do ultimo ladrilho so tem onde ser guardada se existir uma faixa
// de celulas sentinela depois dele. Sem ela o tabuleiro 10x10 era, na pratica,
// 9x9 -- nao dava para encostar construcao na borda.
const GRADE = 10;
const BORDA = GRADE + 1;

function worldParaTela(wx, wy) {
    return {
        x: canvas.width  / 2 + (wx + camX - CENTRO_MAPA.x) * camZoom,
        y: canvas.height / 2 + (wy + camY - CENTRO_MAPA.y) * camZoom,
    };
}
function telaParaWorld(sx, sy) {
    return {
        x: (sx - canvas.width  / 2) / camZoom - camX + CENTRO_MAPA.x,
        y: (sy - canvas.height / 2) / camZoom - camY + CENTRO_MAPA.y,
    };
}
// Posicao do mouse em coordenadas fracionarias da grade (inverso de gridToScreen).
function telaParaGrade(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const w = telaParaWorld(clientX - rect.left, clientY - rect.top);
    return {
        col: (w.x / (tileWidth / 2) + w.y / (tileHeight / 2)) / 2,
        row: (w.y / (tileHeight / 2) - w.x / (tileWidth / 2)) / 2,
    };
}

// ALTURA: propriedade de CADA parede, nao do andar.
// blockHeight e a altura da PROXIMA parede a ser construida -- um ajuste de
// ferramenta. Paredes ja erguidas guardam a sua e nao mudam, o que permite
// parede baixa e nave de igreja no mesmo tabuleiro.
let blockHeight = 48;
let cutawayHeight = 12;

// O empilhamento de andares tem altura propria e fixa: com paredes de alturas
// variadas nao existe "a" altura do andar. Parede mais alta que isso atravessa
// o piso de cima de proposito -- e assim que se faz um pe-direito duplo.
const alturaDoAndar = 48;

// Altura do telhado de cada cômodo: a da parede mais alta que o cerca.
let alturaComodo = {};

let surfaceColor = '#1e293b'; 

// ===================== TEXTURAS =====================
// O catalogo vem do manifesto; as imagens sao carregadas sob demanda e guardadas
// aqui. Enquanto uma imagem nao chega, o desenho cai na cor solida de sempre --
// nunca fica um buraco esperando download.
let catalogoTexturas = [];
const imagensTextura = {};
let texturaSelecionada = { piso: null, parede: null, telhado: null, agua: null };

function imagemDaTextura(id) {
    if (!id) return null;
    const pronta = imagensTextura[id];
    if (pronta) return pronta.completa ? pronta.img : null;
    const item = catalogoTexturas.find(t => t.id === id);
    if (!item) return null;
    const img = new Image();
    const registro = { img, completa: false };
    imagensTextura[id] = registro;
    img.onload = () => { registro.completa = true; drawIsometricGrid(); };
    img.src = item.arquivo;
    return null;
}

// Projeta a imagem quadrada em cima de um paralelogramo: p0 e o canto, u e v sao
// os dois lados. E assim que a textura acompanha a perspectiva isometrica em vez
// de ficar colada na tela.
function pintarComTextura(img, p0, u, v, escurecer, recorte) {
    ctx.save();
    ctx.transform(u.x, u.y, v.x, v.y, p0.x, p0.y);
    if (recorte) ctx.drawImage(img, recorte.sx, recorte.sy, recorte.s, recorte.s, 0, 0, 1, 1);
    else ctx.drawImage(img, 0, 0, 1, 1);
    ctx.restore();
    if (escurecer) {
        ctx.fillStyle = escurecer;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p0.x + u.x, p0.y + u.y);
        ctx.lineTo(p0.x + u.x + v.x, p0.y + u.y + v.y);
        ctx.lineTo(p0.x + v.x, p0.y + v.y);
        ctx.closePath();
        ctx.fill();
    }
}

// Projeta um triangulo da imagem num triangulo da tela. E isso que faz a telha
// acompanhar a INCLINACAO da agua: cada fatia do telhado carrega as coordenadas
// do seu pedaco da imagem, em vez de receber a imagem achatada no quadro da
// celula -- que era o motivo de a telha sair esticada e desencontrada.
function desenharTrianguloTexturizado(img, p1, p2, p3, uv1, uv2, uv3) {
    const L = img.width, A = img.height;
    const u1 = uv1.u * L, v1 = uv1.v * A;
    const u2 = uv2.u * L, v2 = uv2.v * A;
    const u3 = uv3.u * L, v3 = uv3.v * A;

    const den = u1 * (v3 - v2) - u2 * (v3 - v1) + u3 * (v2 - v1);
    if (!den) return false;

    const a = (p1.x * (v3 - v2) - p2.x * (v3 - v1) + p3.x * (v2 - v1)) / den;
    const b = (p1.y * (v3 - v2) - p2.y * (v3 - v1) + p3.y * (v2 - v1)) / den;
    const c = (u1 * (p3.x - p2.x) - u2 * (p3.x - p1.x) + u3 * (p2.x - p1.x)) / den;
    const d = (u1 * (p3.y - p2.y) - u2 * (p3.y - p1.y) + u3 * (p2.y - p1.y)) / den;
    const e = (u1 * (v3 * p2.x - v2 * p3.x) - u2 * (v3 * p1.x - v1 * p3.x)
             + u3 * (v2 * p1.x - v1 * p2.x)) / den;
    const f = (u1 * (v3 * p2.y - v2 * p3.y) - u2 * (v3 * p1.y - v1 * p3.y)
             + u3 * (v2 * p1.y - v1 * p2.y)) / den;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y);
    ctx.closePath(); ctx.clip();
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
    return true;
}

// Ao girar o tabuleiro, a IMAGEM tambem precisa girar: senao a tabua do assoalho
// muda de direcao em relacao a casa a cada quarto de volta. Por isso o canto de
// origem e os dois lados sao escolhidos conforme a rotacao atual.
function baseDoPiso(pN, pL, pS, pO) {
    const cantos = [pN, pL, pS, pO];
    const o = cantos[rotacao % 4];
    const a = cantos[(rotacao + 1) % 4];
    const b = cantos[(rotacao + 3) % 4];
    return { p0: o, u: { x: a.x - o.x, y: a.y - o.y }, v: { x: b.x - o.x, y: b.y - o.y } };
}

// A mesma volta, em coordenadas de imagem, para o telhado.
function uvGirado(u, v) {
    switch (rotacao % 4) {
        case 1: return { u: v, v: 1 - u };
        case 2: return { u: 1 - u, v: 1 - v };
        case 3: return { u: 1 - v, v: u };
        default: return { u, v };
    }
}

// Cada face recebe um veu diferente para a parede nao virar um bloco chapado.
const veuDaFace = { L: 'rgba(0,0,0,0.30)', R: 'rgba(255,255,255,0.06)',
                    WE: 'rgba(0,0,0,0.16)', NS: 'rgba(0,0,0,0.24)' };

function carregarCatalogoTexturas() {
    fetch('texturas/manifesto.json')
        .then(r => r.ok ? r.json() : null)
        .then(dados => {
            if (!dados) return;
            catalogoTexturas = dados.texturas || [];
            montarPaletaTexturas();
            drawIsometricGrid();
        })
        .catch(() => { /* sem manifesto o motor segue nas cores solidas */ });
}

let undergroundColor = '#0a0705'; 
let dirtColor = '#1e140f'; 
let roofColor = '#475569'; 

let roofPitch = 24; 

// DUAS PALETAS COM PAPEIS SEPARADOS.
// Construido = pedra/reboco neutro. Verde = vai construir. Vermelho = vai apagar.
// Antes a parede pronta era vermelha e o chao pronto era verde, colidindo
// exatamente com o significado das cores de acao.
const corParede = { L: '#8a7f6d', R: '#c4b8a2', WE: '#b0a48f', NS: '#9d9280' };
const corPiso   = 'rgba(138, 126, 106, 0.6)';
const corCerca  = { L: '#6b5a3e', R: '#9c8659', WE: '#8a7550', NS: '#7a6847' };
const corAcaoConstruir = 'rgba(100, 255, 100, 0.8)';
const corAcaoApagar    = 'rgba(255, 70, 70, 0.85)';

let hoverCol = -1;
let hoverRow = -1;
let hoverQuadrant = 'none';
let currentBrush = 1;

let isDragging = false;
let dragStartNode = null;
let previewWalls = [];

// Ferramenta de parede no modelo do Sims: voce mira no CANTO da grade, nao dentro
// do quadrado. O ponto A trava no canto, a linha acompanha o mouse e o ponto B
// marca a ponta. Some a adivinhacao de "qual aresta ele quis".
let verticeA = null;      // canto onde o traco comecou
let verticeB = null;      // canto final, ja preso a reta ou a 45 graus
let verticeHover = null;  // canto sob o mouse antes de clicar
let hoverFracao = { fr: 0.5, fc: 0.5 };   // onde dentro da celula, para a metade cortada
let isCutaway = true; 
let mapHistory = [];
let isErasing = false;

let currentFloor = 0;
let mapData = {};
let map; 

let enclosedCache = {};

// Onde o telhado DESTE andar realmente existe: comodo fechado que nao tem
// nada construido em cima. Estilo The Sims: o andar de cima come o telhado
// do de baixo, e o que sobra vira o telhado menor ao redor.
let telhadoCache = {};

// Para a celula cortada por uma parede diagonal, guarda QUAL metade esta dentro:
// 'E'/'W' quando o corte e wallNS, 'N'/'S' quando e wallWE. null = celula inteira.
let metadeCache = {};

function createEmptyMap() {
    const newMap = [];
    for (let i = 0; i < BORDA; i++) {
        newMap[i] = [];
        for (let j = 0; j < BORDA; j++) {
            // cercaX marca que a parede daquela aresta e meia parede: ela e desenhada
            // baixa e NAO fecha cômodo, entao nao gera telhado.
            // pisoFora e o chao da metade que sobra do lado de fora de uma parede
            // diagonal: a celula cortada tem dois lados, e os dois podem ser piso.
            newMap[i][j] = { floor: 0, wallL: 0, wallR: 0, wallWE: 0, wallNS: 0, column: 0,
                             cercaL: 0, cercaR: 0, cercaWE: 0, cercaNS: 0, pisoFora: 0,
                             texPiso: null, texPisoFora: null,
                             texL: null, texR: null, texWE: null, texNS: null,
                             texTelhado: null, texColuna: null,
                             // agua decorativa: puramente estetica, mas BLOQUEIA a
                             // celula -- nada se constroi por cima, como no The Sims 1
                             agua: 0, texAgua: null }; 
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
        data: JSON.parse(JSON.stringify(mapData)),
        agua: JSON.parse(JSON.stringify(pinceladasDeAgua))
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

function drawFlatWall(p1, p2, height, color, textura, face) {
    const img = imagemDaTextura(textura);
    if (img) {
        pintarComTextura(img, { x: p1.x, y: p1.y },
                         { x: p2.x - p1.x, y: p2.y - p1.y },
                         { x: 0, y: -height },
                         veuDaFace[face] || null);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p2.x, p2.y - height); ctx.lineTo(p1.x, p1.y - height);
        ctx.closePath();
        // Com textura o contorno grosso vira moldura: a imagem ja separa uma face
        // da outra. No modo cru ele e o unico limite, entao continua forte.
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 0.6 / camZoom;
        ctx.stroke();
        return;
    }
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

    // A celula cortada por uma diagonal fica meio dentro, meio fora -- a pergunta
    // "esta fechada?" nao tem resposta por celula inteira. Antes o laco descartava
    // essa celula e, com a fila vazia, concluia "fechada": QUALQUER diagonal passava
    // como cômodo, inclusive uma solta em campo aberto. Quem decide o estado dessas
    // celulas agora e a segunda passada de precalculateRooms.
    if (fMap[startRow][startCol].wallWE > 0 || fMap[startRow][startCol].wallNS > 0) return false;

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
        if (fMap[r][c+1].wallL === 0) {
            if (c === GRADE - 1) return false;
            if (!visited.has(`${r},${c+1}`)) { visited.add(`${r},${c+1}`); queue.push({r, c: c+1}); }
        }
        if (fMap[r][c].wallR === 0) {
            if (r === 0) return false;
            if (!visited.has(`${r-1},${c}`)) { visited.add(`${r-1},${c}`); queue.push({r: r-1, c}); }
        }
        if (fMap[r+1][c].wallR === 0) {
            if (r === GRADE - 1) return false;
            if (!visited.has(`${r+1},${c}`)) { visited.add(`${r+1},${c}`); queue.push({r: r+1, c}); }
        }
    }
    return true; 
}

function precalculateRooms() {
    enclosedCache = {};
    telhadoCache = {};
    metadeCache = {};
    alturaComodo = {};
    const floors = Object.keys(mapData).map(Number);

    for (const f of floors) {
        const m = mapData[f];
        const cortadas = [];
        const visitado = [];
        for (let r = 0; r < BORDA; r++) visitado.push(new Array(BORDA).fill(false));
        // Cerca nao conta como parede aqui: o espaco atravessa ela, entao area
        // cercada continua "aberta" e nao ganha telhado.
        const paredeReal = (h, cerca) => (cerca ? 0 : h);
        const ehCortada = (r, c) => paredeReal(m[r][c].wallWE, m[r][c].cercaWE) > 0
                                 || paredeReal(m[r][c].wallNS, m[r][c].cercaNS) > 0;

        // Passada 1: rotula os espacos conectados de uma vez so, e ja colhe a
        // altura da parede mais alta que cerca cada um.
        // Antes isso era uma varredura separada POR CELULA -- cem varreduras por
        // quadro respondendo a mesma pergunta.
        for (let r0 = 0; r0 < GRADE; r0++) {
            for (let c0 = 0; c0 < GRADE; c0++) {
                if (ehCortada(r0, c0)) {
                    cortadas.push({ r: r0, c: c0 });
                    enclosedCache[`${f},${r0},${c0}`] = false;
                    continue;
                }
                if (visitado[r0][c0]) continue;

                const fila = [{ r: r0, c: c0 }];
                visitado[r0][c0] = true;
                const grupo = [];
                let fechado = true;
                let altura = 0;

                while (fila.length) {
                    const { r, c } = fila.shift();
                    grupo.push({ r, c });
                    const cel = m[r][c];

                    // Em cada aresta: ou existe parede -- e entao ela conta para a
                    // altura do cômodo -- ou o espaco continua pelo vizinho. Chegar
                    // na borda do mapa sem parede significa que o espaco vaza.
                    const passo = (alturaParede, vr, vc, naBorda) => {
                        if (alturaParede > 0) { if (alturaParede > altura) altura = alturaParede; return; }
                        if (naBorda) { fechado = false; return; }
                        if (ehCortada(vr, vc)) return;          // a diagonal bloqueia a passagem
                        if (visitado[vr][vc]) return;
                        visitado[vr][vc] = true;
                        fila.push({ r: vr, c: vc });
                    };

                    passo(paredeReal(cel.wallL, cel.cercaL), r, c - 1, c === 0);
                    passo(paredeReal(cel.wallR, cel.cercaR), r - 1, c, r === 0);
                    // A aresta leste/sul agora existe de verdade (faixa sentinela),
                    // entao uma parede encostada na borda fecha o comodo.
                    passo(paredeReal(m[r][c+1].wallL, m[r][c+1].cercaL), r, c + 1, c === GRADE - 1);
                    passo(paredeReal(m[r+1][c].wallR, m[r+1][c].cercaR), r + 1, c, r === GRADE - 1);
                }

                for (const g of grupo) {
                    enclosedCache[`${f},${g.r},${g.c}`] = fechado;
                    if (fechado) alturaComodo[`${f},${g.r},${g.c}`] = altura || blockHeight;
                }
            }
        }

        // Passada 2: a celula cortada por diagonal herda o estado -- e a altura --
        // do vizinho de dentro. Numa diagonal solta no meio do nada nenhum vizinho
        // esta fechado, e ela fica de fora.
        for (const { r, c } of cortadas) {
            const cel = m[r][c];
            const viz = {
                O: c > 0 && cel.wallL === 0       && enclosedCache[`${f},${r},${c-1}`],
                L: c < GRADE - 1 && m[r][c+1].wallL === 0 && enclosedCache[`${f},${r},${c+1}`],
                N: r > 0 && cel.wallR === 0       && enclosedCache[`${f},${r-1},${c}`],
                S: r < GRADE - 1 && m[r+1][c].wallR === 0 && enclosedCache[`${f},${r+1},${c}`],
            };
            let metade = null;
            if (cel.wallNS > 0) {            // corte de norte a sul: metade leste x oeste
                if (viz.N || viz.L) metade = 'E';
                else if (viz.O || viz.S) metade = 'W';
            } else {                          // corte de oeste a leste: metade norte x sul
                if (viz.O || viz.N) metade = 'N';
                else if (viz.L || viz.S) metade = 'S';
            }
            metadeCache[`${f},${r},${c}`] = metade;
            enclosedCache[`${f},${r},${c}`] = metade !== null;

            if (metade) {
                let h = Math.max(cel.wallWE, cel.wallNS);
                const vizinhos = [[viz.O, r, c-1], [viz.L, r, c+1], [viz.N, r-1, c], [viz.S, r+1, c]];
                for (const [dentro, vr, vc] of vizinhos) {
                    if (dentro) h = Math.max(h, alturaComodo[`${f},${vr},${vc}`] || 0);
                }
                alturaComodo[`${f},${r},${c}`] = h || blockHeight;
            }
        }
    }

    // Passada 3: o telhado so cobre o que NAO tem andar em cima. Isso tem que
    // ser decidido depois de rotular todos os andares, porque depende do de cima.
    for (const f of floors) {
        for (let r = 0; r < GRADE; r++) {
            for (let c = 0; c < GRADE; c++) {
                // Subsolo nao tem telhado: a sala e escavada na rocha. Isso ja
                // valia no desenho; agora vale tambem no dado, para nenhuma conta
                // de altura enxergar telhado onde nunca vai existir um.
                telhadoCache[`${f},${r},${c}`] = f >= 0
                    && !!enclosedCache[`${f},${r},${c}`] && !hasStructureAbove(f, r, c);
            }
        }
    }
}

// Cantos da parte de DENTRO da celula: o losango inteiro, ou o triangulo do lado
// de dentro da parede diagonal.
function poligonoDentro(metade, pN, pL, pS, pO) {
    if (!metade) return [pN, pL, pS, pO];
    if (metade === 'E') return [pN, pL, pS];
    if (metade === 'W') return [pN, pS, pO];
    if (metade === 'N') return [pO, pN, pL];
    return [pO, pL, pS];
}
// A metade oposta — o pedaco que ficou do lado de fora da parede.
function poligonoFora(metade, pN, pL, pS, pO) {
    if (metade === 'E') return [pN, pS, pO];
    if (metade === 'W') return [pN, pL, pS];
    if (metade === 'N') return [pO, pL, pS];
    return [pO, pN, pL];
}
function tracarPoligono(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
}

function getRoofZ(fIndex, x, y, pitch) {
    let minDist = Infinity;
    const m = mapData[fIndex];

    // Distancia ate a CAIXA de uma celula, na mesma metrica usada pelo telhado.
    const distCaixa = (r, c) => {
        let dx = 0; if (x < r) dx = r - x; else if (x > r + 1) dx = x - (r + 1);
        let dy = 0; if (y < c) dy = c - y; else if (y > c + 1) dy = y - (c + 1);
        return Math.max(dx, dy);
    };

    for (let r = -2; r <= 11; r++) {
        for (let c = -2; c <= 11; c++) {
            const noMapa = r >= 0 && r < GRADE && c >= 0 && c < GRADE;
            // Ter piso nao implica estar fechado: uma laje ou patio a ceu aberto
            // tem chao e nao tem telhado. So o cômodo fechado conta.
            // A borda do telhado e a parede OU a linha onde o andar de cima
            // comeca. Antes so a parede contava: o telhado continuava subindo por
            // baixo do andar superior e depois era cortado na marra -- por isso a
            // agua saia gigante e desencontrada.
            const fechada = noMapa ? telhadoCache[`${fIndex},${r},${c}`] : false;

            // Celula que so ficou de fora por causa do andar de cima. Se la em cima
            // ela e cortada por uma diagonal, METADE dela ainda e telhado deste
            // andar -- entao a fronteira e a LINHA da parede de cima, nao a caixa
            // da celula. Medindo por caixa, o telhado despencava a zero na celula
            // inteira e abria aquele entalhe em V embaixo do chanfro.
            const cobertaPorCima = noMapa && !fechada && enclosedCache[`${fIndex},${r},${c}`];
            const metadeAcima = cobertaPorCima ? metadeCache[`${fIndex + 1},${r},${c}`] : null;

            if (metadeAcima) {
                const celAcima = mapData[fIndex + 1][r][c];
                const dReta = celAcima.wallWE > 0
                    ? Math.abs((x + y) - (r + c + 1)) / 2
                    : Math.abs((x - y) - (r - c)) / 2;
                // A reta e infinita: o max com a caixa impede que o chanfro de um
                // canto rebaixe o telhado do outro lado do mapa.
                const d = Math.max(dReta, distCaixa(r, c));
                if (d < minDist) minDist = d;
            } else if (!fechada) {
                const d = distCaixa(r, c);
                if (d < minDist) minDist = d;
            } else if (noMapa && metadeCache[`${fIndex},${r},${c}`]) {
                // CELULA CORTADA POR DIAGONAL.
                // Metade dela e lado de fora, entao a borda do telhado e a propria
                // LINHA da parede, nao a caixa da celula. Medindo por caixa, o
                // telhado despencava a zero so nos vertices onde duas diagonais se
                // encontram, e ficava alto no resto -- o funil entre as aguas.
                //
                // Nesta metrica, a distancia ate a reta x+y=k e |x+y-k|/2, porque
                // um passo diagonal muda a soma em 2 sem sair da vizinhanca.
                // O max com a distancia da caixa evita que a reta, que e infinita,
                // rebaixe o telhado longe do trecho de parede que realmente existe.
                const cel = m[r][c];
                const dReta = cel.wallWE > 0
                    ? Math.abs((x + y) - (r + c + 1)) / 2
                    : Math.abs((x - y) - (r - c)) / 2;
                const d = Math.max(dReta, distCaixa(r, c));
                if (d < minDist) minDist = d;
            }
        }
    }
    return minDist * pitch;
}

// Inclinacao da agua do telhado. Duas fatias com normais diferentes significam
// que ha uma dobra entre elas -- e uma cumeeira ou um espigao.
function normalDoTelhado(p1, p2, p3) {
    const det = (p2.x - p1.x)*(p3.y - p1.y) - (p3.x - p1.x)*(p2.y - p1.y);
    if (Math.abs(det) < 0.0001) return null;
    const a = ((p2.z - p1.z)*(p3.y - p1.y) - (p3.z - p1.z)*(p2.y - p1.y)) / det;
    const b = ((p3.z - p1.z)*(p2.x - p1.x) - (p2.z - p1.z)*(p3.x - p1.x)) / det;
    return { nx: -a, ny: -b };
}

function getTriangleShade(p1, p2, p3) {
    const n = normalDoTelhado(p1, p2, p3);
    if (!n) return 'rgba(0,0,0,0)';

    let eps = 0.01;
    let nx = n.nx;
    let ny = n.ny;

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

// O que sustenta uma laje por baixo, ocupando a celula inteira.
function apoioDireto(fIndex, r, c) {
    if (r < 0 || r >= GRADE || c < 0 || c >= GRADE) return false;
    const m = mapData[fIndex];
    if (!m) return false;
    const cel = m[r][c];
    return cel.column > 0 || cel.floor > 0 || isEnclosed(fIndex, r, c);
}

// A celula de agua e intransponivel: nao recebe chao, parede nem coluna. E o
// mesmo tratamento do The Sims 1 -- obstaculo estatico, sem profundidade.
function ehAgua(r, c) {
    if (r < 0 || r >= GRADE || c < 0 || c >= GRADE) return false;
    return map[r][c].agua > 0;
}

// A flag de bloqueio e RECALCULADA a partir das pinceladas: o centro do ladrilho
// dentro de qualquer pincelada significa celula intransponivel. O resto do motor
// (apoio, preenchimento, giro) continua conversando com a flag, como antes.
function recalcularAgua() {
    const m = mapData[0];
    if (!m) return;
    for (let r = 0; r < GRADE; r++) {
        for (let c = 0; c < GRADE; c++) {
            // Basta ENCOSTAR: se a pincelada invade qualquer pedaco do ladrilho,
            // ele e agua. Testar so o centro deixava o vizinho meio molhado com
            // chao pintado por cima -- e o chao recortava a curva do lago.
            let dentro = null;
            for (const p of pinceladasDeAgua) {
                const dr = Math.max(r - p.r, 0, p.r - (r + 1));
                const dc = Math.max(c - p.c, 0, p.c - (c + 1));
                if (dr * dr + dc * dc <= p.raio * p.raio) { dentro = p; break; }
            }
            const cel = m[r][c];
            // Agua nao derruba construcao. Se o ladrilho tem parede ou coluna, ele
            // simplesmente nao molha -- passar o pincel perto de uma casa nao pode
            // apagar a parede dela sem aviso.
            const temEstrutura = cel.wallL > 0 || cel.wallR > 0 || cel.wallWE > 0
                              || cel.wallNS > 0 || cel.column > 0;
            if (dentro && !temEstrutura) {
                // O chao continua ali, por baixo: agua e uma camada, nao um buraco.
                // So a construcao e que fica proibida.
                cel.agua = 1; cel.texAgua = dentro.estilo;
            } else {
                cel.agua = 0; cel.texAgua = null;
            }
        }
    }
}

// Onde a pincelada cai na tela: um circulo na grade vira uma elipse na projecao
// isometrica, e a projecao e linear -- entao basta desenhar o circulo com a
// mesma transformacao que leva a grade para a tela.
function tracarPinceladas(lista) {
    ctx.beginPath();
    for (const p of lista) {
        ctx.save();
        const centro = gridToScreen(p.r, p.c);
        ctx.translate(centro.x, centro.y);
        ctx.transform(tileWidth / 2, tileHeight / 2, -tileWidth / 2, tileHeight / 2, 0, 0);
        ctx.arc(0, 0, p.raio, 0, Math.PI * 2);
        ctx.restore();
    }
}

function isFloorSupported(r, c) {
    if (ehAgua(r, c)) return false;
    if (currentFloor <= 0) return true; 
    if (!mapData[currentFloor - 1]) return false;
    // Apoio DIRETO: o que ocupa a celula inteira embaixo -- piso, coluna ou o
    // interior de um cômodo. Parede sozinha nao conta: ela mora na ARESTA, e como
    // as arestas norte/oeste ficam na propria celula e as leste/sul na vizinha,
    // aceitar parede fazia a laje avancar um ladrilho so de dois lados do predio.
    if (apoioDireto(currentFloor - 1, r, c)) return true;

    // BALANCO DE UM LADRILHO: a sacada pode avancar um passo alem do apoio sem
    // nada embaixo -- e o beiral que toda construcao aguenta. Do segundo ladrilho
    // em diante e que a coluna passa a ser necessaria.
    // Os oito vizinhos, nao quatro: na tela isometrica, o ladrilho "a frente"
    // e o (r+1, c+1) da grade. Contar so os quatro ortogonais recusava justamente
    // o passo que a pessoa ve como o primeiro.
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            if (apoioDireto(currentFloor - 1, r + dr, c + dc)) return true;
        }
    }
    return false;
}

function isWallSupported(r, c, side) {
    if (ehAgua(r, c)) return false;
    if (side === 'L' && ehAgua(r, c - 1)) return false;
    if (side === 'R' && ehAgua(r - 1, c)) return false;
    if (currentFloor <= 0) return true;

    // A laje sustenta o que se apoia nela: se ha chao de um dos lados da aresta,
    // neste mesmo andar, a parede (ou a cerca) pode subir ali. E o que permite
    // cercar a sacada inteira, inclusive a parte em balanco.
    const temChao = (vr, vc) => vr >= 0 && vr < GRADE && vc >= 0 && vc < GRADE
                               && map[vr][vc].floor > 0;
    if (temChao(r, c)) return true;
    if (side === 'L' && temChao(r, c - 1)) return true;
    if (side === 'R' && temChao(r - 1, c)) return true;

    if (!mapData[currentFloor - 1]) return false;
    const lower = mapData[currentFloor - 1][r][c];
    if (side === 'L' && lower.wallL > 0) return true;
    if (side === 'R' && lower.wallR > 0) return true;
    if (side === 'WE' && lower.wallWE > 0) return true;
    if (side === 'NS' && lower.wallNS > 0) return true;
    if (lower.column > 0) return true;
    if (side === 'L' && c > 0 && mapData[currentFloor - 1][r][c - 1].column > 0) return true;
    if (side === 'R' && r > 0 && mapData[currentFloor - 1][r - 1][c].column > 0) return true;
    if (isEnclosed(currentFloor - 1, r, c)) return true;
    if (side === 'L' && c > 0 && isEnclosed(currentFloor - 1, r, c - 1)) return true;
    if (side === 'R' && r > 0 && isEnclosed(currentFloor - 1, r - 1, c)) return true;
    return false;
}

// A CORREÇÃO DE OURO DA SUA ANÁLISE!
function hasStructureAbove(fIndex, r, c) {
    const upper = mapData[fIndex + 1];
    if (!upper) return false;
    
    // Agora o telhado só é cortado se a célula de cima for realmente o interior de uma sala ou tiver piso!
    // Removemos a verificação de paredes, impedindo que a "grid ao redor da parede superior" bloqueie o telhado de baixo.
    if (upper[r][c].floor > 0) return true;
    if (enclosedCache[`${fIndex + 1},${r},${c}`]) return true;
    
    return false;
}

function isFloorEmpty(fIndex) {
    const fMap = mapData[fIndex];
    if (!fMap) return true;
    for(let r=0; r<BORDA; r++) {
        for(let c=0; c<BORDA; c++) {
            if (fMap[r][c].floor > 0 || fMap[r][c].wallWE > 0 || fMap[r][c].wallNS > 0 || fMap[r][c].wallL > 0 || fMap[r][c].wallR > 0 || fMap[r][c].column > 0) {
                return false;
            }
        }
    }
    return true;
}

function getTargetEdge(hRow, hCol, hQuad) {
    if (hRow < 0 || hRow >= GRADE || hCol < 0 || hCol >= GRADE) return null;
    let tRow = hRow, tCol = hCol, side = 'L';
    if (hQuad === 'NE') side = 'R';
    else if (hQuad === 'SW') { tRow += 1; side = 'R'; }
    else if (hQuad === 'SE') { tCol += 1; side = 'L'; }
    if (tRow >= 0 && tRow < BORDA && tCol >= 0 && tCol < BORDA) return { row: tRow, col: tCol, side };
    return null;
}

// Converte a posicao do mouse no canto (vertice) mais proximo da grade.
// E a operacao inversa de gridToScreen: se x = (c-r)*32 e y = (c+r)*16,
// entao c = (x/32 + y/16)/2 e r = (y/16 - x/32)/2.
function screenToVertice(clientX, clientY) {
    const g = telaParaGrade(clientX, clientY);
    return {
        row: Math.max(0, Math.min(GRADE, Math.round(g.row))),
        col: Math.max(0, Math.min(GRADE, Math.round(g.col)))
    };
}

// Prende o ponto B a uma reta ou a 45 graus, como no Sims.
// Os limites 22,5 e 67,5 graus dividem cada quadrante em tres fatias iguais.
function restringirB(a, bBruto) {
    const dR = bBruto.row - a.row, dC = bBruto.col - a.col;
    const aR = Math.abs(dR), aC = Math.abs(dC);
    if (aR === 0 && aC === 0) return { row: a.row, col: a.col };

    const proporcao = aC === 0 ? Infinity : aR / aC;
    if (proporcao > 2.414) return { row: bBruto.row, col: a.col };        // vertical
    if (proporcao < 0.414) return { row: a.row, col: bBruto.col };        // horizontal
    const passos = Math.round((aR + aC) / 2);                             // 45 graus
    return { row: a.row + Math.sign(dR) * passos, col: a.col + Math.sign(dC) * passos };
}

// Traduz o traco A->B para as arestas onde o motor guarda as paredes.
function segmentosEntre(a, b) {
    const segs = [];
    const dR = b.row - a.row, dC = b.col - a.col;
    const passos = Math.max(Math.abs(dR), Math.abs(dC));
    if (passos === 0) return segs;
    const sR = Math.sign(dR), sC = Math.sign(dC);

    for (let i = 0; i < passos; i++) {
        const r = a.row + i * sR, c = a.col + i * sC;
        if (sC === 0)      segs.push({ row: Math.min(r, r + sR), col: c, side: 'L' });   // vertical
        else if (sR === 0) segs.push({ row: r, col: Math.min(c, c + sC), side: 'R' });   // horizontal
        else segs.push({ row: Math.min(r, r + sR), col: Math.min(c, c + sC),
                         side: (sR === sC) ? 'NS' : 'WE' });                             // 45 graus
    }
    // As bordas leste e sul do tabuleiro nao tem onde guardar parede (ver 9x9).
    return segs.filter(s => s.row >= 0 && s.row < BORDA && s.col >= 0 && s.col < BORDA);
}

function desenharVertice(v, cor, raio) {
    if (!v) return;
    const p = gridToScreen(v.row, v.col);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - raio); ctx.lineTo(p.x + raio * 1.6, p.y);
    ctx.lineTo(p.x, p.y + raio);  ctx.lineTo(p.x - raio * 1.6, p.y);
    ctx.closePath();
    ctx.fillStyle = cor; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1; ctx.stroke();
}


// ===================== AGUA ANIMADA =====================
//
// A agua nao e uma imagem: e desenhada a cada quadro. Duas familias de ondas
// senoidais se somam num ladrilho de 64x64 que fecha nas bordas (frequencias
// inteiras), entao ele pode ser repetido sem costura. A crista de cada onda
// recebe um brilho -- e o que da a leitura de "molhado" que uma foto parada
// nunca da.

const ESTILOS_DE_AGUA = [
    { id: 'agua-lago',    nome: 'Lago',     funda: [18, 52, 74],  rasa: [86, 168, 190], vel: 0.55, brilho: 0.85 },
    { id: 'agua-mar',     nome: 'Mar',      funda: [10, 38, 72],  rasa: [64, 140, 196], vel: 0.85, brilho: 1.0 },
    { id: 'agua-pantano', nome: 'Pântano',  funda: [22, 46, 30],  rasa: [96, 140, 84],  vel: 0.30, brilho: 0.45 },
    { id: 'agua-rio',     nome: 'Rio',      funda: [16, 60, 68],  rasa: [110, 190, 190], vel: 1.25, brilho: 0.9 },
    { id: 'agua-fosso',   nome: 'Fosso',    funda: [12, 24, 34],  rasa: [48, 84, 104],  vel: 0.40, brilho: 0.55 },
];

// A agua nao mora mais na celula. Ela e uma lista de PINCELADAS em coordenadas
// de grade (linha/coluna fracionarias), e a silhueta do lago e a uniao delas.
// Guardar por celula obrigava a margem a ser a borda do losango -- agua em
// formato de tabuleiro de xadrez. Com pinceladas, a borda e uma curva.
let pinceladasDeAgua = [];        // { r, c, raio, estilo }
let raioDoPincel = 0.85;          // em ladrilhos

const LADO_AGUA = 64;
const telasDeAgua = {};      // uma tela por estilo, redesenhada a cada quadro
let tempoDaAgua = 0;
let relogioDaAgua = null;

function telaDoEstilo(id) {
    if (!telasDeAgua[id]) {
        const tela = document.createElement('canvas');
        tela.width = LADO_AGUA; tela.height = LADO_AGUA;
        telasDeAgua[id] = { tela, ctx: tela.getContext('2d'),
                            imagem: tela.getContext('2d').createImageData(LADO_AGUA, LADO_AGUA) };
    }
    return telasDeAgua[id];
}

function desenharOndas(estilo, t) {
    const alvo = telaDoEstilo(estilo.id);
    const dados = alvo.imagem.data;
    const passo = Math.PI * 2 / LADO_AGUA;
    const fase = t * estilo.vel;

    for (let y = 0; y < LADO_AGUA; y++) {
        const v = y * passo;
        for (let x = 0; x < LADO_AGUA; x++) {
            const u = x * passo;
            // Frequencias inteiras: o ladrilho fecha nas quatro bordas.
            let h = Math.sin(u + fase) * 0.45
                  + Math.sin(v * 2 - fase * 0.8) * 0.3
                  + Math.sin((u + v) * 2 + fase * 1.3) * 0.22
                  + Math.sin((u - v) * 3 - fase * 0.6) * 0.16;
            const m = Math.min(1, Math.max(0, (h + 1) / 2));
            const i = (y * LADO_AGUA + x) * 4;
            dados[i]     = estilo.funda[0] + (estilo.rasa[0] - estilo.funda[0]) * m;
            dados[i + 1] = estilo.funda[1] + (estilo.rasa[1] - estilo.funda[1]) * m;
            dados[i + 2] = estilo.funda[2] + (estilo.rasa[2] - estilo.funda[2]) * m;
            dados[i + 3] = 255;

            // A crista vira brilho: pouca area, muito efeito.
            if (h > 0.72) {
                const f = (h - 0.72) * 3 * estilo.brilho;
                dados[i]     = Math.min(255, dados[i] + 200 * f);
                dados[i + 1] = Math.min(255, dados[i + 1] + 215 * f);
                dados[i + 2] = Math.min(255, dados[i + 2] + 230 * f);
            }
        }
    }
    alvo.ctx.putImageData(alvo.imagem, 0, 0);
    return alvo.tela;
}

function estiloDeAgua(id) {
    return ESTILOS_DE_AGUA.find(e => e.id === id) || ESTILOS_DE_AGUA[0];
}

function superficieDeAgua(id) {
    return desenharOndas(estiloDeAgua(id), tempoDaAgua);
}

function existeAgua() {
    return currentFloor === 0 && pinceladasDeAgua.length > 0;
}

// A agua e uma camada continua desenhada ANTES dos ladrilhos: assim a silhueta e
// a uniao das pinceladas, e nao a soma de losangos.
function desenharCamadaDeAgua() {
    if (currentFloor !== 0 || !pinceladasDeAgua.length) return;

    const porEstilo = {};
    for (const p of pinceladasDeAgua) (porEstilo[p.estilo] = porEstilo[p.estilo] || []).push(p);

    for (const id of Object.keys(porEstilo)) {
        const lista = porEstilo[id];
        const superficie = superficieDeAgua(id);

        // MARGEM: a silhueta inteira preenchida em escuro, com desfoque, forma um
        // halo por fora. Contornar cada pincelada desenharia as emendas internas
        // do traco -- o lago ficava com arcos escuros no meio.
        ctx.save();
        ctx.shadowColor = 'rgba(4, 12, 20, 0.8)';
        ctx.shadowBlur = 9;
        ctx.fillStyle = 'rgba(4, 12, 20, 0.95)';
        tracarPinceladas(lista);
        ctx.fill();
        ctx.restore();

        ctx.save();
        tracarPinceladas(lista);
        ctx.clip();

        // A onda e amostrada em coordenadas de MUNDO: o desenho atravessa o lago
        // inteiro sem emenda, em vez de recomecar em cada ladrilho.
        const meio = LADO_AGUA / 2;
        for (let r = 0; r < GRADE; r++) {
            for (let c = 0; c < GRADE; c++) {
                const pN = gridToScreen(r, c), pL = gridToScreen(r, c + 1);
                const pS = gridToScreen(r + 1, c + 1), pO = gridToScreen(r + 1, c);
                const base = baseDoPiso(pN, pL, pS, pO);
                pintarComTextura(superficie, base.p0, base.u, base.v, null,
                                 { sx: (c % 2) * meio, sy: (r % 2) * meio, s: meio });
            }
        }
        ctx.restore();
    }
}

// O relogio so corre quando ha agua na cena: um tabuleiro seco nao gasta quadro.
function cuidarDoRelogioDaAgua() {
    const precisa = existeAgua();
    if (precisa && !relogioDaAgua) {
        relogioDaAgua = setInterval(() => {
            tempoDaAgua += 0.12;
            drawIsometricGrid();
        }, 80);
    } else if (!precisa && relogioDaAgua) {
        clearInterval(relogioDaAgua);
        relogioDaAgua = null;
    }
}

// ===================== ROTACAO DA CAMERA =====================
//
// Girar a vista 90 graus e, na pratica, girar o tabuleiro sob a camera. E a
// abordagem mais segura aqui: o sombreamento, as aguas do telhado, o meio-
// ladrilho e a conversao do clique sao todos definidos em relacao a TELA
// (oeste e a face escura, norte e a clara). Se eu girasse so o desenho, cada
// uma dessas quatro pecas precisaria de um remapeamento proprio -- quatro
// chances de errar. Girando o dado, tudo continua valendo como esta, e sao os
// dados que passam a estar na posicao nova.
//
// A parede mora numa ARESTA, entao o giro e feito pelos VERTICES da aresta:
// gira os dois cantos e pergunta de novo em que celula e lado eles caem. E a
// mesma conta que a ferramenta ponto A -> B ja usa.

let rotacao = 0;   // 0, 1, 2, 3 -- quartos de volta no sentido horario

function girarVertice(v) {
    return { row: v.col, col: GRADE - v.row };
}

// Quais dois cantos formam cada aresta de uma celula.
function verticesDaAresta(r, c, lado) {
    if (lado === 'L')  return [{ row: r + 1, col: c }, { row: r, col: c }];
    if (lado === 'R')  return [{ row: r, col: c }, { row: r, col: c + 1 }];
    if (lado === 'WE') return [{ row: r + 1, col: c }, { row: r, col: c + 1 }];
    return [{ row: r, col: c }, { row: r + 1, col: c + 1 }];   // NS
}

// O caminho de volta: dois cantos vizinhos dizem em que celula e lado a parede mora.
function arestaDosVertices(a, b) {
    const dR = b.row - a.row, dC = b.col - a.col;
    if (dC === 0) return { row: Math.min(a.row, b.row), col: a.col, lado: 'L' };
    if (dR === 0) return { row: a.row, col: Math.min(a.col, b.col), lado: 'R' };
    return { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col),
             lado: (dR === dC) ? 'NS' : 'WE' };
}

function girarAndar(m) {
    const novo = createEmptyMap();
    const campos = ['floor', 'pisoFora', 'column', 'texPiso', 'texPisoFora',
                    'texTelhado', 'texColuna', 'agua', 'texAgua'];

    for (let r = 0; r < GRADE; r++) {
        for (let c = 0; c < GRADE; c++) {
            const destino = novo[c][GRADE - 1 - r];
            for (const campo of campos) destino[campo] = m[r][c][campo];
        }
    }

    // As paredes viajam pela aresta, nao pela celula.
    for (let r = 0; r < BORDA; r++) {
        for (let c = 0; c < BORDA; c++) {
            for (const lado of ['L', 'R', 'WE', 'NS']) {
                const altura = m[r][c]['wall' + lado];
                if (!altura) continue;
                const [a, b] = verticesDaAresta(r, c, lado);
                const nova = arestaDosVertices(girarVertice(a), girarVertice(b));
                if (nova.row < 0 || nova.row >= BORDA || nova.col < 0 || nova.col >= BORDA) continue;
                const alvo = novo[nova.row][nova.col];
                alvo['wall' + nova.lado] = altura;
                alvo['cerca' + nova.lado] = m[r][c]['cerca' + lado];
                alvo['tex' + nova.lado] = m[r][c]['tex' + lado];
            }
        }
    }
    return novo;
}

function girarCamera(sentido) {
    saveState();
    const voltas = sentido > 0 ? 1 : 3;      // anti-horario = tres quartos de volta
    for (let i = 0; i < voltas; i++) {
        for (const f of Object.keys(mapData).map(Number)) {
            mapData[f] = girarAndar(mapData[f]);
        }
        // A pincelada gira pelo mesmo caminho dos vertices.
        pinceladasDeAgua = pinceladasDeAgua.map(p => ({ ...p, r: p.c, c: GRADE - p.r }));
        rotacao = (rotacao + 1) % 4;
    }
    recalcularAgua();
    map = mapData[currentFloor];
    isDragging = false; dragStartNode = null;
    verticeA = null; verticeB = null;
    precalculateRooms();
    updateUI();
    updatePreview();
    drawIsometricGrid();
}

// ===================== CERCA E SALAS PRE-MOLDADAS =====================

// A cerca e uma parede de meia altura: nao fecha comodo, logo nao gera telhado.
function alturaCerca() { return Math.max(8, Math.round(blockHeight / 2)); }

const v_ = (row, col) => ({ row, col });

// Triangulo retangulo: o angulo reto fica no canto onde o arrasto comecou e a
// hipotenusa desce a 45 graus -- por isso a caixa e forcada a ser quadrada.
function contornoTriangulo(N, S, O, L, ancoraNorte, ancoraOeste) {
    const lado = Math.min(S - N, L - O);
    if (lado < 1) return [];
    if (ancoraNorte) S = N + lado; else N = S - lado;
    if (ancoraOeste) L = O + lado; else O = L - lado;

    if (ancoraNorte && ancoraOeste)   return [[v_(N,O),v_(N,L)], [v_(N,O),v_(S,O)], [v_(N,L),v_(S,O)]];
    if (ancoraNorte && !ancoraOeste)  return [[v_(N,O),v_(N,L)], [v_(N,L),v_(S,L)], [v_(N,O),v_(S,L)]];
    if (!ancoraNorte && ancoraOeste)  return [[v_(S,O),v_(S,L)], [v_(N,O),v_(S,O)], [v_(N,O),v_(S,L)]];
    return [[v_(S,O),v_(S,L)], [v_(N,L),v_(S,L)], [v_(N,L),v_(S,O)]];
}

// Octogono: um retangulo com os quatro cantos chanfrados a 45 graus.
function contornoOctogono(N, S, O, L) {
    const menor = Math.min(S - N, L - O);
    if (menor < 3) return contornoRetangulo(N, S, O, L);
    const k = Math.max(1, Math.floor(menor / 4));
    return [
        [v_(N, O+k), v_(N, L-k)],   // norte
        [v_(N, L-k), v_(N+k, L)],   // chanfro nordeste
        [v_(N+k, L), v_(S-k, L)],   // leste
        [v_(S-k, L), v_(S, L-k)],   // chanfro sudeste
        [v_(S, L-k), v_(S, O+k)],   // sul
        [v_(S, O+k), v_(S-k, O)],   // chanfro sudoeste
        [v_(S-k, O), v_(N+k, O)],   // oeste
        [v_(N+k, O), v_(N, O+k)]    // chanfro noroeste
    ];
}

function contornoRetangulo(N, S, O, L) {
    return [[v_(N,O),v_(N,L)], [v_(N,L),v_(S,L)], [v_(S,L),v_(S,O)], [v_(S,O),v_(N,O)]];
}

function paredesDoContorno(arestas) {
    const vistos = new Set();
    const saida = [];
    arestas.forEach(([a, b]) => segmentosEntre(a, b).forEach(seg => {
        const chave = `${seg.row},${seg.col},${seg.side}`;
        if (!vistos.has(chave)) { vistos.add(chave); saida.push(seg); }
    }));
    return saida;
}

function updatePreview() {
    previewWalls = [];
    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    // PAREDE — modelo ponto A -> linha -> ponto B.
    // Nao depende de qual celula esta sob o mouse, so dos cantos da grade, entao e
    // resolvido antes da checagem de hover (que travaria o traco nas bordas).
    if (currentBrush === 2 || currentBrush === 9) {
        if (isDragging && verticeA) {
            verticeB = restringirB(verticeA, verticeHover || verticeA);
            previewWalls = segmentosEntre(verticeA, verticeB);
        } else {
            verticeB = null;
        }
        if (!currentEraseMode) {
            previewWalls = previewWalls.filter(x => isWallSupported(x.row, x.col, x.side));
        }
        return;
    }

    if (hoverRow < 0 || hoverRow >= GRADE || hoverCol < 0 || hoverCol >= GRADE) return;

    if (currentBrush === 4 || currentBrush === 5) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const N = Math.min(dragStartNode.row, hoverRow);
            const S = Math.max(dragStartNode.row, hoverRow) + 1;
            const O = Math.min(dragStartNode.col, hoverCol);
            const L = Math.max(dragStartNode.col, hoverCol) + 1;
            const arestas = (currentBrush === 4)
                ? contornoTriangulo(N, S, O, L, dragStartNode.row <= hoverRow, dragStartNode.col <= hoverCol)
                : contornoOctogono(N, S, O, L);
            previewWalls = paredesDoContorno(arestas);
        }
        if (!currentEraseMode) previewWalls = previewWalls.filter(p => isWallSupported(p.row, p.col, p.side));
        return;
    }

    if (currentBrush === 3 || (currentEraseMode && currentBrush === 3)) {
        if (isDragging && dragStartNode && dragStartNode.type === 'room') {
            const minR = Math.min(dragStartNode.row, hoverRow);
            const maxR = Math.max(dragStartNode.row, hoverRow);
            const minC = Math.min(dragStartNode.col, hoverCol);
            const maxC = Math.max(dragStartNode.col, hoverCol);

            for (let r = minR; r <= maxR; r++) previewWalls.push({ row: r, col: minC, side: 'L' });
            for (let c = minC; c <= maxC; c++) previewWalls.push({ row: minR, col: c, side: 'R' });
            for (let c = minC; c <= maxC; c++) previewWalls.push({ row: maxR + 1, col: c, side: 'R' });
            for (let r = minR; r <= maxR; r++) previewWalls.push({ row: r, col: maxC + 1, side: 'L' });
        } else if (!isDragging) {
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'L' });
            previewWalls.push({ row: hoverRow, col: hoverCol, side: 'R' });
            previewWalls.push({ row: hoverRow + 1, col: hoverCol, side: 'R' });
            previewWalls.push({ row: hoverRow, col: hoverCol + 1, side: 'L' });
        }
    }

    if (!currentEraseMode) {
        previewWalls = previewWalls.filter(p => isWallSupported(p.row, p.col, p.side));
    }
}

function renderCell(row, col, fIndex, isGhost, activeEraseMode = false, applyCutaway = false, showActiveTools = false, renderPass = 0) {
    const targetMap = mapData[fIndex];
    if (!targetMap || !targetMap[row]) return;

    ctx.save();
    const distance = fIndex - currentFloor;
    ctx.translate(0, -distance * alturaDoAndar);

    const pNorte = gridToScreen(row, col);
    const pLeste = gridToScreen(row, col + 1);
    const pSul   = gridToScreen(row + 1, col + 1);
    const pOeste = gridToScreen(row + 1, col);

    // A faixa sentinela existe so para segurar a parede da borda: nao tem chao,
    // nem grama, nem grade -- se tivesse, o tabuleiro pareceria 11x11.
    const naMargem = (row === GRADE || col === GRADE);

    // O passe 2 desenha SO o chao, e roda antes da agua; a estrutura vem depois,
    // no passe 0. E isso que faz o lago ficar POR CIMA da grama em vez de abrir
    // buracos escuros nos ladrilhos que ele encosta.
    if (renderPass === 2 && !naMargem) {
        const hasContent = targetMap[row][col].agua > 0 || targetMap[row][col].floor > 0 || targetMap[row][col].wallL > 0 || targetMap[row][col].wallR > 0 || targetMap[row][col].wallWE > 0 || targetMap[row][col].wallNS > 0 || targetMap[row][col].column > 0;
        
        let shouldDrawGrid = false;
        if (fIndex === currentFloor) {
            if (currentFloor <= 0) shouldDrawGrid = true; 
            else shouldDrawGrid = hasContent || isFloorSupported(row, col); 
        } else if (fIndex < currentFloor) {
            shouldDrawGrid = hasContent;
        } else if (fIndex > currentFloor) {
            shouldDrawGrid = false;
        }

        // MEIO-LADRILHO: numa celula cortada por parede diagonal, o chao nao pode
        // terminar no quadrado -- tem que terminar na parede.
        const metade = metadeCache[`${fIndex},${row},${col}`];
        const temPiso = targetMap[row][col].floor > 0;
        const dentroPts = poligonoDentro(metade, pNorte, pLeste, pSul, pOeste);

        const temAgua = targetMap[row][col].agua > 0;
        let isDirt = false;
        if (fIndex <= 0 && !temPiso && !temAgua && !enclosedCache[`${fIndex},${row},${col}`]) isDirt = true;

        // A metade que sobrou do lado de fora da diagonal e sempre terra.
        const temPisoFora = targetMap[row][col].pisoFora > 0;
        if (metade && (fIndex <= 0 || temPisoFora)) {
            const imgFora = temPisoFora && !isGhost
                ? imagemDaTextura(targetMap[row][col].texPisoFora) : null;
            const fora = poligonoFora(metade, pNorte, pLeste, pSul, pOeste);
            if (imgFora) {
                const baseF = baseDoPiso(pNorte, pLeste, pSul, pOeste);
                ctx.save();
                tracarPoligono(fora); ctx.clip();
                pintarComTextura(imgFora, baseF.p0, baseF.u, baseF.v, null);
                ctx.restore();
            } else {
                ctx.fillStyle = temPisoFora
                    ? (isGhost ? 'rgba(120, 120, 120, 0.3)' : corPiso)
                    : dirtColor;
                tracarPoligono(fora); ctx.fill();
            }
        }

        // A agua do terreo e desenhada em camada propria, antes dos ladrilhos.
        // Aqui so sobra o caso do andar de baixo visto de cima (fantasma).
        if (temAgua && isGhost) {
            ctx.fillStyle = 'rgba(60,90,120,0.4)';
            tracarPoligono(dentroPts); ctx.fill();
        } else if (false) {
            const baseA = baseDoPiso(pNorte, pLeste, pSul, pOeste);
            if (isGhost) {
                ctx.fillStyle = 'rgba(60,90,120,0.4)';
                tracarPoligono(dentroPts); ctx.fill();
            } else {
                // Meia onda por ladrilho: como o desenho fecha nas bordas, as
                // celulas emendam, e o padrao so se repete a cada duas -- sem o
                // efeito de papel de parede que uma onda inteira por ladrilho da.
                const meio = LADO_AGUA / 2;
                ctx.save(); tracarPoligono(dentroPts); ctx.clip();
                pintarComTextura(superficieDeAgua(targetMap[row][col].texAgua),
                                 baseA.p0, baseA.u, baseA.v, null,
                                 { sx: (col % 2) * meio, sy: (row % 2) * meio, s: meio });
                ctx.restore();
            }

            // MARGEM: onde a agua encosta na terra, uma sombra curta. E o que
            // separa o lago do chao sem precisar de contorno desenhado.
            if (!isGhost) {
                const vizinhoSeco = (vr, vc) => !(vr >= 0 && vr < GRADE && vc >= 0 && vc < GRADE
                                                 && targetMap[vr][vc].agua > 0);
                const margens = [
                    [vizinhoSeco(row, col - 1), pOeste, pNorte],
                    [vizinhoSeco(row - 1, col), pNorte, pLeste],
                    [vizinhoSeco(row, col + 1), pLeste, pSul],
                    [vizinhoSeco(row + 1, col), pSul, pOeste],
                ];
                ctx.save();
                tracarPoligono(dentroPts); ctx.clip();
                ctx.strokeStyle = 'rgba(6, 16, 26, 0.5)';
                ctx.lineWidth = 6;
                margens.forEach(([seco, a, b]) => {
                    if (!seco) return;
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                });
                ctx.restore();
                ctx.lineWidth = 1;
            }
        } else if (isDirt) {
            ctx.fillStyle = dirtColor;
            tracarPoligono(dentroPts); ctx.fill();
        } else if (temPiso) {
            const imgPiso = isGhost ? null : imagemDaTextura(targetMap[row][col].texPiso);
            if (imgPiso) {
                const base = baseDoPiso(pNorte, pLeste, pSul, pOeste);
                ctx.save();
                tracarPoligono(dentroPts); ctx.clip();
                pintarComTextura(imgPiso, base.p0, base.u, base.v, null);
                ctx.restore();
            } else {
                ctx.fillStyle = isGhost ? 'rgba(120, 120, 120, 0.3)' : corPiso;
                tracarPoligono(dentroPts); ctx.fill();
            }
        }

        if (shouldDrawGrid && !temAgua) {
            tracarPoligono(dentroPts);
            const texturado = targetMap[row][col].texPiso && temPiso;
            ctx.strokeStyle = isDirt ? 'rgba(255, 255, 255, 0.03)'
                            : (isGhost ? 'rgba(85, 85, 85, 0.15)'
                            : (texturado ? 'rgba(0,0,0,0.22)' : '#555'));
            ctx.lineWidth = texturado ? 0.6 / camZoom : 1;
            ctx.stroke();
            ctx.lineWidth = 1;
        }

        if (showActiveTools && row === hoverRow && col === hoverCol && !isDragging && currentBrush === 1) {
            const supp = isFloorSupported(row, col);
            tracarPoligono(dentroPts);
            ctx.fillStyle = (!supp && !activeEraseMode) ? 'rgba(255, 50, 50, 0.3)' : (activeEraseMode ? 'rgba(255, 50, 50, 0.2)' : 'rgba(100, 255, 100, 0.2)');
            ctx.fill();
        }
    }

    if (renderPass === 0) {

        // O corte so rebaixa o que for MAIS ALTO que ele: assim a cerca, que ja e
        // baixa, continua visivel no modo cortado em vez de sumir.
        const cel_ = targetMap[row][col];
        const alturaCortada = (h) => (applyCutaway && h > cutawayHeight) ? cutawayHeight : h;
        const tom = (cerca, lado, fantasma) => isGhost ? fantasma : (cerca ? corCerca[lado] : corParede[lado]);

        const hL = alturaCortada(cel_.wallL), hR = alturaCortada(cel_.wallR);
        if (hL > 0) drawFlatWall(pOeste, pNorte, hL, tom(cel_.cercaL, 'L', 'rgba(90, 90, 90, 0.5)'), isGhost ? null : cel_.texL, 'L');
        if (hR > 0) drawFlatWall(pNorte, pLeste, hR, tom(cel_.cercaR, 'R', 'rgba(110, 110, 110, 0.5)'), isGhost ? null : cel_.texR, 'R');

        const hWE = alturaCortada(cel_.wallWE), hNS = alturaCortada(cel_.wallNS);
        if (hWE > 0) drawFlatWall(pOeste, pLeste, hWE, tom(cel_.cercaWE, 'WE', 'rgba(100, 100, 100, 0.5)'), isGhost ? null : cel_.texWE, 'WE');
        if (hNS > 0) drawFlatWall(pNorte, pSul, hNS, tom(cel_.cercaNS, 'NS', 'rgba(80, 80, 80, 0.5)'), isGhost ? null : cel_.texNS, 'NS');

        if (targetMap[row][col].column > 0) {
            let colH = applyCutaway ? cutawayHeight : targetMap[row][col].column;
            const cx = pNorte.x; const cy = pNorte.y + (tileHeight / 2);
            
            ctx.fillStyle = isGhost ? 'rgba(130, 130, 130, 0.5)' : '#a3a3a3'; ctx.strokeStyle = isGhost ? 'transparent' : '#555';
            ctx.beginPath(); ctx.moveTo(cx, cy - colH - 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx - 6, cy - colH); ctx.closePath(); ctx.fill(); ctx.stroke();
            
            const imgColuna = isGhost ? null : imagemDaTextura(targetMap[row][col].texColuna);

            ctx.fillStyle = isGhost ? 'rgba(100, 100, 100, 0.5)' : '#777';
            ctx.beginPath(); ctx.moveTo(cx - 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 6, cy); ctx.closePath();
            if (imgColuna) { ctx.save(); ctx.clip();
                pintarComTextura(imgColuna, { x: cx - 6, y: cy - colH }, { x: 6, y: 4 }, { x: 0, y: colH }, 'rgba(0,0,0,0.28)');
                ctx.restore(); ctx.beginPath(); ctx.moveTo(cx - 6, cy - colH); ctx.lineTo(cx, cy - colH + 4); ctx.lineTo(cx, cy + 4); ctx.lineTo(cx - 6, cy); ctx.closePath(); }
            else ctx.fill();
            ctx.stroke();

            ctx.fillStyle = isGhost ? 'rgba(110, 110, 110, 0.5)' : '#888';
            ctx.beginPath(); ctx.moveTo(cx, cy - colH + 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 4); ctx.closePath();
            if (imgColuna) { ctx.save(); ctx.clip();
                pintarComTextura(imgColuna, { x: cx, y: cy - colH + 4 }, { x: 6, y: -4 }, { x: 0, y: colH }, 'rgba(255,255,255,0.05)');
                ctx.restore(); ctx.beginPath(); ctx.moveTo(cx, cy - colH + 4); ctx.lineTo(cx + 6, cy - colH); ctx.lineTo(cx + 6, cy); ctx.lineTo(cx, cy + 4); ctx.closePath(); }
            else ctx.fill();
            ctx.stroke();
        }
    } 

    else if (renderPass === 1) {
        let hideLowerRoof = false;
        if (fIndex < currentFloor && isFloorEmpty(currentFloor)) {
            hideLowerRoof = true;
        }

        let isIndoors = telhadoCache[`${fIndex},${row},${col}`];

        if (!isCutaway && fIndex >= 0 && !hideLowerRoof && isIndoors) {
            
            let zN = getRoofZ(fIndex, row, col, roofPitch);
            let zNE = getRoofZ(fIndex, row, col + 0.5, roofPitch);
            let zE = getRoofZ(fIndex, row, col + 1, roofPitch);
            let zSE = getRoofZ(fIndex, row + 0.5, col + 1, roofPitch);
            let zS = getRoofZ(fIndex, row + 1, col + 1, roofPitch);
            let zSW = getRoofZ(fIndex, row + 1, col + 0.5, roofPitch);
            let zW = getRoofZ(fIndex, row + 1, col, roofPitch);
            let zNW = getRoofZ(fIndex, row + 0.5, col, roofPitch);
            let zC = getRoofZ(fIndex, row + 0.5, col + 0.5, roofPitch);

            // O telhado se apoia na parede mais alta que cerca ESTE cômodo.
            // Com alturas variadas no mesmo tabuleiro, nao existe uma altura global
            // que sirva: a nave alta e a sala baixa precisam de telhados em niveis
            // diferentes.
            const baseTelhado = alturaComodo[`${fIndex},${row},${col}`] || blockHeight;

            let t_pN = gridToScreen(row, col); t_pN.y -= (baseTelhado + zN);
            let t_pNE = gridToScreen(row, col + 0.5); t_pNE.y -= (baseTelhado + zNE);
            let t_pE = gridToScreen(row, col + 1); t_pE.y -= (baseTelhado + zE);
            let t_pSE = gridToScreen(row + 0.5, col + 1); t_pSE.y -= (baseTelhado + zSE);
            let t_pS = gridToScreen(row + 1, col + 1); t_pS.y -= (baseTelhado + zS);
            let t_pSW = gridToScreen(row + 1, col + 0.5); t_pSW.y -= (baseTelhado + zSW);
            let t_pW = gridToScreen(row + 1, col); t_pW.y -= (baseTelhado + zW);
            let t_pNW = gridToScreen(row + 0.5, col); t_pNW.y -= (baseTelhado + zNW);
            let t_pC = gridToScreen(row + 0.5, col + 0.5); t_pC.y -= (baseTelhado + zC);

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
            
            ctx.beginPath();
            ctx.moveTo(pSul.x, pSul.y - baseTelhado); 
            ctx.lineTo(pLeste.x, pLeste.y - baseTelhado); 
            ctx.lineTo(pLeste.x, pLeste.y - baseTelhado - 2000); 
            ctx.lineTo(pNorte.x, pNorte.y - baseTelhado - 2000); 
            ctx.lineTo(pOeste.x, pOeste.y - baseTelhado - 2000); 
            ctx.lineTo(pOeste.x, pOeste.y - baseTelhado); 
            ctx.closePath();
            ctx.clip();

            let neighborHasRoof = (r, c) => {
                if (r < 0 || r >= GRADE || c < 0 || c >= GRADE) return false;
                return !!telhadoCache[`${fIndex},${r},${c}`];
            };

            const drawSkirt = (p1_2d, p2_2d, p1_3d, p2_3d, overlay) => {
                if (p1_3d.z <= 0.1 && p2_3d.z <= 0.1) return;
                
                ctx.fillStyle = roofColor;
                ctx.beginPath();
                ctx.moveTo(p1_2d.x, p1_2d.y); 
                ctx.lineTo(p2_2d.x, p2_2d.y); 
                ctx.lineTo(p2_2d.x, p2_2d.y + p2_3d.z);
                ctx.lineTo(p1_2d.x, p1_2d.y + p1_3d.z);
                ctx.closePath();
                ctx.fill();
                
                ctx.fillStyle = overlay;
                ctx.fill();
                
                ctx.strokeStyle = roofColor;
                ctx.lineWidth = 1;
                ctx.stroke();
            };

            // MEIO-LADRILHO NO TELHADO.
            // O ponto central da celula pertence as DUAS diagonais, entao as 8
            // micro-fatias se dividem exatamente 4 a 4 sobre qualquer um dos cortes.
            // Numa celula cortada, desenhamos apenas as 4 fatias do lado de dentro.
            const metadeTel = metadeCache[`${fIndex},${row},${col}`];

            const fatias = [
                [t_pN,  t_pNE, pN_3d,  pNE_3d], [t_pNE, t_pE,  pNE_3d, pE_3d],
                [t_pE,  t_pSE, pE_3d,  pSE_3d], [t_pSE, t_pS,  pSE_3d, pS_3d],
                [t_pS,  t_pSW, pS_3d,  pSW_3d], [t_pSW, t_pW,  pSW_3d, pW_3d],
                [t_pW,  t_pNW, pW_3d,  pNW_3d], [t_pNW, t_pN,  pNW_3d, pN_3d],
            ];
            const sombraSaia = ['rgba(0,0,0,0.1)','rgba(0,0,0,0.1)','rgba(0,0,0,0.4)','rgba(0,0,0,0.4)',
                                'rgba(255,255,255,0.15)','rgba(255,255,255,0.15)','rgba(0,0,0,0.3)','rgba(0,0,0,0.3)'];
            const vizinhoDaSaia = [[row-1,col],[row-1,col],[row,col+1],[row,col+1],
                                   [row+1,col],[row+1,col],[row,col-1],[row,col-1]];

            const indices = metadeTel === 'E' ? [0,1,2,3]
                          : metadeTel === 'W' ? [4,5,6,7]
                          : metadeTel === 'N' ? [6,7,0,1]
                          : metadeTel === 'S' ? [2,3,4,5]
                          : [0,1,2,3,4,5,6,7];

            for (const i of indices) {
                const [a2, b2, a3, b3] = fatias[i];
                const [vr, vc] = vizinhoDaSaia[i];
                if (!neighborHasRoof(vr, vc)) drawSkirt(a2, b2, a3, b3, sombraSaia[i]);
            }

            // Saia ao longo do proprio corte, fechando o vao entre o telhado e a
            // parede diagonal -- sem ela sobraria uma fresta.
            if (metadeTel) {
                const corteVertical = (metadeTel === 'E' || metadeTel === 'W');
                const q1 = corteVertical ? [t_pN, t_pC, pN_3d, pC_3d] : [t_pW, t_pC, pW_3d, pC_3d];
                const q2 = corteVertical ? [t_pC, t_pS, pC_3d, pS_3d] : [t_pC, t_pE, pC_3d, pE_3d];
                drawSkirt(q1[0], q1[1], q1[2], q1[3], 'rgba(0,0,0,0.25)');
                drawSkirt(q2[0], q2[1], q2[2], q2[3], 'rgba(0,0,0,0.25)');
            }

            // A textura do telhado e a do cômodo: cada fatia leva as coordenadas do
            // seu pedaco da imagem, tiradas da posicao na grade.
            const imgTelhado = isGhost ? null : imagemDaTextura(targetMap[row][col].texTelhado);
            const uvDe = (p3d) => uvGirado(p3d.y - col, p3d.x - row);

            const drawMicroTri = (p1, p2, p3, p1_3d, p2_3d, p3_3d) => {
                let overlay = getTriangleShade(p1_3d, p2_3d, p3_3d);
                if (overlay === 'rgba(0,0,0,0)') return;
                ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath();
                ctx.fillStyle = roofColor; ctx.fill();
                if (imgTelhado) {
                    desenharTrianguloTexturizado(imgTelhado, p1, p2, p3,
                                                 uvDe(p1_3d), uvDe(p2_3d), uvDe(p3_3d));
                    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
                    ctx.lineTo(p3.x, p3.y); ctx.closePath();
                }
                ctx.fillStyle = overlay; ctx.fill();
                // Os contornos existiam para disfarcar a costura entre as fatias na
                // cor chapada. Com textura eles viram uma teia de riscos por cima
                // do telhado -- entao so entram quando nao ha imagem.
                if (!imgTelhado) {
                    ctx.strokeStyle = roofColor; ctx.lineWidth = 1; ctx.stroke();
                    ctx.strokeStyle = overlay;   ctx.lineWidth = 1; ctx.stroke();
                }
            };

            for (const i of indices) {
                const [a2, b2, a3, b3] = fatias[i];
                drawMicroTri(a2, b2, t_pC, a3, b3, pC_3d);
            }

            // CUMEEIRAS E ESPIGOES.
            // Cada fatia vizinha divide com a seguinte um raio que sai do centro da
            // celula. Se as duas tem inclinacao diferente, ha uma dobra ali: e onde
            // duas aguas se encontram. Marcando essas arestas o olho reconstrói a
            // forma; sem elas o telhado vira uma mancha cinza e o formato so da
            // para deduzir.
            const pontos2d = [t_pN, t_pNE, t_pE, t_pSE, t_pS, t_pSW, t_pW, t_pNW];
            const raioEntre = [1, 2, 3, 4, 5, 6, 7, 0];   // NE, E, SE, S, SW, W, NW, N
            const normais = fatias.map(([, , a3, b3]) => normalDoTelhado(a3, b3, pC_3d));

            // Com telha, a propria imagem mostra onde uma agua encontra a outra;
            // o risco preto so serve no modo cru.
            ctx.strokeStyle = 'rgba(12, 16, 22, 0.85)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            for (const i of (imgTelhado ? [] : indices)) {
                const j = (i + 1) % 8;
                if (indices.indexOf(j) === -1) continue;   // a vizinha foi recortada pela diagonal
                const n1 = normais[i], n2 = normais[j];
                if (!n1 || !n2) continue;
                if (Math.abs(n1.nx - n2.nx) > 0.02 || Math.abs(n1.ny - n2.ny) > 0.02) {
                    const ponta = pontos2d[raioEntre[i]];
                    ctx.beginPath();
                    ctx.moveTo(t_pC.x, t_pC.y);
                    ctx.lineTo(ponta.x, ponta.y);
                    ctx.stroke();
                }
            }
            ctx.lineWidth = 1;
            
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
            const ghostColor = activeEraseMode ? corAcaoApagar : corAcaoConstruir;
            ghosts.forEach(p => {
                const hAlvo = (currentBrush === 9) ? alturaCerca() : blockHeight;
                let hGhost = (applyCutaway && hAlvo > cutawayHeight) ? cutawayHeight : hAlvo;
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

// Que andares entram na cena. Abaixo do terreo so o nivel atual aparece: a
// escavacao de baixo nao enxerga a de cima, que e o que faz a passagem secreta
// ser secreta. Acima, os andares se empilham normalmente.
function andarVisivel(f) {
    if (currentFloor < 0) return f === currentFloor;
    // Nada acima do andar em que voce esta. Antes a laje do andar de cima ficava
    // desenhada por cima do terreo: dava para pintar o chao, mas nao dava para
    // VER -- parecia que o pincel tinha parado de funcionar.
    return f >= 0 && f <= currentFloor;
}

function drawIsometricGrid() {
    cuidarDoRelogioDaAgua();
    precalculateRooms(); 
    
    ctx.fillStyle = currentFloor >= 0 ? surfaceColor : undergroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camZoom, camZoom);
    ctx.translate(camX - CENTRO_MAPA.x, camY - CENTRO_MAPA.y);

    const floors = Object.keys(mapData).map(Number).sort((a, b) => a - b);
    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    let renderQueue = [];
    for (const f of floors) {
        if (!andarVisivel(f)) continue;
        for (let row = 0; row < BORDA; row++) {
            for (let col = 0; col < BORDA; col++) {
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

    // 1) o chao inteiro: e plano, nao disputa profundidade com ninguem
    for (const cell of renderQueue) {
        renderCell(cell.r, cell.c, cell.f, cell.f < currentFloor, currentEraseMode, isCutaway, cell.f === currentFloor, 2);
    }

    // 2) a agua: por cima do chao, por baixo de tudo que fica de pe
    desenharCamadaDeAgua();

    // 3) paredes, colunas e telhados, na ordem de profundidade
    for (const cell of renderQueue) {
        renderCell(cell.r, cell.c, cell.f, cell.f < currentFloor, currentEraseMode, isCutaway, cell.f === currentFloor, 0);
        renderCell(cell.r, cell.c, cell.f, cell.f < currentFloor, currentEraseMode, isCutaway, cell.f === currentFloor, 1);
    }

    // Pontos A e B da ferramenta de parede -- e da cerca, que usa o mesmo traco.
    if (currentBrush === 2 || currentBrush === 9) {
        const corA = currentEraseMode ? '#ff6b6b' : '#4ade80';
        if (isDragging && verticeA) {
            desenharVertice(verticeA, corA, 7);
            if (verticeB && (verticeB.row !== verticeA.row || verticeB.col !== verticeA.col)) {
                desenharVertice(verticeB, '#38bdf8', 7);
            }
        } else if (verticeHover) {
            desenharVertice(verticeHover, 'rgba(255,255,255,0.55)', 5);
        }
    }

    ctx.restore();
}

// Em qual lado da parede diagonal o clique caiu.
function metadeSobOMouse(r, c) {
    const cel = map[r][c];
    const { fr, fc } = hoverFracao;
    if (cel.wallNS > 0) return (fc > fr) ? 'E' : 'W';    // corte de norte a sul
    if (cel.wallWE > 0) return (fr + fc > 1) ? 'S' : 'N'; // corte de oeste a leste
    return null;
}

// As celulas ligadas a esta, sem atravessar parede. E o mesmo caminho do Shift,
// reaproveitado para pintar um cômodo inteiro de uma vez.
function celulasDoComodo(r0, c0) {
    const fila = [{ r: r0, c: c0 }];
    const vistos = new Set([`${r0},${c0}`]);
    const saida = [];
    while (fila.length) {
        const { r, c } = fila.shift();
        saida.push({ r, c });
        const cel = map[r][c];
        if (cel.wallWE > 0 || cel.wallNS > 0) continue;
        const passo = (temParede, vr, vc) => {
            if (temParede) return;
            if (vr < 0 || vr >= GRADE || vc < 0 || vc >= GRADE) return;
            if (vistos.has(`${vr},${vc}`)) return;
            vistos.add(`${vr},${vc}`);
            fila.push({ r: vr, c: vc });
        };
        passo(cel.wallL > 0, r, c - 1);
        passo(cel.wallR > 0, r - 1, c);
        passo(map[r][c + 1].wallL > 0, r, c + 1);
        passo(map[r + 1][c].wallR > 0, r + 1, c);
        if (saida.length > GRADE * GRADE) break;
    }
    return saida;
}

// Todas as arestas com parede (ou cerca) que cercam um conjunto de celulas.
function arestasDoComodo(celulas) {
    const arestas = [];
    for (const { r, c } of celulas) {
        const cel = map[r][c];
        if (cel.wallL > 0) arestas.push({ r, c, lado: 'L' });
        if (cel.wallR > 0) arestas.push({ r, c, lado: 'R' });
        if (cel.wallWE > 0) arestas.push({ r, c, lado: 'WE' });
        if (cel.wallNS > 0) arestas.push({ r, c, lado: 'NS' });
        if (map[r][c + 1].wallL > 0) arestas.push({ r, c: c + 1, lado: 'L' });
        if (map[r + 1][c].wallR > 0) arestas.push({ r: r + 1, c, lado: 'R' });
    }
    return arestas;
}

function applySmartBrush() {
    if (hoverRow < 0 || hoverRow >= GRADE || hoverCol < 0 || hoverCol >= GRADE) return;
    const currentEraseMode = isDragging ? (dragStartNode && dragStartNode.erase) : isErasing;

    // Antes daqui saia um 'return' quando o corte estava desligado: com o telhado
    // aparecendo, piso e coluna simplesmente nao entravam, sem aviso nenhum.

    if (currentBrush === 1) { 
        if (!currentEraseMode && !isFloorSupported(hoverRow, hoverCol)) return;
        const cel = map[hoverRow][hoverCol];

        // Numa celula cortada por parede diagonal, o clique pinta a METADE onde
        // caiu. Antes so a metade de dentro existia como piso, e o lado de fora
        // ficava condenado a terra para sempre.
        const ladoDoMouse = metadeSobOMouse(hoverRow, hoverCol);
        if (ladoDoMouse) {
            const dentro = metadeCache[`${currentFloor},${hoverRow},${hoverCol}`];
            const ehDeFora = dentro && ladoDoMouse !== dentro;
            if (ehDeFora) {
                cel.pisoFora = currentEraseMode ? 0 : 1;
                cel.texPisoFora = currentEraseMode ? null : texturaSelecionada.piso;
            } else {
                cel.floor = currentEraseMode ? 0 : 1;
                cel.texPiso = currentEraseMode ? null : texturaSelecionada.piso;
            }
            return;
        }

        // Construir ja aplica o acabamento escolhido: o chao nasce com a textura
        // da paleta, em vez de sair cinza e pedir uma segunda passada.
        cel.floor = currentEraseMode ? 0 : 1;
        cel.texPiso = currentEraseMode ? null : texturaSelecionada.piso;
        if (currentEraseMode) { cel.pisoFora = 0; cel.texPisoFora = null; }
        return; 
    }
    
    // AGUA DECORATIVA (0): pinta a celula e bloqueia. O que estava construido ali
    // sai -- agua e chao nao ocupam o mesmo ladrilho.
    if (currentBrush === 0) {
        if (currentFloor !== 0) return;          // agua so no terreo
        const r = hoverRow + hoverFracao.fr, c = hoverCol + hoverFracao.fc;

        if (currentEraseMode) {
            // A borracha tira as pinceladas que o cursor alcanca.
            pinceladasDeAgua = pinceladasDeAgua.filter(p => {
                const dr = r - p.r, dc = c - p.c;
                return Math.sqrt(dr * dr + dc * dc) > p.raio * 0.6 + raioDoPincel * 0.4;
            });
            recalcularAgua();
            return;
        }

        // Enquanto o mouse arrasta, uma pincelada a cada meio raio: menos que
        // isso e desperdicio, mais que isso deixa o traco serrilhado.
        const ultima = pinceladasDeAgua[pinceladasDeAgua.length - 1];
        if (ultima) {
            const dr = r - ultima.r, dc = c - ultima.c;
            if (Math.sqrt(dr * dr + dc * dc) < raioDoPincel * 0.35) return;
        }
        pinceladasDeAgua.push({ r, c, raio: raioDoPincel,
                                estilo: texturaSelecionada.agua || ESTILOS_DE_AGUA[0].id });
        recalcularAgua();
        return;
    }

    // PINTAR TELHADO (7): a agua e do cômodo inteiro, nao de um ladrilho, entao
    // um clique pinta o cômodo sob o cursor de uma vez.
    if (currentBrush === 7) {
        const nova = currentEraseMode ? null : texturaSelecionada.telhado;
        celulasDoComodo(hoverRow, hoverCol).forEach(({ r, c }) => { map[r][c].texTelhado = nova; });
        return;
    }

    // PINTAR PAREDE (8): parede, cerca e coluna -- tudo que fica de pe.
    if (currentBrush === 8) {
        const cel = map[hoverRow][hoverCol];
        const nova = currentEraseMode ? null : texturaSelecionada.parede;

        if (cel.column > 0 && hoverQuadrant === 'NW') { cel.texColuna = nova; return; }
        if (cel.wallWE > 0) { cel.texWE = nova; return; }
        if (cel.wallNS > 0) { cel.texNS = nova; return; }

        let aRow = hoverRow, aCol = hoverCol, lado = 'L';
        if (hoverQuadrant === 'NE') lado = 'R';
        else if (hoverQuadrant === 'SW') { aRow += 1; lado = 'R'; }
        else if (hoverQuadrant === 'SE') { aCol += 1; lado = 'L'; }
        if (aRow >= BORDA || aCol >= BORDA) return;
        const alvo = map[aRow][aCol];
        if (lado === 'L' && alvo.wallL > 0) alvo.texL = nova;
        else if (lado === 'R' && alvo.wallR > 0) alvo.texR = nova;
        else if (cel.column > 0) cel.texColuna = nova;
        return;
    }

    if (currentBrush === 6) {
        if (!currentEraseMode && !isFloorSupported(hoverRow, hoverCol)) return;
        map[hoverRow][hoverCol].column = currentEraseMode ? 0 : blockHeight;
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

    if (tRow < BORDA && tCol < BORDA && !isDragging && currentBrush === 2) {
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

// A paleta mostra o que serve para a ferramenta ativa: chao com chao, parede
// com parede. Antes esta grade existia no HTML e vivia vazia.
function grupoDaFerramenta() {
    if (currentBrush === 8) return 'parede';
    if (currentBrush === 7) return 'telhado';
    if (currentBrush === 0) return 'agua';
    return 'piso';
}

function montarPaletaTexturas() {
    const grade = document.getElementById('texturePalette');
    if (!grade) return;
    const grupo = grupoDaFerramenta();
    grade.innerHTML = '';

    const limpar = document.createElement('div');
    limpar.className = 'texture-wrapper';
    const botaoLimpar = document.createElement('div');
    botaoLimpar.className = 'texture-btn' + (texturaSelecionada[grupo] ? '' : ' selected');
    botaoLimpar.style.background = 'repeating-linear-gradient(45deg,#334155,#334155 6px,#1e293b 6px,#1e293b 12px)';
    botaoLimpar.title = 'Sem textura (volta para a cor)';
    botaoLimpar.addEventListener('click', () => { texturaSelecionada[grupo] = null; montarPaletaTexturas(); });
    const rotuloLimpar = document.createElement('div');
    rotuloLimpar.className = 'texture-label'; rotuloLimpar.innerText = 'Sem textura';
    limpar.appendChild(botaoLimpar); limpar.appendChild(rotuloLimpar);
    grade.appendChild(limpar);

    // A agua nao vem de arquivo: e desenhada. A amostra da paleta e um quadro
    // do proprio efeito, congelado.
    if (grupo === 'agua') {
        ESTILOS_DE_AGUA.forEach(estilo => {
            const caixa = document.createElement('div');
            caixa.className = 'texture-wrapper';
            const botao = document.createElement('div');
            botao.className = 'texture-btn' + (texturaSelecionada.agua === estilo.id ? ' selected' : '');
            botao.style.backgroundImage = `url(${desenharOndas(estilo, 1.7).toDataURL()})`;
            botao.title = estilo.nome;
            botao.addEventListener('click', () => { texturaSelecionada.agua = estilo.id; montarPaletaTexturas(); });
            const rotulo = document.createElement('div');
            rotulo.className = 'texture-label'; rotulo.innerText = estilo.nome;
            caixa.appendChild(botao); caixa.appendChild(rotulo);
            grade.appendChild(caixa);
        });
        atualizarSeloDaTextura();
        return;
    }

    // Agrupadas por categoria: procurar "tijolo" no meio de quarenta quadradinhos
    // sem nome nao e escolher, e adivinhar.
    const categorias = [];
    catalogoTexturas.filter(t => t.grupo === grupo).forEach(t => {
        const nomeCategoria = t.nome.replace(/\s+\d+$/, '');
        let cat = categorias.find(c => c.nome === nomeCategoria);
        if (!cat) { cat = { nome: nomeCategoria, itens: [] }; categorias.push(cat); }
        cat.itens.push(t);
    });

    categorias.forEach(cat => {
        const titulo = document.createElement('div');
        titulo.className = 'texture-categoria';
        titulo.innerText = cat.nome;
        grade.appendChild(titulo);
        cat.itens.forEach(t => desenharBotaoTextura(grade, t, grupo));
    });
    atualizarSeloDaTextura();
}

function desenharBotaoTextura(grade, t, grupo) {
    {
        const caixa = document.createElement('div');
        caixa.className = 'texture-wrapper';
        const botao = document.createElement('div');
        botao.className = 'texture-btn' + (texturaSelecionada[grupo] === t.id ? ' selected' : '');
        botao.style.backgroundImage = `url(${t.arquivo})`;
        botao.title = t.nome;
        botao.addEventListener('click', () => { texturaSelecionada[grupo] = t.id; montarPaletaTexturas(); });
        const rotulo = document.createElement('div');
        rotulo.className = 'texture-label'; rotulo.innerText = t.nome;
        caixa.appendChild(botao); caixa.appendChild(rotulo);
        grade.appendChild(caixa);
    }
}

function atualizarSeloDaTextura() {
    const selo = document.getElementById('texturaAtiva');
    if (!selo) return;
    const grupo = grupoDaFerramenta();
    if (grupo === 'agua') {
        const e = ESTILOS_DE_AGUA.find(x => x.id === texturaSelecionada.agua);
        selo.innerText = e ? e.nome : 'nenhuma';
        return;
    }
    const escolhida = catalogoTexturas.find(t => t.id === texturaSelecionada[grupo]);
    selo.innerText = escolhida ? escolhida.nome : 'nenhuma';
}

function updateUI() {
    document.getElementById('btnPiso').classList.toggle('active', currentBrush === 1 && !isErasing);
    document.getElementById('btnParede').classList.toggle('active', currentBrush === 2 && !isErasing);
    document.getElementById('btnRoomRect').classList.toggle('active', currentBrush === 3 && !isErasing);
    document.getElementById('btnColuna').classList.toggle('active', currentBrush === 6 && !isErasing);
    document.getElementById('btnRoomTri').classList.toggle('active', currentBrush === 4 && !isErasing);
    document.getElementById('btnRoomOct').classList.toggle('active', currentBrush === 5 && !isErasing);
    document.getElementById('btnCerca').classList.toggle('active', currentBrush === 9 && !isErasing);
    document.getElementById('btnPaintRoof').classList.toggle('active', currentBrush === 7 && !isErasing);
    document.getElementById('btnPaintWall').classList.toggle('active', currentBrush === 8 && !isErasing);
    document.getElementById('btnAgua').classList.toggle('active', currentBrush === 0 && !isErasing);
    document.getElementById('btnBorracha').classList.toggle('active', isErasing);
    document.getElementById('btnCutaway').innerText = isCutaway ? 'Paredes: CORTADAS (C)' : 'Paredes: INTEIRAS (C)';

    let floorName = currentFloor === 0 ? "Térreo (0)" : (currentFloor > 0 ? `Superior (${currentFloor})` : `Subsolo (${currentFloor})`);
    document.getElementById('floorLabel').innerText = `Andar Atual: ${floorName}`;
}

function definirAlturaParede(nova) {
    // Vale para o que vier a seguir. O que ja esta de pe fica como esta --
    // e isso que permite misturar alturas no mesmo tabuleiro.
    blockHeight = nova;
    cutawayHeight = Math.max(6, Math.round(nova * 0.25));

    const rotulo = document.getElementById('valorAltura');
    if (rotulo) rotulo.innerText = nova;
    updatePreview();
    drawIsometricGrid();
}

// Catalogo de texturas: carrega assim que a pagina abre.
carregarCatalogoTexturas();

document.getElementById('sliderAltura').addEventListener('input', (e) => {
    definirAlturaParede(parseInt(e.target.value));
});

const sliderPincel = document.getElementById('sliderPincelAgua');
if (sliderPincel) {
    sliderPincel.addEventListener('input', (e) => {
        raioDoPincel = parseInt(e.target.value) / 100;
        const rotulo = document.getElementById('valorPincelAgua');
        if (rotulo) rotulo.innerText = raioDoPincel.toFixed(2).replace('.', ',');
    });
}

document.getElementById('roofPitchSelect').addEventListener('change', (e) => {
    roofPitch = parseInt(e.target.value);
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
document.getElementById('colorRoof').addEventListener('input', (e) => {
    roofColor = e.target.value;
    drawIsometricGrid();
});

canvas.addEventListener('mousemove', (e) => {
    isErasing = e.ctrlKey || e.metaKey;
    updateUI();

    // Ferramenta de parede: o alvo e o canto da grade, nao a celula.
    if (currentBrush === 2 || currentBrush === 9) verticeHover = screenToVertice(e.clientX, e.clientY);


    // Qual celula esta sob o mouse.
    // Antes isso era feito tracando os 100 losangos no canvas e perguntando
    // isPointInPath -- caro, e quebraria com zoom, porque o teste depende da
    // transformacao ativa. Agora invertemos a projecao direto.
    hoverCol = -1; hoverRow = -1; hoverQuadrant = 'none';
    const g = telaParaGrade(e.clientX, e.clientY);
    const rInt = Math.floor(g.row), cInt = Math.floor(g.col);

    if (rInt >= 0 && rInt < GRADE && cInt >= 0 && cInt < GRADE) {
        hoverRow = rInt; hoverCol = cInt;
        // Fracao dentro da celula. As duas comparacoes abaixo sao as mesmas do
        // codigo antigo, so que em coordenadas de grade: na tela, x cresce com
        // (col - row) e y cresce com (col + row).
        const fr = g.row - rInt, fc = g.col - cInt;
        hoverFracao = { fr, fc };
        if (fc < fr)  hoverQuadrant = (fc + fr < 1) ? 'NW' : 'SW';
        else          hoverQuadrant = (fc + fr < 1) ? 'NE' : 'SE';
    }

    if (isDragging) {
        if (currentBrush === 0 || currentBrush === 1 || currentBrush === 6 || currentBrush === 7 || currentBrush === 8 || (dragStartNode && dragStartNode.erase && dragStartNode.type === 'floor')) {
            applySmartBrush(); 
        }
    }

    updatePreview();
    drawIsometricGrid();
});

canvas.addEventListener('mousedown', (e) => { 
    if (hoverRow < 0 || hoverRow >= GRADE || hoverCol < 0 || hoverCol >= GRADE) return;
    
    isErasing = e.ctrlKey || e.metaKey;
    updateUI();
    saveState(); 

    if (e.shiftKey) {
        // Shift nas ferramentas de acabamento: pinta o cômodo inteiro de uma vez,
        // em vez de preencher chao.
        if (currentBrush === 0) { applySmartBrush(); drawIsometricGrid(); return; }
        if (currentBrush === 7 || currentBrush === 8) {
            saveState();
            const celulas = celulasDoComodo(hoverRow, hoverCol);
            if (currentBrush === 7) {
                const nova = isErasing ? null : texturaSelecionada.telhado;
                celulas.forEach(({ r, c }) => { map[r][c].texTelhado = nova; });
            } else {
                const nova = isErasing ? null : texturaSelecionada.parede;
                arestasDoComodo(celulas).forEach(({ r, c, lado }) => { map[r][c]['tex' + lado] = nova; });
                celulas.forEach(({ r, c }) => { if (map[r][c].column > 0) map[r][c].texColuna = nova; });
            }
            drawIsometricGrid();
            return;
        }

        if (!isErasing && currentBrush !== 0 && !isFloorSupported(hoverRow, hoverCol)) return;
        const queue = [{r: hoverRow, c: hoverCol}];
        const visited = new Set();
        visited.add(`${hoverRow},${hoverCol}`);

        // No andar de cima, a laje so existe sobre o que a sustenta. O
        // preenchimento e limitado pelo APOIO alem das paredes: assim o Shift
        // cobre exatamente a pegada do que esta construido embaixo, em vez de
        // espalhar chao flutuante pelo tabuleiro inteiro.
        // O Shift cobre a PEGADA do que existe embaixo. O balanco de um ladrilho
        // continua disponivel, mas so no clique -- senao todo preenchimento sairia
        // com uma saia de sobra em volta do predio.
        // Apagando, o preenchimento so atravessa o que TEM chao -- senao, um
        // Shift+Ctrl no vazio caminhava pelo tabuleiro inteiro e limpava a laje.
        // Agua nao usa mais preenchimento por celula: o pincel e continuo.
        const pintandoAgua = false;
        const podePintar = (r, c) => {
            if (pintandoAgua) return isErasing ? map[r][c].agua > 0 : currentFloor === 0;
            if (ehAgua(r, c)) return false;      // agua bloqueia: o chao nao passa por cima
            return isErasing ? map[r][c].floor > 0
                             : (currentFloor <= 0 || apoioDireto(currentFloor - 1, r, c));
        };

        // A celula cortada por diagonal nao entra na fila -- a parede corta a
        // passagem --, mas a METADE virada para este lado e chao contiguo. Sem
        // isto o preenchimento parava um triangulo antes da parede e deixava
        // aquela franja de terra ao longo da diagonal.
        const meiaVizinha = (r, c, vr, vc) => {
            if (vr < 0 || vr >= GRADE || vc < 0 || vc >= GRADE) return;
            const viz = map[vr][vc];
            const cortada = viz.wallNS > 0 || viz.wallWE > 0;
            if (!cortada) return;
            // Olhando de (r,c): a metade encostada em nos e a do nosso lado.
            const lado = viz.wallNS > 0
                ? ((c < vc) ? 'W' : (c > vc) ? 'E' : (r < vr) ? 'E' : 'W')
                : ((r < vr) ? 'N' : (r > vr) ? 'S' : (c < vc) ? 'N' : 'S');
            const dentro = metadeCache[`${currentFloor},${vr},${vc}`];
            if (dentro && lado === dentro) {
                viz.floor = isErasing ? 0 : 1;
                viz.texPiso = isErasing ? null : texturaSelecionada.piso;
            } else {
                viz.pisoFora = isErasing ? 0 : 1;
                viz.texPisoFora = isErasing ? null : texturaSelecionada.piso;
            }
        };

        while(queue.length > 0) {
            const {r, c} = queue.shift();
            if (!podePintar(r, c)) continue;
            if (pintandoAgua) {
                const cel = map[r][c];
                if (isErasing) { cel.agua = 0; cel.texAgua = null; }
                else {
                    cel.agua = 1; cel.texAgua = texturaSelecionada.agua || ESTILOS_DE_AGUA[0].id;
                    cel.floor = 0; cel.texPiso = null; cel.pisoFora = 0; cel.column = 0;
                    cel.wallL = 0; cel.wallR = 0; cel.wallWE = 0; cel.wallNS = 0;
                }
            } else {
                map[r][c].floor = isErasing ? 0 : 1;
                map[r][c].texPiso = isErasing ? null : texturaSelecionada.piso;
            }
            meiaVizinha(r, c, r, c - 1); meiaVizinha(r, c, r, c + 1);
            meiaVizinha(r, c, r - 1, c); meiaVizinha(r, c, r + 1, c);

            // A propagacao e limitada pelas PAREDES (testadas logo abaixo), nunca pelo
            // estado do piso. A trava antiga interrompia o preenchimento em toda celula
            // vazia -- ou seja, sempre -- e so um ladrilho era pintado.

            const wL = map[r][c].wallL > 0; const wR = map[r][c].wallR > 0;
            const wWE = map[r][c].wallWE > 0; const wNS = map[r][c].wallNS > 0;
            const wL_next = map[r][c+1].wallL > 0;
            const wR_next = map[r+1][c].wallR > 0;

            // No andar de cima a laje para nas paredes do andar DE BAIXO. Sem isso
            // o preenchimento cobria tudo que tivesse chao embaixo -- se o terreo
            // estivesse todo pintado, a laje tomava o tabuleiro inteiro.
            const baixo = currentFloor > 0 ? mapData[currentFloor - 1] : null;
            const bL = baixo ? baixo[r][c].wallL > 0 : false;
            const bR = baixo ? baixo[r][c].wallR > 0 : false;
            const bL_next = baixo ? baixo[r][c+1].wallL > 0 : false;
            const bR_next = baixo ? baixo[r+1][c].wallR > 0 : false;
            const bWE = baixo ? baixo[r][c].wallWE > 0 : false;
            const bNS = baixo ? baixo[r][c].wallNS > 0 : false;

            const barraAgua = (vr, vc) => !pintandoAgua && ehAgua(vr, vc);
            if (c > 0 && !wL && !wWE && !wNS && !bL && !bWE && !bNS && !barraAgua(r, c-1) && !visited.has(`${r},${c-1}`)) { visited.add(`${r},${c-1}`); queue.push({r, c: c-1}); }
            if (c < GRADE - 1 && !wL_next && !wWE && !wNS && !bL_next && !bWE && !bNS && !barraAgua(r, c+1) && !visited.has(`${r},${c+1}`)) { visited.add(`${r},${c+1}`); queue.push({r, c: c+1}); }
            if (r > 0 && !wR && !wWE && !wNS && !bR && !bWE && !bNS && !barraAgua(r-1, c) && !visited.has(`${r-1},${c}`)) { visited.add(`${r-1},${c}`); queue.push({r: r-1, c}); }
            if (r < GRADE - 1 && !wR_next && !wWE && !wNS && !bR_next && !bWE && !bNS && !barraAgua(r+1, c) && !visited.has(`${r+1},${c}`)) { visited.add(`${r+1},${c}`); queue.push({r: r+1, c}); }
        }
        drawIsometricGrid();
        return; 
    }

    isDragging = true; 
    
    if (currentBrush === 0 || currentBrush === 1 || currentBrush === 6 || currentBrush === 7 || currentBrush === 8) {
        dragStartNode = { type: currentBrush === 1 ? 'floor' : (currentBrush === 6 ? 'column' : (currentBrush === 0 ? 'agua' : 'pintura')), row: hoverRow, col: hoverCol, erase: isErasing };
        applySmartBrush(); 
    } else if (currentBrush === 3 || currentBrush === 4 || currentBrush === 5) {
        dragStartNode = { type: 'room', row: hoverRow, col: hoverCol, erase: isErasing };
    } else if (currentBrush === 2 || currentBrush === 9) {
        // Ponto A trava no canto mais proximo do clique.
        verticeA = screenToVertice(e.clientX, e.clientY);
        verticeHover = verticeA;
        verticeB = verticeA;
        dragStartNode = { type: 'wall', erase: isErasing };
    }
    
    updatePreview();
    drawIsometricGrid(); 
});

canvas.addEventListener('mouseup', () => { 
    if (isDragging) {
        const eraseMode = dragStartNode.erase;
        if ([2, 3, 4, 5, 9].includes(currentBrush)) {
            const ehCerca = currentBrush === 9;
            const altura = ehCerca ? alturaCerca() : blockHeight;
            if (!eraseMode) {
                saveState(); 
                previewWalls.forEach(p => {
                    const cel = map[p.row][p.col];
                    if (p.side === 'L') { cel.wallL = altura; cel.cercaL = ehCerca ? 1 : 0; }
                    else if (p.side === 'R') { cel.wallR = altura; cel.cercaR = ehCerca ? 1 : 0; }
                    else if (p.side === 'WE') { cel.wallWE = altura; cel.cercaWE = ehCerca ? 1 : 0; }
                    else if (p.side === 'NS') { cel.wallNS = altura; cel.cercaNS = ehCerca ? 1 : 0; }
                });
            } else if (eraseMode && dragStartNode && (dragStartNode.type === 'wall' || dragStartNode.type === 'room')) {
                saveState();
                previewWalls.forEach(p => {
                    const cel = map[p.row][p.col];
                    if (p.side === 'L') { cel.wallL = 0; cel.cercaL = 0; }
                    else if (p.side === 'R') { cel.wallR = 0; cel.cercaR = 0; }
                    else if (p.side === 'WE') { cel.wallWE = 0; cel.cercaWE = 0; }
                    else if (p.side === 'NS') { cel.wallNS = 0; cel.cercaNS = 0; }
                });
            }
        }
    }
    isDragging = false; 
    dragStartNode = null;
    verticeA = null; verticeB = null;
    updatePreview();
    drawIsometricGrid();
});

canvas.addEventListener('mouseleave', () => { 
    isDragging = false; 
    dragStartNode = null;
    verticeA = null; verticeB = null; verticeHover = null;
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

    if (e.key === 'q' || e.key === 'Q') { girarCamera(-1); return; }
    if (e.key === 'e' || e.key === 'E') { girarCamera(1); return; }

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
            pinceladasDeAgua = JSON.parse(JSON.stringify(previousState.agua || []));
            map = mapData[currentFloor];
            
            updateUI();
            drawIsometricGrid();
        }
        return;
    }

    if (['0','1','2','3','4','5','6','7','8','9'].includes(e.key)) {
        currentBrush = parseInt(e.key);
        isDragging = false;
        dragStartNode = null;
        updateUI();
        montarPaletaTexturas();
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
document.getElementById('btnColuna').addEventListener('click', () => { currentBrush = 6; updateUI(); });
document.getElementById('btnRoomTri').addEventListener('click', () => { currentBrush = 4; updateUI(); });
document.getElementById('btnRoomOct').addEventListener('click', () => { currentBrush = 5; updateUI(); });
document.getElementById('btnCerca').addEventListener('click', () => { currentBrush = 9; updateUI(); });
document.getElementById('btnAgua').addEventListener('click', () => { currentBrush = 0; updateUI(); montarPaletaTexturas(); });
document.getElementById('btnPaintRoof').addEventListener('click', () => { currentBrush = 7; updateUI(); montarPaletaTexturas(); });
document.getElementById('btnPaintWall').addEventListener('click', () => { currentBrush = 8; updateUI(); montarPaletaTexturas(); });

document.getElementById('btnRotL').addEventListener('click', () => girarCamera(-1));
document.getElementById('btnRotR').addEventListener('click', () => girarCamera(1));

document.getElementById('btnCutaway').addEventListener('click', () => { isCutaway = !isCutaway; updateUI(); drawIsometricGrid(); });
document.getElementById('btnUndo').addEventListener('click', () => { 
    const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    window.dispatchEvent(event);
});

// ===================== CAMERA: ZOOM E MOVIMENTO =====================

function aplicarZoom(fator, ancoraX, ancoraY) {
    const antes = camZoom;
    camZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camZoom * fator));
    if (camZoom === antes) return;
    // Se houver ancora (a roda do mouse), o ponto do mapa sob o cursor fica
    // parado enquanto o resto aproxima ou afasta.
    if (ancoraX !== undefined) {
        const rect = canvas.getBoundingClientRect();
        camX += (ancoraX - rect.left - canvas.width  / 2) * (1 / camZoom - 1 / antes);
        camY += (ancoraY - rect.top  - canvas.height / 2) * (1 / camZoom - 1 / antes);
    }
    drawIsometricGrid();
}

document.getElementById('btnZoomIn') ?.addEventListener('click', () => aplicarZoom(1.25));
document.getElementById('btnZoomOut')?.addEventListener('click', () => aplicarZoom(1 / 1.25));

// Trackpad e roda do mouse. No Mac, pinca chega como wheel com ctrlKey.
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const passo = e.ctrlKey ? 0.02 : 0.0015;
    aplicarZoom(Math.exp(-e.deltaY * passo), e.clientX, e.clientY);
}, { passive: false });

// Movimento continuo enquanto a tecla estiver pressionada. So roda enquanto
// alguma direcao esta ativa -- nao ha laco de animacao permanente.
const teclasCamera = { w: false, a: false, s: false, d: false };
let loopCamera = false;

function passoCamera() {
    const v = 14 / camZoom;   // em zoom fechado, o passo em pixels de tela e o mesmo
    let mudou = false;
    if (teclasCamera.w) { camY += v; mudou = true; }
    if (teclasCamera.s) { camY -= v; mudou = true; }
    if (teclasCamera.a) { camX += v; mudou = true; }
    if (teclasCamera.d) { camX -= v; mudou = true; }
    if (mudou) drawIsometricGrid();

    if (teclasCamera.w || teclasCamera.a || teclasCamera.s || teclasCamera.d) {
        requestAnimationFrame(passoCamera);
    } else {
        loopCamera = false;
    }
}

const direcaoDaTecla = {
    w: 'w', a: 'a', s: 's', d: 'd',
    arrowup: 'w', arrowleft: 'a', arrowdown: 's', arrowright: 'd',
};

window.addEventListener('keydown', (e) => {
    const alvo = (e.target && e.target.tagName || '').toLowerCase();
    if (alvo === 'input' || alvo === 'select' || alvo === 'textarea') return;
    const dir = direcaoDaTecla[e.key.toLowerCase()];
    if (!dir) return;
    e.preventDefault();
    teclasCamera[dir] = true;
    if (!loopCamera) { loopCamera = true; requestAnimationFrame(passoCamera); }
});

window.addEventListener('keyup', (e) => {
    const dir = direcaoDaTecla[e.key.toLowerCase()];
    if (dir) teclasCamera[dir] = false;
});

// Se a janela perde o foco, nenhuma tecla "fica presa" e a camera nao desliza sozinha.
window.addEventListener('blur', () => {
    teclasCamera.w = teclasCamera.a = teclasCamera.s = teclasCamera.d = false;
});

function resizeCanvas() {
    if (!container) return;
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    drawIsometricGrid();
}

window.addEventListener('resize', resizeCanvas);
updateUI();
resizeCanvas();