# SWADE 2.5D — Texturas: Pintar Chão e Pintar Parede

**Importante:** desta vez é obrigatório usar o **`TESTAR.command`**. Abrir o
`index.html` com dois cliques não funciona mais — o navegador bloqueia a leitura
do catálogo de texturas em arquivo local. Era exatamente para isso que o
`TESTAR.command` existia desde o começo.

---

## O que veio dos seus arquivos

Seus três pacotes tinham **525 imagens PNG de 512×512, 363 MB**. Carregar isso
numa engine de navegador deixaria o tabuleiro pesado e o repositório impossível.

Fiz uma curadoria: **39 texturas**, reduzidas para 128×128 e convertidas para
webp. O conjunto inteiro ficou em **260 KB** — mil e quatrocentas vezes menor, e
na tela a diferença não aparece, porque um ladrilho isométrico tem 64×32 pixels.

Categorias que entraram:

| Chão | Parede |
|---|---|
| Grama, Terra, Ladrilho, Madeira, Terreno, Pedra | Tijolo, Tijolo miúdo, Reboco, Pedra, Tábua, Metal |

Licença: **CC0 / domínio público** (Screaming Brain Studios). Uso comercial
liberado, sem obrigação de crédito. Se você quiser outras categorias dos pacotes
originais — Gema, Grade, Tecido, Caixa, Metal pesado —, é só pedir: o processo de
conversão está pronto e roda em segundos.

---

## Como usar

1. **Pintar Chão (7)** — a biblioteca passa a mostrar as texturas de chão.
   Escolha uma e clique (ou arraste) sobre o chão já construído.
2. **Pintar Parede (8)** — a biblioteca troca para as texturas de parede.
   Clique na parede que quer revestir.
3. **Ctrl** com qualquer um dos dois **remove** a textura e volta para a cor.
4. **"Sem textura"** é o primeiro quadro da paleta, com o mesmo efeito.

Duas regras que eu segui de propósito:

- **Pintar não constrói.** Clicar com o 7 num lugar sem chão não cria chão — o
  acabamento é uma camada separada da construção.
- **Meio ladrilho tem duas texturas.** Numa célula cortada por parede diagonal,
  cada metade guarda a sua.

---

## O que eu quero que você teste

1. **Chão:** ferramenta 7, escolha Ladrilho, arraste por dentro de uma sala.
2. **Parede:** ferramenta 8, escolha Tijolo, clique nas paredes da sala.
3. **A paleta troca sozinha** ao alternar entre 7 e 8.
4. **Apagar textura:** Ctrl + clique com a 7 sobre o chão pintado.
5. **Pintar não constrói:** com a 7, clique na terra fora do prédio → nada.
6. **Meia célula:** numa sala triangular, pinte os dois lados da hipotenusa com
   texturas diferentes.
7. **Nada regrediu:** cerca, laje, sacada, subsolo, telhado.

---

## O que ficou de fora, e por quê

O **telhado continua na cor sólida**. Tentei texturar as águas inclinadas e o
resultado ficou ruim — a imagem é projetada no quadro da célula, e a água do
telhado sobe além dele, o que deixa a telha esticada e desalinhada entre uma
célula e a vizinha. Precisa de outra abordagem (projetar no plano inclinado de
cada água). Preferi não entregar meia-boca; fica na fila.

---

Testes de regressão: **29/29** (novo: pintar chão e parede aplicam a textura sem
alterar a construção, e a paleta acompanha a ferramenta).
