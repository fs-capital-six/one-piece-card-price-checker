const cheerio = require('cheerio');
const { toIdr } = require('./currency');
const { attachVariantFlags } = require('./variantFilter');

const BASE = 'https://yuyu-tei.jp';
const SUPPORTS_GRADED = false;

function parseYen(text) {
  const match = text.replace(/,/g, '').match(/(\d+)\s*円/);
  return match ? parseInt(match[1], 10) : null;
}

function parseYuyuTeiRarity(cardSetId, alt) {
  const afterId = alt.split(cardSetId.toUpperCase())[1] || alt.split(cardSetId)[1] || '';
  const match = afterId.trim().match(/^([A-Z]+(?:-[A-Z]+)?)\b/);
  return match ? match[1] : '';
}

function buildYuyuTeiVariantName(name, alt, cardSetId, rarity) {
  if (rarity === 'SP') {
    const baseName = name.replace(/\(パラレル\)/g, '').trim() || name;
    return `${baseName} SP [${cardSetId}]`;
  }
  if (rarity?.startsWith('P-') || name.includes('パラレル')) {
    return `${name} [${cardSetId}] ${rarity}`.trim();
  }
  return `${name} [${cardSetId}] ${rarity}`.trim();
}

async function fetchYuyuTeiPrices(cardSetId) {
  const url = `${BASE}/sell/opc/s/search?search_word=${encodeURIComponent(cardSetId)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OPCPriceChecker/1.0)' },
  });

  if (!res.ok) throw new Error(`Yuyu-Tei request failed (${res.status})`);

  const html = await res.text();
  const $ = cheerio.load(html);
  const results = [];

  $('.card-product').each((_, el) => {
    const block = $(el);
    const idText = block.find('span.d-block.border').first().text().trim();
    if (!idText || idText.toUpperCase() !== cardSetId.toUpperCase()) return;

    const name = block.find('h4.text-primary').first().text().trim();
    const priceText = block.find('strong.d-block.text-end').first().text().trim();
    const yen = parseYen(priceText);
    if (!yen) return;

    const link = block.find('a[href*="/sell/opc/card/"]').first().attr('href');
    const alt = block.find('img.card').first().attr('alt') || '';
    const rarity = parseYuyuTeiRarity(cardSetId, alt);
    const variantName = buildYuyuTeiVariantName(name || alt, alt, cardSetId, rarity);

    results.push(
      attachVariantFlags({
        source: 'yuyu-tei',
        supportsGraded: SUPPORTS_GRADED,
        variantName,
        priceOriginal: yen,
        currency: 'JPY',
        url: link ? (link.startsWith('http') ? link : `${BASE}${link}`) : url,
        rarity,
      })
    );
  });

  for (const item of results) {
    item.priceIdr = await toIdr(item.priceOriginal, 'JPY');
  }

  return results;
}

module.exports = { fetchYuyuTeiPrices, SUPPORTS_GRADED };
