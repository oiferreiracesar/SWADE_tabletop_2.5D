#!/usr/bin/env python3
"""
Converte uma folha de sprites (as vistas de um objeto lado a lado) nos arquivos
que o tabuleiro lê, e atualiza o catalogo.

    python3 ferramentas/converter-sprites.py folha.png --id bau --nome "Baú" \
        --categoria Masmorra --ladrilhos 1x1

O que ele faz, na ordem:
  1. Descobre o fundo. Aceita alfa de verdade, fundo magenta, cor chapada ou o
     xadrez PINTADO que os geradores de imagem costumam entregar. O recorte e
     feito por inundacao a partir da borda: so vira transparente o que esta
     LIGADO ao fundo, entao um brilho claro dentro do objeto nao e apagado.
  2. Acha cada vista sozinho, pelos pixels que sobraram -- em vez de dividir a
     imagem em partes iguais, que herda qualquer desalinhamento do gerador.
  3. CONFERE se as vistas sao mesmo um giro. Silhuetas quase identicas entre si
     denunciam quatro variacoes do mesmo angulo, que e o erro mais comum.
  4. Alinha o pe de todas no mesmo ponto, redimensiona e grava em webp.
  5. Escreve a FICHA do objeto em objetos/<id>.json e remonta o catalogo
     objetos/manifesto.json a partir de todas as fichas.
"""
import argparse, json, os, sys
from collections import deque

import numpy as np
from PIL import Image

# o nome do arquivo tem hifen, entao carrego pelo caminho
import importlib.util as _iu
_aqui = os.path.dirname(os.path.abspath(__file__))
_spec = _iu.spec_from_file_location('montar_catalogo', os.path.join(_aqui, 'montar-catalogo.py'))
montar_catalogo = _iu.module_from_spec(_spec)
_spec.loader.exec_module(montar_catalogo)

LARGURA_POR_LADRILHO = 160   # folga para o zoom maximo (2,5x) do tabuleiro


CHROMAS = {
    'verde':   (0, 255, 0),
    'magenta': (255, 0, 255),
    'azul':    (0, 0, 255),
    'ciano':   (0, 255, 255),
}


def identificar_chroma(rgb):
    """Se a borda da imagem for uma cor de chroma conhecida, diz qual."""
    h, w, _ = rgb.shape
    amostras = np.concatenate([rgb[0, :], rgb[h - 1, :], rgb[:, 0], rgb[:, w - 1]])
    mediana = np.median(amostras, axis=0)
    for nome, cor in CHROMAS.items():
        if np.all(np.abs(mediana - np.array(cor)) <= 60):
            return nome, np.array(cor, float)
    return None, None


def alfa_por_chroma(rgb, cor, perto=70.0, longe=150.0):
    """Alfa suave pela distancia ate a cor de fundo.

    O pixel da BORDA do objeto e uma mistura de objeto e fundo -- e por isso que
    recorte duro deixa franja colorida. Aqui o alfa sobe aos poucos entre as duas
    distancias, entao a borda fica macia como na imagem original.
    """
    dist = np.sqrt(((rgb - cor) ** 2).sum(axis=2))
    alfa = (dist - perto) / (longe - perto)
    return np.clip(alfa, 0, 1)


def tirar_derrame(rgb, nome_chroma, onde):
    """Tira o reflexo da cor de fundo que fica na borda do objeto.

    Numa folha verde, o contorno do bau ganha um verde que nao existe no bau. A
    correcao e limitar o canal da cor de fundo a MEDIA dos outros dois. Usei o
    maior dos dois antes e sobrava franja: em madeira (r=150, b=60) o teto pelo
    maior deixa o verde em 150, que ainda e verde demais. A media (105) e o que
    de fato neutraliza.

    So vale na FAIXA da borda (onde=True). Aplicar na imagem inteira apagaria o
    verde legitimo do objeto -- uma gema verde viraria preta. Descobri isso
    testando com uma gema de proposito.
    """
    saida = rgb.astype(float).copy()
    r, g, b = saida[:, :, 0].copy(), saida[:, :, 1].copy(), saida[:, :, 2].copy()
    def limitar(canal, a, b_):
        return np.where(onde, np.minimum(canal, (a + b_) / 2.0), canal)
    if nome_chroma == 'verde':
        saida[:, :, 1] = limitar(g, r, b)
    elif nome_chroma == 'magenta':
        saida[:, :, 0] = limitar(r, g, b)
        saida[:, :, 2] = limitar(b, g, r)
    elif nome_chroma == 'azul':
        saida[:, :, 2] = limitar(b, r, g)
    elif nome_chroma == 'ciano':
        saida[:, :, 1] = limitar(g, r, b)
        saida[:, :, 2] = limitar(b, r, g)
    return np.clip(saida, 0, 255).astype(np.uint8)


