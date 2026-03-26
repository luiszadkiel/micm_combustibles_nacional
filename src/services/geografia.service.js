// ============================================================================
// MICM-INTEL v1.0 — Servicio de Geografía (Drill-Down por Zoom)
// 3 Macro-Regiones: NORTE (CIBAO) | SUROESTE | SURESTE
// ============================================================================
const db = require('../db');

// ── Mapeo Provincia → Macro-Región ──────────────────────────────────────────
// Basado en la división geográfica estándar de República Dominicana
const MACRO_REGION_MAP = {
  // NORTE (CIBAO) — toda la zona norte
  'SANTIAGO':                'NORTE (CIBAO)',
  'LA VEGA':                 'NORTE (CIBAO)',
  'PUERTO PLATA':            'NORTE (CIBAO)',
  'DUARTE':                  'NORTE (CIBAO)',
  'ESPAILLAT':               'NORTE (CIBAO)',
  'VALVERDE':                'NORTE (CIBAO)',
  'MONTECRISTI':             'NORTE (CIBAO)',
  'MONTE CRISTI':            'NORTE (CIBAO)',
  'SAMANÁ':                  'NORTE (CIBAO)',
  'SAMANA':                  'NORTE (CIBAO)',
  'MARÍA TRINIDAD SÁNCHEZ':  'NORTE (CIBAO)',
  'MARIA TRINIDAD SANCHEZ':  'NORTE (CIBAO)',
  'HERMANAS MIRABAL':        'NORTE (CIBAO)',
  'SALCEDO':                 'NORTE (CIBAO)',
  'SÁNCHEZ RAMÍREZ':         'NORTE (CIBAO)',
  'SANCHEZ RAMIREZ':         'NORTE (CIBAO)',
  'SANTIAGO RODRÍGUEZ':      'NORTE (CIBAO)',
  'SANTIAGO RODRIGUEZ':      'NORTE (CIBAO)',
  'DAJABÓN':                 'NORTE (CIBAO)',
  'DAJABON':                 'NORTE (CIBAO)',
  'MONTE PLATA':             'NORTE (CIBAO)',
  'MONSEÑOR NOUEL':          'NORTE (CIBAO)',
  'MONSENOR NOUEL':          'NORTE (CIBAO)',
  'LA ESTRELLETA':           'NORTE (CIBAO)',

  // SUROESTE — Enriquillo + El Valle + parte central-sur
  'SAN JUAN':                'SUROESTE',
  'SAN JUAN DE LA MAGUANA':  'SUROESTE',
  'BARAHONA':                'SUROESTE',
  'AZUA':                    'SUROESTE',
  'INDEPENDENCIA':           'SUROESTE',
  'PEDERNALES':              'SUROESTE',
  'ELÍAS PIÑA':              'SUROESTE',
  'ELIAS PIÑA':              'SUROESTE',
  'ELIAS PINA':              'SUROESTE',
  'BAORUCO':                 'SUROESTE',
  'BAHORUCO':                'SUROESTE',
  'SAN JOSÉ DE OCOA':        'SUROESTE',
  'SAN JOSE DE OCOA':        'SUROESTE',
  'PERAVIA':                 'SUROESTE',

  // SURESTE — Ozama + Higuamo + Yuma + Valdesia
  'SANTO DOMINGO':           'SURESTE',
  'DISTRITO NACIONAL':       'SURESTE',
  'SAN CRISTÓBAL':           'SURESTE',
  'SAN CRISTOBAL':           'SURESTE',
  'LA ROMANA':               'SURESTE',
  'SAN PEDRO DE MACORÍS':    'SURESTE',
  'SAN PEDRO DE MACORIS':    'SURESTE',
  'LA ALTAGRACIA':           'SURESTE',
  'EL SEIBO':                'SURESTE',
  'EL SEYBO':                'SURESTE',
  'HATO MAYOR':              'SURESTE',
};

// Coordenadas centrales fijas para cada macro-región (para GeoJSON Point)
const MACRO_REGION_CENTROIDS = {
  'NORTE (CIBAO)': { lat: 19.45, lon: -70.70 },
  'SUROESTE':      { lat: 18.50, lon: -71.30 },
  'SURESTE':       { lat: 18.55, lon: -69.50 },
};

/**
 * Obtiene la macro-región de una provincia (case-insensitive, quita acentos)
 */
function getMacroRegion(provincia) {
  if (!provincia) return 'SURESTE'; // fallback
  const key = provincia.toUpperCase().trim();
  return MACRO_REGION_MAP[key] || 'SURESTE'; // fallback a SURESTE
}

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
  // Macro-regiones: aggregate all provincias into 3 groups
  const regiones = buildRegionGeoJSON(niveles['Provincia'], estMap, alertMap);
  const provincias = buildProvinciaGeoJSON(niveles['Provincia'], estMap, alertMap);
  const municipios = buildMunicipioGeoJSON(niveles['Municipio'], estMap, alertMap);

  return { regiones, provincias, municipios };
}

/**
 * Construye GeoJSON de 3 macro-regiones agregando métricas de todas las provincias.
 * Ya no depende de los rows de nivel 'Región' en dim_geografia.
 */
function buildRegionGeoJSON(provRows, estMap, alertMap) {
  // Agrupar provincias por macro-región
  const regionData = {};
  Object.keys(MACRO_REGION_CENTROIDS).forEach(mr => {
    regionData[mr] = { estaciones: 0, alertas: 0, criticas: 0, zScoreSum: 0, zCount: 0, poblacion: 0, area: 0, frontera: false, provCount: 0 };
  });

  provRows.forEach(r => {
    const mr = getMacroRegion(r.provincia);
    if (!regionData[mr]) return;
    const data = regionData[mr];
    data.provCount++;
    data.poblacion += parseInt(r.poblacion_aprox || 0);
    data.area += parseFloat(r.area_km2 || 0);
    if (r.es_frontera_haiti) data.frontera = true;

    const e = estMap[r.provincia];
    const a = alertMap[r.provincia];
    if (e) {
      data.estaciones += e.estaciones;
      if (e.z_score_avg) { data.zScoreSum += e.z_score_avg; data.zCount++; }
    }
    if (a) {
      data.alertas += a.alertas_activas;
      data.criticas += a.alertas_criticas;
    }
  });

  return {
    type: 'FeatureCollection',
    features: Object.entries(regionData).map(([nombre, d]) => {
      const centroid = MACRO_REGION_CENTROIDS[nombre];
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [centroid.lon, centroid.lat] },
        properties: {
          nombre,
          nivel: 'Región',
          estaciones: d.estaciones,
          alertas_activas: d.alertas,
          alertas_criticas: d.criticas,
          z_score_avg: d.zCount > 0 ? +(d.zScoreSum / d.zCount).toFixed(2) : 0,
          poblacion: d.poblacion,
          area_km2: +d.area.toFixed(1),
          es_frontera: d.frontera,
          provincias: d.provCount,
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
          region: getMacroRegion(r.provincia),
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
          region: getMacroRegion(r.provincia),
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

module.exports = { getGeografia, getMacroRegion, MACRO_REGION_MAP };
