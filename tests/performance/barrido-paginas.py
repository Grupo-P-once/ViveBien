"""Barrido de SOLO LECTURA de todas las páginas del inventario contra un BASE (3 GET por página, mediana de tiempo y tamaño).
Uso: python barrido-paginas.py <inv.json> <BASE> <salida.json>   (en producción es un smoke controlado: ~130 GET en total)"""
import json
import re
import sys
import time
import urllib.error
import urllib.request

inv = json.load(open(sys.argv[1], encoding='utf8'))
BASE = sys.argv[2].rstrip('/')
MUESTRAS = {'[id]': 'tzula-castillos', '[uid]': 'qa-sin-uid', '[categoria]': 'buscar-propiedades', '[articulo]': 'como-buscar-una-propiedad'}


class Sin(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


op = urllib.request.build_opener(Sin)
res = []
for r in inv:
    if r['tipo'] != 'PAGINA':
        continue
    ruta = r['ruta']
    for k, v in MUESTRAS.items():
        ruta = ruta.replace(k, v)
    tiempos, estado, tam, loc = [], 0, 0, None
    for _ in range(3):
        t0 = time.time()
        try:
            with op.open(urllib.request.Request(BASE + ruta, headers={'user-agent': 'vivebien-barrido/1'}), timeout=40) as x:
                cuerpo = x.read(); estado = x.status
        except urllib.error.HTTPError as e:
            cuerpo = e.read(); estado = e.code; loc = e.headers.get('location')
        except Exception as e:  # noqa: BLE001
            cuerpo = b''; estado = 0
        tiempos.append((time.time() - t0) * 1000); tam = len(cuerpo)
    tiempos.sort()
    res.append(dict(ruta=r['ruta'], probada=ruta, estado=estado, ms=round(tiempos[1]), bytes=tam, location=loc))
    print(estado, round(tiempos[1]), tam, ruta)
json.dump(res, open(sys.argv[3], 'w', encoding='utf8'), indent=1, ensure_ascii=False)
