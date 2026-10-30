"""Resume un --summary-export de k6: global y por endpoint (p50/p90/p95/p99/max, RPS, tasa de error). Uso: python resumir.py reports/x.json [salida.md]"""
import json
import sys

d = json.load(open(sys.argv[1], encoding='utf8'))
m = d['metrics']
dur = m.get('http_req_duration', {})
reqs = m.get('http_reqs', {})
fail = m.get('http_req_failed', {})
chk = m.get('checks', {})
vus = m.get('vus_max', {})
tiempo = (reqs.get('count', 0) / reqs['rate'] * 1000) if reqs.get('rate') else 0


def fila(nombre, v):
    return '| %s | %.0f | %.0f | %.0f | %.0f | %.0f |' % (nombre, v.get('med', 0), v.get('p(90)', 0), v.get('p(95)', 0), v.get('p(99)', 0), v.get('max', 0))


out = []
out.append('Archivo: %s | duración %.0f s | VUs máx %s | peticiones %s | RPS %.1f | error http %.2f %% | checks ok %.2f %%' % (
    sys.argv[1].split('/')[-1], tiempo / 1000, vus.get('value'), reqs.get('count'), reqs.get('rate', 0), 100 * fail.get('value', fail.get('rate', 0)), 100 * chk.get('value', 0)))
out.append('')
out.append('| endpoint | p50 ms | p90 | p95 | p99 | max |')
out.append('|---|---|---|---|---|---|')
out.append(fila('GLOBAL', dur))
for k in sorted(m):
    if k.startswith('http_req_duration{name:'):
        out.append(fila(k[len('http_req_duration{name:'):-1], m[k]))
        continue
    if k.startswith('http_req_duration{fase:'):
        out.append(fila('(sonda) ' + k[len('http_req_duration{'):-1], m[k]))
texto = '\n'.join(out)
print(texto)
if len(sys.argv) > 2:
    open(sys.argv[2], 'w', encoding='utf8').write(texto + '\n')
