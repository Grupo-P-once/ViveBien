import json

file_path = 'workflow-vivebien-firebase.json'
with open(file_path, 'r', encoding='utf-8') as f:
    wf = json.load(f)

for node in wf['nodes']:
    if node['name'] == 'Filtrar y Preparar Contactos' and 'parameters' in node and 'jsCode' in node['parameters']:
        new_code = """// Obtener datos con fallback si algun nodo no ejecuto aun
let contactosResp = {}, leadsResp = {}, enviosResp = {};
try { contactosResp = $('Leer Contactos').first().json; } catch(e) {}
try { leadsResp = $('Leer Leads').first().json; } catch(e) {}
try { enviosResp = $('Leer Envios de Hoy').first().json; } catch(e) {}

function parseDoc(doc) {
  const f = doc.fields || {};
  return {
    nombre: f.nombre?.stringValue || 'Cliente',
    email: (f.email?.stringValue || '').toLowerCase().trim(),
    interes: (f.interes?.stringValue || f.propiedad?.stringValue || 'nave').toLowerCase()
  };
}

const todos = [
  ...(contactosResp.documents || []),
  ...(leadsResp.documents || [])
].map(parseDoc).filter(c => c.email);

// 1. ELIMINAR DUPLICADOS DEL DIA DE HOY EN LA LISTA
const clientesUnicos = {};
for (const c of todos) {
    if (!clientesUnicos[c.email]) {
        clientesUnicos[c.email] = c;
    }
}
const arrayUnicos = Object.values(clientesUnicos);

// 2. OBTENER EL HISTORIAL DE ENVIOS
const historiales = (enviosResp.documents || []).map(d => {
    const f = d.fields || {};
    return {
        email: (f.email?.stringValue || '').toLowerCase(),
        fecha: f.fecha?.stringValue || '',
        timestamp: new Date(f.timestamp?.stringValue || f.fecha?.stringValue || 0).getTime()
    };
}).filter(h => h.email);

// 3. BUSCAR LA FECHA DEL ULTIMO ENVIO POR PERSONA
const ultimoEnvioPorEmail = {};
for (const h of historiales) {
    if (!ultimoEnvioPorEmail[h.email] || ultimoEnvioPorEmail[h.email].timestamp < h.timestamp) {
        ultimoEnvioPorEmail[h.email] = h;
    }
}

// 4. CALCULAR LOS 2 DIAS
const unDiaMs = 24 * 60 * 60 * 1000;
const haceDosDiasMs = Date.now() - (1.9 * unDiaMs); // un poco menos de 48h para dar margen al Trigger

// 5. FILTRAR A QUIEN SE LE MANDA HOY
const pendientes = arrayUnicos.filter(c => {
  const ultimoEnvio = ultimoEnvioPorEmail[c.email];
  // Si nunca se le ha enviado, O si el ultimo envio fue hace mas de 2 dias
  if (!ultimoEnvio) return true;
  return ultimoEnvio.timestamp < haceDosDiasMs;
});

console.log(`Total unicos: ${arrayUnicos.length} | Pendientes (hace > 2 dias): ${pendientes.length}`);
return pendientes.map(c => ({ json: c }));"""
        node['parameters']['jsCode'] = new_code

    if node['name'] == 'Generar Email HTML' and 'parameters' in node and 'jsCode' in node['parameters']:
        new_code2 = """const BASE_URL = 'https://grupo-p-once.github.io/ViveBien';

let propsFirebase = [];
try {
  const resp = $('Leer Propiedades').first().json;
  if (resp && resp.documents) {
    propsFirebase = resp.documents.filter(d => {
      const state = d.fields?.estado?.stringValue;
      return state !== 'vendida' && state !== 'pausada';
    }).map(d => {
      const f = d.fields || {};
      const featuresArr = (f.features && f.features.arrayValue && f.features.arrayValue.values) ? f.features.arrayValue.values.map(v => v.stringValue) : [];
      let img = f.imagen?.stringValue || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&auto=format';
      if (!img.startsWith('http')) {
        if (!img.startsWith('/')) img = '/' + img;
        img = BASE_URL + img;
      }
      return {
        id: d.name.split('/').pop(),
        tipo: f.tipo?.stringValue || 'comercial',
        titulo: f.titulo?.stringValue || 'Propiedad',
        subtitulo: f.ubicacion?.stringValue || 'Leon, Gto.',
        precio: f.precio?.stringValue || 'A consultar',
        imagen: img,
        features: featuresArr,
        operacion: f.operacion?.stringValue || 'venta'
      };
    });
  }
} catch(e) {
  console.log('Error leyendo firebase props', e);
}

const fallbackProps = {
  nave: {
    badge: 'NAVE INDUSTRIAL', badgeColor: '#1B365D',
    titulo: 'Bodega en Renta • 1,244 m²', subtitulo: 'Blvd. San Juan Bosco, Leon',
    precio: '$118,180 MXN + IVA / mes', precioLabel: 'Renta mensual',
    features: ['1,244 m² totales', 'Oficinas en 3 niveles', 'Altura para maniobras', 'Acceso a Blvd. Hidalgo'],
    imagen: BASE_URL + '/3vive_bien_fotos/naves_industriales/nave_industrial_SanJuanBosco_Renta/foto1.jpg',
    enlace: BASE_URL + '/propiedades.html#naves'
  },
  terreno: {
    badge: 'TERRENO INDUSTRIAL', badgeColor: '#279546',
    titulo: 'Terreno Industrial Panan II', subtitulo: 'Cluster Panan II, Silao, Gto.',
    precio: 'Precio a consultar', precioLabel: 'Disponible',
    features: ['600 m² por lote', 'Seguridad 24/7', 'Acceso pavimentado', 'Uso industrial'],
    imagen: BASE_URL + '/3vive_bien_fotos/terrenos/terreno_panam_silao_venta/foto1.jpg',
    enlace: BASE_URL + '/propiedades.html#terrenos'
  },
  casa: {
    badge: 'RESIDENCIAL', badgeColor: '#8B1A1A',
    titulo: 'Casas Residenciales', subtitulo: 'Zonas exclusivas de Leon, Gto.',
    precio: 'Desde $1,800,000 MXN', precioLabel: 'Precio de venta',
    features: ['Acabados de lujo', 'Seguridad privada', 'Jardin y estacionamiento', 'Zonas premium'],
    imagen: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&auto=format',
    enlace: BASE_URL + '/propiedades.html#casas'
  },
  comercial: {
    badge: 'LOCAL COMERCIAL', badgeColor: '#D97706',
    titulo: 'Locales Comerciales', subtitulo: 'Zonas de alta afluencia, Leon, Gto.',
    precio: 'Precio a consultar', precioLabel: 'Disponible',
    features: ['Alta afluencia', 'Visibilidad garantizada', 'Ideal para franquicias', 'Excelente ubicacion'],
    imagen: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=600&auto=format',
    enlace: BASE_URL + '/propiedades.html#comerciales'
  }
};

const interes = ($json.interes || '').toLowerCase();
let tipoBusqueda = 'nave';
if (interes.includes('terreno')) tipoBusqueda = 'terreno';
else if (interes.includes('casa') || interes.includes('residencial') || interes.includes('depto')) tipoBusqueda = 'casa';
else if (interes.includes('comercial') || interes.includes('local')) tipoBusqueda = 'comercial';
else if (interes.includes('nave') || interes.includes('bodega') || interes.includes('industrial')) tipoBusqueda = 'nave';

let matchBaseProps = propsFirebase.filter(p => p.tipo === tipoBusqueda);
if (matchBaseProps.length === 0) {
    if (propsFirebase.length > 0) matchBaseProps = [propsFirebase[0]];
}
let prop1 = matchBaseProps[0];
let prop2 = matchBaseProps.length > 1 ? matchBaseProps[1] : null;

function parseToHTMLProp(matchBase) {
    if (!matchBase) return null;
    const opLabel = matchBase.operacion === 'renta' ? 'Renta mensual' : 'Precio de venta';
    let bColor = '#1B365D'; let bText = 'PROPIEDAD';
    if (matchBase.tipo === 'nave') { bColor = '#1B365D'; bText = 'NAVE INDUSTRIAL'; }
    else if (matchBase.tipo === 'casa') { bColor = '#8B1A1A'; bText = 'RESIDENCIAL'; }
    else if (matchBase.tipo === 'terreno') { bColor = '#279546'; bText = 'TERRENO'; }
    else if (matchBase.tipo === 'comercial') { bColor = '#D97706'; bText = 'LOCAL COMERCIAL'; }
    else if (matchBase.tipo === 'departamento') { bColor = '#8B1A1A'; bText = 'DEPARTAMENTO'; }
    
    return {
        badge: bText, badgeColor: bColor,
        titulo: matchBase.titulo, subtitulo: matchBase.subtitulo,
        precio: matchBase.precio, precioLabel: opLabel,
        features: matchBase.features.length ? matchBase.features.slice(0, 4) : ['Excelente oportunidad'],
        imagen: matchBase.imagen,
        enlace: BASE_URL + '/propiedades.html#' + (matchBase.tipo==='nave'?'naves':matchBase.tipo+'s')
    };
}

let primaryProp = parseToHTMLProp(prop1) || fallbackProps[tipoBusqueda] || fallbackProps.nave;
let secondaryProp = parseToHTMLProp(prop2); // Puede ser null

const nombre = $json.nombre || 'Cliente';
const asunto = `?? Vive Bien – Propiedades en tu radar: ${primaryProp.titulo}`;
const fecha = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

const featuresHTML1 = primaryProp.features.map(f => `
  <tr><td style="padding:5px 0">
    <span style="display:inline-flex;align-items:center;gap:8px;font-size:14px;color:#444">
      <span style="width:20px;height:20px;background:${primaryProp.badgeColor};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0">
        <span style="color:#fff;font-size:11px;font-weight:bold">?</span>
      </span>
      ${f}
    </span>
  </td></tr>`).join('');

let secondaryHTML = '';
if (secondaryProp) {
    let img2 = secondaryProp.imagen;
    secondaryHTML = `
    <!-- SECONDARY PROPERTY -->
    <tr><td style="background:#fff;padding:0 36px 32px">
      <h3 style="margin:0 0 16px;font-size:16px;color:#1B365D;font-family:Georgia,serif;border-top:1px solid #EAEFF4;padding-top:24px">Otra opcion que podria interesarte:</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;overflow:hidden">
        <tr>
          <td width="200" style="width:200px">
            <a href="${secondaryProp.enlace}" style="display:block">
              <img src="${img2}" width="200" height="150" style="object-fit:cover;display:block" />
            </a>
          </td>
          <td style="padding:16px">
             <span style="background:${secondaryProp.badgeColor};color:#fff;font-family:Arial,sans-serif;font-size:9px;font-weight:800;letter-spacing:1px;padding:3px 8px;border-radius:4px">${secondaryProp.badge}</span>
             <h4 style="margin:8px 0 4px;font-size:14px;color:#1B365D;font-family:Georgia,serif">${secondaryProp.titulo}</h4>
             <p style="margin:0 0 8px;font-size:11px;color:#666;font-family:Arial,sans-serif">${secondaryProp.subtitulo}</p>
             <p style="margin:0;font-size:15px;color:#8B1A1A;font-weight:800;font-family:Arial,sans-serif">${secondaryProp.precio}</p>
             <a href="${secondaryProp.enlace}" style="display:inline-block;margin-top:10px;font-size:12px;color:#1B365D;font-weight:bold;text-decoration:none">Ver detalles &rarr;</a>
          </td>
        </tr>
      </table>
    </td></tr>`;
}

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${asunto}</title>
</head>
<body style="margin:0;padding:0;background:#EAEFF4;font-family:Georgia,serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#EAEFF4">
<tr><td align="center" style="padding:30px 10px">
  <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
    <!-- TOP BAR -->
    <tr><td style="background:#8B1A1A;padding:10px 30px;border-radius:10px 10px 0 0">
      <table width="100%"><tr>
        <td style="color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1px">VIVE BIEN</td>
        <td align="right" style="color:rgba(255,255,255,.7);font-family:Arial,sans-serif;font-size:11px">${fecha}</td>
      </tr></table>
    </td></tr>
    <!-- HERO BANNER -->
    <tr><td style="position:relative;padding:0">
      <a href="${primaryProp.enlace}" style="display:block;text-decoration:none">
        <img src="${primaryProp.imagen}" width="600" style="width:100%;max-width:600px;height:260px;object-fit:cover;display:block" alt="${primaryProp.titulo}">
        <div style="position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(to bottom,rgba(0,0,0,.05) 0%,rgba(0,0,0,.55) 100%)"></div>
        <div style="position:absolute;bottom:24px;left:28px;right:28px">
          <span style="background:${primaryProp.badgeColor};color:#fff;font-family:Arial,sans-serif;font-size:10px;font-weight:800;letter-spacing:2px;padding:5px 12px;border-radius:4px">${primaryProp.badge}</span>
          <h1 style="margin:10px 0 4px;color:#fff;font-size:24px;font-family:Georgia,serif;text-shadow:0 2px 8px rgba(0,0,0,.4)">${primaryProp.titulo}</h1>
          <p style="margin:0;color:rgba(255,255,255,.9);font-family:Arial,sans-serif;font-size:13px">?? ${primaryProp.subtitulo}</p>
        </div>
      </a>
    </td></tr>
    <!-- MAIN CONTENT -->
    <tr><td style="background:#fff;padding:32px 36px">
      <!-- Saludo -->
      <p style="margin:0 0 6px;font-size:18px;color:#1B365D;font-family:Georgia,serif">Hola, <strong>${nombre}</strong></p>
      <p style="margin:0 0 24px;font-size:14px;color:#666;font-family:Arial,sans-serif;line-height:1.6">Encontramos estas recomendaciones basadas en tu interes. El inventario vuela, no te quedes sin opciones.</p>
      <!-- Precio box -->
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#8B1A1A,#1B365D);border-radius:10px;margin-bottom:24px">
        <tr><td style="padding:18px 24px">
          <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:1px">${primaryProp.precioLabel}</p>
          <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:26px;font-weight:800;color:#fff">${primaryProp.precio}</p>
        </td></tr>
      </table>
      <!-- Features -->
      <p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:13px;font-weight:700;color:#1B365D;text-transform:uppercase;letter-spacing:.5px">Caracteristicas Principal</p>
      <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
        ${featuresHTML1}
      </table>
      <!-- CTA -->
      <table width="100%"><tr><td align="center">
        <a href="${primaryProp.enlace}"
           style="display:inline-block;background:linear-gradient(135deg,#8B1A1A,#C0392B);color:#fff;font-family:Arial,sans-serif;font-size:16px;font-weight:700;padding:16px 48px;border-radius:50px;text-decoration:none;box-shadow:0 4px 16px rgba(139,26,26,.35);letter-spacing:.5px">
          Ver Propiedad Principal &rarr;
        </a>
      </td></tr></table>
    </td></tr>

    ${secondaryHTML}

    <!-- WHATSAPP BAR -->
    <tr><td style="background:#F0F4F8;padding:18px 36px;border-top:1px solid #E2E8F0">
      <table width="100%"><tr>
        <td style="font-family:Arial,sans-serif;font-size:13px;color:#555">Quieres mas informacion o agendar visita?</td>
        <td align="right">
          <a href="https://wa.me/524778116501" style="display:inline-flex;align-items:center;gap:6px;background:#25D366;color:#fff;font-family:Arial,sans-serif;font-size:13px;font-weight:700;padding:8px 16px;border-radius:20px;text-decoration:none">
            &#128241; WhatsApp
          </a>
        </td>
      </tr></table>
    </td></tr>
    <!-- FOOTER -->
    <tr><td style="background:#1B365D;padding:20px 36px;border-radius:0 0 10px 10px;text-align:center">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:rgba(255,255,255,.6)">Vive Bien Grupo Inmobiliario &bull; Leon, Guanajuato, Mexico</p>
      <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:11px;color:rgba(255,255,255,.4)">Recibiste este correo porque te registraste en nuestro sitio web.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;

const firebasePayload = JSON.stringify({
  fields: {
    email: { stringValue: $json.email },
    nombre: { stringValue: nombre },
    asunto: { stringValue: asunto },
    fecha: { stringValue: new Date().toISOString().slice(0, 10) },
    timestamp: { stringValue: new Date().toISOString() }
  }
});

return { json: { email: $json.email, nombre, asunto, emailHtml: html, firebasePayload } };"""
        node['parameters']['jsCode'] = new_code2

with open(file_path, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print('Nuevos nodos insertados correctamente')
