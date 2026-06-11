const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { createWorker, PSM } = require('tesseract.js');
const { classifyCardVariant } = require('./variantFilter');
const { analyzeImageAttributes, buildAutoFillHints } = require('./imageAnalyzer');

const CARD_ID_PATTERN = /\b((?:OP|ST|EB|PRB|P)\d{2}-\d{3})\b/i;
const TESSDATA_DIR = path.join(__dirname, '..');

let workerPromise = null;

function extractCardId(text) {
  const normalized = String(text).replace(/\s/g, '').toUpperCase();
  const candidates = [
    normalized,
    normalized.replace(/0P/g, 'OP'),
    normalized.replace(/([A-Z]{2})0(\d-\d{3})/g, '$1O$2'),
  ];

  for (const candidate of candidates) {
    const match = candidate.match(CARD_ID_PATTERN);
    if (match) return match[1].toUpperCase();
  }

  const loose = normalized.match(/[O0]P\d{2}-\d{3}/);
  if (loose) {
    return loose[0].replace(/^0P/i, 'OP').toUpperCase();
  }

  return null;
}

function normalizeOcrText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

async function getOcrWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng', 1, {
        langPath: TESSDATA_DIR,
        gzip: false,
        cachePath: path.join(TESSDATA_DIR, 'data', 'tesseract-cache'),
      });
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      });
      return worker;
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

function buildRegionSpecs(width, height) {
  const barHeight = Math.max(28, Math.floor(height * 0.1));
  const barTop = height - barHeight;
  const cornerWidth = Math.max(1, Math.floor(width * 0.42));
  const cornerHeight = Math.max(1, Math.floor(height * 0.12));
  const cornerTop = height - cornerHeight;

  return [
    {
      name: 'bottom-right',
      left: width - cornerWidth,
      top: cornerTop,
      width: cornerWidth,
      height: cornerHeight,
    },
    {
      name: 'bottom-bar',
      left: 0,
      top: barTop,
      width,
      height: barHeight,
    },
    {
      name: 'bottom-left',
      left: 0,
      top: cornerTop,
      width: Math.max(1, Math.floor(width * 0.48)),
      height: cornerHeight,
    },
  ];
}

async function preprocessForOcr(buffer, variant = 'light') {
  const meta = await sharp(buffer).metadata();
  const targetWidth = Math.max((meta.width || 1) * 4, 1600);

  let pipeline = sharp(buffer).resize({
    width: targetWidth,
    withoutEnlargement: false,
    kernel: sharp.kernel.lanczos3,
  });

  if (variant === 'grey') {
    pipeline = pipeline.greyscale().normalize().sharpen();
  } else if (variant === 'linear') {
    pipeline = pipeline.greyscale().linear(1.5, -40).sharpen();
  }

  return pipeline.png().toBuffer();
}

async function buildOcrRegions(imagePath) {
  const metadata = await sharp(imagePath).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;
  if (!width || !height) {
    return [{ name: 'full-grey', buffer: await preprocessForOcr(fs.readFileSync(imagePath)) }];
  }

  const prepared = [];
  for (const region of buildRegionSpecs(width, height)) {
    const crop = await sharp(imagePath)
      .extract({
        left: region.left,
        top: region.top,
        width: region.width,
        height: region.height,
      })
      .toBuffer();

    const variants = region.name === 'bottom-right' ? ['light', 'grey', 'linear'] : ['grey', 'light'];

    for (const variant of variants) {
      prepared.push({
        name: `${region.name}-${variant}`,
        buffer: await preprocessForOcr(crop, variant),
      });
    }
  }

  return prepared;
}

async function recognizeRegion(worker, region) {
  const psmModes = region.name.startsWith('bottom-right')
    ? [PSM.SPARSE_TEXT, PSM.SINGLE_BLOCK, PSM.SINGLE_LINE]
    : [PSM.SINGLE_BLOCK, PSM.SINGLE_LINE];

  for (const psm of psmModes) {
    await worker.setParameters({ tessedit_pageseg_mode: psm });
    const { data } = await worker.recognize(region.buffer);
    const rawText = data?.text || '';
    const cardId = extractCardId(normalizeOcrText(rawText)) || extractCardId(rawText);
    if (cardId) {
      return {
        region: region.name,
        rawText: rawText.trim(),
        cardId,
        confidence: data?.confidence || 0,
        psm,
      };
    }
  }

  return null;
}

