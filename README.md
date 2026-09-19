# SWADE Tabletop 2.5D

Tabuleiro isométrico para RPG de mesa (sistema SWADE), no espírito do The Sims 1:
paredes na aresta entre ladrilhos, telhado que segue o cômodo, câmera que gira o
tabuleiro, e objetos em cena que giram junto com a casa.

Roda no navegador, sem instalar nada.

## Como abrir

Dois cliques em **`TESTAR.command`**. Ele sobe um servidor local e abre o menu.

O servidor local é obrigatório: abrir os arquivos direto do Finder impede o
navegador de carregar as texturas e de gravar na pasta do projeto.

## As páginas

| Arquivo | O que é |
|---|---|
| `index.html` | O menu — a porta de entrada |
| `tabuleiro.html` | O construtor de mapa |
| `conversor.html` | Converte folhas de sprite em objetos do tabuleiro |

## As pastas

| Pasta | O que guarda |
|---|---|
| `texturas/` | Biblioteca de materiais (chão, parede, telhado) + `manifesto.json` |
| `objetos/` | Os sprites, a ficha de cada objeto e o catálogo montado |
| `folhas/` | Matéria-prima: as folhas geradas pela IA, antes de converter |
| `ferramentas/` | O conversor de sprites, o montador de catálogo e o guia de geração |

## O catálogo de objetos

Cada objeto tem a **sua própria ficha** — `objetos/barril.json` — e o
`objetos/manifesto.json` é a **soma das fichas**, montado automaticamente.

Não edite o manifesto à mão. Nenhum arquivo é compartilhado entre dois objetos,
então acrescentar um objeto novo nunca apaga os que já estavam lá.

O `.github/workflows/montar-catalogo.yml` remonta o catálogo a cada envio para
`objetos/`. O mesmo trabalho local: `python3 ferramentas/montar-catalogo.py`.

## O caminho de um objeto novo

1. **Pedir a arte** — os prompts prontos estão em
   `ferramentas/COMO-GERAR-SPRITES.md`. Peça fundo de chroma key sólido.
2. **Gerar sprites** — arraste a folha no `conversor.html`. Ele recorta o fundo,
   separa as vistas, redimensiona e confere se é mesmo um giro de 90°.
3. **Gravar** — escolha a pasta `objetos/` e ele grava direto lá, remontando o
   catálogo. Ou baixe o `.zip` e descompacte por cima do projeto.
4. **Abrir o tabuleiro** — o objeto já está na ferramenta **O**.

## Testes

```
node teste-regressao.js
```

Cobre as funções vivas da engine: paredes, cômodos, telhado de dois andares,
laje, sacada, subsolo, texturas, giro da câmera, água, aberturas e objetos.
