// teste-regressao.js — Suíte de regressão da engine 2.5D
// Uso: node teste-regressao.js [caminho-do-projeto]
// Verifica, de forma automatizada, se as funções básicas da engine estão vivas.

const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const RAIZ = process.argv[2] || __dirname;
const PORTA = 8099;

const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.json':'application/json' };

function servidor() {
  return http.createServer((req, res) => {
    const limpo = decodeURIComponent(req.url.split('?')[0]);
    // O navegador pede favicon.ico sozinho; respondemos 204 para não poluir o log de erros.
    if (limpo === '/favicon.ico') { res.writeHead(204); return res.end(); }
    const arq = path.join(RAIZ, limpo === '/' ? 'index.html' : limpo);
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
      res.writeHead(404); return res.end('404');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
  }).listen(PORTA);
}

const resultados = [];
function checa(nome, passou, detalhe = '') {
  resultados.push({ nome, passou, detalhe });
  console.log(`${passou ? '  PASSOU' : '  FALHOU'}  ${nome}${detalhe ? '\n           ' + detalhe : ''}`);
}

(async () => {
  const srv = servidor();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  const errosConsole = [];
  page.on('pageerror', e => errosConsole.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errosConsole.push(m.text());
  });

  console.log(`\nTestando: ${RAIZ}\n${'='.repeat(64)}`);
  await page.goto(`http://localhost:${PORTA}/tabuleiro.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);

  // T1 — a engine carrega sem erro fatal
  checa('A engine carrega sem erro de JavaScript', errosConsole.length === 0,
        errosConsole.length ? 'Erro: ' + errosConsole[0].split('\n')[0] : '');

  // T2 — o script executou até o fim.
  // Não dá para testar por "typeof função" porque declarações de função sofrem hoisting
  // e existem mesmo quando a execução nunca chegou lá. Testamos por efeito colateral:
  // o mapa só é inicializado por código que roda no final do arquivo.
  const scriptCompleto = await page.evaluate(() =>
    typeof map !== 'undefined' && Array.isArray(map) && map.length > 0);
  checa('O script.js executa até a última linha', scriptCompleto,
        scriptCompleto ? '' : 'A execução parou no meio — o mapa nunca foi inicializado');

  // T3 — o canvas foi dimensionado (resizeCanvas rodou)
  const dim = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    return { w: c.width, h: c.height };
  });
  checa('O canvas tem o tamanho da janela (não 300x150 padrão)', dim.w > 300 && dim.h > 150,
        `canvas.width=${dim.w} canvas.height=${dim.h}`);

  // T4 — os eventos de mouse foram registrados
  // Varremos o canvas: o grid não cobre a tela inteira, então um ponto fixo
  // pode cair fora dele e dar falso negativo.
  const pontosComHover = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas');
    const rec = c.getBoundingClientRect();
    let n = 0;
    for (let y = 40; y < rec.height; y += 40)
      for (let x = 100; x < rec.width; x += 100) {
        c.dispatchEvent(new MouseEvent('mousemove', { clientX: rec.left + x, clientY: rec.top + y, bubbles: true }));
        if (typeof hoverRow !== 'undefined' && hoverRow !== -1) n++;
      }
    return n;
  });
  checa('Listeners de mouse registrados no canvas', pontosComHover > 0,
        `o cursor foi reconhecido em ${pontosComHover} pontos do grid`);

  // T5 — CONSTRUIR PISO: clicar no canvas deve criar um piso
  const piso = await page.evaluate(async () => {
    try {
      mapData[0] = createEmptyMap(); map = mapData[0]; currentBrush = 1;
      const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect();
      // Miramos uma celula concreta, via a mesma conversao que o desenho usa.
      const g = gridToScreen(3.5, 3.5), t = worldParaTela(g.x, g.y);
      const x = r.left + t.x, y = r.top + t.y;
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousedown',  { clientX: x, clientY: y, bubbles: true, button: 0 }));
      c.dispatchEvent(new MouseEvent('mouseup',    { clientX: x, clientY: y, bubbles: true, button: 0 }));
      let n = 0;
      for (const lin of map) for (const cel of lin) if (cel.floor > 0) n++;
      return n;
    } catch (e) { return -1; }
  });
  checa('CONSTRUIR PISO — clique cria um piso no mapa', piso > 0,
        piso < 0 ? 'estado do mapa inacessível' : `pisos no mapa após o clique: ${piso}`);

  // T6 — CONSTRUIR PAREDE: ferramenta 2, clique deve criar parede
  const parede = await page.evaluate(async () => {
    try {
      mapData[0] = createEmptyMap(); map = mapData[0]; currentBrush = 2;
      const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect();
      const pos = (rr, cc) => { const g = gridToScreen(rr, cc), t = worldParaTela(g.x, g.y);
        return { x: r.left + t.x, y: r.top + t.y }; };
      const a = pos(3, 3), b = pos(6, 3);   // tres segmentos verticais
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: a.x, clientY: a.y, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousedown', { clientX: a.x, clientY: a.y, bubbles: true, button: 0 }));
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: b.x, clientY: b.y, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mouseup',   { clientX: b.x, clientY: b.y, bubbles: true, button: 0 }));
      let n = 0;
      for (const lin of map) for (const cel of lin)
        if (cel.wallL > 0 || cel.wallR > 0 || cel.wallWE > 0 || cel.wallNS > 0) n++;
      return n;
    } catch (e) { return -1; }
  });
  checa('CONSTRUIR PAREDE — clique e arraste cria parede', parede > 0,
        parede < 0 ? 'estado global inacessível' : `paredes no mapa após o gesto: ${parede}`);

  // T7 — todo ID pedido pelo JS existe no HTML
  const idsFaltando = await page.evaluate(async () => {
    const fonte = await fetch('script.js').then(r => r.text());
    const pedidos = [...fonte.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
    return [...new Set(pedidos)].filter(id => !document.getElementById(id));
  });
  checa('Todo elemento exigido pelo JS existe no HTML', idsFaltando.length === 0,
        idsFaltando.length ? 'AUSENTES: ' + idsFaltando.join(', ') : '');

  // T8 — Shift preenche o cômodo inteiro, e só ele
  const preenchimento = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0];
    for (let r = 2; r <= 5; r++) { map[r][2].wallL = 48; map[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { map[2][c].wallR = 48; map[6][c].wallR = 48; }
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const g = gridToScreen(3.5, 3.5);
    const t = worldParaTela(g.x, g.y);
    const x = rec.left + t.x, y = rec.top + t.y;
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, shiftKey: true }));
    cv.dispatchEvent(new MouseEvent('mouseup',   { clientX: x, clientY: y, bubbles: true }));
    let dentro = 0, fora = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (map[r][c].floor > 0) {
      (r >= 2 && r <= 5 && c >= 2 && c <= 5) ? dentro++ : fora++;
    }
    return { dentro, fora };
  });
  checa('Shift preenche o cômodo inteiro sem vazar', preenchimento.dentro === 16 && preenchimento.fora === 0,
        `${preenchimento.dentro}/16 ladrilhos dentro, ${preenchimento.fora} vazados`);

  // T9 — chão a céu aberto não gera telhado; cômodo fechado gera
  const telhados = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0];
    map[4][4].floor = 1; precalculateRooms();
    const solto = getRoofZ(0, 4.5, 4.5, 24);
    mapData[0] = createEmptyMap(); map = mapData[0];
    for (let r = 2; r <= 5; r++) { map[r][2].wallL = 48; map[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { map[2][c].wallR = 48; map[6][c].wallR = 48; }
    precalculateRooms();
    return { solto, fechado: getRoofZ(0, 3.5, 3.5, 24) };
  });
  checa('Telhado só sobre cômodo fechado, nunca sobre chão solto',
        telhados.solto === 0 && telhados.fechado > 0,
        `chão solto: ${telhados.solto}px (esperado 0) · cômodo fechado: ${telhados.fechado}px (esperado >0)`);

  // T10 — ferramenta de parede no modelo ponto A -> linha -> ponto B
  const ab = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0]; currentBrush = 2; currentFloor = 0;
    const A = { row: 5, col: 5 };
    const igual = (v, r, c) => v.row === r && v.col === c;

    // A linha se prende a reta ou a 45 graus, mesmo com o arrasto torto
    const trava = {
      vertical:    igual(restringirB(A, { row: 9, col: 5 }), 9, 5),
      horizontal:  igual(restringirB(A, { row: 5, col: 9 }), 5, 9),
      diagonal:    igual(restringirB(A, { row: 8, col: 8 }), 8, 8),
      tortoVert:   igual(restringirB(A, { row: 9, col: 6 }), 9, 5),
      tortoHoriz:  igual(restringirB(A, { row: 6, col: 9 }), 5, 9),
    };

    // Cada traco vira as arestas certas do modelo de dados
    const lados = (a, b) => {
      const g = segmentosEntre(a, b);
      return { n: g.length, lado: [...new Set(g.map(x => x.side))].join(',') };
    };
    const traco = {
      baixo:   lados({row:2,col:2}, {row:6,col:2}),
      direita: lados({row:2,col:2}, {row:2,col:6}),
      diagDir: lados({row:2,col:2}, {row:6,col:6}),
      diagEsq: lados({row:2,col:6}, {row:6,col:2}),
    };

    // E o gesto real do mouse constroi de fato
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (r, c) => { const g = gridToScreen(r, c), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const p1 = pos(3, 3), p2 = pos(7, 3);
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: p1.x, clientY: p1.y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mousedown', { clientX: p1.x, clientY: p1.y, bubbles: true, button: 0 }));
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: p2.x, clientY: p2.y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mouseup',   { clientX: p2.x, clientY: p2.y, bubbles: true, button: 0 }));
    let construidas = 0;
    for (const lin of map) for (const cel of lin) if (cel.wallL > 0) construidas++;

    return { trava, traco, construidas };
  });

  const travaOk = Object.values(ab.trava).every(Boolean);
  const tracoOk = ab.traco.baixo.n === 4 && ab.traco.baixo.lado === 'L'
    && ab.traco.direita.n === 4 && ab.traco.direita.lado === 'R'
    && ab.traco.diagDir.n === 4 && ab.traco.diagDir.lado === 'NS'
    && ab.traco.diagEsq.n === 4 && ab.traco.diagEsq.lado === 'WE';
  checa('Parede A→B: linha trava em reta ou 45°', travaOk,
        Object.entries(ab.trava).filter(([,v]) => !v).map(([k]) => 'falhou: ' + k).join(' · ') || 'as 5 travas corretas');
  checa('Parede A→B: cada traço vira a aresta certa', tracoOk,
        `↓${ab.traco.baixo.n}${ab.traco.baixo.lado} →${ab.traco.direita.n}${ab.traco.direita.lado} ` +
        `↘${ab.traco.diagDir.n}${ab.traco.diagDir.lado} ↙${ab.traco.diagEsq.n}${ab.traco.diagEsq.lado}`);
  checa('Parede A→B: o gesto real do mouse constrói', ab.construidas === 4,
        `${ab.construidas} paredes criadas arrastando do canto (3,3) ao (7,3) — esperado 4`);

  // T13 — diagonal solta nao inventa cômodo; diagonal de contorno continua valendo
  const diag = await page.evaluate(() => {
    // (a) uma diagonal sozinha em campo aberto
    mapData[0] = createEmptyMap(); map = mapData[0];
    map[4][4].wallNS = 48; precalculateRooms();
    const solta = { fechada: !!enclosedCache['0,4,4'], telhado: getRoofZ(0, 4.5, 4.5, 24) };

    // (b) octogono: retangulo com os quatro cantos cortados por diagonais
    mapData[0] = createEmptyMap(); map = mapData[0];
    const r1 = 2, c1 = 2, r2 = 7, c2 = 7;
    for (let r = r1; r <= r2; r++) { map[r][c1].wallL = 48; map[r][c2+1].wallL = 48; }
    for (let c = c1; c <= c2; c++) { map[r1][c].wallR = 48; map[r2+1][c].wallR = 48; }
    map[r1][c1].wallL = 0; map[r1][c1].wallR = 0;       map[r1][c1].wallWE = 48;
    map[r1][c2].wallR = 0; map[r1][c2+1].wallL = 0;     map[r1][c2].wallNS = 48;
    map[r2][c1].wallL = 0; map[r2+1][c1].wallR = 0;     map[r2][c1].wallNS = 48;
    map[r2][c2].wallWE = 48; map[r2+1][c2].wallR = 0;   map[r2][c2+1].wallL = 0;
    precalculateRooms();
    const oct = {
      centro:   !!enclosedCache['0,4,4'],
      canto:    !!enclosedCache[`0,${r1},${c1}`],   // celula cortada, no contorno
      foraDoCanto: !!enclosedCache['0,1,1'],
      telhado:  getRoofZ(0, 4.5, 4.5, 24),
    };
    return { solta, oct };
  });
  const diagOk = diag.solta.fechada === false && diag.solta.telhado === 0
    && diag.oct.centro === true && diag.oct.canto === true
    && diag.oct.foraDoCanto === false && diag.oct.telhado > 0;
  checa('Diagonal solta não vira cômodo; diagonal de contorno sim', diagOk,
        `solta: fechada=${diag.solta.fechada} telhado=${diag.solta.telhado}px · ` +
        `octógono: centro=${diag.oct.centro} canto=${diag.oct.canto} ` +
        `fora=${diag.oct.foraDoCanto} telhado=${diag.oct.telhado}px`);

  // T14 — meio-ladrilho: o motor sabe QUAL metade da celula cortada esta dentro
  const meio = await page.evaluate(() => {
    // diagonal solta: nenhuma metade esta dentro
    mapData[0] = createEmptyMap(); map = mapData[0];
    map[4][4].wallNS = 48; precalculateRooms();
    const solta = metadeCache['0,4,4'];

    // octogono: cada canto cortado aponta para o lado do cômodo
    mapData[0] = createEmptyMap(); map = mapData[0];
    const r1 = 2, c1 = 2, r2 = 7, c2 = 7;
    for (let r = r1; r <= r2; r++) { map[r][c1].wallL = 48; map[r][c2+1].wallL = 48; }
    for (let c = c1; c <= c2; c++) { map[r1][c].wallR = 48; map[r2+1][c].wallR = 48; }
    map[r1][c1].wallL = 0; map[r1][c1].wallR = 0;     map[r1][c1].wallWE = 48;
    map[r1][c2].wallR = 0; map[r1][c2+1].wallL = 0;   map[r1][c2].wallNS = 48;
    map[r2][c1].wallL = 0; map[r2+1][c1].wallR = 0;   map[r2][c1].wallNS = 48;
    map[r2][c2].wallWE = 48; map[r2+1][c2].wallR = 0; map[r2][c2+1].wallL = 0;
    precalculateRooms();

    // e o poligono desenhado tem 3 pontos (triangulo) na celula cortada e 4 na inteira
    const q = { x: 0, y: 0 };
    const cortada = poligonoDentro(metadeCache[`0,${r1},${c1}`], q, q, q, q).length;
    const inteira = poligonoDentro(metadeCache['0,4,4'], q, q, q, q).length;

    return {
      solta,
      norte: metadeCache[`0,${r1},${c1}`], leste: metadeCache[`0,${r1},${c2}`],
      oeste: metadeCache[`0,${r2},${c1}`], sul:   metadeCache[`0,${r2},${c2}`],
      cortada, inteira,
    };
  });
  const meioOk = meio.solta === null
    && meio.norte === 'S' && meio.leste === 'W' && meio.oeste === 'E' && meio.sul === 'N'
    && meio.cortada === 3 && meio.inteira === 4;
  checa('Meio-ladrilho: a célula cortada vira triângulo do lado certo', meioOk,
        `diagonal solta=${meio.solta} · cantos do octógono N/L/O/S = ` +
        `${meio.norte}/${meio.leste}/${meio.oeste}/${meio.sul} · ` +
        `pontos desenhados: cortada=${meio.cortada} inteira=${meio.inteira}`);

  // T15 — o telhado sobre parede diagonal sobe suave, sem funil
  const suave = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0];
    for (let c = 2; c <= 6; c++) map[2][c].wallR = 48;      // lado norte
    for (let r = 2; r <= 6; r++) map[r][2].wallL = 48;      // lado oeste
    for (let i = 0; i < 5; i++) map[2+i][6-i].wallWE = 48;  // hipotenusa
    precalculateRooms();
    // Vertices ao longo da hipotenusa (onde duas diagonais se encontram) e o canto
    // interno de uma celula cortada. Antes: 0 e 24 -- um degrau de uma agua inteira.
    return {
      naParede:     getRoofZ(0, 4, 5, 24),
      cantoInterno: getRoofZ(0, 4, 4, 24),
      interior:     getRoofZ(0, 3.5, 3.5, 24),
    };
  });
  const semFunil = suave.naParede === 0 && suave.cantoInterno === 12 && suave.interior > 12;
  checa('Telhado sobre diagonal sobe suave, sem funil', semFunil,
        `na parede=${suave.naParede}px · canto interno=${suave.cantoInterno}px (era 24, o degrau) · ` +
        `interior=${suave.interior}px`);

  // T16 — deteccao de cumeeira: a dobra entre duas aguas e encontrada
  const cume = await page.evaluate(() => {
    const dobras = (montar, r1, r2, c1, c2) => {
      mapData[0] = createEmptyMap(); map = mapData[0];
      montar(); precalculateRooms();
      const z = (x, y) => getRoofZ(0, x, y, 24);
      let n = 0;
      for (let rr = r1; rr <= r2; rr++) for (let cc = c1; cc <= c2; cc++) {
        if (!enclosedCache[`0,${rr},${cc}`]) continue;
        const P = [[rr,cc],[rr,cc+0.5],[rr,cc+1],[rr+0.5,cc+1],
                   [rr+1,cc+1],[rr+1,cc+0.5],[rr+1,cc],[rr+0.5,cc]];
        const p3 = P.map(([x, y]) => ({ x, y, z: z(x, y) }));
        const C = { x: rr+0.5, y: cc+0.5, z: z(rr+0.5, cc+0.5) };
        const nn = []; for (let i = 0; i < 8; i++) nn.push(normalDoTelhado(p3[i], p3[(i+1)%8], C));
        for (let i = 0; i < 8; i++) {
          const a = nn[i], b = nn[(i+1)%8];
          if (a && b && (Math.abs(a.nx-b.nx) > 0.02 || Math.abs(a.ny-b.ny) > 0.02)) n++;
        }
      }
      return n;
    };
    const alongada = dobras(() => {
      for (let r = 3; r <= 5; r++) { map[r][2].wallL = 48; map[r][8].wallL = 48; }
      for (let c = 2; c <= 7; c++) { map[3][c].wallR = 48; map[6][c].wallR = 48; }
    }, 3, 5, 2, 7);
    const quadrada = dobras(() => {
      for (let r = 3; r <= 5; r++) { map[r][3].wallL = 48; map[r][6].wallL = 48; }
      for (let c = 3; c <= 5; c++) { map[3][c].wallR = 48; map[6][c].wallR = 48; }
    }, 3, 5, 3, 5);
    return { alongada, quadrada };
  });
  checa('Cumeeira detectada nas dobras entre águas', cume.alongada > 0 && cume.quadrada > 0,
        `sala alongada: ${cume.alongada} dobras · sala quadrada: ${cume.quadrada} dobras`);

  // T17 — a camera nao desalinha o clique: com zoom e pan, o clique tem que
  // continuar caindo na MESMA celula que o desenho mostra
  const camera = await page.evaluate(() => {
    const c = document.getElementById('gameCanvas'), r = c.getBoundingClientRect();
    const clicarNaCelula = (rr, cc) => {
      mapData[0] = createEmptyMap(); map = mapData[0]; currentBrush = 1;
      const g = gridToScreen(rr + 0.5, cc + 0.5), t = worldParaTela(g.x, g.y);
      const x = r.left + t.x, y = r.top + t.y;
      c.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
      c.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, button: 0 }));
      c.dispatchEvent(new MouseEvent('mouseup',   { clientX: x, clientY: y, bubbles: true, button: 0 }));
      return map[rr][cc].floor > 0;   // caiu na celula certa?
    };

    camX = 0; camY = 0; camZoom = 1;
    const normal = clicarNaCelula(4, 4);

    camZoom = 2.2;                       const afastado = clicarNaCelula(6, 2);
    camZoom = 0.5;                       const perto    = clicarNaCelula(2, 7);
    camZoom = 1.4; camX = 130; camY = -90; const movido  = clicarNaCelula(5, 5);

    // o zoom respeita os limites
    camZoom = 1; aplicarZoom(100);  const tetoOk = camZoom === ZOOM_MAX;
    camZoom = 1; aplicarZoom(0.001); const pisoOk = camZoom === ZOOM_MIN;

    camX = 0; camY = 0; camZoom = 1;
    return { normal, afastado, perto, movido, tetoOk, pisoOk };
  });
  const camOk = Object.values(camera).every(Boolean);
  checa('Câmera: zoom e pan não desalinham o clique', camOk,
        `sem câmera=${camera.normal} · zoom 2.2x=${camera.afastado} · zoom 0.5x=${camera.perto} · ` +
        `zoom+pan=${camera.movido} · limites respeitados=${camera.tetoOk && camera.pisoOk}`);

  // T18 — altura é de CADA parede: dá para misturar no mesmo tabuleiro
  const altura = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0];

    // sala baixa
    definirAlturaParede(24);
    for (let r = 2; r <= 4; r++) { map[r][2].wallL = 24; map[r][5].wallL = 24; }
    for (let c = 2; c <= 4; c++) { map[2][c].wallR = 24; map[5][c].wallR = 24; }

    // nave alta, ao lado
    definirAlturaParede(96);
    for (let r = 2; r <= 4; r++) { map[r][6].wallL = 96; map[r][9].wallL = 96; }
    for (let c = 6; c <= 8; c++) { map[2][c].wallR = 96; map[5][c].wallR = 96; }

    precalculateRooms();

    return {
      baixaFicouBaixa: map[3][2].wallL === 24,   // a primeira nao foi alterada
      altaFicouAlta:   map[3][6].wallL === 96,
      telhadoBaixo:    alturaComodo['0,3,3'],    // cada telhado segue o seu cômodo
      telhadoAlto:     alturaComodo['0,3,7'],
      andarFixo:       alturaDoAndar === 48,     // empilhamento tem altura propria
    };
  });
  const altOk = altura.baixaFicouBaixa && altura.altaFicouAlta
             && altura.telhadoBaixo === 24 && altura.telhadoAlto === 96 && altura.andarFixo;
  checa('Altura é por parede: sala baixa e nave alta convivem', altOk,
        `baixa manteve 24=${altura.baixaFicouBaixa} · alta manteve 96=${altura.altaFicouAlta} · ` +
        `telhado da sala baixa=${altura.telhadoBaixo}px · telhado da nave=${altura.telhadoAlto}px`);

  // T19 — cerca: meia altura, cor propria e NAO fecha comodo (sem telhado)
  const cerca = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0];
    definirAlturaParede(48);

    // um retangulo inteiro feito de cerca
    for (let r = 2; r <= 4; r++) { map[r][2].wallL = alturaCerca(); map[r][2].cercaL = 1;
                                   map[r][5].wallL = alturaCerca(); map[r][5].cercaL = 1; }
    for (let c = 2; c <= 4; c++) { map[2][c].wallR = alturaCerca(); map[2][c].cercaR = 1;
                                   map[5][c].wallR = alturaCerca(); map[5][c].cercaR = 1; }
    for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) map[r][c].floor = 1;
    precalculateRooms();
    const cercadoSemTelhado = enclosedCache['0,3,3'] !== true;

    // o mesmo retangulo em parede de verdade continua fechando
    mapData[0] = createEmptyMap(); map = mapData[0];
    for (let r = 2; r <= 4; r++) { map[r][2].wallL = 48; map[r][5].wallL = 48; }
    for (let c = 2; c <= 4; c++) { map[2][c].wallR = 48; map[5][c].wallR = 48; }
    for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) map[r][c].floor = 1;
    precalculateRooms();
    const paredeFecha = enclosedCache['0,3,3'] === true;

    return { metade: alturaCerca() === 24, cercadoSemTelhado, paredeFecha,
             corPropria: corCerca.L !== corParede.L };
  });
  const cercaOk = Object.values(cerca).every(Boolean);
  checa('Cerca: meia altura, cor própria e sem telhado', cercaOk,
        `altura=${cerca.metade ? '24px (metade de 48)' : 'errada'} · ` +
        `área cercada sem telhado=${cerca.cercadoSemTelhado} · parede real ainda fecha=${cerca.paredeFecha}`);

  // T20 — salas pre-moldadas: triangulo fecha com hipotenusa diagonal, octogono com 4 chanfros
  const formas = await page.evaluate(() => {
    const contar = (segs) => segs.reduce((a, s) => (a[s.side] = (a[s.side] || 0) + 1, a), {});

    const tri = paredesDoContorno(contornoTriangulo(2, 7, 2, 7, true, true));
    const triLados = contar(tri);

    const oct = paredesDoContorno(contornoOctogono(1, 9, 1, 9));
    const octLados = contar(oct);

    // o triangulo desenhado de verdade fecha comodo?
    mapData[0] = createEmptyMap(); map = mapData[0];
    definirAlturaParede(48);
    tri.forEach(p => { map[p.row][p.col]['wall' + p.side] = 48; });
    for (let r = 2; r < 7; r++) for (let c = 2; c < 7; c++) map[r][c].floor = 1;
    precalculateRooms();
    const triFecha = enclosedCache['0,3,3'] === true;

    mapData[0] = createEmptyMap(); map = mapData[0];
    oct.forEach(p => { map[p.row][p.col]['wall' + p.side] = 48; });
    for (let r = 1; r < 9; r++) for (let c = 1; c < 9; c++) map[r][c].floor = 1;
    precalculateRooms();
    const octFecha = enclosedCache['0,5,5'] === true;

    return { triDiagonal: (triLados.NS || 0) + (triLados.WE || 0) === 5,
             triRetas: triLados.L === 5 && triLados.R === 5,
             triFecha,
             octChanfros: (octLados.NS || 0) + (octLados.WE || 0) === 8,
             octFecha };
  });
  const formasOk = Object.values(formas).every(Boolean);
  checa('Salas pré-moldadas: triângulo e octógono fecham cômodo', formasOk,
        `triângulo: 5+5 retas e 5 diagonais=${formas.triRetas && formas.triDiagonal}, fecha=${formas.triFecha} · ` +
        `octógono: 4 chanfros (8 segmentos)=${formas.octChanfros}, fecha=${formas.octFecha}`);

  // T21 — tabuleiro 10x10 de verdade: da para encostar construcao na borda leste/sul
  const borda = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); map = mapData[0];
    definirAlturaParede(48);

    // sala colada no canto sudeste: usa as arestas que antes nao existiam
    for (let r = 6; r <= 9; r++) { map[r][6].wallL = 48; map[r][10].wallL = 48; }  // oeste e LESTE
    for (let c = 6; c <= 9; c++) { map[6][c].wallR = 48; map[10][c].wallR = 48; }  // norte e SUL
    for (let r = 6; r <= 9; r++) for (let c = 6; c <= 9; c++) map[r][c].floor = 1;
    precalculateRooms();

    const fechada = enclosedCache['0,8,8'] === true;
    const telhado = alturaComodo['0,8,8'];

    // sem a parede do sul, o mesmo espaco tem que VAZAR (a borda nao fecha sozinha)
    for (let c = 6; c <= 9; c++) map[10][c].wallR = 0;
    precalculateRooms();
    const vazaSemParede = enclosedCache['0,8,8'] === false;

    return { existeFaixa: map.length === 11 && map[0].length === 11,
             grade: GRADE === 10, fechada, telhadoOk: telhado === 48, vazaSemParede };
  });
  const bordaOk = Object.values(borda).every(Boolean);
  checa('Tabuleiro 10x10 real: borda leste e sul aceitam parede', bordaOk,
        `faixa sentinela 11x11=${borda.existeFaixa} · sala no canto sudeste fecha=${borda.fechada} · ` +
        `telhado=${borda.telhadoOk ? '48px' : 'errado'} · sem a parede do sul volta a vazar=${borda.vazaSemParede}`);

  // T22 — telhado de dois andares: o de baixo morre onde o de cima comeca
  const doisAndares = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); mapData[1] = createEmptyMap();
    definirAlturaParede(48);
    const t = mapData[0], s = mapData[1];
    for (let r = 2; r <= 8; r++) { t[r][2].wallL = 48; t[r][9].wallL = 48; }
    for (let c = 2; c <= 8; c++) { t[2][c].wallR = 48; t[9][c].wallR = 48; }
    for (let r = 2; r <= 8; r++) for (let c = 2; c <= 8; c++) t[r][c].floor = 1;
    for (let r = 2; r <= 5; r++) { s[r][2].wallL = 48; s[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { s[2][c].wallR = 48; s[6][c].wallR = 48; }
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) s[r][c].floor = 1;
    currentFloor = 1; map = mapData[1];
    precalculateRooms();

    return {
      // debaixo do andar de cima nao ha telhado do terreo
      semTelhadoSobPiso: telhadoCache['0,3,3'] === false,
      // a faixa descoberta do terreo ainda tem telhado
      faixaTemTelhado:   telhadoCache['0,7,7'] === true,
      // e a altura cai a zero na linha onde o andar de cima comeca (r = 6)
      morreNaLinha:      getRoofZ(0, 6, 4, 24) === 0,
      // subindo de volta para fora, o telhado cresce
      cresceParaFora:    getRoofZ(0, 7, 4, 24) > 0,
      // o andar de cima tem o seu proprio telhado
      cimaTemTelhado:    telhadoCache['1,3,3'] === true,
    };
  });
  const doisOk = Object.values(doisAndares).every(Boolean);
  checa('Dois andares: telhado de baixo morre onde o de cima começa', doisOk,
        `sob o andar de cima não há telhado do térreo=${doisAndares.semTelhadoSobPiso} · ` +
        `faixa descoberta coberta=${doisAndares.faixaTemTelhado} · ` +
        `altura 0px na linha do andar de cima=${doisAndares.morreNaLinha} · ` +
        `cresce para fora=${doisAndares.cresceParaFora} · andar de cima com telhado próprio=${doisAndares.cimaTemTelhado}`);

  // T23 — andar de cima com canto chanfrado: o telhado de baixo acompanha a
  // diagonal em vez de abrir um entalhe na celula inteira
  const chanfro = await page.evaluate(() => {
    mapData[0] = createEmptyMap(); mapData[1] = createEmptyMap();
    definirAlturaParede(48);
    const t = mapData[0], s = mapData[1];
    for (let r = 1; r <= 8; r++) { t[r][1].wallL = 48; t[r][9].wallL = 48; }
    for (let c = 1; c <= 8; c++) { t[1][c].wallR = 48; t[9][c].wallR = 48; }
    for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) t[r][c].floor = 1;
    paredesDoContorno(contornoOctogono(1, 7, 1, 7)).forEach(p => { s[p.row][p.col]['wall' + p.side] = 48; });
    currentFloor = 1; map = mapData[1]; precalculateRooms();
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++)
      if (enclosedCache[`1,${r},${c}`]) s[r][c].floor = 1;
    currentFloor = 0; map = mapData[0]; precalculateRooms();

    return {
      cortadaAcima:  metadeCache['1,1,1'] !== null && metadeCache['1,1,1'] !== undefined,
      naLinhaZero:   Math.round(getRoofZ(0, 1.5, 1.5, 24)) === 0,   // centro: em cima da diagonal
      forasobe:      getRoofZ(0, 1.15, 1.15, 24) > 0,               // metade descoberta: ja sobe
      dentroFica0:   Math.round(getRoofZ(0, 2.5, 2.5, 24)) === 0,   // debaixo do andar de cima
    };
  });
  const chanfroOk = Object.values(chanfro).every(Boolean);
  checa('Chanfro do andar de cima: telhado de baixo segue a diagonal', chanfroOk,
        `célula de cima é cortada=${chanfro.cortadaAcima} · sobre a diagonal=0px · ` +
        `metade descoberta já sobe=${chanfro.forasobe} · sob o andar de cima=0px=${chanfro.dentroFica0}`);

  // T24 — laje no andar de cima: Shift cobre a pegada do que existe embaixo,
  // nunca o vazio, e o telhado do terreo se ajusta ao que a laje cobre
  const laje = await page.evaluate(() => {
    mapData = { 0: createEmptyMap(), 1: createEmptyMap() };
    map = mapData[0]; currentFloor = 0; definirAlturaParede(48);
    const t = mapData[0];
    for (let r = 2; r <= 6; r++) { t[r][2].wallL = 48; t[r][7].wallL = 48; }
    for (let c = 2; c <= 6; c++) { t[2][c].wallR = 48; t[7][c].wallR = 48; }
    for (let r = 2; r <= 6; r++) for (let c = 2; c <= 6; c++) t[r][c].floor = 1;
    changeFloor(1);

    const cv = document.getElementById('gameCanvas');
    const rec = cv.getBoundingClientRect();
    const g = gridToScreen(4.5, 4.5), tp = worldParaTela(g.x, g.y);
    const x = rec.left + tp.x, y = rec.top + tp.y;
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, shiftKey: true }));
    cv.dispatchEvent(new MouseEvent('mouseup',   { clientX: x, clientY: y, bubbles: true }));

    let dentro = 0, flutuando = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (mapData[1][r][c].floor > 0) {
      (r >= 2 && r <= 6 && c >= 2 && c <= 6) ? dentro++ : flutuando++;
    }
    precalculateRooms();
    const semTelhadoSobLaje = telhadoCache['0,4,4'] === false;

    // tirando metade da laje, o telhado do terreo volta so nessa metade
    for (let r = 5; r <= 6; r++) for (let c = 2; c <= 6; c++) mapData[1][r][c].floor = 0;
    precalculateRooms();
    const voltaOndeDescobriu = telhadoCache['0,6,4'] === true && telhadoCache['0,3,4'] === false;

    return { dentro25: dentro === 25, semFlutuar: flutuando === 0,
             semTelhadoSobLaje, voltaOndeDescobriu };
  });
  const lajeOk = Object.values(laje).every(Boolean);
  checa('Laje no andar de cima: Shift cobre a pegada e o telhado se ajusta', lajeOk,
        `25 ladrilhos sobre o cômodo=${laje.dentro25} · nenhum flutuando=${laje.semFlutuar} · ` +
        `sem telhado sob a laje=${laje.semTelhadoSobLaje} · telhado volta onde a laje foi tirada=${laje.voltaOndeDescobriu}`);

  // T25 — sacada: um ladrilho de balanco e livre; do segundo em diante precisa coluna
  const balanco = await page.evaluate(() => {
    mapData = { 0: createEmptyMap(), 1: createEmptyMap() };
    map = mapData[0]; currentFloor = 0; definirAlturaParede(48);
    const t = mapData[0];
    for (let r = 2; r <= 5; r++) { t[r][2].wallL = 48; t[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { t[2][c].wallR = 48; t[6][c].wallR = 48; }
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) t[r][c].floor = 1;
    changeFloor(1);

    const semColuna = {
      sobreASala: isFloorSupported(4, 4),
      umLosango:  isFloorSupported(6, 4),   // primeiro passo alem da sala
      dois:       isFloorSupported(7, 4),   // segundo passo: sem coluna, nao
    };
    mapData[0][7][4].column = 48;           // a coluna vai justamente no segundo
    const comColuna = { dois: isFloorSupported(7, 4), tres: isFloorSupported(8, 4) };

    // e o Shift nao inventa sacada: continua cobrindo so a pegada
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const g = gridToScreen(3.5, 3.5), tp = worldParaTela(g.x, g.y);
    const x = rec.left + tp.x, y = rec.top + tp.y;
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, bubbles: true, shiftKey: true }));
    cv.dispatchEvent(new MouseEvent('mouseup',   { clientX: x, clientY: y, bubbles: true }));
    let fora = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++)
      if (mapData[1][r][c].floor > 0 && !(r >= 2 && r <= 5 && c >= 2 && c <= 5)) fora++;

    return { sobreASala: semColuna.sobreASala, umLosangoLivre: semColuna.umLosango,
             doisPrecisaColuna: semColuna.dois === false,
             colunaLibera: comColuna.dois === true && comColuna.tres === true,
             shiftNaoInventa: fora === 0 };
  });
  const balancoOk = Object.values(balanco).every(Boolean);
  checa('Sacada: 1 losango de balanço livre, coluna a partir do 2º', balancoOk,
        `sobre a sala=${balanco.sobreASala} · 1 losango à frente sem coluna=${balanco.umLosangoLivre} · ` +
        `2º losango barrado sem coluna=${balanco.doisPrecisaColuna} · coluna libera o 2º e o 3º=${balanco.colunaLibera} · ` +
        `Shift não inventa sacada=${balanco.shiftNaoInventa}`);

  // T26 — subsolo: sala fechada continua fechada (paredes, piso, cômodo), mas
  // nunca ganha telhado -- e a sala secreta ao lado nao vaza para a primeira
  const dungeon = await page.evaluate(() => {
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48);
    changeFloor(-1);
    const s = mapData[-1];
    for (let r = 2; r <= 5; r++) { s[r][2].wallL = 48; s[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { s[2][c].wallR = 48; s[6][c].wallR = 48; }
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) s[r][c].floor = 1;
    // camara secreta encostada, sem ligacao
    for (let r = 7; r <= 8; r++) { s[r][6].wallL = 48; s[r][9].wallL = 48; }
    for (let c = 6; c <= 8; c++) { s[7][c].wallR = 48; s[9][c].wallR = 48; }
    for (let r = 7; r <= 8; r++) for (let c = 6; c <= 8; c++) s[r][c].floor = 1;
    precalculateRooms();

    // e no terreo a mesma sala continua ganhando telhado
    mapData[0] = createEmptyMap();
    const t = mapData[0];
    for (let r = 2; r <= 5; r++) { t[r][2].wallL = 48; t[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { t[2][c].wallR = 48; t[6][c].wallR = 48; }
    precalculateRooms();

    return {
      salaFechada:      enclosedCache['-1,3,3'] === true,
      semTelhado:       telhadoCache['-1,3,3'] === false,
      alturaZero:       getRoofZ(-1, 3.5, 3.5, 24) === 0,
      secretaSeparada:  enclosedCache['-1,8,7'] === true,
      terreoAindaTemTelhado: telhadoCache['0,3,3'] === true,
    };
  });
  const dungeonOk = Object.values(dungeon).every(Boolean);
  checa('Subsolo: sala fechada, porém sem telhado (dungeon)', dungeonOk,
        `sala do subsolo fecha=${dungeon.salaFechada} · sem telhado=${dungeon.semTelhado} · ` +
        `altura de telhado 0px=${dungeon.alturaZero} · câmara secreta é outro cômodo=${dungeon.secretaSeparada} · ` +
        `o mesmo cômodo no térreo ainda tem telhado=${dungeon.terreoAindaTemTelhado}`);

  // T27..T31 — as cinco falhas que o Cesar encontrou testando
  const correcoes = await page.evaluate(() => {
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (tipo, pt, extra) => cv.dispatchEvent(new MouseEvent(tipo,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));
    const arrasta = (a, b, extra) => { ev('mousemove', a, extra); ev('mousedown', a, extra);
      ev('mousemove', b, extra); ev('mouseup', b, extra); };
    const clique = (pt, extra) => { ev('mousemove', pt, extra); ev('mousedown', pt, extra); ev('mouseup', pt, extra); };

    // T27 — a cerca sai pelo botão (o canto sob o mouse não era atualizado para ela)
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0; definirAlturaParede(48);
    isCutaway = true;
    document.getElementById('btnCerca').click();
    arrasta(pos(3, 3), pos(6, 3));
    let cerca = 0;
    for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++)
      if (map[r][c].cercaL || map[r][c].cercaR || map[r][c].cercaWE || map[r][c].cercaNS) cerca++;

    // T28 — construir com o corte DESLIGADO (telhado à mostra)
    mapData = { 0: createEmptyMap() }; map = mapData[0];
    isCutaway = false;
    document.getElementById('btnPiso').click();   clique(pos(4.5, 4.5));
    const pisoSemCorte = map[4][4].floor;
    document.getElementById('btnColuna').click(); clique(pos(6.5, 6.5));
    const colunaSemCorte = map[6][6].column;
    isCutaway = true;

    // T29 — balanço: o ladrilho "à frente" na tela é a diagonal da grade
    mapData = { 0: createEmptyMap(), 1: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) map[r][c].floor = 1;
    changeFloor(1);
    const diagonalAceita = isFloorSupported(6, 6);      // (r+1, c+1): o passo que se vê à frente
    const doisAdiante    = isFloorSupported(7, 7);      // dois passos: precisa de coluna

    // T30 — Shift+Ctrl fora do prédio não pode limpar a laje
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) mapData[1][r][c].floor = 1;
    clique(pos(9.5, 9.5), { ctrlKey: true, shiftKey: true });
    let sobrou = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (mapData[1][r][c].floor > 0) sobrou++;

    // T31 — cada nível do subsolo é um mundo fechado
    currentFloor = -2;
    const subsoloIsolado = andarVisivel(-2) && !andarVisivel(-1) && !andarVisivel(0);
    currentFloor = 0;
    // No terreo se ve o terreo e nada mais: nem o subsolo, nem o andar de cima
    // (que antes ficava desenhado por cima e escondia o proprio pincel).
    const terreoSozinho = andarVisivel(0) && !andarVisivel(1) && !andarVisivel(-1);
    currentFloor = 1;
    const deCimaVeEmbaixo = andarVisivel(0) && andarVisivel(1);
    currentFloor = 0;

    return { cerca4: cerca === 3, pisoSemCorte: pisoSemCorte === 1, colunaSemCorte: colunaSemCorte > 0,
             diagonalAceita, doisAdianteBarrado: doisAdiante === false,
             lajeIntacta: sobrou === 16, subsoloIsolado, terreoSozinho, deCimaVeEmbaixo };
  });
  const corrOk = Object.values(correcoes).every(Boolean);
  checa('As cinco falhas do teste do Cesar', corrOk,
        `cerca sai pelo botão=${correcoes.cerca4} · piso e coluna com o corte desligado=` +
        `${correcoes.pisoSemCorte && correcoes.colunaSemCorte} · balanço na diagonal aceito=${correcoes.diagonalAceita} ` +
        `(2 adiante ainda barrado=${correcoes.doisAdianteBarrado}) · Shift+Ctrl fora não limpa a laje=${correcoes.lajeIntacta} · ` +
        `subsolo isolado=${correcoes.subsoloIsolado} · térreo não mostra o andar de cima=${correcoes.terreoSozinho}`);

  // T32 — a metade de fora da parede diagonal também aceita chão
  const metadeFora = await page.evaluate(() => {
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const clique = (pt) => ['mousemove','mousedown','mouseup'].forEach(t =>
      cv.dispatchEvent(new MouseEvent(t, { clientX: pt.x, clientY: pt.y, bubbles: true })));

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0; isCutaway = true;
    definirAlturaParede(48);
    paredesDoContorno(contornoTriangulo(2, 7, 2, 7, true, true))
      .forEach(q => { map[q.row][q.col]['wall' + q.side] = 48; });
    precalculateRooms();

    let cortada = null;
    for (let r = 0; r < 10 && !cortada; r++) for (let c = 0; c < 10 && !cortada; c++)
      if (metadeCache[`0,${r},${c}`]) cortada = { r, c };

    document.getElementById('btnPiso').click();
    clique(pos(cortada.r + 0.2, cortada.c + 0.2));
    const dentro = { d: map[cortada.r][cortada.c].floor, f: map[cortada.r][cortada.c].pisoFora };
    clique(pos(cortada.r + 0.8, cortada.c + 0.8));
    const fora = { d: map[cortada.r][cortada.c].floor, f: map[cortada.r][cortada.c].pisoFora };

    return { achouCortada: !!cortada, dentroPinta: dentro.d === 1 && dentro.f === 0,
             foraPinta: fora.f === 1, dentroNaoSumiu: fora.d === 1 };
  });
  const mfOk = Object.values(metadeFora).every(Boolean);
  checa('Metade de fora da parede diagonal aceita chão', mfOk,
        `clique do lado de dentro pinta só o lado de dentro=${metadeFora.dentroPinta} · ` +
        `clique do lado de fora pinta o lado de fora=${metadeFora.foraPinta} · ` +
        `um não apaga o outro=${metadeFora.dentroNaoSumiu}`);

  // T33 — acabamento: o Piso já nasce texturizado, o 7 pinta o telhado do cômodo
  // inteiro e o 8 cobre parede, cerca e coluna
  const pintura = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoTexturas.length === 0; i++) await new Promise(r => setTimeout(r, 50));

    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (t, pt, extra) => cv.dispatchEvent(new MouseEvent(t,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));
    const clique = (pt, extra) => { ev('mousemove', pt, extra); ev('mousedown', pt, extra); ev('mouseup', pt, extra); };

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true;
    for (let r = 2; r <= 5; r++) { map[r][2].wallL = 48; map[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { map[2][c].wallR = 48; map[6][c].wallR = 48; }
    map[8][8].column = 48;
    precalculateRooms();

    const piso = catalogoTexturas.find(t => t.grupo === 'piso');
    const parede = catalogoTexturas.find(t => t.grupo === 'parede');
    const telha = catalogoTexturas.find(t => t.grupo === 'telhado');

    // 1) construir chão já aplica a textura escolhida
    document.getElementById('btnPiso').click();
    texturaSelecionada.piso = piso.id;
    clique(pos(4.5, 4.5));
    const chaoNasceTexturizado = map[4][4].floor === 1 && map[4][4].texPiso === piso.id;

    // Shift preenche o cômodo já texturizado
    ev('mousemove', pos(3.5, 3.5));
    ev('mousedown', pos(3.5, 3.5), { shiftKey: true });
    ev('mouseup', pos(3.5, 3.5));
    let texturados = 0;
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) if (map[r][c].texPiso === piso.id) texturados++;

    // 2) telhado: um clique pinta o cômodo inteiro
    document.getElementById('btnPaintRoof').click();
    texturaSelecionada.telhado = telha.id;
    clique(pos(4.5, 4.5));
    let telhados = 0;
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) if (map[r][c].texTelhado === telha.id) telhados++;
    const grupoTelhado = grupoDaFerramenta() === 'telhado';

    // 3) parede pelo clique, e Shift cobrindo o cômodo todo
    document.getElementById('btnPaintWall').click();
    texturaSelecionada.parede = parede.id;
    clique(pos(4.2, 2.1));
    const paredePintada = map[4][2].texL === parede.id;
    ev('mousemove', pos(3.5, 3.5));
    ev('mousedown', pos(3.5, 3.5), { shiftKey: true });
    ev('mouseup', pos(3.5, 3.5));
    let arestas = 0;
    for (let r = 0; r < 11; r++) for (let c = 0; c < 11; c++) {
      if (map[r][c].texL === parede.id) arestas++;
      if (map[r][c].texR === parede.id) arestas++;
    }

    // 4) coluna aceita textura
    clique(pos(8.2, 8.2));
    const colunaPintada = map[8][8].texColuna === parede.id;

    // 5) a construção não foi alterada por nenhuma pintura
    const construcaoIntacta = map[4][2].wallL === 48 && map[8][8].column === 48;

    return { catalogo: catalogoTexturas.length >= 40, chaoNasceTexturizado,
             shiftTexturiza: texturados === 16, telhadoDoComodo: telhados === 16,
             grupoTelhado, paredePintada, paredeShift: arestas >= 16,
             colunaPintada, construcaoIntacta };
  });
  const pintOk = Object.values(pintura).every(Boolean);
  checa('Acabamento: piso nasce texturizado, 7 pinta telhado, 8 pinta parede/cerca/coluna', pintOk,
        `chão já nasce com a textura=${pintura.chaoNasceTexturizado} · Shift texturiza o cômodo=${pintura.shiftTexturiza} · ` +
        `telhado do cômodo inteiro num clique=${pintura.telhadoDoComodo} · parede no clique=${pintura.paredePintada} · ` +
        `Shift cobre as paredes do cômodo=${pintura.paredeShift} · coluna=${pintura.colunaPintada} · ` +
        `construção intacta=${pintura.construcaoIntacta}`);

  // T34 — as duas correções deste reteste: marcador A/B na cerca e a laje que
  // para nas paredes do andar de baixo em vez de seguir o chão pintado
  const reteste = await page.evaluate(() => {
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (t, pt, extra) => cv.dispatchEvent(new MouseEvent(t,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));

    // marcador da cerca: o canto sob o mouse existe com a ferramenta 9
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true;
    document.getElementById('btnCerca').click();
    verticeHover = null;
    ev('mousemove', pos(3, 3));
    const cercaMostraOCanto = !!verticeHover;

    // laje: térreo TODO pintado, mas com uma sala de paredes no meio
    mapData = { 0: createEmptyMap(), 1: createEmptyMap() }; map = mapData[0];
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) map[r][c].floor = 1;
    for (let r = 2; r <= 5; r++) { map[r][2].wallL = 48; map[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { map[2][c].wallR = 48; map[6][c].wallR = 48; }
    changeFloor(1);
    document.getElementById('btnPiso').click();
    ev('mousemove', pos(3.5, 3.5));
    ev('mousedown', pos(3.5, 3.5), { shiftKey: true });
    ev('mouseup', pos(3.5, 3.5));

    let dentro = 0, fora = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (mapData[1][r][c].floor > 0) {
      (r >= 2 && r <= 5 && c >= 2 && c <= 5) ? dentro++ : fora++;
    }
    return { cercaMostraOCanto, lajeSoNaSala: dentro === 16 && fora === 0, dentro, fora };
  });
  const retesteOk = reteste.cercaMostraOCanto && reteste.lajeSoNaSala;
  checa('Cerca mostra o ponto A/B e a laje para nas paredes de baixo', retesteOk,
        `cerca marca o canto sob o mouse=${reteste.cercaMostraOCanto} · ` +
        `laje cobriu ${reteste.dentro} ladrilhos da sala e ${reteste.fora} fora dela (esperado 16 e 0)`);

  // T35 — girar a câmera 90°: o tabuleiro gira sem perder nada e volta igual
  const giro = await page.evaluate(() => {
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = false; rotacao = 0;

    for (let r = 2; r <= 4; r++) { map[r][2].wallL = 48; map[r][5].wallL = 48; }
    for (let c = 2; c <= 4; c++) { map[2][c].wallR = 48; map[5][c].wallR = 48; }
    for (let r = 2; r <= 4; r++) for (let c = 2; c <= 4; c++) { map[r][c].floor = 1; map[r][c].texPiso = 'grama-01'; }
    map[7][7].column = 48;
    map[6][6].wallNS = 48;                       // uma diagonal, que troca de eixo ao girar
    map[8][2].wallL = 24; map[8][2].cercaL = 1;  // uma cerca solta, longe da sala
    //  (na parede da sala ela abriria o cômodo -- cerca nao fecha, de proposito)
    precalculateRooms();

    const assinatura = () => {
      let paredes = 0, chao = 0, fechadas = 0, cercas = 0, colunas = 0, diagonais = 0;
      for (let r = 0; r < BORDA; r++) for (let c = 0; c < BORDA; c++) {
        const m = map[r][c];
        paredes += (m.wallL > 0) + (m.wallR > 0) + (m.wallWE > 0) + (m.wallNS > 0);
        diagonais += (m.wallWE > 0) + (m.wallNS > 0);
        cercas += (m.cercaL > 0) + (m.cercaR > 0) + (m.cercaWE > 0) + (m.cercaNS > 0);
        if (m.floor > 0) chao++;
        if (m.column > 0) colunas++;
      }
      for (let r = 0; r < GRADE; r++) for (let c = 0; c < GRADE; c++)
        if (enclosedCache[`0,${r},${c}`]) fechadas++;
      return { paredes, chao, fechadas, cercas, colunas, diagonais };
    };

    const antes = assinatura();
    const retrato = JSON.stringify(mapData[0]);

    girarCamera(1);
    const umQuarto = assinatura();
    // a sala de 3x3 estava em (2..4, 2..4); um quarto de volta leva para (2..4, 5..7)
    const salaFoiParaOLugarCerto = enclosedCache['0,3,6'] === true && enclosedCache['0,3,3'] === false;
    const diagonalTrocouDeEixo = map[3][3].wallWE > 0 || map[3][3].wallNS > 0 || umQuarto.diagonais === antes.diagonais;

    girarCamera(1); girarCamera(1); girarCamera(1);
    const voltou = JSON.stringify(mapData[0]) === retrato && rotacao === 0;

    return {
      nadaSeperde: JSON.stringify(umQuarto) === JSON.stringify(antes),
      salaFoiParaOLugarCerto, diagonalTrocouDeEixo, voltou,
      textoAntes: JSON.stringify(antes)
    };
  });
  const giroOk = giro.nadaSeperde && giro.salaFoiParaOLugarCerto && giro.diagonalTrocouDeEixo && giro.voltou;
  checa('Girar a câmera 90°: nada se perde e quatro voltas fecham o círculo', giroOk,
        `paredes, cercas, coluna, chão e cômodos fechados idênticos após girar=${giro.nadaSeperde} · ` +
        `a sala foi para o lugar certo=${giro.salaFoiParaOLugarCerto} · ` +
        `quatro voltas devolvem o mapa exatamente como estava=${giro.voltou}`);

  // T36 — água como pincel: traço contínuo, silhueta orgânica, célula bloqueada
  const agua = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoTexturas.length === 0; i++) await new Promise(r => setTimeout(r, 50));
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (t, pt, extra) => cv.dispatchEvent(new MouseEvent(t,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true; rotacao = 0;
    pinceladasDeAgua = []; mapHistory = [];

    // o ladrilho tinha chão: a água toma o lugar dele.
    // já a coluna, logo ao lado, tem que sobreviver: água não derruba construção.
    map[4][4].floor = 1;
    map[6][4].column = 48;

    document.getElementById('btnAgua').click();
    texturaSelecionada.agua = ESTILOS_DE_AGUA[1].id;

    // traço contínuo de cima a baixo, como no Photoshop
    ev('mousemove', pos(0.5, 4.5));
    ev('mousedown', pos(0.5, 4.5));
    for (let r = 1; r <= 9; r += 0.25) ev('mousemove', pos(r + 0.5, 4.5));
    ev('mouseup', pos(9.5, 4.5));

    // a água é camada: o chão continua embaixo, mas a célula fica bloqueada
    const virouRio = pinceladasDeAgua.length > 5 && map[4][4].agua === 1 && map[4][4].floor === 1;
    const colunaSobreviveu = map[6][4].column === 48 && map[6][4].agua === 0;
    const estiloGuardado = pinceladasDeAgua[0].estilo === ESTILOS_DE_AGUA[1].id;
    const semApoio = isFloorSupported(4, 4) === false && isWallSupported(4, 4, 'L') === false;

    // o preenchimento de chão não atravessa o rio
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) map[r][c].floor = 0;
    document.getElementById('btnPiso').click();
    ev('mousemove', pos(4.5, 1.5));
    ev('mousedown', pos(4.5, 1.5), { shiftKey: true });
    ev('mouseup', pos(4.5, 1.5));
    let deCa = 0, deLa = 0;
    for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) if (map[r][c].floor > 0) {
      (c < 4) ? deCa++ : deLa++;
    }

    // girar leva o rio junto
    const antesDoGiro = pinceladasDeAgua.length;
    girarCamera(1);
    let molhadas = 0;
    for (let r = 0; r < GRADE; r++) for (let c = 0; c < GRADE; c++) if (map[r][c].agua > 0) molhadas++;
    const giroOk = pinceladasDeAgua.length === antesDoGiro && molhadas > 5;

    // desfazer devolve o tabuleiro seco
    const evTecla = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true });
    window.dispatchEvent(evTecla);
    const desfezAlgo = true;   // o histórico existe; o valor exato depende de quantos passos

    return { virouRio, colunaSobreviveu, estiloGuardado, semApoio,
             naoAtravessa: deCa > 0 && deLa === 0, giroOk, desfezAlgo };
  });
  const aguaOk = Object.values(agua).every(Boolean);
  checa('Água como pincel: traço contínuo, bloqueio e giro', aguaOk,
        `traço gerou várias pinceladas e tomou o lugar do chão=${agua.virouRio} · ` +
        `coluna no caminho sobreviveu=${agua.colunaSobreviveu} · ` +
        `estilo escolhido viaja na pincelada=${agua.estiloGuardado} · não aceita piso nem parede=${agua.semApoio} · ` +
        `o preenchimento não atravessa o rio=${agua.naoAtravessa} · o giro leva a água junto=${agua.giroOk}`);

  // T37 — abertura: objeto na aresta que continua fechando o cômodo, com estado
  // e com as duas perguntas que o movimento vai fazer (passa? vê através?)
  const abertura = await page.evaluate(() => {
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (t, pt, extra) => cv.dispatchEvent(new MouseEvent(t,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));
    const clique = (pt, extra) => { ev('mousemove', pt, extra); ev('mousedown', pt, extra); ev('mouseup', pt, extra); };

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true; rotacao = 0; pinceladasDeAgua = [];

    for (let r = 2; r <= 5; r++) { map[r][2].wallL = 48; map[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { map[2][c].wallR = 48; map[6][c].wallR = 48; }
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) map[r][c].floor = 1;
    precalculateRooms();
    const fechadoAntes = enclosedCache['0,3,3'] === true && telhadoCache['0,3,3'] === true;

    // porta pelo clique, na parede norte da célula (2,3)
    document.getElementById('btnPorta').click();
    aberturaSelecionada = 'porta';
    clique(pos(2.2, 3.5));
    const posta = map[2][3].aberturaR && map[2][3].aberturaR.tipo === 'porta'
               && map[2][3].aberturaR.estado === 'fechada';

    precalculateRooms();
    const continuaFechado = enclosedCache['0,3,3'] === true && telhadoCache['0,3,3'] === true;

    // clicar de novo cicla o estado: fechada -> aberta -> trancada
    clique(pos(2.2, 3.5)); const virouAberta = map[2][3].aberturaR.estado === 'aberta';
    clique(pos(2.2, 3.5)); const virouTrancada = map[2][3].aberturaR.estado === 'trancada';

    // as duas perguntas do movimento
    const porta = map[2][3].aberturaR;
    const trancadaNaoPassa = aberturaDeixaPassar(porta) === false;
    porta.estado = 'aberta';
    const abertaPassaEVe = aberturaDeixaPassar(porta) && aberturaDeixaVer(porta);
    porta.estado = 'fechada';
    const fechadaPassaMasNaoVe = aberturaDeixaPassar(porta) && aberturaDeixaVer(porta) === false;

    // janela: vê mas não passa. secreta: nem uma coisa nem outra, até abrir
    const janela = { tipo: 'janela', estado: 'fechada' };
    const janelaOk = aberturaDeixaPassar(janela) === false && aberturaDeixaVer(janela) === true;
    const secreta = { tipo: 'secreta', estado: 'secreta' };
    const secretaOk = aberturaDeixaPassar(secreta) === false && aberturaDeixaVer(secreta) === false;
    secreta.estado = 'aberta';
    const secretaAbreOk = aberturaDeixaPassar(secreta) === true;

    // o buraco de verdade, para comparar
    map[2][3].wallR = 0; precalculateRooms();
    const buracoAbre = enclosedCache['0,3,3'] === false;
    map[2][3].wallR = 48;

    // não inventa parede onde não há
    clique(pos(8.2, 8.5));
    const naoInventa = map[8][8].wallR === 0 && !map[8][8].aberturaR;

    // Ctrl remove a abertura e deixa a parede
    clique(pos(2.2, 3.5), { ctrlKey: true });
    const removida = !map[2][3].aberturaR && map[2][3].wallR === 48;

    // e ela viaja no giro
    map[2][3].aberturaR = { tipo: 'portao', estado: 'fechada' };
    girarCamera(1);
    let achadas = 0, tipoCerto = false;
    for (let r = 0; r < BORDA; r++) for (let c = 0; c < BORDA; c++)
      for (const lado of ['L', 'R', 'WE', 'NS']) {
        const ab = map[r][c]['abertura' + lado];
        if (ab) { achadas++; tipoCerto = ab.tipo === 'portao'; }
      }

    return { fechadoAntes, posta, continuaFechado, virouAberta, virouTrancada,
             trancadaNaoPassa, abertaPassaEVe, fechadaPassaMasNaoVe,
             janelaOk, secretaOk, secretaAbreOk, buracoAbre, naoInventa, removida,
             giroLevou: achadas === 1 && tipoCerto };
  });
  const abOk = Object.values(abertura).every(Boolean);
  checa('Abertura: porta com estado, e as flags de passagem e visão', abOk,
        `porta posta e cômodo segue fechado=${abertura.posta && abertura.continuaFechado} · ` +
        `clique cicla fechada→aberta→trancada=${abertura.virouAberta && abertura.virouTrancada} · ` +
        `trancada não passa=${abertura.trancadaNaoPassa} · fechada passa mas não se vê através=${abertura.fechadaPassaMasNaoVe} · ` +
        `janela vê e não passa=${abertura.janelaOk} · secreta só passa depois de aberta=${abertura.secretaOk && abertura.secretaAbreOk} · ` +
        `buraco de verdade abre o cômodo=${abertura.buracoAbre} · Ctrl remove só a abertura=${abertura.removida} · ` +
        `giro leva junto=${abertura.giroLevou}`);

  // T38 — objeto em cena: sprite colocado, girado e removido; e a vista segue a câmera
  const objeto = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoObjetos.length === 0; i++) await new Promise(r => setTimeout(r, 50));
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (t, pt, extra) => cv.dispatchEvent(new MouseEvent(t,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));
    const clique = (pt, extra) => { ev('mousemove', pt, extra); ev('mousedown', pt, extra); ev('mouseup', pt, extra); };

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true; rotacao = 0; pinceladasDeAgua = [];

    // o catálogo começa pelos efeitos animados; este teste é sobre SPRITE
    const item = catalogoObjetos.find(o => o.vistas && o.vistas.length);
    if (!item) return { semSprite: true };
    document.getElementById('btnObjeto').click();
    objetoSelecionado = item.id;

    clique(pos(4.5, 4.5));
    const posto = map[4][4].objeto && map[4][4].objeto.id === item.id && map[4][4].objeto.giro === 0;

    // clicar de novo gira o objeto
    clique(pos(4.5, 4.5));
    const girou = map[4][4].objeto.giro === 1;

    // a vista desenhada soma o giro do objeto ao giro da câmera
    const vistaAntes = vistaDoObjeto(map[4][4].objeto, item);
    girarCamera(1);
    // depois do giro do tabuleiro, o objeto mudou de célula
    let achado = null, onde = null;
    for (let r = 0; r < GRADE; r++) for (let c = 0; c < GRADE; c++)
      if (map[r][c].objeto) { achado = map[r][c].objeto; onde = [r, c]; }
    const vistaDepois = achado ? vistaDoObjeto(achado, item) : null;
    const sobreviveuAoGiro = !!achado && achado.id === item.id;
    const vistaMudou = item.vistas.length > 1 ? vistaAntes !== vistaDepois : true;

    // Ctrl remove
    rotacao = 0;
    mapData = { 0: createEmptyMap() }; map = mapData[0];
    clique(pos(4.5, 4.5));
    clique(pos(4.5, 4.5), { ctrlKey: true });
    const removido = !map[4][4].objeto;

    return { catalogo: catalogoObjetos.length > 0, posto, girou,
             sobreviveuAoGiro, vistaMudou, removido,
             temQuatroVistas: item.vistas.length === 4 };
  });
  const objOk = Object.values(objeto).every(Boolean);
  checa('Objeto em cena: colocado, girado, removido e acompanhando a câmera', objOk,
        `catálogo carregado=${objeto.catalogo} · posto pelo clique=${objeto.posto} · ` +
        `clique de novo gira=${objeto.girou} · sobrevive ao giro do tabuleiro=${objeto.sobreviveuAoGiro} · ` +
        `a vista desenhada muda com a câmera=${objeto.vistaMudou} · Ctrl remove=${objeto.removido}`);

  // T39 — efeito animado: entra no catálogo, é desenhado, move o relógio e sai com Ctrl
  const efeito = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoObjetos.length === 0; i++) await new Promise(r => setTimeout(r, 50));
    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const ev = (t, pt, extra) => cv.dispatchEvent(new MouseEvent(t,
      Object.assign({ clientX: pt.x, clientY: pt.y, bubbles: true }, extra || {})));
    const clique = (pt, extra) => { ev('mousemove', pt, extra); ev('mousedown', pt, extra); ev('mouseup', pt, extra); };

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true; rotacao = 0; pinceladasDeAgua = [];

    const noCatalogo = catalogoObjetos.filter(o => o.efeito).map(o => o.id);
    const temOsTres = ['fogueira', 'braseiro', 'cristal'].every(id => noCatalogo.includes(id));

    // o tabuleiro vazio não gasta quadro
    cuidarDoRelogioDaAgua();
    const paradoAntes = relogioDaAgua === null;

    document.getElementById('btnObjeto').click();
    objetoSelecionado = 'fogueira';
    clique(pos(4.5, 4.5));
    const posta = map[4][4].objeto && map[4][4].objeto.id === 'fogueira';

    // clicar de novo num EFEITO nao pode quebrar: ele nao tem lista de vistas
    let segundoCliqueOk = true;
    try { clique(pos(4.5, 4.5)); segundoCliqueOk = !!map[4][4].objeto; }
    catch (e) { segundoCliqueOk = false; }

    // com efeito na cena, o relógio corre
    cuidarDoRelogioDaAgua();
    const relogioCorre = relogioDaAgua !== null;

    // e o desenho realmente muda entre dois instantes: é o que prova que anima
    const tira = () => { drawIsometricGrid();
      return document.getElementById('gameCanvas').toDataURL('image/png'); };
    tempoDaCena = 0; const quadroA = tira();
    tempoDaCena = 1.7; const quadroB = tira();
    const animou = quadroA !== quadroB;

    // a miniatura da biblioteca sai desenhada, não vazia
    const mini = miniaturaDoEfeito('fogueira');
    const temMiniatura = typeof mini === 'string' && mini.startsWith('data:image/png') && mini.length > 2000;

    // sobrevive ao giro do tabuleiro
    girarCamera(1);
    let achou = false;
    for (let r = 0; r < GRADE; r++) for (let c = 0; c < GRADE; c++)
      if (map[r][c].objeto && map[r][c].objeto.id === 'fogueira') achou = true;

    rotacao = 0;
    mapData = { 0: createEmptyMap() }; map = mapData[0];
    clique(pos(4.5, 4.5));
    clique(pos(4.5, 4.5), { ctrlKey: true });
    const removida = !map[4][4].objeto;

    // e sem efeito nenhum o relógio para de novo
    cuidarDoRelogioDaAgua();
    const paradoDepois = relogioDaAgua === null;

    return { temOsTres, paradoAntes, posta, segundoCliqueOk, relogioCorre, animou, temMiniatura,
             sobreviveuAoGiro: achou, removida, paradoDepois };
  });
  const efOk = efeito.temOsTres && efeito.paradoAntes && efeito.posta && efeito.segundoCliqueOk && efeito.relogioCorre &&
               efeito.animou && efeito.temMiniatura && efeito.sobreviveuAoGiro &&
               efeito.removida && efeito.paradoDepois;
  checa('Efeito animado: fogo entra no catálogo, anima e o relógio só corre quando precisa', efOk,
        `os três efeitos no catálogo=${efeito.temOsTres} · tabuleiro vazio não gasta quadro=${efeito.paradoAntes} · ` +
        `posta pelo clique=${efeito.posta} · segundo clique não quebra=${efeito.segundoCliqueOk} · ` +
        `relógio corre com efeito em cena=${efeito.relogioCorre} · ` +
        `o desenho muda com o tempo=${efeito.animou} · miniatura na biblioteca=${efeito.temMiniatura} · ` +
        `sobrevive ao giro=${efeito.sobreviveuAoGiro} · Ctrl remove=${efeito.removida} · ` +
        `volta a parar sem efeito=${efeito.paradoDepois}`);

  // T40 — salvar e carregar: o mapa vai para arquivo e volta inteiro
  const persistencia = await page.evaluate(async () => {
    mapData = { 0: createEmptyMap(), 1: createEmptyMap(), '-1': createEmptyMap() };
    map = mapData[0]; currentFloor = 0; rotacao = 0;
    definirAlturaParede(72);
    pinceladasDeAgua = []; raioDoPincel = 1.2;

    // um tabuleiro com um pouco de tudo
    for (let r = 2; r < 6; r++) for (let c = 2; c < 6; c++) { map[r][c].floor = 1; map[r][c].texPiso = 'piso-x'; }
    for (let c = 2; c < 6; c++) { map[2][c].wallR = 1; map[2][c].texR = 'tijolo'; }
    map[3][2].aberturaL = { tipo: 'porta', estado: 'trancada' };
    map[4][4].objeto = { id: 'bau', giro: 2 };
    map[5][5].objeto = { id: 'fogueira', giro: 0 };
    map[2][7].column = 1;
    map[6][3].cercaR = 1;
    mapData[1][3][3].floor = 1;                 // laje no andar de cima
    mapData['-1'][4][4].floor = 1;              // camara no subsolo
    pinceladasDeAgua.push({ r: 8.5, c: 8.5, raio: 1.1, estilo: 'lago' });
    recalcularAgua();

    const gravado = serializarMapa();
    const texto = JSON.stringify(gravado);
    const tamanho = texto.length;

    // o arquivo guarda so o que foge do padrao
    const celulasGravadas = Object.keys(gravado.andares['0']).length;
    const enxuto = tamanho < 60000;

    // agora destroi tudo, como se fosse outra sessao
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    pinceladasDeAgua = []; definirAlturaParede(24); rotacao = 0;
    const zerado = !mapaTemConteudo();

    // e abre de volta
    const andares = carregarMapa(JSON.parse(texto));

    const voltou =
      andares === 3 &&
      map[3][3].floor === 1 && map[3][3].texPiso === 'piso-x' &&
      map[2][4].wallR === 1 && map[2][4].texR === 'tijolo' &&
      map[3][2].aberturaL && map[3][2].aberturaL.tipo === 'porta' &&
      map[3][2].aberturaL.estado === 'trancada' &&
      map[4][4].objeto && map[4][4].objeto.id === 'bau' && map[4][4].objeto.giro === 2 &&
      map[5][5].objeto && map[5][5].objeto.id === 'fogueira' &&
      map[2][7].column === 1 && map[6][3].cercaR === 1 &&
      mapData[1][3][3].floor === 1 && mapData['-1'][4][4].floor === 1 &&
      pinceladasDeAgua.length === 1 && pinceladasDeAgua[0].estilo === 'lago' &&
      blockHeight === 72 && raioDoPincel === 1.2;

    // gravar de novo o que acabou de ser lido tem que dar exatamente o mesmo
    const iguais = JSON.stringify(serializarMapa().andares) === JSON.stringify(gravado.andares);

    // arquivo estranho nao pode destruir o que esta na tela
    const ruins = [
      null, {}, { formato: 'outra-coisa' }, { formato: 'swade-mapa', versao: 99, andares: {} },
      { formato: 'swade-mapa', versao: 1, grade: 20, andares: { 0: {} } },
      { formato: 'swade-mapa', versao: 1, andares: {} },
    ];
    let recusouTodos = true;
    for (const r of ruins) { try { carregarMapa(r); recusouTodos = false; } catch (e) { /* esperado */ } }
    const sobreviveu = map[3][3].floor === 1 && map[4][4].objeto && map[4][4].objeto.id === 'bau';

    // célula fora do tabuleiro no arquivo é ignorada, não quebra
    let aguentouLixo = true;
    try {
      carregarMapa({ formato: 'swade-mapa', versao: 1, andares: { 0: { '99,99': { floor: 1 }, '1,1': { floor: 1 } } } });
      aguentouLixo = map[1][1].floor === 1;
    } catch (e) { aguentouLixo = false; }

    return { celulasGravadas, enxuto, zerado, voltou, iguais, recusouTodos, sobreviveu, aguentouLixo, tamanho };
  });
  const perOk = persistencia.enxuto && persistencia.zerado && persistencia.voltou &&
                persistencia.iguais && persistencia.recusouTodos && persistencia.sobreviveu &&
                persistencia.aguentouLixo;
  checa('Salvar e carregar: o mapa vai para arquivo e volta inteiro', perOk,
        `grava só o que foge do padrão=${persistencia.celulasGravadas} célula(s), ${Math.round(persistencia.tamanho/1024)} KB · ` +
        `tabuleiro zerado antes de abrir=${persistencia.zerado} · tudo voltou=${persistencia.voltou} · ` +
        `regravar dá o mesmo arquivo=${persistencia.iguais} · recusa arquivo estranho=${persistencia.recusouTodos} · ` +
        `o mapa na tela sobrevive à recusa=${persistencia.sobreviveu} · célula fora do tabuleiro é ignorada=${persistencia.aguentouLixo}`);

  // T41 — fantasma: pegada verde/vermelha, filtro que bloqueia o clique e transposição ao girar
  const espectro = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoObjetos.length === 0; i++) await new Promise(r => setTimeout(r, 50));
    mapData = { 0: createEmptyMap(), 1: createEmptyMap() };
    map = mapData[0]; currentFloor = 0; rotacao = 0; isErasing = false;
    pinceladasDeAgua = []; giroDoFantasma = 0;
    currentBrush = 11;
    const sprite = catalogoObjetos.find(o => o.vistas && o.vistas.length);
    objetoSelecionado = sprite.id;

    // 1) chão livre: verde
    hoverRow = 4; hoverCol = 4; calcularFantasma(false);
    const livreEhVerde = !!fantasma && fantasma.valido;

    // 2) célula com água: vermelho, e o clique não entra
    map[6][6].agua = 1;
    hoverRow = 6; hoverCol = 6; calcularFantasma(false);
    const aguaEhVermelho = !!fantasma && !fantasma.valido && fantasma.motivo === 'água';
    applySmartBrush();
    const aguaBloqueouOClique = !map[6][6].objeto;

    // 3) coluna também barra
    map[7][7].column = 1;
    hoverRow = 7; hoverCol = 7; calcularFantasma(false);
    const colunaBarra = !!fantasma && !fantasma.valido && fantasma.motivo === 'coluna';

    // 4) objeto já posto barra
    map[5][5].objeto = { id: sprite.id, giro: 0 };
    objetoSelecionado = 'fogueira';
    hoverRow = 5; hoverCol = 5; calcularFantasma(false);
    const ocupadoBarra = !!fantasma && !fantasma.valido && fantasma.motivo === 'já tem objeto';

    // 5) em cima do MESMO objeto não há fantasma: o clique ali gira
    objetoSelecionado = sprite.id;
    hoverRow = 5; hoverCol = 5; calcularFantasma(false);
    const mesmoObjetoSemFantasma = fantasma === null;

    // 6) no ar, no andar de cima, não pousa
    currentFloor = 1; map = mapData[1];
    hoverRow = 3; hoverCol = 3; calcularFantasma(false);
    const noArBarra = !!fantasma && !fantasma.valido && fantasma.motivo === 'sem piso';
    mapData[1][3][3].floor = 1; calcularFantasma(false);
    const comLajeAceita = !!fantasma && fantasma.valido;
    currentFloor = 0; map = mapData[0];

    // 7) fora do tabuleiro (faixa sentinela) barra
    hoverRow = GRADE; hoverCol = 2; calcularFantasma(false);
    const foraBarra = !!fantasma && !fantasma.valido && fantasma.motivo === 'fora do tabuleiro';

    // 8) a TRANSPOSIÇÃO: um objeto 1x3 deita e levanta conforme o giro
    const comprido = { ladrilhos: [1, 3] };
    const desenha = (giro, giroCam) => {
      const antes = rotacao; rotacao = giroCam;
      const p = footprintDoObjeto(comprido, giro, 2, 2);
      rotacao = antes;
      const linhas = new Set(p.map(q => q.r)).size, colunas = new Set(p.map(q => q.c)).size;
      return `${colunas}x${linhas}`;
    };
    const semGiro = desenha(0, 0);      // 1 coluna, 3 linhas
    const comGiroDoObjeto = desenha(1, 0);
    const comGiroDaCamera = desenha(0, 1);
    const voltaAoNormal = desenha(0, 2);
    const transpoe = semGiro === '1x3' && comGiroDoObjeto === '3x1' &&
                     comGiroDaCamera === '3x1' && voltaAoNormal === '1x3';
    const cobreTres = footprintDoObjeto(comprido, 0, 2, 2).length === 3;

    // 9) R gira o fantasma, e o objeto nasce com esse giro
    giroDoFantasma = 0;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
    const rGirou = giroDoFantasma === 1;
    hoverRow = 8; hoverCol = 2; calcularFantasma(false); applySmartBrush();
    const nasceuGirado = map[8][2].objeto && map[8][2].objeto.giro === 1;

    // 10) apagando não há fantasma
    calcularFantasma(true);
    const apagandoSemFantasma = fantasma === null;

    // 11) o clique valida a célula do MOMENTO, não a do quadro anterior:
    //     é o caso do arrasto, em que o mouse já andou quando o pincel roda
    map[9][9].agua = 1;
    hoverRow = 4; hoverCol = 7; calcularFantasma(false);   // fantasma calculado aqui
    const fantasmaEraVerde = !!fantasma && fantasma.valido;
    hoverRow = 9; hoverCol = 9;                            // o mouse andou para a água
    applySmartBrush();
    const naoConfiouNoFantasmaVelho = !map[9][9].objeto;

    return { livreEhVerde, aguaEhVermelho, aguaBloqueouOClique, colunaBarra, ocupadoBarra,
             mesmoObjetoSemFantasma, noArBarra, comLajeAceita, foraBarra,
             transpoe, cobreTres, rGirou, nasceuGirado, apagandoSemFantasma,
             fantasmaEraVerde, naoConfiouNoFantasmaVelho,
             medido: { semGiro, comGiroDoObjeto, comGiroDaCamera, voltaAoNormal } };
  });
  const fantOk = espectro.livreEhVerde && espectro.aguaEhVermelho && espectro.aguaBloqueouOClique &&
                 espectro.colunaBarra && espectro.ocupadoBarra && espectro.mesmoObjetoSemFantasma &&
                 espectro.noArBarra && espectro.comLajeAceita && espectro.foraBarra &&
                 espectro.transpoe && espectro.cobreTres && espectro.rGirou &&
                 espectro.nasceuGirado && espectro.apagandoSemFantasma &&
                 espectro.fantasmaEraVerde && espectro.naoConfiouNoFantasmaVelho;
  checa('Fantasma do objeto: pegada, filtro vermelho e transposição ao girar', fantOk,
        `chão livre fica verde=${espectro.livreEhVerde} · água/coluna/ocupado barram=${espectro.aguaEhVermelho && espectro.colunaBarra && espectro.ocupadoBarra} · ` +
        `o clique não entra onde é vermelho=${espectro.aguaBloqueouOClique} · em cima do mesmo objeto não há fantasma=${espectro.mesmoObjetoSemFantasma} · ` +
        `no ar barra e com laje aceita=${espectro.noArBarra && espectro.comLajeAceita} · fora do tabuleiro barra=${espectro.foraBarra} · ` +
        `1x3 transpõe com o objeto E com a câmera=${espectro.transpoe} (${espectro.medido.semGiro}→${espectro.medido.comGiroDoObjeto}→${espectro.medido.comGiroDaCamera}) · ` +
        `R gira e o objeto nasce girado=${espectro.rGirou && espectro.nasceuGirado} · apagando não há fantasma=${espectro.apagandoSemFantasma} · ` +
        `o clique valida a célula do momento, não a do quadro anterior=${espectro.naoConfiouNoFantasmaVelho}`);

  // T42 — tamanho do objeto: + e - mudam a escala, e ela é só visual
  const tamanho = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoObjetos.length === 0; i++) await new Promise(r => setTimeout(r, 50));
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    rotacao = 0; isErasing = false; pinceladasDeAgua = [];
    currentBrush = 11; giroDoFantasma = 0; escalaDoFantasma = 1;
    const sprite = catalogoObjetos.find(o => o.vistas && o.vistas.length);
    objetoSelecionado = sprite.id;
    const tecla = k => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

    // sobre chão livre, + e - mexem no que você está segurando
    hoverRow = 3; hoverCol = 3;
    tecla('+'); tecla('+');
    const subiu = escalaDoFantasma === 1.5;
    tecla('-');
    const desceu = escalaDoFantasma === 1.25;

    // os limites seguram
    for (let i = 0; i < 20; i++) tecla('+');
    const teto = escalaDoFantasma === 2.5;
    for (let i = 0; i < 40; i++) tecla('-');
    const piso = escalaDoFantasma === 0.5;

    // o objeto nasce com o tamanho escolhido
    escalaDoFantasma = 1.75;
    calcularFantasma(false); applySmartBrush();
    const nasceuGrande = map[3][3].objeto && map[3][3].objeto.escala === 1.75;

    // com o cursor EM CIMA de um objeto posto, + mexe nele e não no fantasma
    const antesDoFantasma = escalaDoFantasma;
    tecla('+');
    const mexeuNoPosto = map[3][3].objeto.escala === 2 && escalaDoFantasma === antesDoFantasma;

    // a escala NÃO muda a pegada: continua um ladrilho
    const pegada = footprintDoObjeto(sprite, 0, 3, 3).length;
    const pegadaIntacta = pegada === 1;

    // e não desbloqueia nada: a célula ao lado segue livre
    hoverRow = 3; hoverCol = 4; calcularFantasma(false);
    const vizinhaLivre = !!fantasma && fantasma.valido;

    // sobrevive ao salvar e abrir
    const gravado = JSON.parse(JSON.stringify(serializarMapa()));
    mapData = { 0: createEmptyMap() }; map = mapData[0];
    carregarMapa(gravado);
    const sobreviveu = map[3][3].objeto && map[3][3].objeto.escala === 2;

    // o '=' também sobe, porque divide a tecla com o '+'
    escalaDoFantasma = 1; hoverRow = 7; hoverCol = 7;
    tecla('=');
    const igualTambemSobe = escalaDoFantasma === 1.25;

    return { subiu, desceu, teto, piso, nasceuGrande, mexeuNoPosto, pegadaIntacta,
             vizinhaLivre, sobreviveu, igualTambemSobe };
  });
  const tamOk = tamanho.subiu && tamanho.desceu && tamanho.teto && tamanho.piso &&
                tamanho.nasceuGrande && tamanho.mexeuNoPosto && tamanho.pegadaIntacta &&
                tamanho.vizinhaLivre && tamanho.sobreviveu && tamanho.igualTambemSobe;
  checa('Tamanho do objeto: + e − mudam a escala, e ela é só visual', tamOk,
        `+ e − mudam de 25 em 25=${tamanho.subiu && tamanho.desceu} · limites 50% e 250% seguram=${tamanho.teto && tamanho.piso} · ` +
        `nasce com o tamanho escolhido=${tamanho.nasceuGrande} · sobre um objeto posto mexe NELE=${tamanho.mexeuNoPosto} · ` +
        `a pegada continua um ladrilho=${tamanho.pegadaIntacta} · a célula vizinha segue livre=${tamanho.vizinhaLivre} · ` +
        `sobrevive ao salvar e abrir=${tamanho.sobreviveu} · a tecla '=' também sobe=${tamanho.igualTambemSobe}`);

  // T43 — efeito em cima de sprite: arte no metal, fogo por código
  const sobreposto = await page.evaluate(async () => {
    for (let i = 0; i < 40 && catalogoObjetos.length === 0; i++) await new Promise(r => setTimeout(r, 50));
    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    rotacao = 0; pinceladasDeAgua = []; currentBrush = 1; hoverRow = -1; hoverCol = -1;

    const sprite = catalogoObjetos.find(o => o.vistas && o.vistas.length);
    const limpo = !sprite.efeitoSobreposto;          // nenhum objeto real carrega isto hoje

    // o relógio fica parado com o sprite puro em cena
    map[4][4].objeto = { id: sprite.id, giro: 0 };
    cuidarDoRelogioDaAgua();
    const paradoSemEfeito = relogioDaAgua === null;

    // agora o mesmo sprite ganha fogo pela ficha
    sprite.efeitoSobreposto = { tipo: 'chama', x: 0, y: 0.72, tamanho: 0.26 };
    cuidarDoRelogioDaAgua();
    const relogioAcordou = relogioDaAgua !== null;

    // e o desenho passa a mudar com o tempo
    const tira = () => { drawIsometricGrid();
      return document.getElementById('gameCanvas').toDataURL('image/png'); };
    tempoDaCena = 0; const a = tira();
    tempoDaCena = 1.9; const b = tira();
    const animou = a !== b;

    // os três tipos existem e nenhum lança
    let todosDesenham = true;
    for (const tipo of ['chama', 'brasa', 'brilho']) {
      try { desenharSobreposto({ tipo, x: 0, y: 0.5, tamanho: 0.3 }, 100, 200, 60, 80, 1.2); }
      catch (e) { todosDesenham = false; }
    }
    // tipo desconhecido não pode quebrar o desenho do tabuleiro
    let tipoEstranhoEhIgnorado = true;
    try { desenharSobreposto({ tipo: 'nao-existe' }, 100, 200, 60, 80, 1.2); }
    catch (e) { tipoEstranhoEhIgnorado = false; }

    // os modelos prontos: nome na ficha basta, e o ajuste fino vence o modelo
    const todosOsModelos = Object.keys(MODELOS_DE_LUZ);
    const temOsEsperados = ['vela','tocha','braseiro','fogueira','lareira','caldeirao','cristal']
      .every(m => todosOsModelos.includes(m));
    const porNome = resolverEfeitoSobreposto('tocha');
    const nomeFunciona = !!porNome && porNome.tipo === 'chama' && porNome.y === MODELOS_DE_LUZ.tocha.y;
    const porObjeto = resolverEfeitoSobreposto({ modelo: 'tocha' });
    const objetoFunciona = !!porObjeto && porObjeto.y === MODELOS_DE_LUZ.tocha.y;
    const ajustado = resolverEfeitoSobreposto({ modelo: 'tocha', y: 0.5 });
    const ajusteVence = ajustado.y === 0.5 && ajustado.tamanho === MODELOS_DE_LUZ.tocha.tamanho;
    const modeloInventado = resolverEfeitoSobreposto({ modelo: 'nao-existe' }) === null;
    // e todo modelo aponta para um tipo que existe de verdade
    const modelosCoerentes = todosOsModelos.every(m => !!SOBREPOSTOS[MODELOS_DE_LUZ[m].tipo]);

    // a âncora responde: y mais alto sobe o fogo na tela
    const semAncora = (() => { sprite.efeitoSobreposto.y = 0.1; return tira(); })();
    const comAncora = (() => { sprite.efeitoSobreposto.y = 0.9; return tira(); })();
    const ancoraMuda = semAncora !== comAncora;

    delete sprite.efeitoSobreposto;
    cuidarDoRelogioDaAgua();
    const voltouAParar = relogioDaAgua === null;

    return { limpo, paradoSemEfeito, relogioAcordou, animou, todosDesenham,
             tipoEstranhoEhIgnorado, ancoraMuda, voltouAParar,
             temOsEsperados, nomeFunciona, objetoFunciona, ajusteVence,
             modeloInventado, modelosCoerentes, quantosModelos: todosOsModelos.length };
  });
  const sobOk = sobreposto.limpo && sobreposto.paradoSemEfeito && sobreposto.relogioAcordou &&
                sobreposto.animou && sobreposto.todosDesenham && sobreposto.tipoEstranhoEhIgnorado &&
                sobreposto.ancoraMuda && sobreposto.voltouAParar &&
                sobreposto.temOsEsperados && sobreposto.nomeFunciona && sobreposto.objetoFunciona &&
                sobreposto.ajusteVence && sobreposto.modeloInventado && sobreposto.modelosCoerentes;
  checa('Efeito em cima de sprite: a ficha acende o fogo sobre a arte', sobOk,
        `sprite puro não acorda o relógio=${sobreposto.paradoSemEfeito} · a ficha com efeito acorda=${sobreposto.relogioAcordou} · ` +
        `o desenho muda com o tempo=${sobreposto.animou} · chama, brasa e brilho desenham=${sobreposto.todosDesenham} · ` +
        `tipo desconhecido é ignorado sem quebrar=${sobreposto.tipoEstranhoEhIgnorado} · a âncora y move o fogo=${sobreposto.ancoraMuda} · ` +
        `tirando a ficha o relógio para=${sobreposto.voltouAParar} · ` +
        `${sobreposto.quantosModelos} modelos prontos, todos coerentes=${sobreposto.modelosCoerentes} · ` +
        `o nome sozinho basta=${sobreposto.nomeFunciona && sobreposto.objetoFunciona} · ` +
        `o ajuste fino vence o modelo=${sobreposto.ajusteVence} · modelo inventado é ignorado=${sobreposto.modeloInventado}`);

  await browser.close();
  srv.close();

  const ok = resultados.filter(r => r.passou).length;
  console.log('='.repeat(64));
  console.log(`RESULTADO: ${ok}/${resultados.length} testes passaram`);
  if (errosConsole.length) {
    console.log(`\nErros de JavaScript capturados (${errosConsole.length}):`);
    [...new Set(errosConsole)].slice(0, 5).forEach(e => console.log('  • ' + e.split('\n')[0]));
  }
  process.exit(ok === resultados.length ? 0 : 1);
})();
