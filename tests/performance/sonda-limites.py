"""Ráfagas con carga ÚTIL válida contra la app AISLADA (localhost; escrituras descartadas por la réplica) para comprobar el límite de peticiones por origen.
Datos ficticios [QA]. Uso: python sonda-limites.py <salida.json>"""
import json
import sys
import urllib.error
import urllib.request

BASE = 'http://localhost:3140'
if 'localhost' not in BASE:
    sys.exit('solo localhost')


def post(ruta, cuerpo):
    req = urllib.request.Request(BASE + ruta, data=json.dumps(cuerpo).encode(), method='POST', headers={'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read(300).decode('utf8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, e.read(300).decode('utf8', 'replace')


res = {}
casos = {
    'eventos (tope 300 / 10 min)': ('/api/eventos', {'nombre': 'property_view', 'propiedadId': 'tzula-castillos', 'sesion': 'qa-sonda'}, 330),
    'registro-lead (tope 6 / hora)': ('/api/registro-lead', {'nombre': '[QA] Prueba', 'telefono': '4771234567', 'consentimiento': True, 'origen': 'contacto', 'mensaje': '[QA] sonda de límites'}, 10),
    'ayuda/feedback (sin tope declarado)': ('/api/ayuda/feedback', {'articuloId': 'qa-sonda', 'util': True, 'comentario': '[QA]'}, 400),
}
for nombre, (ruta, cuerpo, n) in casos.items():
    cods = {}
    primero429 = None
    for i in range(1, n + 1):
        st, _ = post(ruta, cuerpo)
        cods[st] = cods.get(st, 0) + 1
        if st == 429 and primero429 is None:
            primero429 = i
    res[nombre] = {'peticiones': n, 'codigos': cods, 'primer_429_en': primero429}
    print(nombre, json.dumps(res[nombre]))
json.dump(res, open(sys.argv[1], 'w', encoding='utf8'), indent=1, ensure_ascii=False)
