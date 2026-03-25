// Compare the origin coordinates between old cache keys and current DB routes
const db = require('./src/db');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, 'cache/osrm_routes.json');

(async () => {
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const cacheKeys = Object.keys(cache);
  
  // Extract unique origins from cache keys
  const cacheOrigins = new Set();
  for (const key of cacheKeys) {
    const origin = key.split(';')[0]; // e.g., "-70.020,18.415"
    cacheOrigins.add(origin);
  }
  console.log(`Orígenes únicos en cache: ${cacheOrigins.size}`);
  console.log('Ejemplo orígenes cache:', [...cacheOrigins].slice(0, 5));

  // Get unique origins from DB
  const { rows } = await db.query(`
    SELECT DISTINCT 
      ROUND(r.origen_lon::numeric, 3) as olon, 
      ROUND(r.origen_lat::numeric, 3) as olat
    FROM dim_ruta_distribucion r
    WHERE r.activo = true AND r.origen_lat IS NOT NULL
    ORDER BY olon, olat
  `);
  console.log(`\nOrígenes únicos en DB: ${rows.length}`);
  const dbOrigins = rows.map(r => `${parseFloat(r.olon).toFixed(3)},${parseFloat(r.olat).toFixed(3)}`);
  console.log('Ejemplo orígenes DB:', dbOrigins.slice(0, 5));

  // Check overlap
  let overlap = 0;
  for (const o of dbOrigins) {
    if (cacheOrigins.has(o)) overlap++;
  }
  console.log(`\nOrígenes que coinciden: ${overlap}`);

  process.exit(0);
})();
