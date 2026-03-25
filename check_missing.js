const db = require('./src/db');
(async () => {
  try {
    const r = await db.query("SELECT estacion_id, lat, lon, activo FROM dim_estacion WHERE estacion_id IN ('EST-0133', 'EST-1382', 'EST-1383')");
    console.table(r.rows);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
