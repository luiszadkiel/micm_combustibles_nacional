const db = require('./src/db');
const fs = require('fs');

(async () => {
  // Check what coordinates we have from different sources
  const r = await db.query(`
    SELECT e.estacion_id, e.nombre_establecimiento, e.provincia, e.municipio,
           e.lat::float as est_lat, e.lon::float as est_lon,
           r.origen_lat::float, r.origen_lon::float,
           r.nodo_lat::float, r.nodo_lon::float
    FROM dim_estacion e
    LEFT JOIN dim_ruta_distribucion r ON r.estacion_id = e.estacion_id
    WHERE e.activo = true
    ORDER BY RANDOM()
    LIMIT 15
  `);
  
  fs.writeFileSync('coord_check.json', JSON.stringify(r.rows, null, 2));
  
  // Also check if waypoints_json has the real destination
  const w = await db.query(`
    SELECT estacion_id, waypoints_json
    FROM dim_ruta_distribucion
    WHERE waypoints_json IS NOT NULL
    LIMIT 3
  `);
  fs.writeFileSync('waypoints_sample.json', JSON.stringify(w.rows, null, 2));
  
  console.log('Done - check coord_check.json and waypoints_sample.json');
  process.exit();
})();
