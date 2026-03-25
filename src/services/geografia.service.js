// ============================================================================
// MICM-INTEL v1.0 — Servicio de Geografía (Drill-Down por Zoom)
// ============================================================================
const db = require('../db');

/**
 * Retorna los 3 niveles geográficos con métricas agregadas.
 * Cada nivel es un GeoJSON FeatureCollection de puntos.
 */
async function getGeografia() {
  // 1. Obtener todos los puntos de dim_geografia con lat/lon
  const geoRows = (await db.query(`
    SELECT geo_id, nivel, region_fedomu, provincia, municipio,
           lat::float, lon::float, poblacion_aprox, area_km2, es_frontera_haiti
    FROM dim_geografia
    WHERE lat IS NOT NULL AND lon IS NOT NULL
    ORDER BY nivel, provincia, municipio
  `)).rows;

  // 2. Obtener métricas agregadas por provincia desde dim_estacion + fact_alertas
  const estacionesPorProv = (await db.query(`
    SELECT provincia,
      COUNT(*)::int as estaciones,
      ROUND(AVG(z_score_ajustado_fisico), 2)::float as z_score_avg
    FROM dim_estacion e
    LEFT JOIN (
      SELECT estacion_id, z_score_ajustado_fisico
      FROM fact_anomalias_volumen
      WHERE (anio, semana_iso) = (
        SELECT anio, semana_iso FROM fact_anomalias_volumen
        ORDER BY anio DESC, semana_iso DESC LIMIT 1
      )
    ) a ON a.estacion_id = e.estacion_id
    WHERE e.activo = true AND e.provincia IS NOT NULL
    GROUP BY provincia
  `)).rows;

  const alertasPorProv = (await db.query(`
    SELECT e.provincia,
      COUNT(*)::int as alertas_activas,
      COUNT(*) FILTER (WHERE ao.nivel_alerta >= 2)::int as alertas_criticas
    FROM fact_alertas_operativas ao
    JOIN dim_estacion e ON e.estacion_id = ao.estacion_id
    WHERE ao.estado_alerta != 'DESCARTADA'
    GROUP BY e.provincia
  `)).rows;

  // Build lookup maps
  const estMap = {};
  estacionesPorProv.forEach(r => { estMap[r.provincia] = r; });
  const alertMap = {};
  alertasPorProv.forEach(r => { alertMap[r.provincia] = r; });

  // 3. Group by nivel
  const niveles = { 'Región': [], 'Provincia': [], 'Municipio': [] };
  geoRows.forEach(r => {
    if (niveles[r.nivel]) niveles[r.nivel].push(r);
  });

  // 4. Build GeoJSON for each level
  // Regiones: aggregate metrics across all provincias in the region
  const regiones = buildRegionGeoJSON(niveles['Región'], geoRows, estMap, alertMap);
  const provincias = buildProvinciaGeoJSON(niveles['Provincia'], estMap, alertMap);
  const municipios = buildMunicipioGeoJSON(niveles['Municipio'], estMap, alertMap);

  return { regiones, provincias, municipios };
}

function buildRegionGeoJSON(regionRows, allRows, estMap, alertMap) {
  // For each region, aggregate metrics from all provincias in that region
  const regionProvincias = {};
  allRows.filter(r => r.nivel === 'Provincia').forEach(r => {
    if (!regionProvincias[r.region_fedomu]) regionProvincias[r.region_fedomu] = [];
    regionProvincias[r.region_fedomu].push(r.provincia);
  });

  return {
    type: 'FeatureCollection',
    features: regionRows.map(r => {
      const provs = regionProvincias[r.region_fedomu] || [];
      let estaciones = 0, alertas = 0, criticas = 0, zScoreSum = 0, zCount = 0;
      provs.forEach(p => {
        const e = estMap[p];
        const a = alertMap[p];
        if (e) { estaciones += e.estaciones; if (e.z_score_avg) { zScoreSum += e.z_score_avg; zCount++; } }
        if (a) { alertas += a.alertas_activas; criticas += a.alertas_criticas; }
      });
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: {
          geo_id: r.geo_id,
          nombre: r.region_fedomu,
          nivel: 'Región',
          estaciones,
          alertas_activas: alertas,
          alertas_criticas: criticas,
          z_score_avg: zCount > 0 ? +(zScoreSum / zCount).toFixed(2) : 0,
          poblacion: r.poblacion_aprox,
          area_km2: r.area_km2,
          es_frontera: r.es_frontera_haiti,
        },
      };
    }),
  };
}

function buildProvinciaGeoJSON(provRows, estMap, alertMap) {
  return {
    type: 'FeatureCollection',
    features: provRows.map(r => {
      const e = estMap[r.provincia] || {};
      const a = alertMap[r.provincia] || {};
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: {
          geo_id: r.geo_id,
          nombre: r.provincia,
          nivel: 'Provincia',
          region: r.region_fedomu,
          estaciones: e.estaciones || 0,
          alertas_activas: a.alertas_activas || 0,
          alertas_criticas: a.alertas_criticas || 0,
          z_score_avg: e.z_score_avg || 0,
          poblacion: r.poblacion_aprox,
          area_km2: r.area_km2,
          es_frontera: r.es_frontera_haiti,
        },
      };
    }),
  };
}

function buildMunicipioGeoJSON(munRows, estMap, alertMap) {
  return {
    type: 'FeatureCollection',
    features: munRows.map(r => {
      // Municipios use parent provincia for metric lookup
      const e = estMap[r.provincia] || {};
      const a = alertMap[r.provincia] || {};
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
        properties: {
          geo_id: r.geo_id,
          nombre: r.municipio,
          nivel: 'Municipio',
          provincia: r.provincia,
          region: r.region_fedomu,
          estaciones: e.estaciones || 0,
          alertas_activas: a.alertas_activas || 0,
          alertas_criticas: a.alertas_criticas || 0,
          z_score_avg: e.z_score_avg || 0,
          poblacion: r.poblacion_aprox,
          area_km2: r.area_km2,
          es_frontera: r.es_frontera_haiti,
        },
      };
    }),
  };
}

module.exports = { getGeografia };
