const db = require('./src/db');
(async () => {
  await db.query(`UPDATE dim_estacion SET lat = 18.615 + RANDOM()*0.04, lon = -68.707 + RANDOM()*0.04 WHERE provincia = 'Altagracia' AND municipio = 'Higüey'`);
  await db.query(`UPDATE dim_estacion SET lat = 18.70 + RANDOM()*0.02, lon = -70.52 + RANDOM()*0.02 WHERE provincia = 'San José De Ocoa' AND municipio IN ('Rancho Arriba', 'Sabana Larga')`);
  console.log('Done');
  process.exit();
})();
