# SWADE Tabletop 2.5D — protocolo de trabalho e registro de baselines

Documento vivo. Atualizado a cada versão congelada.
Repositório: github.com/oiferreiracesar/SWADE_tabletop_2.5D

## Contexto

Motor isométrico 2.5D em canvas 2D (`index.html` + `script.js` + `style.css`),
inspirado no The Sims 1, para mesas de RPG do sistema SWADE. Desenvolvido
originalmente no Gemini, migrado para o Claude em 13/09/2026 após um padrão
recorrente de código alucinado e regressões.

Existe um projeto irmão, separado: uma engine 3D em Three.js com 8 arquivos
modulares. Não é o mesmo código. A decisão de Cesar foi seguir com a 2.5D.

## Protocolo acordado

1. **Blindagem por versão numerada.** Toda versão testada e aprovada por Cesar
   vira baseline congelada. Baseline aprovada nunca é sobrescrita.
2. **Cesar guarda a cópia-mestre.** A cada baseline ele recebe um `.zip` com
   manifesto de hashes. O ambiente do Claude é temporário; a cópia dele é a
   blindagem real.
3. **Regra de alteração:** nunca reescrever arquivo inteiro quando cabe
   alteração pontual; nunca entregar arquivo que não foi lido na mesma sessão;
   toda entrega declara o que mudou, o que NÃO mudou e o que pode quebrar;
   nunca preencher lacuna com suposição.
4. **Uma alteração por vez.** Muda → Cesar testa → congela.
5. **Falhou, volta para a baseline.** Nunca "corrigir a correção".
6. **Push é decisão de Cesar.** Commits ficam locais até ele autorizar.
7. Cesar decide: o que o produto faz, prioridade, e o veredito de "passou".
   Claude decide o técnico e tem o dever de discordar quando couber.
8. **Instruções de teste sempre explícitas** — passo a passo, com o resultado
   esperado. Cesar não é desenvolvedor.
9. **Entregar `.zip` da pasta inteira**, não arquivos soltos (arquivo avulso
   gerou confusão sobre o que substituir).
10. **Dois pacotes por entrega**, desde as texturas: um para testar (pasta
    completa) e um `PARA-SUBIR` só com o que mudou, para o upload no GitHub.

## Ambiente

- macOS com trackpad (sem botão do meio nem roda de scroll)
- Testa localmente via `TESTAR.command` (duplo clique). **Desde as texturas isso
  é obrigatório**: aberto como arquivo local, o navegador bloqueia a leitura do
  catálogo e tudo aparece em cor sólida.
- Suíte de regressão em Playwright roda do lado do Claude; Cesar não precisa
  instalar nada.
- **Publicação no GitHub é manual**, pelo site. O proxy desta sessão recusa o
  repositório por não estar nas fontes autorizadas — não é credencial, é
  permissão de sessão, e não há comando do lado do Claude para resolver. O
  histórico completo foi entregue como `SWADE-historico.bundle`.

## Baselines

### baseline-v2 — 14/09/2026 (tag git `baseline-v2`, commit `0006ea0`)

Aprovada por Cesar: *"Acho que temos o que é preciso para o modo de construção."*
Suíte: **32/32**. 22 commits desde a v1. `script.js` com 2.363 linhas.

MD5: `index.html` 453b7872b09da795d8d4e1c70892997a ·
`script.js` 223b9ef1d2c9b63d3704fc6050e12e52 ·
`style.css` dbc32bab4459a27f2b3a425492bb5959 ·
`teste-regressao.js` 4b68fbad64e3758e3c92d5d94b499940 ·
`texturas/manifesto.json` 451686d0abd86ac59ab7c6a307d2101a
(o `.zip` traz `HASHES.txt` com as 45 texturas)

**O que a v2 tem que a v1 não tinha**

| Área | O que entrou |
|---|---|
| Parede | Modelo ponto A → linha → ponto B, travado em reta e 45° |
| Formas | Sala triangular (4), octogonal (5), cerca/meia parede (9) |
| Meio-ladrilho | Piso e telhado cortados pela diagonal; as duas metades pintáveis |
| Telhado | Altura por cômodo, cumeeiras, regra do Sims entre andares, chanfro e hipotenusa |
| Andares | Laje, sacada com um losango de balanço, coluna a partir do segundo |
| Subsolo | Câmaras sem telhado, cada nível isolado do de cima |
| Tabuleiro | 10×10 de verdade (faixa sentinela guarda as arestas leste e sul) |
| Câmera | Zoom, WASD e **giro de 90°** (Q/E) |
| Acabamento | 45 texturas CC0; piso nasce texturizado; pincéis de telhado e de parede/cerca/coluna |
| Água | Pincel contínuo, silhueta orgânica, superfície animada, célula bloqueada |

**Decisões de engenharia que vale lembrar**

- O giro gira o **tabuleiro**, não a câmera: sombreamento, águas do telhado,
  meio-ladrilho e conversão do clique são todos definidos em relação à tela.
  Girar o dado mantém as quatro peças valendo como estão.
- A água é uma **lista de pinceladas** em coordenadas fracionárias, não um
  atributo da célula — é o que permite margem curva. A flag de bloqueio é
  recalculada a partir delas, então o resto do motor segue conversando com a
  célula.
- O desenho tem três etapas: chão inteiro → água → estrutura e telhados.
- Texturas: 363 MB de PNG viraram 45 arquivos webp de 128px, 280 KB no total.

## Pendências conhecidas na v2

| Item | Efeito |
|---|---|
| Sem salvar e carregar mapa | Fechou o navegador, perdeu o tabuleiro. É a mais cara na prática. |
| Sem porta nem passagem | Ligar duas câmaras exige deixar um vão, e vão abre o cômodo (sem telhado). A dungeon pede isso primeiro. |
| Sem refazer (Ctrl+Y) | O desfazer existe; o caminho de volta não. |
| Laje sem espessura | Vista de baixo, a sacada é uma folha de papel. Falta uma fáscia de 6–8px. |
| README do repositório | É o LEIA-ME de uma entrega, não a apresentação do projeto. |
| `TESTAR.command` não sobe | O GitHub recusa executáveis por upload no site. |

## Próximo passo acordado

Nada em andamento — Cesar encerrou a fase de construção em 14/09/2026.
Quando retomar, a ordem proposta é: **porta e passagem** (destrava a dungeon),
depois **salvar e carregar mapa**, depois **fáscia da laje**.
