// ============================================================================
// MICM-INTEL v1.0 — Chat AI Route (OpenAI) + Map Actions
// ============================================================================
const { Router } = require('express');
const OpenAI = require('openai');

const db = require('../db');

const router = Router();

// Initialize OpenAI client
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Province coordinates (center points for flyTo) ──────────────────────────
const PROVINCE_COORDS = {
  'DISTRITO NACIONAL': { lat: 18.486, lng: -69.931 },
  'SANTO DOMINGO': { lat: 18.504, lng: -69.852 },
  'SANTIAGO': { lat: 19.450, lng: -70.697 },
  'LA VEGA': { lat: 19.222, lng: -70.529 },
  'SAN CRISTÓBAL': { lat: 18.416, lng: -70.106 },
  'DUARTE': { lat: 19.349, lng: -70.032 },
  'PUERTO PLATA': { lat: 19.793, lng: -70.694 },
  'SAN PEDRO DE MACORÍS': { lat: 18.462, lng: -69.308 },
  'LA ROMANA': { lat: 18.427, lng: -68.972 },
  'LA ALTAGRACIA': { lat: 18.617, lng: -68.708 },
  'ESPAILLAT': { lat: 19.627, lng: -70.278 },
  'PERAVIA': { lat: 18.280, lng: -70.332 },
  'SAN JUAN': { lat: 18.806, lng: -71.229 },
  'AZUA': { lat: 18.453, lng: -70.729 },
  'MONSEÑOR NOUEL': { lat: 18.922, lng: -70.382 },
  'BARAHONA': { lat: 18.208, lng: -71.100 },
  'MONTE PLATA': { lat: 18.807, lng: -69.784 },
  'VALVERDE': { lat: 19.588, lng: -71.083 },
  'HERMANAS MIRABAL': { lat: 19.384, lng: -70.158 },
  'MARÍA TRINIDAD SÁNCHEZ': { lat: 19.384, lng: -69.847 },
  'SAMANÁ': { lat: 19.206, lng: -69.337 },
  'SÁNCHEZ RAMÍREZ': { lat: 19.058, lng: -70.150 },
  'HATO MAYOR': { lat: 18.762, lng: -69.256 },
  'EL SEIBO': { lat: 18.766, lng: -69.039 },
  'MONTECRISTI': { lat: 19.851, lng: -71.650 },
  'BAHORUCO': { lat: 18.486, lng: -71.418 },
  'INDEPENDENCIA': { lat: 18.499, lng: -71.680 },
  'SANTIAGO RODRÍGUEZ': { lat: 19.471, lng: -71.340 },
  'DAJABÓN': { lat: 19.549, lng: -71.708 },
  'PEDERNALES': { lat: 18.036, lng: -71.744 },
  'ELÍAS PIÑA': { lat: 18.876, lng: -71.700 },
  'SAN JOSÉ DE OCOA': { lat: 18.546, lng: -70.508 },
};

