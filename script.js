const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = 800;
canvas.height = 600;

function drawIsometricGrid() {
    const tileWidth = 64;
    const tileHeight = 32;
    ctx.translate(canvas.width / 2, 100);

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
            ctx.strokeStyle = '#555';
            ctx.stroke();
        }
    }
}
drawIsometricGrid();