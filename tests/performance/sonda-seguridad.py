"""Sonda de seguridad SIN SESIÓN contra la app AISLADA (localhost:3140 + Supabase de réplica: las escrituras se descartan). D-62.
Recorre TODAS las rutas /api/* con cada método declarado, más abuso básico (cuerpos malformados, XSS/inyección en parámetros, cabeceras).
Nunca se apunta a producción: este script se niega si BASE no es localhost.  Uso: python sonda-seguridad.py <inv.json> <salida.json>"""
import json
import re
import sys
import urllib.error
import urllib.request

BASE = 'http://localhost:3140'
if not BASE.startswith('http://localhost'):
    sys.exit('Solo localhost')
inv = json.load(open(sys.argv[1], encoding='utf8'))


class Sin(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


op = urllib.request.build_opener(Sin)


def pedir(metodo, ruta, cuerpo=None, cab=None, crudo=None):
    data = crudo if crudo is not None else (json.dumps(cuerpo).encode() if cuerpo is not None else None)
    h = {'content-type': 'application/json', 'user-agent': 'sonda-seguridad/1'}
    h.update(cab or {})
    try:
        with op.open(urllib.request.Request(BASE + ruta, data=data, method=metodo, headers=h), timeout=30) as r:
            return r.status, r.read(20000).decode('utf8', 'replace'), dict((k.lower(), v) for k, v in r.headers.items())
    except urllib.error.HTTPError as e:
        # El servidor puede cortar el cuerpo de un error a medias (28-oct-2026): se registra el estado y se sigue, la sonda no se cae.
        try:
            cuerpo = e.read(20000).decode('utf8', 'replace')
        except Exception as e2:  # noqa: BLE001
            cuerpo = '[cuerpo cortado: %s]' % type(e2).__name__
        return e.code, cuerpo, dict((k.lower(), v) for k, v in e.headers.items())
    except Exception as e:  # noqa: BLE001
        return 0, str(e), {}


def concreta(ruta):
    return re.sub(r'\[[^\]]+\]', 'prueba-qa', ruta)


res = {'rutas': [], 'abuso': [], 'cabeceras': {}}
for r in inv:
    if r['tipo'] != 'API':
        continue
    for m in r['metodos']:
        ruta = concreta(r['ruta'])
        cuerpo = {} if m in ('POST', 'PATCH', 'PUT', 'DELETE') else None
        st, b, h = pedir(m, ruta, cuerpo)
        protegida = bool(r['guardas'])
        verboso = bool(re.search(r'(at\s+\S+\s+\(|node_modules|stack|ECONN|supabase\.co|SUPABASE_|eyJ[A-Za-z0-9_-]{20,})', b))
        res['rutas'].append(dict(ruta=r['ruta'], metodo=m, estado=st, guardas=r['guardas'], protegida=protegida, ms_cache=h.get('cache-control'), verboso=verboso, cuerpo=b[:140]))

# abuso básico
def caso(nombre, st, b, esperado):
    ok = esperado(st)
    res['abuso'].append(dict(nombre=nombre, estado=st, ok=ok, cuerpo=b[:160]))
    return ok


for nombre, m, ruta, kw in [
    ('JSON malformado en /api/contacto', 'POST', '/api/contacto', dict(crudo=b'{"a":')),
    ('cuerpo gigante (1 MB) en /api/contacto', 'POST', '/api/contacto', dict(crudo=b'{"mensaje":"' + b'A' * 1_000_000 + b'"}')),
    ('JSON malformado en /api/eventos', 'POST', '/api/eventos', dict(crudo=b'not json')),
    ('JSON malformado en /api/registro-lead', 'POST', '/api/registro-lead', dict(crudo=b'[[[')),
    ('JSON malformado en /api/ayuda/feedback', 'POST', '/api/ayuda/feedback', dict(crudo=b'{')),
    ('webhook Telegram sin secreto', 'POST', '/api/telegram/webhook', dict(cuerpo={'message': {'text': 'hola', 'chat': {'id': 1}}})),
    ('webhook WhatsApp sin firma', 'POST', '/api/whatsapp/webhook', dict(cuerpo={'entry': []})),
]:
    st, b, h = pedir(m, ruta, **kw)
    caso(nombre, st, b, lambda s: s != 0 and s < 500)

for nombre, ruta in [
    ('XSS en ficha', '/propiedades/%3Cscript%3Ealert(1)%3C%2Fscript%3E'),
    ('traversal en ficha', '/propiedades/..%2f..%2f..%2fetc%2fpasswd'),
    ('inyección SQL en ficha', "/propiedades/x'%20OR%20'1'='1"),
    ('búsqueda de ayuda con XSS', '/api/ayuda/buscar?q=%3Cscript%3E%22%27'),
    ('búsqueda de ayuda con SQL', "/api/ayuda/buscar?q=';DROP TABLE x;--".replace(' ', '%20')),
    ('búsqueda de ayuda enorme', '/api/ayuda/buscar?q=' + 'a' * 20000),
    ('segmento de ayuda inexistente', '/ayuda/no-existe/nada'),
]:
    st, b, h = pedir('GET', ruta)
    reflejo = '<script>alert(1)</script>' in b
    ok = (st != 0 and st < 500) and not reflejo
    res['abuso'].append(dict(nombre=nombre, estado=st, ok=ok, reflejo_sin_escapar=reflejo, cuerpo=b[:100]))

# límite de peticiones (en memoria): ¿responde 429 tras ráfaga?
cods = []
for i in range(60):
    st, b, h = pedir('POST', '/api/eventos', {'tipo': 'vista', 'propiedad_id': 'tzula-castillos'})
    cods.append(st)
res['abuso'].append(dict(nombre='ráfaga 60 POST /api/eventos (anónimo): ¿hay 429?', estado=sorted(set(cods)), ok=429 in cods, cuerpo=''))
cods = []
for i in range(40):
    st, b, h = pedir('POST', '/api/ayuda/feedback', {'articulo': 'x', 'util': True})
    cods.append(st)
res['abuso'].append(dict(nombre='ráfaga 40 POST /api/ayuda/feedback (anónimo): ¿hay 429?', estado=sorted(set(cods)), ok=429 in cods, cuerpo=''))

# cabeceras
st, b, h = pedir('GET', '/propiedades')
res['cabeceras'] = {k: h.get(k) for k in ('strict-transport-security', 'x-content-type-options', 'x-frame-options', 'referrer-policy', 'permissions-policy', 'content-security-policy', 'content-security-policy-report-only', 'x-powered-by', 'server')}
st, b, h = pedir('GET', '/api/usuarios/me')
res['cabeceras']['usuarios_me_cache_control'] = h.get('cache-control')

json.dump(res, open(sys.argv[2], 'w', encoding='utf8'), indent=1, ensure_ascii=False)
rs = res['rutas']
print('rutas/métodos probados:', len(rs))
print('5xx (fallo del servidor sin sesión):', [(x['metodo'], x['ruta'], x['estado']) for x in rs if x['estado'] >= 500 or x['estado'] == 0])
print('protegidas que NO respondieron 401/403/405:', [(x['metodo'], x['ruta'], x['estado']) for x in rs if x['protegida'] and x['estado'] not in (401, 403, 405)])
print('con detalle verboso:', [(x['metodo'], x['ruta']) for x in rs if x['verboso']])
print('abuso fallido:', [(x['nombre'], x['estado']) for x in res['abuso'] if not x['ok']])
print('cabeceras:', json.dumps(res['cabeceras'], ensure_ascii=False)[:600])
