const fs = require('fs');
const path = require('path');
const db = require('./src/db');

const CACHE_FILE = path.join(__dirname, 'cache/osrm_routes.json');

(async () => {
  let cache = {};
  try { if (fs.existsSync(CACHE_FILE)) cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch(e) {}
  console.log(`Cache tiene: ${Object.keys(cache).length} rutas`);

  // Show a sample of cache keys
  const keys = Object.keys(cache).slice(0, 3);
  console.log('Ejemplo de llaves en cache:', keys);

  // Get DB routes and compare
  const { rows } = await db.query(`
    SELECT r.origen_lat, r.origen_lon, e.lat as d_lat, e.lon as d_lon
    FROM dim_ruta_distribucion r
    JOIN dim_estacion e ON e.estacion_id = r.estacion_id
    WHERE r.activo = true AND e.activo = true
      AND r.origen_lat IS NOT NULL AND e.lat IS NOT NULL
  `);
  console.log(`Total rutas en DB: ${rows.length}`);

  let matched = 0, unmatched = 0;
  for (const r of rows) {
    const oLat = parseFloat(r.origen_lat), oLon = parseFloat(r.origen_lon);
    const dLat = parseFloat(r.d_lat), dLon = parseFloat(r.d_lon);
    if (!oLat || !oLon || !dLat || !dLon) continue;
    const key = `${oLon.toFixed(3)},${oLat.toFixed(3)};${dLon.toFixed(3)},${dLat.toFixed(3)}`;
    if (cache[key]) matched++;
    else unmatched++;
  }

  console.log(`Rutas que YA están en cache: ${matched}`);
  console.log(`Rutas que FALTAN en cache: ${unmatched}`);

  // Check how many stations still have null coords
  const nullRes = await db.query(`SELECT COUNT(*) as cnt FROM dim_estacion WHERE activo = true AND (lat IS NULL OR lon IS NULL)`);
  console.log(`Estaciones activas SIN coordenadas: ${nullRes.rows[0].cnt}`);

  process.exit(0);
})();
