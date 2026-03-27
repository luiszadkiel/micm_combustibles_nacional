const db = require('./src/db');

async function main() {
  try {
    const res = await db.query("SELECT pg_get_viewdef('v_mapa_calor_municipio', true) as def;");
    console.log(res.rows[0].def);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

main();
