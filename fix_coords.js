/**
 * Restore real coordinates for dim_estacion using Nominatim geocoding.
 * Strategy:
 * 1. For each station, geocode by: name + municipio + provincia + "Dominican Republic"
 * 2. If no result, fallback to: municipio + provincia + "Dominican Republic"
 * 3. If still no result, use dim_ruta_distribucion waypoints (nodo_lat, nodo_lon)
 * 4. Last resort: keep current coordinates
 */
const db = require('./src/db');
const https = require('https');

const DELAY_MS = 1100; // Nominatim requires 1 request/second

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function geocode(query) {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=do`;
    https.get(url, { headers: { 'User-Agent': 'MICM-INTEL/1.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const results = JSON.parse(data);
          if (results.length > 0) {
            resolve({ lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) });
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

(async () => {
  // First, try to use dim_ruta_distribucion nodo_lat/nodo_lon as real coordinates
  const rutaRes = await db.query(`
    SELECT DISTINCT ON (estacion_id) estacion_id, nodo_lat::float, nodo_lon::float
    FROM dim_ruta_distribucion
    WHERE nodo_lat IS NOT NULL AND nodo_lon IS NOT NULL AND activo = true
  `);
  const rutaCoords = {};
  rutaRes.rows.forEach(r => { rutaCoords[r.estacion_id] = { lat: r.nodo_lat, lon: r.nodo_lon }; });
  console.log(`Route node coordinates available for ${Object.keys(rutaCoords).length} stations`);

  // Apply route node coordinates first (these are likely real)
  let routeFixed = 0;
  for (const [id, coords] of Object.entries(rutaCoords)) {
    // Only apply if the coords look like they're in DR
    if (coords.lat >= 17.5 && coords.lat <= 20.0 && coords.lon >= -72.0 && coords.lon <= -68.0) {
      await db.query('UPDATE dim_estacion SET lat = $1, lon = $2 WHERE estacion_id = $3',
                     [coords.lat, coords.lon, id]);
      routeFixed++;
    }
  }
  console.log(`✓ Fixed ${routeFixed} stations from dim_ruta_distribucion nodo coordinates`);

  // Check how many still need fixing (those not in rutaCoords)
  const remaining = await db.query(`
    SELECT estacion_id, nombre_establecimiento, municipio, provincia
    FROM dim_estacion
    WHERE activo = true AND estacion_id NOT IN (
      SELECT DISTINCT estacion_id FROM dim_ruta_distribucion 
      WHERE nodo_lat IS NOT NULL AND activo = true
    )
  `);
  console.log(`Remaining stations to geocode: ${remaining.rows.length}`);

  // Geocode remaining stations via Nominatim
  let geocoded = 0, failed = 0;
  for (let i = 0; i < remaining.rows.length; i++) {
    const est = remaining.rows[i];
    
    // Try with station name + location
    let result = await geocode(`${est.nombre_establecimiento}, ${est.municipio}, ${est.provincia}, Dominican Republic`);
    
    if (!result) {
      // Fallback: just municipio + provincia
      await sleep(DELAY_MS);
      result = await geocode(`${est.municipio}, ${est.provincia}, Dominican Republic`);
    }
    
    if (result && result.lat >= 17.5 && result.lat <= 20.0 && result.lon >= -72.0 && result.lon <= -68.0) {
      // Add small random offset so they don't stack exactly
      const lat = result.lat + (Math.random() - 0.5) * 0.004;
      const lon = result.lon + (Math.random() - 0.5) * 0.004;
      await db.query('UPDATE dim_estacion SET lat = $1, lon = $2 WHERE estacion_id = $3',
                     [lat, lon, est.estacion_id]);
      geocoded++;
    } else {
      failed++;
    }
    
    if ((i + 1) % 20 === 0) {
      console.log(`  [${i+1}/${remaining.rows.length}] geocoded: ${geocoded}, failed: ${failed}`);
    }
    
    await sleep(DELAY_MS);
  }

  console.log(`\n✓ Geocoded: ${geocoded} stations via Nominatim`);
  console.log(`✗ Failed: ${failed} stations (keeping current coords)`);
  console.log(`\nTotal fixed: ${routeFixed + geocoded} / 1960`);
  
  process.exit();
})();
