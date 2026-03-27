const { Client } = require('pg');
require('dotenv').config();

const config = require('./src/config/index.js');
const client = new Client(config.pg);

async function run() {
  try {
    await client.connect();
    console.log("Connected to DB, running mv conversion...");

    // Only run if the view is not yet a materialized view
    const checkRes = await client.query(`
      SELECT matviewname FROM pg_matviews WHERE matviewname = 'v_mapa_calor_municipio' OR matviewname = 'mv_mapa_calor_municipio';
    `);

    if (checkRes.rows.every(row => row.matviewname !== 'v_mapa_calor_municipio' && row.matviewname !== 'mv_mapa_calor_municipio')) {
      await client.query(`
        ALTER VIEW micm_intel.v_mapa_calor_municipio RENAME TO v_mapa_calor_municipio_old;
        CREATE MATERIALIZED VIEW micm_intel.mv_mapa_calor_municipio AS SELECT * FROM micm_intel.v_mapa_calor_municipio_old;
        CREATE UNIQUE INDEX idx_mv_mapa_calor_municipio_geo_unique ON micm_intel.mv_mapa_calor_municipio (geo_id);
      `);
      console.log("Successfully converted to Materialized View!");
    } else {
      console.log("Materialized view already exists or was created.");
    }
  } catch (err) {
    if (err.message.includes('not a view')) {
      console.log("It might already be converted:", err.message);
    } else {
      console.error(err);
    }
  } finally {
    await client.end();
  }
}
run();