async function ocrImageRegions(imagePath) {
  const worker = await getOcrWorker();
  const regions = await buildOcrRegions(imagePath);
  const attempts = [];

  for (const region of regions) {
    const result = await recognizeRegion(worker, region);
    if (result) {
      attempts.push(result);
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return {
        cardId: result.cardId,
        rawText: result.rawText,
        confidence: 'ocr',
        region: result.region,
        attempts,
      };
    }
  }

  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
  return {
    cardId: null,
    rawText: '',
    confidence: 'not_found',
    region: null,
    attempts,
  };
}

async function ocrTopRegionForGrade(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;
    if (!width || !height) return '';

    const topHeight = Math.max(1, Math.floor(height * 0.35));
    const buffer = await sharp(imagePath)
      .extract({ left: 0, top: 0, width, height: topHeight })
      .resize({ width: Math.max(width * 2, 1200), withoutEnlargement: false })
      .greyscale()
      .normalize()
      .png()
      .toBuffer();

    const worker = await getOcrWorker();
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    const { data } = await worker.recognize(buffer);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
    return (data?.text || '').trim();
  } catch {
    return '';
  }
}

async function enrichIdentification(imagePath, baseResult) {
  const topText = await ocrTopRegionForGrade(imagePath);
  const combinedText = [baseResult.rawText, topText].filter(Boolean).join('\n');
  const attributes = await analyzeImageAttributes(imagePath, { ocrText: combinedText });

  return {
    ...baseResult,
    rawText: combinedText || baseResult.rawText,
    cardVariant: attributes.cardVariant,
    gradeKey: attributes.gradeKey,
    hasParallelStar: attributes.hasParallelStar,
    autoFillHints: buildAutoFillHints({
      cardId: baseResult.cardId,
      cardVariant: attributes.cardVariant,
      gradeKey: attributes.gradeKey,
      hasParallelStar: attributes.hasParallelStar,
    }),
  };
}

async function identifyFromImage(imagePath) {
  const fromFilename = extractCardId(path.basename(imagePath, path.extname(imagePath)));
  if (fromFilename) {
    return enrichIdentification(imagePath, {
      cardId: fromFilename,
      rawText: `Detected from filename: ${fromFilename}`,
      confidence: 'filename',
    });
  }

  try {
    const ocr = await ocrImageRegions(imagePath);
    const baseResult = ocr.cardId
      ? {
          cardId: ocr.cardId,
          rawText: ocr.rawText,
          confidence: ocr.confidence,
          region: ocr.region,
        }
      : {
          cardId: null,
          rawText: ocr.rawText,
          confidence: 'not_found',
          region: ocr.region,
        };

    return enrichIdentification(imagePath, baseResult);
  } catch (err) {
    return {
      cardId: null,
      rawText: '',
      confidence: 'error',
      error: err.message,
      cardVariant: 'normal',
      gradeKey: 'raw',
      autoFillHints: [],
    };
  }
}

async function fetchCardInfo(cardSetId, { cardVariant, isParallel = false, isSp = false } = {}) {
  try {
    const res = await fetch(`https://optcgapi.com/api/sets/card/${encodeURIComponent(cardSetId)}`);
    if (!res.ok) return null;
    const variants = await res.json();
    if (!Array.isArray(variants) || variants.length === 0) return null;

    const variantKind = (v) => classifyCardVariant(`${v.card_name} ${v.rarity}`);
    const want =
      cardVariant === 'all'
        ? 'normal'
        : cardVariant || (isSp ? 'sp' : isParallel ? 'parallel' : 'normal');
    const primary = variants.find((v) => variantKind(v) === want);
    const selected =
      primary ??
      variants.find((v) => String(v.card_set_id).toUpperCase() === String(cardSetId).toUpperCase()) ??
      variants[0];

    if (!selected) return null;

    const kind = primary ? variantKind(selected) : want;
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
