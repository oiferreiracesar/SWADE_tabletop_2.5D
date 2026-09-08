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

function drawIsometricGrid() {
    // Limpa a tela inteira antes de desenhar o próximo quadro
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

            // Pinta o tile de branco se o mouse estiver em cima dele
            if (row === hoverRow && col === hoverCol) {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fill();
            }

            ctx.strokeStyle = '#555';
            ctx.stroke();
        }
    }
    ctx.restore();
}

// Rastreia o movimento do mouse e converte para coordenadas isométricas
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Ajusta o mouse com base na origem do nosso grid desenhado
    const adjX = mouseX - originX;
    const adjY = mouseY - originY;

    // Fórmula matemática reversa da perspectiva isométrica 2:1
    hoverCol = Math.floor((adjY / tileHeight) + (adjX / tileWidth));
    hoverRow = Math.floor((adjY / tileHeight) - (adjX / tileWidth));

    drawIsometricGrid();
});

// Desenho inicial ao carregar a página
drawIsometricGrid();