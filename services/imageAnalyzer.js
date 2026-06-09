const sharp = require('sharp');

function isGoldStarPixel(r, g, b) {
  return r > 170 && g > 120 && b < 140 && r > b + 35 && g > b + 10;
}

function isBrightAccentPixel(r, g, b) {
  return r + g + b > 600 && Math.max(r, g, b) - Math.min(r, g, b) > 35;
}

async function detectParallelStar(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) return false;

  const region = {
    left: Math.floor(width * 0.74),
    top: Math.floor(height * 0.84),
    width: Math.max(1, Math.floor(width * 0.18)),
    height: Math.max(1, Math.floor(height * 0.08)),
  };

  const { data, info } = await sharp(imagePath)
    .extract(region)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let goldCount = 0;
  let brightCount = 0;
  const channels = info.channels || 3;
  const total = data.length / channels;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isGoldStarPixel(r, g, b)) goldCount += 1;
    if (isBrightAccentPixel(r, g, b)) brightCount += 1;
  }

  const goldRatio = goldCount / total;
  const brightRatio = brightCount / total;
  return goldRatio > 0.007 || (goldRatio > 0.0035 && brightRatio > 0.018);
}

function detectGradeKeyFromText(text) {
  const normalized = String(text).replace(/\s+/g, ' ').toUpperCase();
  if (!normalized.trim()) return 'raw';

  if (/BLACK\s*LABEL|BGS\s*10\s*BL/.test(normalized)) return 'BGS10_BL';
  if (/GOLD\s*LABEL|BGS\s*10\s*GL/.test(normalized)) return 'BGS10_GL';
  if (/BGS\s*9\.5/.test(normalized)) return 'BGS9_5';
  if (/BGS\s*9(?!\.)|BGS\s*9\s|BGS\s*9$/.test(normalized)) return 'BGS9';
  if (/BGS\s*10/.test(normalized)) return 'BGS10';
  if (/ARS\s*10\+/.test(normalized)) return 'ARS10_PLUS';
  if (/ARS\s*10/.test(normalized)) return 'ARS10';
  if (/ARS\s*9/.test(normalized)) return 'ARS9';
  if (/ARS\s*8/.test(normalized)) return 'ARS8';
  if (/PSA\s*10|GEM\s*MT|GEMMT/.test(normalized)) return 'PSA10';
  if (/PSA\s*9/.test(normalized)) return 'PSA9';
  if (/PSA\s*[87]/.test(normalized)) return 'PSA8';
  if (/CGC|BECKETT|PSA|BGS|ARS|鑑定|GRADED/.test(normalized)) return 'CGC';

  return 'raw';
}

function detectCardVariantFromSignals({ ocrText = '', hasParallelStar = false } = {}) {
  const text = String(ocrText).toUpperCase();

  if (/COMIC|MANGA|漫画|SEC-SP|SR-SP|SP\s*\(\s*COMIC/.test(text)) return 'manga';
  if (/\bSP\b|SPECIAL\s*CARD/.test(text)) return 'sp';
  if (hasParallelStar || /\bSR-P\b|\bSEC-P\b|\bL-P\b|PARALLEL|パラレル/.test(text)) return 'parallel';
  if (/\bSEC\b/.test(text) && !/SEC-SP|SEC-P/.test(text)) return 'sec';
  if (/\bP-\d{3}\b|PROMO/.test(text)) return 'promo';

  return 'normal';
}

function buildAutoFillHints({ cardId, cardVariant, gradeKey, hasParallelStar }) {
  const hints = [];
  if (cardId) hints.push(`Kode: ${cardId}`);
  if (cardVariant !== 'normal') {
    const labels = {
      parallel: 'Parallel (★)',
      sp: 'SP',
      manga: 'Manga',
      sec: 'SEC',
      promo: 'Promo',
    };
    hints.push(`Varian: ${labels[cardVariant] || cardVariant}`);
  } else if (hasParallelStar) {
    hints.push('Varian: Parallel (★)');
  }
  if (gradeKey !== 'raw') {
    hints.push(`Grade: ${gradeKey.replace(/_/g, ' ')}`);
  }
  return hints;
}

async function analyzeImageAttributes(imagePath, { ocrText = '' } = {}) {
  const hasParallelStar = await detectParallelStar(imagePath);
  const cardVariant = detectCardVariantFromSignals({ ocrText, hasParallelStar });
  const gradeKey = detectGradeKeyFromText(ocrText);

  return {
    cardVariant,
    gradeKey,
    hasParallelStar,
    hints: buildAutoFillHints({ cardVariant, gradeKey, hasParallelStar, cardId: null }),
  };
}

module.exports = {
  detectParallelStar,
  detectGradeKeyFromText,
  detectCardVariantFromSignals,
  buildAutoFillHints,
  analyzeImageAttributes,
};
