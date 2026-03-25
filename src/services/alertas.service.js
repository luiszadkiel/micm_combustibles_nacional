// ============================================================================
// MICM-INTEL v1.0 — Servicio de Alertas Operativas
// ============================================================================
const db = require('../db');

/**
 * Alertas filtradas desde fact_alertas_operativas + dim_estacion.
 * Todos los filtros son opcionales — filter layer traduce a SQL parametrizado.
 */
async function getAlertas({ nivel, perfil, provincia, producto, estado, frontera } = {}) {
  const conditions = [`a.estado_alerta != 'DESCARTADA'`];
  const params = [];
  let idx = 1;

  if (perfil) {
    conditions.push(`a.perfil_fraude = $${idx++}`);
    params.push(perfil);
  }
  if (nivel) {
    conditions.push(`a.nivel_alerta >= $${idx++}`);
    params.push(parseInt(nivel));
  }
  if (provincia) {
    conditions.push(`e.provincia = $${idx++}`);
    params.push(provincia);
  }
  if (producto) {
    conditions.push(`a.producto_id = $${idx++}`);
    params.push(producto);
  }
  if (estado) {
    conditions.push(`a.estado_alerta = $${idx++}`);
    params.push(estado);
  }
  if (frontera === 'true' || frontera === true) {
    conditions.push(`e.es_zona_fronteriza = true`);
  }

  const sql = `
    SELECT
      a.alerta_id,
      a.timestamp_generacion,
      a.nivel_alerta,
      a.perfil_fraude,
      a.estacion_id,
      a.score_compuesto,
      a.z_score_volumen,
      a.ibf_valor,
      a.ircf_valor,
      a.desviacion_fisica_gal,
      a.pct_shrinkage,
      a.score_red,
      a.score_horario,
      a.score_permiso,
      a.descripcion_alerta,
      a.destinatario,
      a.accion_recomendada,
      a.estado_alerta,
      a.fue_confirmada,
      e.nombre_establecimiento,
      e.lat,
      e.lon,
      e.provincia,
      e.municipio,
      e.es_zona_fronteriza
    FROM fact_alertas_operativas a
    JOIN dim_estacion e ON e.estacion_id = a.estacion_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY a.nivel_alerta DESC, a.score_compuesto DESC
    LIMIT 500
  `;

  const result = await db.query(sql, params);
  return result.rows;
}

/**
 * Resumen de alertas por nivel y perfil.
 */
async function getAlertasSummary() {
  const sql = `
    SELECT
      nivel_alerta,
      perfil_fraude,
      COUNT(*)::int as total,
      ROUND(AVG(score_compuesto), 3) as score_promedio
    FROM fact_alertas_operativas
    WHERE estado_alerta != 'DESCARTADA'
    GROUP BY nivel_alerta, perfil_fraude
    ORDER BY nivel_alerta DESC
  `;
  return (await db.query(sql)).rows;
}

/**
 * Convierte alertas a GeoJSON para Mapbox.
 */
function toGeoJSON(alertas) {
  return {
    type: 'FeatureCollection',
    features: alertas.filter(a => a.lat && a.lon).map(a => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(a.lon), parseFloat(a.lat)] },
      properties: {
        alerta_id: a.alerta_id,
        nivel_alerta: a.nivel_alerta,
        perfil_fraude: a.perfil_fraude,
        score_compuesto: parseFloat(a.score_compuesto),
        estacion_id: a.estacion_id,
        nombre: a.nombre_establecimiento,
        provincia: a.provincia,
        estado_alerta: a.estado_alerta,
        descripcion: a.descripcion_alerta,
        destinatario: a.destinatario,
      },
    })),
  };
}

module.exports = { getAlertas, getAlertasSummary, toGeoJSON };
