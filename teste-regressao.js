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
  await page.goto(`http://localhost:${PORTA}/index.html`, { waitUntil: 'networkidle' });
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
    const terreoEmpilha = andarVisivel(0) && andarVisivel(1) && !andarVisivel(-1);

    return { cerca4: cerca === 3, pisoSemCorte: pisoSemCorte === 1, colunaSemCorte: colunaSemCorte > 0,
             diagonalAceita, doisAdianteBarrado: doisAdiante === false,
             lajeIntacta: sobrou === 16, subsoloIsolado, terreoEmpilha };
  });
  const corrOk = Object.values(correcoes).every(Boolean);
  checa('As cinco falhas do teste do Cesar', corrOk,
        `cerca sai pelo botão=${correcoes.cerca4} · piso e coluna com o corte desligado=` +
        `${correcoes.pisoSemCorte && correcoes.colunaSemCorte} · balanço na diagonal aceito=${correcoes.diagonalAceita} ` +
        `(2 adiante ainda barrado=${correcoes.doisAdianteBarrado}) · Shift+Ctrl fora não limpa a laje=${correcoes.lajeIntacta} · ` +
        `subsolo isolado=${correcoes.subsoloIsolado}`);

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

  // T33 — pintar chão e parede: o acabamento entra sem mexer na construção
  const pintura = await page.evaluate(async () => {
    // espera o catálogo chegar
    for (let i = 0; i < 40 && catalogoTexturas.length === 0; i++) await new Promise(r => setTimeout(r, 50));

    const cv = document.getElementById('gameCanvas'), rec = cv.getBoundingClientRect();
    const pos = (row, col) => { const g = gridToScreen(row, col), t = worldParaTela(g.x, g.y);
      return { x: rec.left + t.x, y: rec.top + t.y }; };
    const clique = (pt) => ['mousemove','mousedown','mouseup'].forEach(t =>
      cv.dispatchEvent(new MouseEvent(t, { clientX: pt.x, clientY: pt.y, bubbles: true })));

    mapData = { 0: createEmptyMap() }; map = mapData[0]; currentFloor = 0;
    definirAlturaParede(48); isCutaway = true;
    for (let r = 2; r <= 5; r++) { map[r][2].wallL = 48; map[r][6].wallL = 48; }
    for (let c = 2; c <= 5; c++) { map[2][c].wallR = 48; map[6][c].wallR = 48; }
    for (let r = 2; r <= 5; r++) for (let c = 2; c <= 5; c++) map[r][c].floor = 1;
    precalculateRooms();

    const piso = catalogoTexturas.find(t => t.grupo === 'piso');
    const parede = catalogoTexturas.find(t => t.grupo === 'parede');

    // pintar chão
    document.getElementById('btnPaintFloor').click();
    texturaSelecionada.piso = piso.id;
    clique(pos(4.5, 4.5));
    const chaoPintado = map[4][4].texPiso === piso.id;
    const naoMexeuNaConstrucao = map[4][4].floor === 1;

    // pintar chão onde NÃO há chão não inventa piso
    clique(pos(9.2, 9.2));
    const semChaoFicaSemTextura = map[9][9].texPiso === null && map[9][9].floor === 0;

    // pintar parede: aresta oeste da célula (4,2)
    document.getElementById('btnPaintWall').click();
    texturaSelecionada.parede = parede.id;
    clique(pos(4.2, 2.1));
    const paredePintada = map[4][2].texL === parede.id;
    const paredeContinuaDePe = map[4][2].wallL === 48;

    // a paleta mostra o grupo da ferramenta ativa
    const botoes = document.querySelectorAll('#texturePalette .texture-btn').length;

    return { catalogo: catalogoTexturas.length >= 20, chaoPintado, naoMexeuNaConstrucao,
             semChaoFicaSemTextura, paredePintada, paredeContinuaDePe, paletaCheia: botoes > 1 };
  });
  const pintOk = Object.values(pintura).every(Boolean);
  checa('Pintar chão e parede aplicam textura sem alterar a construção', pintOk,
        `catálogo carregado=${pintura.catalogo} · chão pintado=${pintura.chaoPintado} · ` +
        `parede pintada=${pintura.paredePintada} · construção intacta=` +
        `${pintura.naoMexeuNaConstrucao && pintura.paredeContinuaDePe} · ` +
        `sem chão não recebe textura=${pintura.semChaoFicaSemTextura} · paleta preenchida=${pintura.paletaCheia}`);

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
