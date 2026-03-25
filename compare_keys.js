const db = require('./src/db');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'cache/osrm_routes.json');

(async () => {
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const cacheKeys = new Set(Object.keys(cache));
  
  // Get all current DB route keys
  const { rows } = await db.query(`
    SELECT r.origen_lat, r.origen_lon, e.lat as d_lat, e.lon as d_lon
    FROM dim_ruta_distribucion r
    JOIN dim_estacion e ON e.estacion_id = r.estacion_id
    WHERE r.activo = true AND e.activo = true
      AND r.origen_lat IS NOT NULL AND e.lat IS NOT NULL
  `);

  // Sample cache keys vs DB keys
  const dbKeys = rows.map(r => {
    const oLon = parseFloat(r.origen_lon).toFixed(3);
    const oLat = parseFloat(r.origen_lat).toFixed(3);
    const dLon = parseFloat(r.d_lon).toFixed(3);
    const dLat = parseFloat(r.d_lat).toFixed(3);
    return `${oLon},${oLat};${dLon},${dLat}`;
  });

  console.log('=== Primeras 5 llaves de CACHE ===');
  [...cacheKeys].slice(0, 5).forEach(k => console.log('  C:', k));

  console.log('\n=== Primeras 5 llaves de DB ===');
  dbKeys.slice(0, 5).forEach(k => console.log('  D:', k));

  // Count matches
  let matched = 0;
  for (const k of dbKeys) {
    if (cacheKeys.has(k)) matched++;
  }
  console.log(`\nCoincidencias: ${matched} de ${dbKeys.length} rutas DB`);
  console.log(`Cache tiene: ${cacheKeys.size} rutas`);

  // How many DB keys are unique?
  const uniqueDB = new Set(dbKeys);
  console.log(`Rutas DB únicas: ${uniqueDB.size}`);

  process.exit(0);
})();