// ── System context builder ──────────────────────────────────────────────────
async function buildSystemContext() {
  const parts = [];

  parts.push(`Eres el analista de inteligencia del sistema MICM-INTEL, el Sistema Nacional de Inteligencia de Combustibles de la República Dominicana.

REGLAS:
- Responde SIEMPRE en español. Sé breve, preciso y profesional.
- Usa datos concretos cuando estén disponibles.
- Cuando sea relevante, ofrece "Puntos de observación" con insights.

FUNCIONALIDAD DE MAPA:
Puedes controlar el mapa del dashboard mediante acciones. SIEMPRE que el usuario mencione una provincia, ciudad, estación, ruta o pida ver alertas, debes incluir acciones en tu respuesta.

Tu respuesta debe ser SIEMPRE un JSON válido con esta estructura:
{
  "reply": "Tu respuesta en texto con **markdown** para negritas y listas",
  "actions": [
    { "type": "filter_province", "province": "SANTIAGO" },
    { "type": "fly_to", "lat": 19.45, "lng": -70.69, "zoom": 10 },
    { "type": "filter_alerts", "levels": [3] },
    { "type": "filter_route", "route": "Nombre de Ruta" },
    { "type": "show_station", "station_id": "EST-0001" },
    { "type": "filter_region", "region": "NORTE (CIBAO)" },
    { "type": "reset_filters" }
  ]
}

TIPOS DE ACCIONES DISPONIBLES:
- "filter_province": Filtra todo el mapa por provincia. province debe ser EXACTO en mayúsculas.
- "fly_to": Mueve el mapa a coordenadas específicas con un zoom.
- "filter_alerts": Muestra solo alertas de ciertos niveles (1, 2, o 3).
- "filter_route": Filtra por nombre de ruta de distribución.
- "show_station": Muestra y vuela a una estación específica por ID.
- "filter_region": Filtra por macro-región. Valores válidos: "NORTE (CIBAO)", "SUROESTE", "SURESTE".
- "reset_filters": Limpia todos los filtros y regresa a la vista general.

COORDENADAS DE PROVINCIAS (para fly_to):
${Object.entries(PROVINCE_COORDS).map(([k, v]) => `${k}: lat=${v.lat}, lng=${v.lng}`).join('\n')}

REGIONES:
- NORTE (CIBAO): Santiago, La Vega, Puerto Plata, Duarte, Espaillat, Valverde, Montecristi, Samaná, etc.
- SUROESTE: San Juan, Barahona, Azua, Independencia, Pedernales, Bahoruco, etc.
- SURESTE: Santo Domingo, Distrito Nacional, San Cristóbal, La Romana, San Pedro de Macorís, etc.

IMPORTANTE:
- Si el usuario dice "muéstrame X" o "quiero ver X" o "llévame a X", SIEMPRE incluye acciones.
- Si el usuario pregunta datos sin pedir ver el mapa, puedes omitir actions o dejar el array vacío.
- El campo "reply" siempre debe existir con tu respuesta de texto.
- Responde SOLO con JSON válido, sin markdown de código alrededor.`);

  try {
    // 1. Station summary
    const stationsRes = await db.query(`
      SELECT tipo_actor, COUNT(*)::int AS total,
             ROUND(AVG(capacidad_galones_declarada::numeric))::int AS cap_prom
      FROM dim_estacion WHERE activo = true
      GROUP BY tipo_actor ORDER BY total DESC
    `);
    if (stationsRes.rows.length > 0) {
      const totalStations = stationsRes.rows.reduce((s, r) => s + r.total, 0);
      parts.push(`\n## ESTACIONES (${totalStations} activas):\n` +
        stationsRes.rows.map(r => `- ${r.tipo_actor}: ${r.total} (cap. promedio: ${r.cap_prom || 0} gal)`).join('\n'));
    }

    // 2. Province distribution
    const provRes = await db.query(`
      SELECT provincia, COUNT(*)::int AS total
      FROM dim_estacion WHERE activo = true AND provincia IS NOT NULL
      GROUP BY provincia ORDER BY total DESC LIMIT 15
    `);
    if (provRes.rows.length > 0) {
      parts.push(`\n## PROVINCIAS POR ESTACIONES:\n` +
        provRes.rows.map(r => `- ${r.provincia}: ${r.total}`).join('\n'));
    }

    // 3. Alert summary
    const alertRes = await db.query(`
      SELECT nivel_alerta, perfil_fraude, estado_alerta, COUNT(*)::int AS total
      FROM fact_alertas_operativas
      WHERE estado_alerta != 'DESCARTADA'
      GROUP BY nivel_alerta, perfil_fraude, estado_alerta
      ORDER BY nivel_alerta DESC
    `);
    if (alertRes.rows.length > 0) {
      const totalAlerts = alertRes.rows.reduce((s, r) => s + r.total, 0);
      const byLevel = {};
      const byProfile = {};
      alertRes.rows.forEach(r => {
        byLevel[r.nivel_alerta] = (byLevel[r.nivel_alerta] || 0) + r.total;
        byProfile[r.perfil_fraude] = (byProfile[r.perfil_fraude] || 0) + r.total;
      });
      parts.push(`\n## ALERTAS OPERATIVAS (${totalAlerts} activas):`);
      parts.push(`Por nivel: ` + Object.entries(byLevel).map(([k, v]) => `N${k}=${v}`).join(', '));
      parts.push(`Por perfil: ` + Object.entries(byProfile).map(([k, v]) => `${k}=${v}`).join(', '));
    }

    // 4. Top alerting provinces
    const alertProvRes = await db.query(`
      SELECT e.provincia, COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE a.nivel_alerta = 3)::int AS criticas
      FROM fact_alertas_operativas a
      JOIN dim_estacion e ON e.estacion_id = a.estacion_id
      WHERE a.estado_alerta != 'DESCARTADA'
      GROUP BY e.provincia ORDER BY total DESC LIMIT 10
    `);
    if (alertProvRes.rows.length > 0) {
      parts.push(`\n## PROVINCIAS CON MÁS ALERTAS:\n` +
        alertProvRes.rows.map(r => `- ${r.provincia}: ${r.total} alertas (${r.criticas} críticas)`).join('\n'));
    }

    // 5. Route names (for filter_route)
    const rutaRes = await db.query(`
      SELECT DISTINCT ruta_principal_nombre
      FROM dim_ruta_distribucion WHERE activo = true AND ruta_principal_nombre IS NOT NULL
      ORDER BY ruta_principal_nombre LIMIT 20
    `);
    if (rutaRes.rows.length > 0) {
      parts.push(`\n## RUTAS DE DISTRIBUCIÓN DISPONIBLES:\n` +
        rutaRes.rows.map(r => `- ${r.ruta_principal_nombre}`).join('\n'));
    }

    // 6. Key metrics
    try {
      const subsidio = await db.query(`
        SELECT
          COALESCE(SUM(subsidio_semanal_total_rd), 0)::numeric AS subsidio_total,
          COALESCE(MAX(wti_usd_bbl), 0)::numeric AS wti,
          COALESCE(MAX(ircf_nacional), 0)::numeric AS ircf
        FROM fact_precios_semanales
        WHERE (anio, semana_iso) = (
          SELECT anio, semana_iso FROM fact_precios_semanales ORDER BY anio DESC, semana_iso DESC LIMIT 1
        )
      `);
      if (subsidio.rows[0]) {
        const s = subsidio.rows[0];
        parts.push(`\n## MÉTRICAS CLAVE:`);
        parts.push(`- Subsidio semanal: RD$ ${parseFloat(s.subsidio_total).toLocaleString()}`);
        parts.push(`- WTI: ${parseFloat(s.wti).toFixed(1)} USD/bbl`);
        parts.push(`- IRCF: ${parseFloat(s.ircf).toFixed(2)}`);
      }
    } catch (e) { /* ok */ }

    // 7. Border zone
    const frontRes = await db.query(`
      SELECT e.provincia, COUNT(*)::int AS estaciones_fronterizas
      FROM dim_estacion e
      WHERE e.es_zona_fronteriza = true AND e.activo = true
      GROUP BY e.provincia ORDER BY estaciones_fronterizas DESC
    `);
    if (frontRes.rows.length > 0) {
      const totalFront = frontRes.rows.reduce((s, r) => s + r.estaciones_fronterizas, 0);
      parts.push(`\n## ZONA FRONTERIZA (${totalFront} estaciones):\n` +
        frontRes.rows.map(r => `- ${r.provincia}: ${r.estaciones_fronterizas}`).join('\n'));
    }

    // 8. Sample station IDs (for show_station action)
    try {
      const sampleStations = await db.query(`
        SELECT estacion_id, nombre_establecimiento, provincia
        FROM dim_estacion WHERE activo = true
        ORDER BY RANDOM() LIMIT 10
      `);
      if (sampleStations.rows.length > 0) {
        parts.push(`\n## EJEMPLOS DE IDs DE ESTACIÓN (para show_station):\n` +
          sampleStations.rows.map(r => `- ${r.estacion_id}: ${r.nombre_establecimiento} (${r.provincia})`).join('\n'));
      }
    } catch (e) { /* ok */ }

  } catch (err) {
    console.error('[CHAT] Error building context:', err.message);
    parts.push('\n[Nota: algunos datos no pudieron cargarse]');
  }

  return parts.join('\n');
}

// ── POST /api/chat ──────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ status: 'error', error: 'Mensaje requerido' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ status: 'error', error: 'OPENAI_API_KEY no configurada' });
    }

    const systemContext = await buildSystemContext();

    const messages = [
      { role: 'system', content: systemContext },
      ...history.slice(-20).map(h => ({
        role: h.role,
        content: h.content,
      })),
      { role: 'user', content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 1024,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0]?.message?.content || '{}';

    // Parse the JSON response
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // If it's not valid JSON, treat the whole thing as a reply
      parsed = { reply: raw, actions: [] };
    }

    const reply = parsed.reply || 'Sin respuesta del modelo.';
    const actions = Array.isArray(parsed.actions) ? parsed.actions : [];

    res.json({ status: 'ok', reply, actions });
  } catch (err) {
    console.error('[CHAT] Error:', err.message);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
