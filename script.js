const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;
const blockHeight = 32; // Altura da parede 3D

let hoverCol = -1;
let hoverRow = -1;
let currentBrush = 1; // 1 = Piso, 2 = Parede, 0 = Borracha

// Matriz 10x10 para guardar o estado do tabuleiro
const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = new Array(10).fill(0);
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'white';
    ctx.font = '16px Arial';
    let brushName = 'Borracha';
    if (currentBrush === 1) brushName = 'Piso (Verde)';
    if (currentBrush === 2) brushName = 'Parede (Vermelho 3D)';
    ctx.fillText('Pincel atual: ' + brushName, 20, 30);
    ctx.fillText('Tecle 1 (Piso), 2 (Parede) ou 0 (Borracha)', 20, 55);

    ctx.save();
    ctx.translate(originX, originY);

    // A ordem de desenho da esquerda para direita, de trás pra frente,
    // garante que os blocos 3D cubram uns aos outros corretamente.
    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const x = (col - row) * (tileWidth / 2);
            const y = (col + row) * (tileHeight / 2);

            if (map[row][col] === 2) {
                // DESENHA A PAREDE 3D
                
                // Face do topo
                ctx.beginPath();
                ctx.moveTo(x, y - blockHeight);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.lineTo(x, y + tileHeight - blockHeight);
                ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.closePath();
                ctx.fillStyle = '#e57373'; // Cor clara simulando luz
                ctx.fill();
                ctx.stroke();

                // Face esquerda
                ctx.beginPath();
                ctx.moveTo(x - tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.lineTo(x, y + tileHeight - blockHeight);
                ctx.lineTo(x, y + tileHeight);
                ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
                ctx.closePath();
                ctx.fillStyle = '#b71c1c'; // Cor escura simulando sombra
                ctx.fill();
                ctx.stroke();

                // Face direita
                ctx.beginPath();
                ctx.moveTo(x, y + tileHeight - blockHeight);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2 - blockHeight);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
                ctx.lineTo(x, y + tileHeight);
                ctx.closePath();
                ctx.fillStyle = '#f44336'; // Cor média
                ctx.fill();
                ctx.stroke();

            } else {
                // DESENHA O CHÃO (VAZIO OU VERDE)
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
                ctx.lineTo(x, y + tileHeight);
                ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
                ctx.closePath();

                if (map[row][col] === 1) {
                    ctx.fillStyle = 'rgba(100, 200, 100, 0.6)'; // Piso Verde
                    ctx.fill();
                } else if (row === hoverRow && col === hoverCol) {
                    if (currentBrush === 1) ctx.fillStyle = 'rgba(100, 200, 100, 0.3)';
                    else if (currentBrush === 2) ctx.fillStyle = 'rgba(244, 67, 54, 0.3)';
                    else ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                    ctx.fill();
                }
                ctx.strokeStyle = '#555';
                ctx.stroke();
            }
        }
    }
    ctx.restore();
}

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const adjX = mouseX - originX;
    const adjY = mouseY - originY;

    hoverCol = Math.floor((adjY / tileHeight) + (adjX / tileWidth));
    hoverRow = Math.floor((adjY / tileHeight) - (adjX / tileWidth));

    drawIsometricGrid();
});

canvas.addEventListener('mousedown', () => {
    if (hoverRow >= 0 && hoverRow < 10 && hoverCol >= 0 && hoverCol < 10) {
        map[hoverRow][hoverCol] = currentBrush;
        drawIsometricGrid();
    }
});

window.addEventListener('keydown', (e) => {
    if (e.key === '0') currentBrush = 0;
    if (e.key === '1') currentBrush = 1;
    if (e.key === '2') currentBrush = 2;
    drawIsometricGrid();
});

drawIsometricGrid();