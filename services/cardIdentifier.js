const path = require('path');
const { classifyCardVariant } = require('./variantFilter');

const CARD_ID_PATTERN = /\b((?:OP|ST|EB|PRB|P)\d{2}-\d{3})\b/i;

function extractCardId(text) {
  const match = String(text).replace(/\s/g, '').match(CARD_ID_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

async function identifyFromImage(imagePath) {
  const fromFilename = extractCardId(path.basename(imagePath, path.extname(imagePath)));
  return {
    cardId: fromFilename,
    rawText: fromFilename ? `Detected from filename: ${fromFilename}` : '',
    confidence: fromFilename ? 'filename' : 'not_found',
  };
}

async function fetchCardInfo(cardSetId, { cardVariant, isParallel = false, isSp = false } = {}) {
  try {
    const res = await fetch(`https://optcgapi.com/api/sets/card/${encodeURIComponent(cardSetId)}`);
    if (!res.ok) return null;
    const variants = await res.json();
    if (!Array.isArray(variants) || variants.length === 0) return null;

    const variantKind = (v) => classifyCardVariant(`${v.card_name} ${v.rarity}`);
    const want =
      cardVariant || (isSp ? 'sp' : isParallel ? 'parallel' : 'normal');
    const primary = variants.find((v) => variantKind(v) === want);
    const selected = primary ?? (want === 'normal' ? variants[0] : null);

    if (!selected) return null;

    const kind = variantKind(selected);
    return {
      cardSetId: selected.card_set_id,
      cardName: selected.card_name,
      setName: selected.set_name,
      rarity: selected.rarity,
      cardVariant: kind,
      isParallel: kind === 'parallel',
      isSp: kind === 'sp',
      isManga: kind === 'manga',
      isPromo: kind === 'promo',
      isSec: kind === 'sec',
      imageUrl: selected.card_image,
      variants: variants.map((v) => {
        const k = variantKind(v);
        return {
          name: v.card_name,
          rarity: v.rarity,
          cardVariant: k,
          isParallel: k === 'parallel',
          isSp: k === 'sp',
          isManga: k === 'manga',
          isPromo: k === 'promo',
          isSec: k === 'sec',
          marketPriceUsd: v.market_price,
          imageUrl: v.card_image,
        };
      }),
    };
  } catch {
    return null;
  }
}

module.exports = { identifyFromImage, extractCardId, fetchCardInfo };
