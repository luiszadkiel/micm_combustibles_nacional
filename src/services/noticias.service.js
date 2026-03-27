// ============================================================================
// MICM-INTEL v1.0 — Servicio de Noticias (NewsData.io)
// ============================================================================
const https = require('https');
const http = require('http');

// API key — set via environment variable NEWSDATA_API_KEY
const API_KEY = process.env.NEWSDATA_API_KEY || '';

// Cache: avoid hitting the API on every request (free tier = 200 credits/day)
let _cache = { data: null, ts: 0 };
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Fetch fuel-related news for Dominican Republic / Latin America.
 * Uses keywords in Spanish related to combustibles, petróleo, GLP, gasolina, diesel.
 */
async function getNoticias(forceRefresh = false) {
  // Return cached if fresh
  if (!forceRefresh && _cache.data && (Date.now() - _cache.ts) < CACHE_TTL_MS) {
    return _cache.data;
  }

  if (!API_KEY) {
    console.warn('[NOTICIAS] ⚠ NEWSDATA_API_KEY no configurado. Usando noticias de demo.');
    return getDemoNoticias();
  }

  const keywords = encodeURIComponent('combustible OR petróleo OR gasolina OR GLP OR diesel OR refinería');
  const url = `https://newsdata.io/api/1/latest?apikey=${API_KEY}&q=${keywords}&language=es&size=20`;

  try {
    const raw = await _httpGet(url);
    const json = JSON.parse(raw);

    if (json.status !== 'success' || !json.results) {
      console.warn('[NOTICIAS] API response error:', json.status);
      return _cache.data || getDemoNoticias();
    }

    const noticias = json.results.map(r => ({
      id: r.article_id,
      title: r.title,
      description: r.description || '',
      content: r.content || r.description || '',
      link: r.link,
      source: r.source_name || r.source_id || '',
      sourceIcon: r.source_icon || '',
      imageUrl: r.image_url || null,
      pubDate: r.pubDate,
      sentiment: r.sentiment || 'neutral',
      category: (r.category || [])[0] || 'general',
      aiSummary: r.ai_summary || null,
      keywords: r.keywords || [],
    }));

    _cache = { data: noticias, ts: Date.now() };
    console.log(`[NOTICIAS] ✓ ${noticias.length} noticias obtenidas de NewsData.io`);
    return noticias;
  } catch (err) {
    console.error('[NOTICIAS] Error fetching:', err.message);
    return _cache.data || getDemoNoticias();
  }
}

/**
 * Demo news when no API key is configured
 */
function getDemoNoticias() {
  return [
    {
      id: 'demo-1',
      title: 'Precios de combustibles se mantienen sin cambios esta semana en RD',
      description: 'El Ministerio de Industria, Comercio y Mipymes (MICM) anunció que los precios de los combustibles se mantienen sin variación para la semana del 22 al 28 de marzo.',
      content: 'El Ministerio de Industria, Comercio y Mipymes (MICM) anunció que los precios de los combustibles se mantienen sin variación para la semana del 22 al 28 de marzo de 2026. La gasolina premium se mantiene en RD$290.10, la regular en RD$272.50, el gasoil óptimo en RD$221.60 y el GLP en RD$147.60.',
      link: '#', source: 'MICM', sourceIcon: '', imageUrl: '/img/noticias/fuel_prices.png',
      pubDate: new Date().toISOString(), sentiment: 'neutral', category: 'business',
      aiSummary: 'Precios de combustibles estables en República Dominicana.', keywords: ['combustibles', 'MICM', 'precios'],
    },
    {
      id: 'demo-2',
      title: 'Petróleo WTI sube a $103 por barril por tensiones en el Estrecho de Ormuz',
      description: 'El precio del crudo West Texas Intermediate alcanzó los $103 por barril debido a las tensiones geopolíticas en Medio Oriente.',
      content: 'El precio del crudo WTI subió a $103 por barril, impulsado por las tensiones en el Estrecho de Ormuz. Analistas advierten que el conflicto entre Irán y Estados Unidos podría afectar el suministro global de petróleo, con impacto directo en los precios de combustibles en el Caribe.',
      link: '#', source: 'Reuters', sourceIcon: '', imageUrl: '/img/noticias/oil_barrel.png',
      pubDate: new Date().toISOString(), sentiment: 'negative', category: 'business',
      aiSummary: 'Precios del petróleo suben por tensiones geopolíticas.', keywords: ['petróleo', 'WTI', 'Ormuz'],
    },
    {
      id: 'demo-3',
      title: 'RD importó 2.5 millones de barriles de combustible en febrero',
      description: 'La República Dominicana importó 2.5 millones de barriles de combustibles en febrero de 2026, un aumento del 8% respecto al mismo mes del año anterior.',
      content: 'Según datos de la Dirección General de Aduanas, las importaciones de combustibles alcanzaron 2.5 millones de barriles en febrero, representando un gasto de RD$18,500 millones. El GLP representó el 35% del total importado.',
      link: '#', source: 'Aduanas RD', sourceIcon: '', imageUrl: '/img/noticias/fuel_tanker.png',
      pubDate: new Date().toISOString(), sentiment: 'neutral', category: 'business',
      aiSummary: 'Importaciones de combustible aumentan en RD.', keywords: ['importaciones', 'combustible', 'barriles'],
    },
    {
      id: 'demo-4',
      title: 'Gobierno anuncia nuevo subsidio al GLP para hogares vulnerables',
      description: 'El programa Bonogas Hogar beneficiará a 1.2 millones de familias con un subsidio mensual de RD$450 en GLP.',
      content: 'El presidente anunció la extensión del programa Bonogas Hogar, que beneficia a familias de bajos ingresos con un subsidio para la compra de gas licuado de petróleo (GLP). El programa cubrirá a 1.2 millones de hogares.',
      link: '#', source: 'Presidencia RD', sourceIcon: '', imageUrl: '/img/noticias/glp_subsidy.png',
      pubDate: new Date().toISOString(), sentiment: 'positive', category: 'politics',
      aiSummary: 'Nuevo subsidio al GLP para hogares vulnerables.', keywords: ['subsidio', 'GLP', 'Bonogas'],
    },
    {
      id: 'demo-5',
      title: 'Refidomsa moderniza terminal de almacenamiento en Haina',
      description: 'La Refinería Dominicana de Petróleo invierte US$45 millones en la modernización de sus instalaciones.',
      content: 'Refidomsa PDV anunció una inversión de US$45 millones para modernizar su terminal de almacenamiento en Haina, San Cristóbal. Las mejoras incluyen nuevos tanques de almacenamiento y sistemas de monitoreo ambiental.',
      link: '#', source: 'Refidomsa', sourceIcon: '', imageUrl: '/img/noticias/refidomsa.png',
      pubDate: new Date().toISOString(), sentiment: 'positive', category: 'business',
      aiSummary: 'Inversión en infraestructura de almacenamiento de combustibles.', keywords: ['Refidomsa', 'Haina', 'modernización'],
    },
  ];
}

function _httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, { timeout: 10000 }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

module.exports = { getNoticias };
