const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');
const { lookupPrices } = require('./services/priceAggregator');
const { identifyFromImage, extractCardId, fetchCardInfo } = require('./services/cardIdentifier');
const { resolveCardImageSources } = require('./services/cardImage');
const { addFacebookPrice } = require('./services/facebook');
const { formatIdr } = require('./services/currency');
const { parseCardVariant, parseGradeKey } = require('./services/variantFilter');
const { GRADE_OPTIONS } = require('./services/gradeFilter');

const app = express();
const PORT = process.env.PORT || 3000;

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Hanya file gambar yang diperbolehkan'));
  },
});

app.use(express.json());
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function buildCardImageQuery({ cardVariant, isParallel, isSp, imageUrl, apparelId }) {
  const params = new URLSearchParams();
  if (cardVariant && cardVariant !== 'normal') params.set('variant', cardVariant);
  if (isParallel) params.set('parallel', 'true');
  if (isSp) params.set('sp', 'true');
  if (imageUrl) params.set('imageUrl', imageUrl);
  if (apparelId) params.set('apparelId', String(apparelId));
  const query = params.toString();
  return query ? `?${query}` : '';
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    version: '1.3.0',
    features: { cardVariants: ['normal', 'parallel', 'sp', 'manga', 'sec', 'promo'], gradeFilters: true },
    grades: GRADE_OPTIONS.map((g) => ({ key: g.key, label: g.label })),
  });
});

app.get('/api/card-image/:cardSetId', async (req, res) => {
  const cardSetId = (extractCardId(req.params.cardSetId) || req.params.cardSetId).toUpperCase();
  const cardVariant = parseCardVariant(req.query.variant, {
    isParallel: req.query.parallel,
    isSp: req.query.sp,
  });
  const cardInfo = await fetchCardInfo(cardSetId, { cardVariant });
  const imageUrl =
    typeof req.query.imageUrl === 'string' && /^https:\/\/cdn\.snkrdunk\.com\//.test(req.query.imageUrl)
      ? req.query.imageUrl
      : null;
  const apparelId = typeof req.query.apparelId === 'string' ? req.query.apparelId : null;

  const sources = await resolveCardImageSources(cardSetId, {
    cardVariant,
    isParallel: cardVariant === 'parallel',
    isSp: cardVariant === 'sp',
    cardInfo,
    imageUrl,
    apparelId,
  });

  for (const url of sources) {
    try {
      const imgRes = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OPCPriceChecker/1.0)' },
      });
      if (!imgRes.ok) continue;

      res.set('Content-Type', imgRes.headers.get('content-type') || 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=3600');
      res.set('Vary', 'parallel, sp');
      return res.send(Buffer.from(await imgRes.arrayBuffer()));
    } catch {
      // try next source
    }
  }

  res.status(404).json({ error: 'Card image not found' });
});

app.post('/api/check', upload.single('image'), async (req, res) => {
  let cardSetId = (req.body.cardSetId || '').trim().toUpperCase();
  let identification = null;
  let uploadedImage = null;

  try {
    if (req.file) {
      identification = await identifyFromImage(req.file.path);
      if (!cardSetId && identification.cardId) {
        cardSetId = identification.cardId;
      }

      const buffer = fs.readFileSync(req.file.path);
      uploadedImage = `data:${req.file.mimetype};base64,${buffer.toString('base64')}`;
    }

    if (!cardSetId) {
      return res.status(400).json({
        error: 'Kartu tidak terdeteksi. Masukkan kode kartu (contoh: OP01-001) atau unggah foto yang lebih jelas.',
        identification,
      });
    }

    const cardVariant = parseCardVariant(req.body.cardVariant, {
      isParallel: req.body.isParallel,
      isSp: req.body.isSp,
    });
    const gradeKey = parseGradeKey(req.body.gradeKey, { isGraded: req.body.isGraded });
    const printingKey = (req.body.printingKey || '').trim() || null;
    const cardInfo = await fetchCardInfo(cardSetId, { cardVariant });
    const pricing = await lookupPrices(cardSetId, { cardVariant, gradeKey, printingKey });
    const selectedPrinting = pricing.selectedPrinting;
    const imageQuery = buildCardImageQuery({
      cardVariant,
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      imageUrl: selectedPrinting?.imageUrl,
      apparelId: selectedPrinting?.apparelId,
    });

    res.json({
      cardSetId,
      cardVariant,
      gradeKey,
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      isGraded: gradeKey !== 'raw',
      cardInfo,
      cardImageUrl: `/api/card-image/${cardSetId}${imageQuery}`,
      uploadedImage,
      identification,
      pricing,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Terjadi kesalahan' });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

app.get('/api/prices/:cardSetId', async (req, res) => {
  try {
    const cardSetId = extractCardId(req.params.cardSetId) || req.params.cardSetId.toUpperCase();
    const cardVariant = parseCardVariant(req.query.variant, {
      isParallel: req.query.parallel,
      isSp: req.query.sp,
    });
    const gradeKey = parseGradeKey(req.query.grade || req.query.graded, {
      isGraded: req.query.graded,
    });
    const printingKey = (req.query.printing || '').trim() || null;
    const cardInfo = await fetchCardInfo(cardSetId, { cardVariant });
    const pricing = await lookupPrices(cardSetId, { cardVariant, gradeKey, printingKey });
    const selectedPrinting = pricing.selectedPrinting;
    const imageQuery = buildCardImageQuery({
      cardVariant,
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      imageUrl: selectedPrinting?.imageUrl,
      apparelId: selectedPrinting?.apparelId,
    });
    res.json({
      cardSetId,
      cardVariant,
      gradeKey,
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      isGraded: gradeKey !== 'raw',
      cardInfo,
      cardImageUrl: `/api/card-image/${cardSetId}${imageQuery}`,
      pricing,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:cardSetId', (req, res) => {
  const cardSetId = req.params.cardSetId.toUpperCase();
  const rows = db
    .prepare(
      `SELECT source, variant_name, price_original, currency, price_idr, url, fetched_at
       FROM price_entries
       WHERE UPPER(card_set_id) = ?
       ORDER BY fetched_at DESC
       LIMIT 50`
    )
    .all(cardSetId);

  res.json({ cardSetId, history: rows });
});

app.post('/api/admin/facebook-price', (req, res) => {
  const { cardSetId, variantName, priceIdr, url } = req.body;

  if (!cardSetId || !variantName || !priceIdr) {
    return res.status(400).json({ error: 'cardSetId, variantName, dan priceIdr wajib diisi' });
  }

  addFacebookPrice({
    cardSetId: cardSetId.toUpperCase(),
    variantName,
    priceIdr: Number(priceIdr),
    url,
  });

  res.json({
    ok: true,
    message: `Harga Facebook ditambahkan untuk ${cardSetId.toUpperCase()} — ${formatIdr(Number(priceIdr))}`,
  });
});

app.listen(PORT, () => {
  console.log(`One Piece Price Checker running at http://localhost:${PORT}`);
});
