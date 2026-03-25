const https = require('https');
const db = require('../src/db');

(async () => {
  // Get routes that are NOT yet in cache
  const fs = require('fs');
  const path = require('path');
  const CACHE_FILE = path.join(__dirname, '../cache/osrm_routes.json');
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch(e) {}

  const {rows} = await db.query(`
    SELECT r.origen_lat, r.origen_lon, e.lat as d_lat, e.lon as d_lon
    FROM dim_ruta_distribucion r
    JOIN dim_estacion e ON e.estacion_id = r.estacion_id
    WHERE r.activo = true AND e.activo = true
      AND r.origen_lat IS NOT NULL AND e.lat IS NOT NULL
    LIMIT 20
  `);

  let tested = 0;
  for (const r of rows) {
    const oLon = parseFloat(r.origen_lon), oLat = parseFloat(r.origen_lat);
    const dLon = parseFloat(r.d_lon), dLat = parseFloat(r.d_lat);
    const key = `${oLon.toFixed(3)},${oLat.toFixed(3)};${dLon.toFixed(3)},${dLat.toFixed(3)}`;
    
    // Skip ones already cached
    if (cache[key]) continue;
    if (tested >= 5) break;
    tested++;

    const url = `https://router.project-osrm.org/route/v1/driving/${oLon},${oLat};${dLon},${dLat}?overview=full&geometries=geojson`;
    console.log(`Testing: ${key}`);
    console.log(`URL: ${url}`);
    
    const resp = await new Promise(resolve => {
      https.get(url, { timeout: 10000 }, res => {
        console.log(`HTTP Status: ${res.statusCode}`);
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => {
          // Print first 300 chars of response
          console.log(`Response (first 300): ${d.substring(0, 300)}`);
          console.log('---');
          resolve();
        });
      }).on('error', e => {
        console.log(`Network Error: ${e.message}`);
        resolve();
      });
    });
    
    await new Promise(r => setTimeout(r, 1000)); // wait between requests
  }
  
  process.exit();
})();
