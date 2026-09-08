const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

const tileWidth = 64;
const tileHeight = 32;
const originX = canvas.width / 2;
const originY = 100;

let hoverCol = -1;
let hoverRow = -1;

// Matriz 10x10 para guardar o estado do tabuleiro (0 = vazio, 1 = marcado)
const map = [];
for (let i = 0; i < 10; i++) {
    map[i] = new Array(10).fill(0);
}

function drawIsometricGrid() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(originX, originY);

    for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 10; col++) {
            const x = (col - row) * (tileWidth / 2);
            const y = (col + row) * (tileHeight / 2);

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + tileWidth / 2, y + tileHeight / 2);
            ctx.lineTo(x, y + tileHeight);
            ctx.lineTo(x - tileWidth / 2, y + tileHeight / 2);
            ctx.closePath();

            // Pinta de verde se estiver marcado na matriz, ou branco translúcido se for hover
            if (map[row][col] === 1) {
                ctx.fillStyle = 'rgba(100, 200, 100, 0.6)';
                ctx.fill();
            } else if (row === hoverRow && col === hoverCol) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fill();
            }

            ctx.strokeStyle = '#555';
            ctx.stroke();
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

// Detecta o clique e altera o estado do mapa entre 0 e 1
canvas.addEventListener('mousedown', () => {
    if (hoverRow >= 0 && hoverRow < 10 && hoverCol >= 0 && hoverCol < 10) {
        map[hoverRow][hoverCol] = map[hoverRow][hoverCol] === 0 ? 1 : 0;
        drawIsometricGrid();
    }
});

drawIsometricGrid();