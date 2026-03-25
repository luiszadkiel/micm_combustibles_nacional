// ============================================================================
// MICM-INTEL v1.0 — Servicio de Rutas de Distribución
// ============================================================================
const db = require('../db');
const osrm = require('./osrm.service');

/**
 * Todas las rutas con waypoints + cached OSRM road geometry.
 * NON-BLOCKING: returns immediately with whatever is in cache.
 * Background task computes missing routes and auto-broadcasts when done.
 */
let bgStarted = false;

async function getRutas() {
  const sql = `
    SELECT
      r.ruta_dist_id, r.estacion_id,
      r.origen, r.origen_lat, r.origen_lon,
      r.destino_provincia, r.destino_municipio,
      r.ruta_principal_nombre,
      r.nodo_distribucion, r.nodo_nombre, r.nodo_lat, r.nodo_lon,
      r.distancia_total_km, r.tiempo_estimado_hrs,
      r.tipo_ruta, r.es_ruta_fronteriza, r.nivel_riesgo_ruta,
      r.waypoints_json,
      e.nombre_establecimiento, e.lat as destino_lat, e.lon as destino_lon,
      e.provincia, e.es_zona_fronteriza
    FROM dim_ruta_distribucion r
    JOIN dim_estacion e ON e.estacion_id = r.estacion_id
    WHERE r.activo = true AND e.activo = true
       AND r.origen_lat IS NOT NULL AND e.lat IS NOT NULL
    ORDER BY
      CASE r.nivel_riesgo_ruta
        WHEN 'CRITICO' THEN 1 WHEN 'ALTO' THEN 2
        WHEN 'MEDIO' THEN 3 ELSE 4
      END,
      r.es_ruta_fronteriza DESC
  `;
  const rows = (await db.query(sql)).rows;

  // Start ONE background OSRM computation (non-blocking)
  if (!bgStarted) {
    bgStarted = true;
    startBackgroundOSRM(rows);
  }

  return rows;
}

/**
 * Convierte rutas a GeoJSON LineString.
 * Uses server-side OSRM cache for road-following geometry when available.
 */
function toGeoJSON(rutas) {
  return {
    type: 'FeatureCollection',
    features: rutas.map(r => {
      const oriLat = parseFloat(r.origen_lat);
      const oriLon = parseFloat(r.origen_lon);
      const dstLat = parseFloat(r.destino_lat);
      const dstLon = parseFloat(r.destino_lon);

      if (!isValidCoord(oriLat, oriLon) || !isValidCoord(dstLat, dstLon)) return null;

      // Check OSRM cache for road-following coordinates
      const roadCoords = osrm.getRoute(oriLat, oriLon, dstLat, dstLon);
      let coordinates;

      if (roadCoords) {
        // Use cached road geometry (already in [lon,lat] GeoJSON format)
        coordinates = roadCoords;
      } else {
        // [MOD] Solo enviamos los dos puntos [origen, destino]. 
        // El cliente ya tiene createBezier() que se encarga de la estetica inicial.
        // Esto reduce significativamente el tamaño del JSON inicial (1960 rutas).
        coordinates = [[oriLon, oriLat], [dstLon, dstLat]];
      }

      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates },
        properties: {
          ruta_id: r.ruta_dist_id,
          estacion_id: r.estacion_id,
          nombre: r.nombre_establecimiento,
          origen: r.origen,
          destino: r.destino_provincia + ' · ' + (r.destino_municipio || ''),
          ruta: r.ruta_principal_nombre,
          nodo: r.nodo_nombre,
          distancia: parseFloat(r.distancia_total_km || 0),
          tiempo_hrs: parseFloat(r.tiempo_estimado_hrs || 0),
          tipo: r.tipo_ruta,
          fronteriza: r.es_ruta_fronteriza,
          riesgo: r.nivel_riesgo_ruta,
          provincia: r.provincia,
          has_road: !!roadCoords,
        },
      };
    }).filter(Boolean),
  };
}

/** Validate coords are within Dominican Republic bounds */
function isValidCoord(lat, lon) {
  return !isNaN(lat) && !isNaN(lon) &&
    lat > 17 && lat < 21 &&
    lon > -73 && lon < -68;
}


/**
 * Background OSRM computation — doesn't block anything.
 * When done, broadcasts updated rutas to all connected clients.
 */
async function startBackgroundOSRM(rows) {
  const routeInputs = rows.map(r => ({
    origen_lat: r.origen_lat, origen_lon: r.origen_lon,
    destino_lat: r.destino_lat, destino_lon: r.destino_lon,
    lat: r.destino_lat, lon: r.destino_lon,
  }));

  // After completion, broadcast updated rutas to all clients
  await osrm.precomputeRoutes(routeInputs, (done, total, ok, newCoords) => {
    if (!newCoords || newCoords.length === 0) return;
    
    console.log(`[RUTAS] Broadcast parcial: ${newCoords.length} rutas nuevas (${done}/${total})`);
    try {
      const { broadcast } = require('../websocket/ws.server');
      const config = require('../config');
      
      // Convertimos solo las nuevas coordenadas a un mini-GeoJSON parcial
      const partialFeatures = [];
      for (const item of newCoords) {
        // Buscamos la fila original para obtener sus propiedades
        const row = rows.find(r => {
          const oLon = parseFloat(r.origen_lon).toFixed(3);
          const oLat = parseFloat(r.origen_lat).toFixed(3);
          const dLat = parseFloat(r.destino_lat).toFixed(3);
          const dLon = parseFloat(r.destino_lon).toFixed(3);
          const key = `${oLon},${oLat};${dLon},${dLat}`;
          return key === item.key;
        });
        
        if (row) {
          const feature = toGeoJSON([row]).features[0];
          if (feature) {
            feature.geometry.coordinates = item.coords;
            feature.properties.has_road = true;
            partialFeatures.push(feature);
          }
        }
      }

      if (partialFeatures.length > 0) {
        broadcast(config.wsTypes.UPDATE_RUTAS, { 
          rutas: { type: 'FeatureCollection', features: partialFeatures },
          isPartial: true,
          progress: { done, total } 
        });
      }
    } catch(e) {
      console.error('[RUTAS] Error en broadcast parcial:', e.message);
    }
  });

  // Final broadcast
  try {
    const { broadcast } = require('../websocket/ws.server');
    const config = require('../config');
    const geojson = toGeoJSON(rows);
    broadcast(config.wsTypes.UPDATE_RUTAS, { rutas: geojson });
    console.log(`[RUTAS] ✓ Rutas OSRM actualizadas (${geojson.features.length}) enviadas a clientes`);
  } catch(e) {
    console.log('[RUTAS] ✓ OSRM listo — recarga la página para ver rutas por carretera');
  }
}

module.exports = { getRutas, toGeoJSON };
