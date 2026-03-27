// ============================================================================
// MICM-INTEL v1.0 — Servicio de Estaciones
// ============================================================================
const db = require('../db');
const cache = require('../utils/cache');

/**
 * Todas las estaciones activas como GeoJSON para Mapbox.
 */
async function getAll() {
  const cached = cache.get('estaciones_all');
  if (cached) return cached;

  const sql = `
    WITH ultimas_anomalias AS (
      SELECT DISTINCT ON (estacion_id)
        estacion_id, nivel_alerta, score_compuesto, perfil_fraude, z_score_ajustado_fisico
      FROM fact_anomalias_volumen
      ORDER BY estacion_id, anio DESC, semana_iso DESC
    )
    SELECT
      e.estacion_id, e.nombre_establecimiento, e.tipo_actor, e.tipo_combustible,
      e.provincia, e.municipio, e.region, e.es_zona_fronteriza,
      e.lat, e.lon, e.propietario_nombre, e.rnc_propietario,
      e.capacidad_galones_declarada, e.estado_licencia,
      COALESCE(a.nivel_alerta, 0) as nivel_alerta,
      a.score_compuesto, a.perfil_fraude, a.z_score_ajustado_fisico
    FROM dim_estacion e
    LEFT JOIN ultimas_anomalias a ON a.estacion_id = e.estacion_id
    WHERE e.activo = true AND e.lat IS NOT NULL AND e.lon IS NOT NULL
    ORDER BY COALESCE(a.nivel_alerta, 0) DESC
  `;
  const result = await db.query(sql);
  const geojson = toGeoJSON(result.rows);
  cache.set('estaciones_all', geojson, 300); // 5 minutes TTL
  return geojson;
}

/**
 * Detalle completo de una estación: datos base + balance + anomalía + ruta + evaporación.
 */
async function getById(estacionId) {
  const [base, balance, anomalia, ruta, evaporacion, alertas] = await Promise.all([
    // Datos base
    db.query(`SELECT * FROM dim_estacion WHERE estacion_id = $1`, [estacionId]),
    // Balance físico más reciente
    db.query(`
      SELECT * FROM fact_balance_fisico
      WHERE estacion_id = $1
      ORDER BY anio DESC, semana_iso DESC LIMIT 5
    `, [estacionId]),
    // Anomalía más reciente
    db.query(`
      SELECT * FROM fact_anomalias_volumen
      WHERE estacion_id = $1
      ORDER BY anio DESC, semana_iso DESC LIMIT 5
    `, [estacionId]),
    // Ruta de distribución
    db.query(`
      SELECT * FROM dim_ruta_distribucion
      WHERE estacion_id = $1 AND activo = true LIMIT 1
    `, [estacionId]),
    // Evaporación por mes
    db.query(`
      SELECT * FROM fact_ruta_evaporacion
      WHERE estacion_id = $1
      ORDER BY mes DESC LIMIT 12
    `, [estacionId]),
    // Alertas activas
    db.query(`
      SELECT * FROM fact_alertas_operativas
      WHERE estacion_id = $1 AND estado_alerta != 'DESCARTADA'
      ORDER BY nivel_alerta DESC LIMIT 10
    `, [estacionId]),
  ]);

  if (base.rows.length === 0) return null;

  return {
    estacion: base.rows[0],
    balance: balance.rows,
    anomalias: anomalia.rows,
    ruta: ruta.rows[0] || null,
    evaporacion: evaporacion.rows,
    alertas: alertas.rows,
  };
}

/**
 * Convierte estaciones a GeoJSON.
 */
function toGeoJSON(estaciones) {
  return {
    type: 'FeatureCollection',
    features: estaciones.map(e => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(e.lon), parseFloat(e.lat)] },
      properties: {
        estacion_id: e.estacion_id,
        nombre: e.nombre_establecimiento,
        tipo: e.tipo_actor,
        provincia: e.provincia,
        municipio: e.municipio,
        fronteriza: e.es_zona_fronteriza,
        capacidad: parseFloat(e.capacidad_galones_declarada || 0),
        licencia: e.estado_licencia,
        nivel_alerta: e.nivel_alerta,
        score: parseFloat(e.score_compuesto || 0),
        perfil: e.perfil_fraude,
        z_score: parseFloat(e.z_score_ajustado_fisico || 0),
        propietario: e.propietario_nombre,
      },
    })),
  };
}

module.exports = { getAll, getById, toGeoJSON };