def inundar_da_borda(rgb, amostras, tol=30):
    """Fundo = o que casa com as amostras E esta ligado a borda da imagem.

    A ligacao com a borda e o que protege o objeto: uma gema verde no meio do bau
    casa com a cor do fundo, mas nao esta ligada a ele, entao nao e apagada.
    """
    h, w, _ = rgb.shape
    fundo = np.zeros((h, w), bool)
    fila = deque()
    for x in range(w):
        fila.append((0, x)); fila.append((h - 1, x))
    for y in range(h):
        fila.append((y, 0)); fila.append((y, w - 1))
    amostras = np.array(amostras)
    while fila:
        y, x = fila.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or fundo[y, x]:
            continue
        if not np.any(np.all(np.abs(amostras - rgb[y, x]) <= tol, axis=1)):
            continue
        fundo[y, x] = True
        fila.extend([(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)])
    return fundo


def achar_fundo(im):
    """Devolve (rgb corrigido, alfa 0..255, descricao do metodo)."""
    if im.mode == 'RGBA':
        alfa = np.array(im.getchannel('A'))
        if alfa.min() == 0:
            return np.array(im.convert('RGB')), alfa, 'alfa do próprio arquivo'

    rgb = np.array(im.convert('RGB'))
    nome, cor = identificar_chroma(rgb)

    if nome is not None:
        # 1) alfa suave pela distancia ate a cor de chroma
        macio = alfa_por_chroma(rgb.astype(float), cor)
        # 2) so vale onde o fundo esta LIGADO a borda -- protege detalhe da mesma
        #    cor dentro do objeto
        ligado = inundar_da_borda(rgb, [cor], tol=90)
        alfa = np.where(ligado, macio, 1.0)
        # 3) tira o derrame SO na faixa da borda: a franja e onde objeto e fundo
        #    se misturam. Dentro do objeto, a cor e do objeto.
        #    A faixa e "perto do fundo", nao so "alfa parcial": o derrame passa
        #    de onde o alfa ja e cheio, e sobrava franja na borda esquerda do bau.
        faixa = ((alfa > 0.02) & (alfa < 0.98)) | ligado
        for _ in range(4):                      # engorda a faixa em 4 pixels
            d = np.zeros_like(faixa)
            d[1:, :] |= faixa[:-1, :]; d[:-1, :] |= faixa[1:, :]
            d[:, 1:] |= faixa[:, :-1]; d[:, :-1] |= faixa[:, 1:]
            faixa = faixa | d
        limpo = tirar_derrame(rgb, nome, faixa)
        return limpo, (alfa * 255).astype(np.uint8), f'chroma {nome} (borda macia + sem derrame)'

    # fundo xadrez pintado ou cor chapada qualquer
    h, w, _ = rgb.shape
    amostras = [rgb[1, 1], rgb[1, w - 2], rgb[h - 2, 1], rgb[h - 2, w - 2]]
    amostras += [rgb[1, x] for x in range(0, w, max(1, w // 40))]
    fundo = inundar_da_borda(rgb, amostras, tol=30)
    return rgb, np.where(fundo, 0, 255).astype(np.uint8), 'xadrez/cor chapada (inundação a partir da borda)'


def espalhar_cor_para_fora(a, passos=4):
    """Estende a cor do objeto para dentro da area transparente.

    O pixel transparente ainda guarda ALGUMA cor, e a do fundo. Ela nao aparece
    na tela, mas reaparece na compressao do webp e no redimensionamento, como
    franja. Empurrando a cor do objeto para fora, o que vaza e a cor certa.
    """
    cor = a[:, :, :3].astype(float).copy()
    conhecido = a[:, :, 3] > 0
    for _ in range(passos):
        falta = ~conhecido
        if not falta.any():
            break
        soma = np.zeros_like(cor)
        peso = np.zeros(cor.shape[:2])
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            viz = np.roll(np.roll(cor, dy, axis=0), dx, axis=1)
            vc = np.roll(np.roll(conhecido, dy, axis=0), dx, axis=1)
            soma += viz * vc[:, :, None]
            peso += vc
        novo = falta & (peso > 0)
        cor[novo] = (soma[novo] / peso[novo][:, None])
        conhecido = conhecido | novo
    saida = a.copy()
    saida[:, :, :3] = cor.astype(np.uint8)
    return saida


def redimensionar_com_alfa(img, largura_alvo):
    """Redimensiona sem criar franja.

    Reduzir uma imagem RGBA direto mistura a cor dos pixels TRANSPARENTES com a
    dos vizinhos -- e como a cor guardada embaixo do transparente e a do fundo, a
    franja verde volta depois de eu ter tirado o derrame. A correcao e a de
    sempre: multiplicar a cor pelo alfa antes de reduzir e dividir depois.
    """
    a = np.array(img).astype(float)
    alfa = a[:, :, 3:4] / 255.0
    pre = np.dstack([a[:, :, :3] * alfa, a[:, :, 3]])
    altura_alvo = max(1, round(img.height * largura_alvo / img.width))
    reduzida = np.array(Image.fromarray(pre.astype(np.uint8), 'RGBA')
                        .resize((largura_alvo, altura_alvo), Image.LANCZOS)).astype(float)
    alfa2 = reduzida[:, :, 3:4] / 255.0
    cor = np.divide(reduzida[:, :, :3], np.maximum(alfa2, 1e-4))
    saida = np.dstack([np.clip(cor, 0, 255), reduzida[:, :, 3]])
    return Image.fromarray(saida.astype(np.uint8), 'RGBA')


def ilhas(mascara_objeto, minimo=1500):
    """Componentes conectados, da esquerda para a direita."""
    h, w = mascara_objeto.shape
    rotulo = np.zeros((h, w), int)
    atual = 0
    achadas = []
    for y0 in range(h):
        for x0 in range(w):
            if not mascara_objeto[y0, x0] or rotulo[y0, x0]:
                continue
            atual += 1
            fila = deque([(y0, x0)])
            rotulo[y0, x0] = atual
            pixels = 0
            minx = maxx = x0; miny = maxy = y0
            while fila:
                y, x = fila.popleft()
                pixels += 1
                minx = min(minx, x); maxx = max(maxx, x)
                miny = min(miny, y); maxy = max(maxy, y)
                for vy, vx in ((y+1,x),(y-1,x),(y,x+1),(y,x-1)):
                    if 0 <= vy < h and 0 <= vx < w and mascara_objeto[vy, vx] and not rotulo[vy, vx]:
                        rotulo[vy, vx] = atual
                        fila.append((vy, vx))
            if pixels >= minimo:
                achadas.append({'id': atual, 'pixels': pixels,
                                'caixa': (minx, miny, maxx + 1, maxy + 1)})
    achadas.sort(key=lambda i: i['caixa'][0])
    return rotulo, achadas


def parecidas(a, b):
    """Interseccao sobre uniao de duas silhuetas, normalizadas."""
    def normal(m):
        img = Image.fromarray((m * 255).astype(np.uint8)).resize((120, 120))
        return (np.array(img) > 128).astype(float)
    x, y = normal(a), normal(b)
    uniao = ((x + y) > 0).sum()
    return float((x * y).sum() / uniao) if uniao else 0.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folha')
    ap.add_argument('--id', required=True)
    ap.add_argument('--nome', required=True)
    ap.add_argument('--categoria', default='Geral')
    ap.add_argument('--ladrilhos', default='1x1', help='ex.: 1x1, 1x2, 2x2')
    ap.add_argument('--bloqueia', action='store_true', default=True)
    ap.add_argument('--livre', dest='bloqueia', action='store_false',
                    help='objeto que NAO bloqueia o ladrilho (tapete, poça)')
    ap.add_argument('--espelhar', action='store_true',
                    help='completa 4 vistas espelhando as encontradas. So para objeto '
                         'SIMETRICO: numa escrivaninha ou estatua, o espelho mente')
    ap.add_argument('--saida', default='objetos')
    args = ap.parse_args()

    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    destino = os.path.join(raiz, args.saida)
    os.makedirs(destino, exist_ok=True)

    im = Image.open(args.folha)
    rgb, alfa, comoFundo = achar_fundo(im)
    rgba = np.dstack([rgb, alfa])
    solido = alfa > 128

    print(f'folha: {args.folha}  ({im.size[0]}x{im.size[1]})')
    print(f'fundo: {comoFundo} — {(1 - solido.mean())*100:.0f}% da imagem')

    rotulo, achadas = ilhas(solido)
    print(f'vistas encontradas: {len(achadas)}')
    if not achadas:
        sys.exit('nenhum objeto encontrado — o fundo pode não ter sido reconhecido')

    mascaras = []
    for i in achadas:
        x0, y0, x1, y1 = i['caixa']
        mascaras.append(rotulo[y0:y1, x0:x1] == i['id'])

    # CONFERENCIA: giro de verdade ou variacoes do mesmo angulo?
    if len(mascaras) >= 2:
        pares = [parecidas(mascaras[a], mascaras[b])
                 for a in range(len(mascaras)) for b in range(a + 1, len(mascaras))]
        media = sum(pares) / len(pares)
        espelhadas = max(parecidas(mascaras[0], m[:, ::-1]) for m in mascaras[1:])
        print(f'semelhança média entre as silhuetas: {media:.2f}'
              f'  |  melhor semelhança com a vista 1 espelhada: {espelhadas:.2f}')
        if media > 0.90 and espelhadas < media - 0.05:
            print('  AVISO: as vistas parecem o MESMO ÂNGULO, não um giro de 90°.')
            print('         Regenere pedindo um turnaround, ou use uma vista só.')

    ladrilhos = [int(n) for n in args.ladrilhos.lower().split('x')]
    largura_alvo = LARGURA_POR_LADRILHO * ladrilhos[0]

    vistas = []
    for k, i in enumerate(achadas):
        x0, y0, x1, y1 = i['caixa']
        recorte = rgba[y0:y1, x0:x1].copy()
        # so o que pertence a ESTA vista; o resto do retangulo fica transparente
        pertence = rotulo[y0:y1, x0:x1] == i['id']
        # a borda macia fica de fora do rotulo (alfa parcial), entao vale tambem
        # o que esta colado nela
        vizinho = np.zeros_like(pertence)
        vizinho[1:, :] |= pertence[:-1, :]; vizinho[:-1, :] |= pertence[1:, :]
        vizinho[:, 1:] |= pertence[:, :-1]; vizinho[:, :-1] |= pertence[:, 1:]
        recorte[:, :, 3] = np.where(pertence | vizinho, recorte[:, :, 3], 0)
        recorte = espalhar_cor_para_fora(recorte)
        img = redimensionar_com_alfa(Image.fromarray(recorte, 'RGBA'), largura_alvo)
        arq = f'{args.id}-{k}.webp'
        img.save(os.path.join(destino, arq), 'WEBP', quality=88, method=5)
        vistas.append(f'{args.saida}/{arq}')
        print(f'  {arq}  {img.size[0]}x{img.size[1]}')

    if args.espelhar and len(vistas) < 4:
        base = len(vistas)
        for k in range(base):
            origem = Image.open(os.path.join(raiz, vistas[k])).transpose(Image.FLIP_LEFT_RIGHT)
            arq = f'{args.id}-{base + k}.webp'
            origem.save(os.path.join(destino, arq), 'WEBP', quality=88, method=5)
            vistas.append(f'{args.saida}/{arq}')
            print(f'  {arq}  (espelhada de {os.path.basename(vistas[k])})')

    # A FICHA do objeto, um arquivo so dele. O catalogo e a soma das fichas --
    # por isso gravar um objeto novo nunca mexe nos outros.
    ficha = {'id': args.id, 'nome': args.nome, 'categoria': args.categoria,
             'ladrilhos': ladrilhos, 'bloqueia': bool(args.bloqueia), 'vistas': vistas}
    caminho_ficha = os.path.join(destino, f'{args.id}.json')
    json.dump(ficha, open(caminho_ficha, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'  {args.id}.json  (ficha do objeto)')

    montar_catalogo.main()


if __name__ == '__main__':
    main()
