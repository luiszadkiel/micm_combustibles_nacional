// ============================================================================
// MICM-INTEL v1.0 — Simulation Data Seeder
// Genera datos realistas para TODAS las fact tables + enriquece dimensiones
// Ejecutar: node scripts/seed_simulation.js
// ============================================================================
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: parseInt(process.env.PGPORT || '5433'),
  database: process.env.PGDATABASE || 'Alerta_Combustible',
  user: process.env.PGUSER || 'postgres',
  password: process.env.PGPASSWORD || 'admin',
  options: '-c search_path=micm_intel,public',
});

// ── Helpers ─────────────────────────────────────────────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function gaussian() { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function formatDate(d) { return d.toISOString().split('T')[0]; }
function weekStart(year, week) {
  const d = new Date(year, 0, 1);
  const dayOfWeek = d.getDay();
  const diff = (week - 1) * 7 + (1 - dayOfWeek);
  d.setDate(d.getDate() + diff);
  return d;
}

// ── Batch INSERT helper ─────────────────────────────────────────────────────
async function batchInsert(table, columns, rows, batchSize = 500) {
  if (rows.length === 0) return;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const placeholders = batch.map((row, ri) =>
      '(' + columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(',') + ')'
    ).join(',');
    const values = batch.flat();
    await pool.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES ${placeholders}`, values);
  }
}

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  MICM-INTEL — Simulation Data Seeder                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // ── Load dimension data ───────────────────────────────────────────────
  console.log('\n[1/10] Cargando dimensiones...');
  const estaciones = (await pool.query('SELECT estacion_id, provincia, municipio, es_zona_fronteriza, capacidad_galones_declarada, lat, lon, geo_id FROM dim_estacion WHERE activo = true')).rows;
  const productos = (await pool.query('SELECT producto_id, nombre_corto, categoria, k1_evap_estacion, k2_evap_transporte, coef_expansion_termica FROM dim_producto WHERE activo = true')).rows;
  const climas = (await pool.query('SELECT geo_id, mes, temperatura_media_c, temperatura_max_c, humedad_relativa_pct, zona_climatica FROM dim_clima')).rows;
  const geos = (await pool.query('SELECT geo_id, provincia, municipio, es_frontera_haiti, poblacion_aprox FROM dim_geografia')).rows;
  const rutas = (await pool.query('SELECT estacion_id, origen, distancia_total_km, tiempo_estimado_hrs, velocidad_promedio_kmh, es_ruta_fronteriza, nodo_distribucion, ruta_principal_nombre FROM dim_ruta_distribucion WHERE activo = true')).rows;

  console.log(`  Estaciones: ${estaciones.length}, Productos: ${productos.length}, Climas: ${climas.length}, Geografias: ${geos.length}, Rutas: ${rutas.length}`);

  // Build lookup maps
  const climaMap = {}; // geo_id+mes → clima
  climas.forEach(c => { climaMap[`${c.geo_id}_${c.mes}`] = c; });
  const rutaMap = {}; // estacion_id → ruta
  rutas.forEach(r => { rutaMap[r.estacion_id] = r; });
  const geoMap = {}; // provincia → geo
  geos.forEach(g => { if (g.provincia) geoMap[g.provincia.toUpperCase()] = g; });
  const fronteraProvincias = new Set(['BARAHONA', 'DAJABÓN', 'ELÍAS PIÑA', 'INDEPENDENCIA', 'MONTECRISTI', 'PEDERNALES']);

  // ── 2. Enrich dim_estacion ────────────────────────────────────────────
  console.log('\n[2/10] Enriqueciendo dim_estacion (licencias, horarios)...');
  const shuffledIds = estaciones.map(e => e.estacion_id).sort(() => Math.random() - 0.5);
  const vencidoIds = shuffledIds.slice(0, Math.floor(estaciones.length * 0.15));
  const renovacionIds = shuffledIds.slice(Math.floor(estaciones.length * 0.15), Math.floor(estaciones.length * 0.20));

  // Prioritize frontera for VENCIDO
  const fronteraEstaciones = estaciones.filter(e => e.es_zona_fronteriza);
  const fronteraVencidoIds = fronteraEstaciones.slice(0, Math.floor(fronteraEstaciones.length * 0.35)).map(e => e.estacion_id);
  const allVencido = new Set([...vencidoIds, ...fronteraVencidoIds]);
  const allRenovacion = new Set(renovacionIds.filter(id => !allVencido.has(id)));

  for (const id of allVencido) {
    const diasAtras = randInt(30, 365);
    const fecha = new Date(); fecha.setDate(fecha.getDate() - diasAtras);
    await pool.query("UPDATE dim_estacion SET estado_licencia = 'VENCIDO', fecha_vencimiento_licencia = $1 WHERE estacion_id = $2", [formatDate(fecha), id]);
  }
  for (const id of allRenovacion) {
    const diasAtras = randInt(1, 90);
    const fecha = new Date(); fecha.setDate(fecha.getDate() - diasAtras);
    await pool.query("UPDATE dim_estacion SET estado_licencia = 'EN_RENOVACION', fecha_vencimiento_licencia = $1 WHERE estacion_id = $2", [formatDate(fecha), id]);
  }
  // Set vigente future dates for the rest
  await pool.query(`UPDATE dim_estacion SET fecha_vencimiento_licencia = CURRENT_DATE + (random() * 730 + 30)::int, horario_apertura = '06:00', horario_cierre = '22:00' WHERE estado_licencia = 'VIGENTE' AND fecha_vencimiento_licencia IS NULL`);
  console.log(`  VENCIDO: ${allVencido.size}, EN_RENOVACION: ${allRenovacion.size}, VIGENTE: ${estaciones.length - allVencido.size - allRenovacion.size}`);

  // ── 3. TRUNCATE fact tables ───────────────────────────────────────────
  console.log('\n[3/10] Limpiando fact tables...');
  const factTables = [
    'fact_alertas_operativas', 'fact_anomalias_volumen', 'fact_balance_fisico',
    'fact_despacho_volumen', 'fact_precios_semanales', 'fact_riesgo_fronterizo',
    'fact_triangulacion_fiscal', 'fact_ruta_evaporacion'
  ];
  for (const t of factTables) {
    await pool.query(`TRUNCATE ${t} CASCADE`);
    console.log(`  ✓ ${t} truncado`);
  }

  // ── 4. fact_precios_semanales ─────────────────────────────────────────
  console.log('\n[4/10] Generando fact_precios_semanales...');
  const precioRows = [];
  const weeks = [];
  for (let y = 2024; y <= 2026; y++) {
    const maxW = y === 2026 ? 12 : 52;
    for (let w = 1; w <= maxW; w++) {
      weeks.push({ anio: y, semana: w });
    }
  }

  const precioColumns = [
    'fecha_desde', 'fecha_hasta', 'anio', 'mes', 'semana_iso', 'producto_id',
    'precio_oficial_rdgal', 'precio_importacion_cif_rdgal', 'subsidio_rdgal',
    'wti_usd_bbl', 'brent_usd_bbl', 'tipo_cambio_rdsusd',
    'subsidio_semanal_total_rd', 'volumen_mercado_estimado_gal', 'ircf_nacional', 'fuente'
  ];

  const basePrices = {
    'PROD-GAS-PREM': { oficial: 293, cif_factor: 1.15 },
    'PROD-GAS-REG': { oficial: 274, cif_factor: 1.10 },
    'PROD-GAO-REG': { oficial: 239, cif_factor: 1.05 },
    'PROD-GAO-PREM': { oficial: 262, cif_factor: 1.12 },
    'PROD-GLP': { oficial: 147, cif_factor: 0.85 },
    'PROD-KERO': { oficial: 338, cif_factor: 1.20 },
    'PROD-AVTUR': { oficial: 298, cif_factor: 1.18 },
    'PROD-FUELOIL': { oficial: 198, cif_factor: 0.95 },
  };
  const volMercado = {
    'PROD-GAS-PREM': 8500000, 'PROD-GAS-REG': 12000000, 'PROD-GAO-REG': 15000000,
    'PROD-GAO-PREM': 3000000, 'PROD-GLP': 20000000, 'PROD-KERO': 500000,
    'PROD-AVTUR': 2000000, 'PROD-FUELOIL': 1500000,
  };

  weeks.forEach((wk, wi) => {
    const ws = weekStart(wk.anio, wk.semana);
    const we = new Date(ws); we.setDate(we.getDate() + 6);
    // WTI: sinusoidal trend 65-85 with noise
    const wtiBase = 72 + 10 * Math.sin(wi * 0.05) + gaussian() * 3;
    const wti = clamp(wtiBase, 55, 95);
    const brent = wti + rand(3, 7);
    const tc = 58.5 + wi * 0.02 + gaussian() * 0.3; // tipo cambio gradual increase

    productos.forEach(prod => {
      const bp = basePrices[prod.producto_id] || { oficial: 250, cif_factor: 1.0 };
      // CIF varies with WTI
      const wti_effect = (wti - 70) / 70;
      const cif = bp.oficial * bp.cif_factor * (1 + wti_effect * 0.3) + gaussian() * 5;
      const oficial = bp.oficial + gaussian() * 2;
      const subsidio = Math.max(0, cif - oficial);
      const vol = (volMercado[prod.producto_id] || 2000000) * (1 + 0.15 * Math.sin(wi * 0.12));
      const subsidioTotal = subsidio * vol;
      const ircf = clamp(subsidio / oficial * (1 + rand(-0.1, 0.1)), 0.1, 0.9);

      precioRows.push([
        formatDate(ws), formatDate(we), wk.anio, ws.getMonth() + 1, wk.semana,
        prod.producto_id, +oficial.toFixed(2), +cif.toFixed(2), +subsidio.toFixed(2),
        +wti.toFixed(2), +brent.toFixed(2), +tc.toFixed(2),
        +subsidioTotal.toFixed(0), +vol.toFixed(0), +ircf.toFixed(4), 'SIMULACION_MICM'
      ]);
    });
  });

  await batchInsert('fact_precios_semanales', precioColumns, precioRows);
  console.log(`  ✓ ${precioRows.length} precios semanales insertados`);

  // ── 5. fact_despacho_volumen ──────────────────────────────────────────
  console.log('\n[5/10] Generando fact_despacho_volumen...');
  const despachoColumns = [
    'fecha_despacho', 'anio', 'mes', 'semana_iso', 'hora_despacho',
    'estacion_id', 'producto_id', 'origen_despacho',
    'volumen_despachado_gal', 'volumen_recibido_gal', 'diferencia_despacho_rec',
    'uso_declarado', 'numero_cisterna', 'distancia_ruta_km',
    'velocidad_promedio_kmh', 'factor_llenado_cisterna', 'temperatura_ruta_c',
    'fuera_horario_declarado'
  ];

  // Sample a subset of stations for detailed weekly despachos (last 12 weeks)
  const recentWeeks = weeks.slice(-12);
  const mainProductos = ['PROD-GAS-PREM', 'PROD-GAS-REG', 'PROD-GAO-REG', 'PROD-GLP'];
  const despachoRows = [];

  // Use all stations but only 2-3 products per station
  for (const est of estaciones) {
    const ruta = rutaMap[est.estacion_id];
    const isFrontera = est.es_zona_fronteriza;
    const estProds = mainProductos.slice(0, randInt(2, 4));

    for (const wk of recentWeeks) {
      const ws = weekStart(wk.anio, wk.semana);

      for (const prodId of estProds) {
        const dia = new Date(ws);
        dia.setDate(dia.getDate() + randInt(0, 5));

        const cap = parseFloat(est.capacidad_galones_declarada || 5000);
        const baseVol = cap * rand(0.3, 0.8);
        const fronteraBoost = isFrontera ? rand(1.2, 1.5) : 1.0;
        const seasonFactor = 1 + 0.1 * Math.sin((wk.semana / 52) * Math.PI * 2);
        const volDesp = baseVol * fronteraBoost * seasonFactor + gaussian() * cap * 0.05;
        const vol = Math.max(100, +volDesp.toFixed(0));

        const dist = ruta ? parseFloat(ruta.distancia_total_km || 80) : rand(20, 250);
        const vel = ruta ? parseFloat(ruta.velocidad_promedio_kmh || 50) : rand(35, 65);
        const tempC = 28 + gaussian() * 4;
        const llenado = rand(0.75, 0.98);

        // Physics-based evaporation in transit
        const k2 = 0.00012;
        const tiempoHrs = dist / vel;
        const deltaT = Math.max(0, tempC - 15);
        const evapTransito = k2 * tiempoHrs * deltaT * (1 - llenado) * vol;
        const volRecibido = +(vol - evapTransito - rand(0, vol * 0.002)).toFixed(0);
        const diff = +(vol - volRecibido).toFixed(0);

        // fuera_horario: 5% normal, 15% for suspicious
        const hora = randInt(0, 23);
        const fueraHorario = hora < 6 || hora > 22;
        const horaStr = `${String(hora).padStart(2, '0')}:${String(randInt(0, 59)).padStart(2, '0')}:00`;

        despachoRows.push([
          formatDate(dia), wk.anio, dia.getMonth() + 1, wk.semana, horaStr,
          est.estacion_id, prodId, ruta?.origen || 'REFIDOMSA',
          vol, Math.max(0, volRecibido), Math.max(0, diff),
          isFrontera ? pick(['REVENTA', 'CONSUMO_PROPIO', 'DISTRIBUCION']) : 'REVENTA',
          `CIS-${randInt(1000, 9999)}`, +dist.toFixed(1),
          +vel.toFixed(1), +llenado.toFixed(3), +tempC.toFixed(1),
          fueraHorario
        ]);
      }
    }
  }

  await batchInsert('fact_despacho_volumen', despachoColumns, despachoRows, 300);
  console.log(`  ✓ ${despachoRows.length} despachos insertados`);

  // ── 6. fact_anomalias_volumen ─────────────────────────────────────────
  console.log('\n[6/10] Generando fact_anomalias_volumen...');
  const anomColumns = [
    'semana_inicio', 'anio', 'semana_iso', 'estacion_id', 'producto_id',
    'vol_semana_actual_gal', 'vol_media_historica_gal', 'vol_std_historica_gal',
    'z_score_bruto', 'z_score_ajustado_fisico', 'ratio_capacidad',
    'pct_variacion_sem_anterior', 'desviacion_fisica_gal', 'pct_shrinkage',
    'demanda_local_esperada_gal', 'exceso_zona_fronteriza_pct',
    'despachos_fuera_horario', 'nivel_alerta', 'score_compuesto', 'perfil_fraude'
  ];
  const anomRows = [];
  const perfiles = ['CONTRABANDO_FRON', 'DESVIO_FISCAL', 'ADULTERACION'];

  for (const est of estaciones) {
    const isFrontera = est.es_zona_fronteriza;
    const cap = parseFloat(est.capacidad_galones_declarada || 5000);
    const estProds = mainProductos.slice(0, randInt(2, 3));

    for (const wk of recentWeeks) {
      const ws = weekStart(wk.anio, wk.semana);

      for (const prodId of estProds) {
        const media = cap * rand(0.4, 0.7);
        const std = media * rand(0.1, 0.25);
        const volActual = media + gaussian() * std * (isFrontera ? 1.4 : 1.0);

        const zBruto = (volActual - media) / (std || 1);
        // Frontera bias: push z-scores up
        const zAjustado = isFrontera ? zBruto + rand(0.3, 1.0) : zBruto;
        const ratio = volActual / cap;
        const variacion = (gaussian() * 12).toFixed(1);
        const desvFisica = Math.max(0, (zAjustado > 1.5 ? rand(50, 500) : rand(0, 30)));
        const shrinkage = desvFisica / (volActual || 1);
        const demandaLocal = cap * rand(0.5, 0.8);
        const excesoFront = isFrontera ? Math.max(0, ((volActual - demandaLocal) / demandaLocal * 100)) : 0;
        const despFuera = randInt(0, zAjustado > 2 ? 5 : 1);

        let nivel = 0, score = 0, perfil = null;
        if (Math.abs(zAjustado) > 3) {
          nivel = 3; score = rand(0.7, 0.95);
          perfil = isFrontera ? 'CONTRABANDO_FRON' : pick(perfiles);
        } else if (Math.abs(zAjustado) > 2) {
          nivel = 2; score = rand(0.45, 0.7);
          perfil = pick(perfiles);
        } else if (Math.abs(zAjustado) > 1.5) {
          nivel = 1; score = rand(0.25, 0.45);
          perfil = pick(perfiles);
        }

        anomRows.push([
          formatDate(ws), wk.anio, wk.semana, est.estacion_id, prodId,
          +volActual.toFixed(0), +media.toFixed(0), +std.toFixed(0),
          +zBruto.toFixed(3), +zAjustado.toFixed(3), +ratio.toFixed(3),
          +variacion, +desvFisica.toFixed(1), +shrinkage.toFixed(5),
          +demandaLocal.toFixed(0), +excesoFront.toFixed(1),
          despFuera, nivel, +score.toFixed(3), perfil
        ]);
      }
    }
  }

  await batchInsert('fact_anomalias_volumen', anomColumns, anomRows, 300);
  console.log(`  ✓ ${anomRows.length} anomalías insertadas`);

  // ── 7. fact_balance_fisico ────────────────────────────────────────────
  console.log('\n[7/10] Generando fact_balance_fisico...');
  const balColumns = [
    'periodo_inicio', 'periodo_fin', 'semana_iso', 'anio', 'mes',
    'estacion_id', 'producto_id', 'geo_id',
    'inventario_inicial_gal', 'entradas_gal', 'ventas_declaradas_gal', 'inventario_final_gal',
    'balance_crudo_gal', 'temperatura_media_c', 'temperatura_delta_c',
    'volumen_vacio_promedio_gal', 'distancia_total_ruta_km', 'factor_llenado_promedio',
    'expansion_termica_gal', 'evap_estacion_gal', 'evap_transporte_gal', 'error_medicion_gal',
    'perdida_legitima_total_gal', 'perdida_real_gal', 'desviacion_anomala_gal',
    'pct_shrinkage', 'vol_corregido_15c', 'nivel_alerta_fisico'
  ];
  const balRows = [];

  for (const est of estaciones) {
    const cap = parseFloat(est.capacidad_galones_declarada || 5000);
    const ruta = rutaMap[est.estacion_id];
    const dist = ruta ? parseFloat(ruta.distancia_total_km || 80) : rand(20, 250);
    const vel = ruta ? parseFloat(ruta.velocidad_promedio_kmh || 50) : rand(35, 65);
    const estProds = mainProductos.slice(0, randInt(2, 3));

    for (const wk of recentWeeks) {
      const ws = weekStart(wk.anio, wk.semana);
      const we = new Date(ws); we.setDate(we.getDate() + 6);
      const mes = ws.getMonth() + 1;

      for (const prodId of estProds) {
        const climaKey = `${est.geo_id}_${mes}`;
        const clima = climaMap[climaKey];
        const tempMedia = clima ? parseFloat(clima.temperatura_media_c) : 28 + gaussian() * 3;
        const deltaT = Math.max(0, tempMedia - 15);

        const invInicial = cap * rand(0.2, 0.6);
        const entradas = cap * rand(0.3, 0.9);
        const ventas = (invInicial + entradas) * rand(0.6, 0.95);
        const invFinal = invInicial + entradas - ventas;

        // Physics calculations
        const coefExpansion = 0.00095;
        const expansion = entradas * coefExpansion * deltaT;
        const volVacio = cap - invInicial;
        const k1 = 0.00008;
        const evapEstacion = k1 * volVacio * deltaT;
        const k2 = 0.00012;
        const tiempoHrs = dist / vel;
        const llenado = rand(0.75, 0.95);
        const evapTransporte = k2 * tiempoHrs * deltaT * (1 - llenado) * entradas;
        const errorMedicion = entradas * 0.001;

        const perdidaLegitima = evapEstacion + evapTransporte + expansion + errorMedicion;
        const balanceCrudo = invInicial + entradas - ventas - invFinal;
        // Add some anomalous loss for ~8% of stations
        const anomaloRate = est.es_zona_fronteriza ? 0.15 : 0.05;
        const hasAnomaly = Math.random() < anomaloRate;
        const perdidaReal = hasAnomaly ? perdidaLegitima * rand(2, 5) : perdidaLegitima * rand(0.8, 1.3);
        const desviacion = Math.max(0, perdidaReal - perdidaLegitima);
        const shrinkage = perdidaReal / (entradas || 1);
        const volCorregido = entradas - expansion;

        let nivelFisico = 0;
        if (shrinkage > 0.015) nivelFisico = 3;
        else if (shrinkage > 0.01) nivelFisico = 2;
        else if (shrinkage > 0.005) nivelFisico = 1;

        balRows.push([
          formatDate(ws), formatDate(we), wk.semana, wk.anio, mes,
          est.estacion_id, prodId, est.geo_id,
          +invInicial.toFixed(0), +entradas.toFixed(0), +ventas.toFixed(0), +invFinal.toFixed(0),
          +balanceCrudo.toFixed(1), +tempMedia.toFixed(1), +deltaT.toFixed(1),
          +volVacio.toFixed(0), +dist.toFixed(1), +llenado.toFixed(3),
          +expansion.toFixed(2), +evapEstacion.toFixed(2), +evapTransporte.toFixed(2), +errorMedicion.toFixed(2),
          +perdidaLegitima.toFixed(2), +perdidaReal.toFixed(2), +desviacion.toFixed(2),
          +shrinkage.toFixed(6), +volCorregido.toFixed(0), nivelFisico
        ]);
      }
    }
  }

  await batchInsert('fact_balance_fisico', balColumns, balRows, 300);
  console.log(`  ✓ ${balRows.length} balances físicos insertados`);

  // ── 8. fact_alertas_operativas ─────────────────────────────────────────
  console.log('\n[8/10] Generando fact_alertas_operativas...');
  const alertColumns = [
    'nivel_alerta', 'perfil_fraude', 'estacion_id', 'empresa_rnc', 'geo_id',
    'producto_id', 'semana_referencia', 'score_compuesto',
    'z_score_volumen', 'ibf_valor', 'ircf_valor', 'desviacion_fisica_gal',
    'pct_shrinkage', 'score_red', 'score_horario', 'score_permiso',
    'descripcion_alerta', 'destinatario', 'accion_recomendada',
    'estado_alerta', 'fue_confirmada'
  ];
  const alertRows = [];
  const destinatarios = ['MICM', 'CECCOM', 'DGA', 'DGII', 'CESFRONT'];
  const estados = ['EMITIDA', 'EN_REVISION', 'CONFIRMADA', 'ACCION_TOMADA'];

  // Generate ~800 alerts from high-risk stations
  const highRiskEstaciones = estaciones
    .sort(() => Math.random() - 0.5)
    .slice(0, 400);

  for (const est of highRiskEstaciones) {
    const numAlertas = est.es_zona_fronteriza ? randInt(2, 4) : randInt(1, 2);
    const isFrontera = est.es_zona_fronteriza;

    for (let a = 0; a < numAlertas; a++) {
      const perfil = isFrontera ? pick(['CONTRABANDO_FRON', 'CONTRABANDO_FRON', 'DESVIO_FISCAL'])
        : pick(['DESVIO_FISCAL', 'DESVIO_FISCAL', 'ADULTERACION', 'CONTRABANDO_FRON']);

      let nivel, score;
      const r = Math.random();
      if (r < 0.15) { nivel = 3; score = rand(0.65, 0.95); }
      else if (r < 0.50) { nivel = 2; score = rand(0.40, 0.65); }
      else { nivel = 1; score = rand(0.20, 0.40); }

      const zScore = nivel === 3 ? rand(2.5, 5) : nivel === 2 ? rand(1.5, 3) : rand(0.8, 2);
      const ibf = rand(0, 0.3);
      const ircf = isFrontera ? rand(0.3, 0.8) : rand(0.1, 0.4);
      const desvFisica = rand(10, 500 * nivel);
      const shrinkage = rand(0.005, 0.03 * nivel);
      const scoreRed = rand(0, 0.5);
      const scoreHorario = rand(0, 0.3);
      const scorePermiso = rand(0, 0.4);

      const semRef = weekStart(2026, randInt(1, 12));
      const confirmada = Math.random() < 0.62; // 62% confirmation rate

      const desc = perfil === 'CONTRABANDO_FRON'
        ? `Despacho excesivo en zona fronteriza. Z-score: ${zScore.toFixed(1)}, IRCF: ${ircf.toFixed(2)}`
        : perfil === 'DESVIO_FISCAL'
        ? `Brecha fiscal detectada. IBF: ${(ibf * 100).toFixed(1)}%, Shrinkage: ${(shrinkage * 100).toFixed(2)}%`
        : `Patrón de adulteración detectado. Despachos fuera de horario + shrinkage anómalo`;

      const accion = perfil === 'CONTRABANDO_FRON'
        ? 'Inspección CESFRONT + verificación volumen en terminal'
        : perfil === 'DESVIO_FISCAL'
        ? 'Auditoría DGII + cruce con declaraciones DGA'
        : 'Inspección física inmediata + muestreo de calidad';

      alertRows.push([
        nivel, perfil, est.estacion_id,
        `RNC-${randInt(100000000, 999999999)}`, est.geo_id,
        pick(mainProductos), formatDate(semRef), +score.toFixed(3),
        +zScore.toFixed(3), +ibf.toFixed(4), +ircf.toFixed(4), +desvFisica.toFixed(1),
        +shrinkage.toFixed(5), +scoreRed.toFixed(3), +scoreHorario.toFixed(3), +scorePermiso.toFixed(3),
        desc, pick(destinatarios), accion,
        confirmada ? pick(['CONFIRMADA', 'ACCION_TOMADA']) : pick(estados),
        confirmada
      ]);
    }
  }

  await batchInsert('fact_alertas_operativas', alertColumns, alertRows);
  console.log(`  ✓ ${alertRows.length} alertas insertadas`);

  // ── 9. fact_riesgo_fronterizo ──────────────────────────────────────────
  console.log('\n[9/10] Generando fact_riesgo_fronterizo...');
  const riesgoColumns = [
    'semana_inicio', 'anio', 'semana_iso', 'geo_id', 'producto_id',
    'precio_importacion_rdgal', 'precio_oficial_rdgal', 'diferencial_rdgal',
    'ircf', 'ircf_slope_12sem', 'vol_despachado_gal', 'demanda_local_esperada_gal',
    'exceso_pct', 'nivel_riesgo'
  ];
  const riesgoRows = [];
  const fronteraGeos = geos.filter(g => g.es_frontera_haiti);

  for (const geo of fronteraGeos) {
    for (const prod of productos) {
      let prevIrcf = rand(0.3, 0.5);
      for (const wk of weeks.slice(-50)) {
        const ws = weekStart(wk.anio, wk.semana);
        const bp = basePrices[prod.producto_id] || { oficial: 250, cif_factor: 1.0 };
        const cif = bp.oficial * bp.cif_factor * rand(0.95, 1.15);
        const oficial = bp.oficial + gaussian() * 2;
        const diferencial = cif - oficial;

        // IRCF with drift
        const ircf = clamp(prevIrcf + gaussian() * 0.05, 0.1, 0.9);
        prevIrcf = ircf;
        const slope = gaussian() * 0.02;

        const pop = parseFloat(geo.poblacion_aprox || 50000);
        const demandaLocal = pop * rand(0.05, 0.12); // galones per capita per week
        const volDespachado = demandaLocal * rand(1.1, 1.8);
        const excesoPct = ((volDespachado - demandaLocal) / demandaLocal * 100);

        let nivel = 'BAJO';
        if (ircf > 0.7 || excesoPct > 50) nivel = 'CRITICO';
        else if (ircf > 0.5 || excesoPct > 30) nivel = 'ALTO';
        else if (ircf > 0.3 || excesoPct > 15) nivel = 'MEDIO';

        riesgoRows.push([
          formatDate(ws), wk.anio, wk.semana, geo.geo_id, prod.producto_id,
          +cif.toFixed(2), +oficial.toFixed(2), +diferencial.toFixed(2),
          +ircf.toFixed(4), +slope.toFixed(4), +volDespachado.toFixed(0), +demandaLocal.toFixed(0),
          +excesoPct.toFixed(1), nivel
        ]);
      }
    }
  }

  await batchInsert('fact_riesgo_fronterizo', riesgoColumns, riesgoRows);
  console.log(`  ✓ ${riesgoRows.length} riesgos fronterizos insertados`);

  // ── 10. fact_triangulacion_fiscal ──────────────────────────────────────
  console.log('\n[10/10] Generando fact_triangulacion_fiscal y fact_ruta_evaporacion...');
  const triColumns = [
    'periodo_inicio', 'periodo_fin', 'anio', 'semana_iso',
    'empresa_rnc', 'empresa_nombre', 'empresa_tipo', 'producto_id',
    'vol_importado_dga_gal', 'vol_declarado_dgii_gal', 'vol_perdida_tecnica_gal', 'vol_brecha_gal',
    'ibf_pct', 'ibf_rolling_12sem', 'impuesto_evadido_rd',
    'tipo_exencion', 'es_uso_exento',
    'vol_exento_declarado_gal', 'vol_exento_verificable_gal', 'vol_exento_sospechoso_gal',
    'subsidio_glp_capturado_rd', 'nivel_alerta'
  ];
  const triRows = [];
  const empresaTipos = ['IMPORTADOR', 'DISTRIBUIDOR', 'ENVASADOR'];
  const exenciones = ['DIPLOMATICA', 'ZONA_FRANCA', 'SECTOR_ELECTRICO', 'GOBIERNO', null];
  const empresaNombres = [
    'Distribuidora del Caribe SRL', 'Importaciones Dominicanas SA', 'Petromax Fuel Corp',
    'GLP Nacional SAS', 'Caribbean Energy SA', 'Combustibles del Este SRL',
    'Energia Total SA', 'Fuel Express RD', 'Multigas Dominicana',
    'PetroCentro SRL', 'AntillasOil SA', 'CombustImport SRL',
    'SunFuel Dominicana', 'EcoGas RD SA', 'Terminal Norte Fuel',
    'RD Petroleum Corp', 'AlphaCombustible SA', 'Isla Fuel SRL',
    'Cariboil Trading SA', 'Megafuel Dominicana SRL',
    'Distribuciones Martinez', 'Transporte & Fuel Ramirez',
    'Grupo Energetico del Sur', 'Norte Fuel Distribuciones',
    'Cibao Gas SA', 'Ozama Fuel SRL', 'Pacific Energy DR',
    'Global Petrol RD', 'Inversiones Energeticas Diaz', 'Combustibles Familia Gomez'
  ];

  for (let i = 0; i < 150; i++) {
    const rnc = `RNC-${String(100000000 + i * 7777).padStart(11, '0')}`;
    const nombre = i < empresaNombres.length ? empresaNombres[i] : `Empresa Combustible ${i + 1} SRL`;
    const tipo = pick(empresaTipos);
    const prodId = pick(mainProductos);
    const exencion = pick(exenciones);
    const esExento = exencion !== null;

    let ibfAcc = rand(0.01, 0.08);
    for (const wk of recentWeeks) {
      const ws = weekStart(wk.anio, wk.semana);
      const we = new Date(ws); we.setDate(we.getDate() + 6);

      const volImportado = rand(10000, 500000);
      const perdidaTecnica = volImportado * rand(0.002, 0.008);
      const ibfPct = clamp(ibfAcc + gaussian() * 0.02, 0, 0.30);
      ibfAcc = ibfPct;
      const brecha = volImportado * ibfPct;
      const volDeclarado = volImportado - perdidaTecnica - brecha;
      const impuestoEvadido = brecha * rand(15, 45); // RD$/galón de impuesto

      const ibfRolling = ibfPct * rand(0.8, 1.2);
      const volExentoDeclarado = esExento ? volImportado * rand(0.1, 0.4) : 0;
      const volExentoVerificable = esExento ? volExentoDeclarado * rand(0.5, 0.9) : 0;
      const volExentoSospechoso = esExento ? Math.max(0, volExentoDeclarado - volExentoVerificable) : 0;
      const subsidioGLP = prodId === 'PROD-GLP' ? brecha * rand(100, 147) : 0;

      let nivel = 0;
      if (ibfPct > 0.15) nivel = 3;
      else if (ibfPct > 0.08) nivel = 2;
      else if (ibfPct > 0.04) nivel = 1;

      triRows.push([
        formatDate(ws), formatDate(we), wk.anio, wk.semana,
        rnc, nombre, tipo, prodId,
        +volImportado.toFixed(0), +volDeclarado.toFixed(0), +perdidaTecnica.toFixed(0), +brecha.toFixed(0),
        +ibfPct.toFixed(4), +ibfRolling.toFixed(4), +impuestoEvadido.toFixed(0),
        exencion, esExento,
        +volExentoDeclarado.toFixed(0), +volExentoVerificable.toFixed(0), +volExentoSospechoso.toFixed(0),
        +subsidioGLP.toFixed(0), nivel
      ]);
    }
  }

  await batchInsert('fact_triangulacion_fiscal', triColumns, triRows);
  console.log(`  ✓ ${triRows.length} triangulaciones fiscales insertadas`);

  // ── fact_ruta_evaporacion ─────────────────────────────────────────────
  const evapColumns = [
    'evap_id', 'estacion_id', 'producto_id', 'mes', 'nodo_distribucion', 'ruta_nombre',
    'distancia_total_km', 'distancia_principal_km', 'ultimo_km', 'velocidad_kmh',
    'tiempo_transporte_hrs', 'temperatura_media_c', 'temperatura_max_c', 'humedad_pct',
    'delta_t', 'factor_llenado', 'vol_cisterna_gal',
    'expansion_termica_gal', 'evap_estacion_gal', 'evap_transporte_gal',
    'perdida_legitima_gal', 'pct_perdida_esperada', 'perdida_valor_rd',
    'nivel_riesgo_evap', 'es_ruta_fronteriza', 'zona_climatica'
  ];
  const evapRows = [];
  let evapCounter = 0;

  // For a sample of stations × months
  const sampleEstaciones = estaciones.sort(() => Math.random() - 0.5).slice(0, 600);
  for (const est of sampleEstaciones) {
    const ruta = rutaMap[est.estacion_id];
    if (!ruta) continue;
    const dist = parseFloat(ruta.distancia_total_km || 80);
    const vel = parseFloat(ruta.velocidad_promedio_kmh || 50);

    for (let mes = 1; mes <= 12; mes++) {
      for (const prodId of mainProductos.slice(0, 2)) {
        const climaKey = `${est.geo_id}_${mes}`;
        const clima = climaMap[climaKey];
        const tempMedia = clima ? parseFloat(clima.temperatura_media_c) : 26 + mes * 0.3;
        const tempMax = clima ? parseFloat(clima.temperatura_max_c) : tempMedia + 4;
        const humedad = clima ? parseFloat(clima.humedad_relativa_pct) : 70;
        const zona = clima?.zona_climatica || 'Tropical húmedo';
        const deltaT = Math.max(0, tempMedia - 15);

        const tiempoHrs = dist / vel;
        const llenado = rand(0.75, 0.95);
        const volCisterna = rand(6000, 10000);
        const distPrincipal = dist * 0.7;
        const ultimoKm = dist * 0.3;

        const expansion = volCisterna * 0.00095 * deltaT;
        const volVacio = volCisterna * (1 - llenado);
        const k1 = 0.00008;
        const evapEst = k1 * volVacio * deltaT;
        const k2 = 0.00012;
        const evapTrans = k2 * tiempoHrs * deltaT * (1 - llenado) * volCisterna;
        const perdidaLegitima = evapEst + evapTrans + expansion;
        const pctPerdida = perdidaLegitima / volCisterna;
        const valorRD = perdidaLegitima * rand(150, 300);

        let riesgo = 'BAJO';
        if (pctPerdida > 0.01) riesgo = 'ALTO';
        else if (pctPerdida > 0.005) riesgo = 'MEDIO';

        evapCounter++;
        evapRows.push([
          `EVAP-${String(evapCounter).padStart(6, '0')}`,
          est.estacion_id, prodId, mes,
          ruta.nodo_distribucion || 'HAINA', ruta.ruta_principal_nombre || 'RD-Sin asignar',
          +dist.toFixed(1), +distPrincipal.toFixed(1), +ultimoKm.toFixed(1), +vel.toFixed(1),
          +tiempoHrs.toFixed(2), +tempMedia.toFixed(1), +tempMax.toFixed(1), +humedad.toFixed(0),
          +deltaT.toFixed(1), +llenado.toFixed(3), +volCisterna.toFixed(0),
          +expansion.toFixed(3), +evapEst.toFixed(3), +evapTrans.toFixed(3),
          +perdidaLegitima.toFixed(3), +pctPerdida.toFixed(6), +valorRD.toFixed(0),
          riesgo, est.es_zona_fronteriza || false, zona
        ]);
      }
    }
  }

  await batchInsert('fact_ruta_evaporacion', evapColumns, evapRows, 300);
  console.log(`  ✓ ${evapRows.length} evaporaciones de ruta insertadas`);

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ✓ SIMULACIÓN COMPLETADA                                   ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Precios semanales:    ${String(precioRows.length).padStart(8)} registros              ║`);
  console.log(`║  Despachos volumen:    ${String(despachoRows.length).padStart(8)} registros              ║`);
  console.log(`║  Anomalías volumen:    ${String(anomRows.length).padStart(8)} registros              ║`);
  console.log(`║  Balance físico:       ${String(balRows.length).padStart(8)} registros              ║`);
  console.log(`║  Alertas operativas:   ${String(alertRows.length).padStart(8)} registros              ║`);
  console.log(`║  Riesgo fronterizo:    ${String(riesgoRows.length).padStart(8)} registros              ║`);
  console.log(`║  Triangulación fiscal: ${String(triRows.length).padStart(8)} registros              ║`);
  console.log(`║  Ruta evaporación:     ${String(evapRows.length).padStart(8)} registros              ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');

  await pool.end();
  console.log('\n[DB] Pool cerrado. Listo para usar.');
}

main().catch(err => {
  console.error('\n[FATAL]', err);
  pool.end();
  process.exit(1);
});
