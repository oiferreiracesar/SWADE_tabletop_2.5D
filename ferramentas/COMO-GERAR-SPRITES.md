# Como gerar sprites que o tabuleiro lê

Guia para pedir arte a um gerador de imagem e trazer para a engine. Escrito
depois do primeiro baú, que trouxe os dois erros mais comuns de uma vez.

---

## 1. Antes de gerar: quantas vistas esse objeto precisa?

Esta é a primeira decisão, e ela muda o pedido.

| O objeto é… | Vistas | Espelhar é permitido? |
|---|---|---|
| **Simétrico por todos os lados** — barril, tonel, pedra, fogueira, poço, árvore, pilha de moedas, tocha | **1** | não faz diferença |
| **Simétrico esquerda-direita, com frente e costas diferentes** — baú com fechadura, cama, altar, fogão | **4** | tolerável: o espelho só troca o lado da fechadura |
| **Assimétrico** — escrivaninha em L, estátua olhando para um lado, escada, bandeira, qualquer coisa com brasão ou texto | **4, obrigatoriamente** | **não.** O espelho inverte o desenho e denuncia |

Uma vista só não é preguiça: para objeto simétrico é o **certo**. Ele fica sempre
de frente para a câmera, gira junto e ninguém percebe — e você economiza três
quartos do trabalho e do peso.

---

## 2. O pedido, para uma vista

> Isometric game asset, single object: **a wooden barrel, iron bands, medieval
> fantasy**. True 2:1 isometric projection, orthographic, no perspective
> distortion. **Solid magenta background (#FF00FF), flat and uniform, no
> gradient.** No ground, no floor
> tile, no scenery, no drop shadow. Light source from the upper right. Object
> centered, resting on the bottom edge of the frame. Clean edges, no text, no
> watermark, no frame.

Troque só o trecho em negrito. O resto, mantenha **idêntico** entre todos os
objetos — é o que faz o baú, o barril e a mesa parecerem do mesmo jogo.

---

## 3. O pedido, para as quatro vistas (a regra nova)

O erro do primeiro baú foi este: pedir "quatro vistas" sem dizer que era um
**giro**. O gerador entendeu "quatro versões" e entregou quatro variações do
mesmo ângulo. Diga explicitamente que o objeto gira, e ancore em uma referência
que os geradores conhecem:

> Isometric game asset **turnaround sheet**: **a wooden treasure chest, iron
> bands, medieval fantasy**. The **same object rotated 90° clockwise between
> views**, four views in a single horizontal row, left to right: front, right
> side, back, left side. **The lock must be visible in view 1, on the right side
> in view 2, hidden in view 3, on the left side in view 4.** Identical scale,
> identical lighting and identical style in all four. True 2:1 isometric
> projection, orthographic, no perspective. **Solid magenta background
> (#FF00FF), flat and uniform, no gradient**, generous empty space between
> views. No ground, no shadow, no labels, no numbers, no frames. Light from the
> upper right.

Três detalhes desse texto fazem o trabalho:

- **"turnaround sheet"** — é o termo da indústria para folha de rotação. Sem ele,
  "four views" vira "four versions".
- **"front, right side, back, left side"** — nomeia cada vista, em vez de deixar
  o gerador escolher.
- **A frase sobre a fechadura** — é a prova viva. Adapte para o seu objeto:
  *"the drawers must face the camera in view 1 and away in view 3"*. Um detalhe
  assimétrico nomeado obriga o gerador a realmente girar, e é como **você** vai
  conferir o resultado em dois segundos.

Sentido do giro: **horário**. É o mesmo da tecla **E** no tabuleiro. Se vier ao
contrário, o objeto gira contra a casa — o conversor consegue inverter a ordem,
mas é melhor sair certo.

---

## 4. O fundo: peça chroma key, não alfa

**Esta é a regra agora.** Não peça mais "transparent background". Peça um fundo
sólido de chroma key:

> solid magenta background (#FF00FF), flat and uniform, no gradient, no shadow
> on the background

O motivo é o que você mesmo apontou: muitos geradores **não conseguem** entregar
canal alfa, e quando não conseguem inventam um xadrez pintado ou um fundo branco
— e aí o recorte fica na sorte. Um fundo chapado eles sempre entregam certo, e o
recorte por cor é exato.

**Use magenta.** O conversor também aceita verde, azul e ciano, mas magenta é a
escolha certa para cenário de fantasia: verde existe em musgo, planta, poção,
esmeralda, limo de masmorra — e o que for verde de verdade corre risco. Magenta
não existe em madeira, pedra, metal nem pele.

A única regra absoluta: **nunca use uma cor que esteja no objeto**. Se for gerar
um cristal roxo, troque o fundo para verde nesse objeto.

O conversor faz três coisas com o chroma:

- **borda macia** — o pixel do contorno é meio objeto, meio fundo; ele vira
  meio transparente, em vez de recorte serrilhado;
- **protege o miolo** — só apaga a cor do fundo que está *ligada* à borda da
  imagem, então um detalhe da mesma cor dentro do objeto sobrevive;
- **tira o derrame** — o reflexo da cor do fundo que fica colado no contorno, na
  faixa perto do fundo apenas.

Se o fundo vier xadrez ou branco assim mesmo, o conversor ainda recorta por
inundação a partir da borda. É o plano B, não o plano.

---

## 5. Tamanho

Peça o maior que o gerador der — 1024 px de largura ou mais. Reduzir é seguro,
ampliar não. O conversor entrega para o tabuleiro em 160 px de largura por
ladrilho ocupado, que cobre o zoom máximo com folga.

---

## 6. Converter

```bash
python3 ferramentas/converter-sprites.py folha.png \
    --id bau --nome "Baú" --categoria Masmorra --ladrilhos 1x1
```

Opções:

- `--ladrilhos 1x2` — objeto que ocupa dois ladrilhos (mesa comprida)
- `--livre` — objeto que **não** bloqueia o ladrilho (tapete, poça, marca no chão)
- `--espelhar` — completa quatro vistas espelhando as encontradas.
  **Só para objeto simétrico** (veja a tabela do item 1)

O conversor recorta o fundo, acha cada vista sozinho, alinha o pé de todas,
redimensiona, grava em webp e atualiza `objetos/manifesto.json`.

**E ele confere o giro.** Se as silhuetas das quatro vistas forem quase
idênticas entre si, ele avisa:

```
AVISO: as vistas parecem o MESMO ÂNGULO, não um giro de 90°.
       Regenere pedindo um turnaround, ou use uma vista só.
```

Esse aviso é a razão de o conversor existir. O erro é invisível na folha —
as quatro imagens parecem certas — e só aparece no tabuleiro, girando a câmera,
depois de você já ter gerado trinta objetos do mesmo jeito.
