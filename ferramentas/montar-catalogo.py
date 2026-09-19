#!/usr/bin/env python3
"""
Monta objetos/manifesto.json a partir das fichas objetos/*.json.

Cada objeto tem a sua propria ficha -- objetos/bau.json, objetos/barril.json --
e o catalogo e a soma delas. E isso que faz subir um objeto novo nunca apagar
os outros: nenhum arquivo e compartilhado entre dois objetos.

    python3 ferramentas/montar-catalogo.py

Roda sozinho no GitHub a cada envio para objetos/; aqui serve para conferir.
"""
import json, os, sys

CAMPOS = ('id', 'nome', 'categoria', 'ladrilhos', 'bloqueia', 'vistas')


def montar(pasta):
    fichas, problemas = [], []
    for arquivo in sorted(os.listdir(pasta)):
        if not arquivo.endswith('.json') or arquivo == 'manifesto.json':
            continue
        caminho = os.path.join(pasta, arquivo)
        try:
            ficha = json.load(open(caminho, encoding='utf-8'))
        except Exception as e:
            problemas.append(f'{arquivo}: nao e um JSON valido ({e})')
            continue
        faltando = [c for c in CAMPOS if c not in ficha]
        if faltando:
            problemas.append(f'{arquivo}: faltam os campos {", ".join(faltando)}')
            continue
        esperado = arquivo[:-5]
        if ficha['id'] != esperado:
            problemas.append(f'{arquivo}: o id la dentro e "{ficha["id"]}", deveria ser "{esperado}"')
            continue
        sumidas = [v for v in ficha['vistas']
                   if not os.path.exists(os.path.join(os.path.dirname(pasta), v))]
        if sumidas:
            problemas.append(f'{arquivo}: faltam os desenhos {", ".join(sumidas)}')
            continue
        fichas.append({c: ficha[c] for c in CAMPOS})

    fichas.sort(key=lambda o: (o['categoria'], o['nome']))
    return fichas, problemas


def main():
    raiz = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pasta = os.path.join(raiz, 'objetos')
    fichas, problemas = montar(pasta)

    for p in problemas:
        print(f'  IGNORADO  {p}')

    manifesto = {
        'fonte': 'montado automaticamente a partir das fichas objetos/*.json — nao edite a mao',
        'objetos': fichas,
    }
    destino = os.path.join(pasta, 'manifesto.json')
    antes = open(destino, encoding='utf-8').read() if os.path.exists(destino) else ''
    depois = json.dumps(manifesto, ensure_ascii=False, indent=1)
    if antes.strip() == depois.strip():
        print(f'catalogo ja estava em dia: {len(fichas)} objeto(s)')
        return 0
    open(destino, 'w', encoding='utf-8').write(depois)
    print(f'catalogo montado: {len(fichas)} objeto(s)')
    for o in fichas:
        print(f'  {o["categoria"]:12} {o["nome"]}  ({len(o["vistas"])} vista(s))')
    return 0


if __name__ == '__main__':
    sys.exit(main())
