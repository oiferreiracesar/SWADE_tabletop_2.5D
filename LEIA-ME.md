# SWADE 2.5D — O baú de verdade

Abra pelo **`TESTAR.command`**.

---

## O veredito da folha nova

A câmera travou. Foi exatamente isso que faltava na anterior, e agora está certo:
as quatro vistas têm **177/178 px de altura** e a mesma proporção, todas mostrando
duas faces mais a tampa. Nenhuma face chapada de frente. A arte, a luz e o fundo
vieram impecáveis — o recorte saiu com excesso de verde no contorno entre
**−1,3 e −2,6**, ou seja, franja nenhuma.

**Um defeito só, e pequeno: a vista 3 estava com a mão trocada.**

Num baú retangular visto de um canto, girar 90° alterna a silhueta: a vista 1
deve ser igual à 3, a 2 igual à 4, e a 1 espelho da 2. Medido na folha que você
mandou:

| par | esperado | veio |
|---|---|---|
| v1 × v3 | iguais | **0,81** (espelhadas: 0,99) |
| v2 × v4 | iguais | 1,00 ✅ |
| v1 × v2 | espelhadas | 1,00 ✅ |

A vista 3 tinha sido desenhada na orientação da 2 e da 4. **Espelhei só ela** —
e como o baú é simétrico esquerda-direita, o espelho aqui é legítimo pela sua
própria regra. Depois da correção:

| par | direto | espelhado |
|---|---|---|
| v1 × v3 | **0,99** | 0,81 |
| v2 × v4 | **1,00** | 0,81 |
| v1 × v2 | 0,81 | **1,00** |

O padrão de um giro de verdade, exato.

---

## Um aviso sobre o aviso do conversor

A semelhança média deu **0,87**, perto do limiar que dispara o alerta de "mesmo
ângulo". Aqui é **falso positivo**, e a razão é geométrica: um baú é uma caixa, e
caixa girada 90° vista de um canto tem quase a mesma silhueta sempre — só a
pintura muda de lugar. O teste de silhueta serve para objeto com forma
assimétrica; para caixa, quem decide é o padrão de espelhamento da tabela acima.

Anotei isso como dívida do conversor: ele deveria comparar o **padrão** de
espelhamento em vez da semelhança média. Não mexi agora para não misturar
assuntos numa entrega só.

---

## O que mudou no pacote

Só os quatro arquivos do baú (`objetos/bau-0..3.webp`) e o `manifesto.json`.
Nenhuma linha de `script.js`, `index.html` ou `style.css`. Os baús antigos, os
que vieram do xadrez e não giravam, foram substituídos.

Os quatro somam **34 KB**.

---

## O que testar

1. **Ferramenta `O`**, clique num ladrilho no meio do tabuleiro.
2. **Gire a câmera com `E`, quatro vezes.**
   → O baú acompanha a casa. A fechadura aparece em duas posições seguidas e
     some nas outras duas. Ele não deve "pular" nem achatar em nenhuma.
3. **Clique de novo no mesmo baú, quatro vezes** (gira o objeto, não a câmera).
   → Mesma sequência das quatro vistas.
4. **Zoom máximo**, baú sobre chão claro e sobre chão escuro.
   → Sem contorno verde em volta.
5. **Profundidade:** um baú encostado na parede do fundo, outro na frente.
   → Um atrás da parede, outro na frente.
6. **Nada regrediu:** aberturas (`P`), água (`0`), telhado (`7`), texturas (`8`).

---

Testes de regressão: **34/34**.
