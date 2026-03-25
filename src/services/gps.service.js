// ============================================================================
// MICM-INTEL v1.0 — Servicio GPS de Cisternas
// Fuente: v_gps_temperatura_evaporacion + dim_ruta_distribucion (waypoints)
// La vista NO tiene lat/lon actual — se interpola en Node.js
// ============================================================================
const db = require('../db');

/**
 * Obtiene las cisternas activas y calcula posición interpolada
 * sobre los waypoints de la ruta.
 */
async function getCisternas() {
  // Despachos recientes (últimas 24h simuladas como "en ruta")
  const sql = `
    SELECT
      g.despacho_id,
      g.numero_cisterna,
      g.fecha_despacho,
      g.hora_despacho,
      g.estacion_id,
      g.nombre_establecimiento,
      g.provincia,
      g.es_zona_fronteriza,
      g.producto_id,
      g.volumen_despachado_gal,
      g.temperatura_media_c,
      g.delta_t,
      g.zona_climatica,
      g.ruta_nombre,
      g.distancia_total_km,
      g.tiempo_transporte_hrs,
      g.evap_esperada_gal,
      g.perdida_legitima_gal,
      g.pct_perdida_esperada,
      g.nivel_riesgo_evap,
      g.alerta_evaporacion,
      e.lat as destino_lat,
      e.lon as destino_lon,
      r.origen_lat,
      r.origen_lon,
      r.waypoints_json
    FROM v_gps_temperatura_evaporacion g
    JOIN dim_estacion e ON e.estacion_id = g.estacion_id
    LEFT JOIN dim_ruta_distribucion r ON r.estacion_id = g.estacion_id
    ORDER BY g.fecha_despacho DESC, g.hora_despacho DESC
    LIMIT 50
  `;

  const result = await db.query(sql);
  return result.rows.map(c => ({
    ...c,
    ...interpolarPosicion(c),
  }));
}

/**
 * Interpola la posición actual de la cisterna sobre los waypoints de su ruta.
 * Usa el tiempo transcurrido desde el despacho vs tiempo total estimado.
 */
function interpolarPosicion(cisterna) {
  const { origen_lat, origen_lon, destino_lat, destino_lon, waypoints_json,
          fecha_despacho, hora_despacho, tiempo_transporte_hrs } = cisterna;

  // Si no hay coordenadas, retornar destino
  if (!destino_lat || !destino_lon) {
    return { lat_estimada: null, lon_estimada: null, progreso: 0 };
  }

  const oLat = parseFloat(origen_lat || destino_lat);
  const oLon = parseFloat(origen_lon || destino_lon);
  const dLat = parseFloat(destino_lat);
  const dLon = parseFloat(destino_lon);

  // Calcular progreso (0.0 a 1.0)
  const ahora = new Date();
  const horaDesp = hora_despacho || '08:00:00';
  const fechaDesp = new Date(`${fecha_despacho}T${horaDesp}`);
  const transcurrido_hrs = (ahora - fechaDesp) / 3600000;
  const total_hrs = parseFloat(tiempo_transporte_hrs) || 4;
  let progreso = Math.min(Math.max(transcurrido_hrs / total_hrs, 0), 1);

  // Si hay waypoints, interpolar sobre la polyline
  if (waypoints_json && Array.isArray(waypoints_json) && waypoints_json.length > 1) {
    const points = waypoints_json.map(wp => [parseFloat(wp.lon || wp[1]), parseFloat(wp.lat || wp[0])]);
    return interpolateAlongPath(points, progreso);
  }

  // Interpolación lineal simple origen → destino
  return {
    lat_estimada: oLat + (dLat - oLat) * progreso,
    lon_estimada: oLon + (dLon - oLon) * progreso,
    progreso: Math.round(progreso * 100),
  };
}

/**
 * Interpola un punto a lo largo de un path de waypoints.
 */
function interpolateAlongPath(points, t) {
  if (points.length === 0) return { lat_estimada: null, lon_estimada: null, progreso: 0 };
  if (points.length === 1) return { lat_estimada: points[0][1], lon_estimada: points[0][0], progreso: Math.round(t * 100) };

  // Calcular distancias acumuladas
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const d = haversine(points[i - 1][1], points[i - 1][0], points[i][1], points[i][0]);
    distances.push(distances[i - 1] + d);
  }
  const totalDist = distances[distances.length - 1];
  const targetDist = t * totalDist;

  // Encontrar segmento
  for (let i = 1; i < distances.length; i++) {
    if (targetDist <= distances[i]) {
      const segLen = distances[i] - distances[i - 1];
      const segT = segLen > 0 ? (targetDist - distances[i - 1]) / segLen : 0;
      return {
        lat_estimada: points[i - 1][1] + (points[i][1] - points[i - 1][1]) * segT,
        lon_estimada: points[i - 1][0] + (points[i][0] - points[i - 1][0]) * segT,
        progreso: Math.round(t * 100),
      };
    }
  }

  const last = points[points.length - 1];
  return { lat_estimada: last[1], lon_estimada: last[0], progreso: 100 };
}

/**
 * Distancia Haversine simplificada (km).
 */
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Convierte cisternas a GeoJSON.
 */
function toGeoJSON(cisternas) {
  return {
    type: 'FeatureCollection',
    features: cisternas.filter(c => c.lat_estimada && c.lon_estimada).map(c => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon_estimada, c.lat_estimada] },
      properties: {
        cisterna: c.numero_cisterna,
        estacion: c.nombre_establecimiento,
        producto: c.producto_id,
        volumen: parseFloat(c.volumen_despachado_gal || 0),
        progreso: c.progreso,
        riesgo: c.nivel_riesgo_evap,
        alerta: c.alerta_evaporacion,
        provincia: c.provincia,
      },
    })),
  };
}

module.exports = { getCisternas, toGeoJSON };
