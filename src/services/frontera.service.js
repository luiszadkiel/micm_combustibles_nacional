// ============================================================================
// MICM-INTEL v1.0 — Servicio de Riesgo Fronterizo
// ============================================================================
const db = require('../db');

/**
 * IRCF actual por provincia fronteriza con coordenadas para Mapbox.
 */
async function getFrontera() {
  const sql = `
    SELECT
      rf.riesgo_id, rf.semana_inicio, rf.anio, rf.semana_iso,
      rf.geo_id, rf.producto_id,
      rf.ircf, rf.ircf_slope_12sem, rf.exceso_pct,
      rf.vol_despachado_gal, rf.demanda_local_esperada_gal,
      rf.diferencial_rdgal, rf.nivel_riesgo,
      g.provincia, g.municipio, g.lat, g.lon, g.es_frontera_haiti
    FROM fact_riesgo_fronterizo rf
    JOIN dim_geografia g ON g.geo_id = rf.geo_id
    WHERE (rf.anio, rf.semana_iso) = (
      SELECT anio, semana_iso FROM fact_riesgo_fronterizo
      ORDER BY anio DESC, semana_iso DESC LIMIT 1
    )
    ORDER BY rf.ircf DESC
  `;
  return (await db.query(sql)).rows;
}

/**
 * Mapa de calor por municipio para heatmap layer.
 */
async function getMapaCalor() {
  const sql = `
    SELECT
      municipio, provincia, geo_id, lat, lon,
      es_frontera_haiti, estaciones,
      z_score_promedio, alertas_activas,
      ircf_promedio, escala_riesgo_1a5,
      pct_evap_promedio, temp_media_c
    FROM v_mapa_calor_municipio
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    ORDER BY escala_riesgo_1a5 DESC
  `;
  return (await db.query(sql)).rows;
}

/**
 * Frontera como GeoJSON points.
 */
function toGeoJSON(datos) {
  return {
    type: 'FeatureCollection',
    features: datos.filter(d => d.lat && d.lon).map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(d.lon), parseFloat(d.lat)] },
      properties: {
        provincia: d.provincia,
        ircf: parseFloat(d.ircf || 0),
        exceso_pct: parseFloat(d.exceso_pct || 0),
        nivel_riesgo: d.nivel_riesgo,
        slope: parseFloat(d.ircf_slope_12sem || 0),
        diferencial: parseFloat(d.diferencial_rdgal || 0),
      },
    })),
  };
}

/**
 * Mapa calor como GeoJSON con weight.
 */
function mapaCalorGeoJSON(datos) {
  return {
    type: 'FeatureCollection',
    features: datos.filter(d => d.lat && d.lon).map(d => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [parseFloat(d.lon), parseFloat(d.lat)] },
      properties: {
        municipio: d.municipio,
        provincia: d.provincia,
        escala: d.escala_riesgo_1a5,
        z_score: parseFloat(d.z_score_promedio || 0),
        ircf: parseFloat(d.ircf_promedio || 0),
        alertas: d.alertas_activas,
        weight: d.escala_riesgo_1a5 / 5, // normalizado 0-1
      },
    })),
  };
}

module.exports = { getFrontera, getMapaCalor, toGeoJSON, mapaCalorGeoJSON };
