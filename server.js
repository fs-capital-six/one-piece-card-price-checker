require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const multer = require('multer');
const db = require('./db');
const { SAMPLE_CSV } = require('./services/postTemplate');
const { processPostTemplate } = require('./services/postTemplateRequest');
const {
  buildLabeledPhotos,
  buildLabeledPhotoEntries,
  createPostPackageZip,
} = require('./services/postPackage');
const {
  getFacebookConfig,
  createOAuthState,
  buildLoginUrl,
  loginWithFacebookCode,
  toSessionUser,
} = require('./services/facebookAuth');
const { lookupPrices } = require('./services/priceAggregator');
const { identifyFromImage, extractCardId, fetchCardInfo } = require('./services/cardIdentifier');
const { resolveCardImageSources } = require('./services/cardImage');
const { addFacebookPrice } = require('./services/facebook');
const { formatIdr } = require('./services/currency');
const { parseCardVariant, parseGradeKey } = require('./services/variantFilter');
const { GRADE_OPTIONS } = require('./services/gradeFilter');
const { LANGUAGE_OPTIONS } = require('./services/languageFilter');
const { buildDistributionDescription } = require('./services/cardDistribution');

function attachDistributionToPricing(pricing, { cardSetId, cardVariant, cardInfo }) {
  const printings = (pricing.printings || []).map((printing) => ({
    ...printing,
    distribution: buildDistributionDescription({ cardSetId, cardVariant, printing, cardInfo }),
  }));

  const selectedPrinting =
    printings.find((printing) => printing.key === pricing.selectedPrintingKey) ||
    pricing.selectedPrinting;

  return {
    ...pricing,
    printings,
    selectedPrinting,
    distribution: buildDistributionDescription({
      cardSetId,
      cardVariant,
      printing: selectedPrinting,
      cardInfo,
    }),
  };
}

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

const postTemplateUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 201 },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'csv') {
      const isCsv =
        file.mimetype === 'text/csv' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.originalname.toLowerCase().endsWith('.csv');
      return isCsv ? cb(null, true) : cb(new Error('Unggah file CSV yang valid'));
    }

    if (file.fieldname === 'photos' && file.mimetype.startsWith('image/')) {
      return cb(null, true);
    }

    return cb(new Error('Tipe file tidak didukung'));
  },
});

function cleanupUploadedFiles(files = []) {
  for (const file of files) {
    if (file?.path) fs.unlink(file.path, () => {});
  }
}

app.use(express.json());
app.set('trust proxy', 1);
app.use(
  session({
    name: 'opcc.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);
app.use((req, res, next) => {
  if (req.path === '/' || req.path === '/facebook-group-tools' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/facebook', (req, res) => {
  const { isConfigured } = getFacebookConfig();
  if (!isConfigured) {
    return res.status(503).send(
      'Facebook Login belum dikonfigurasi. Set FACEBOOK_APP_ID dan FACEBOOK_APP_SECRET di environment.'
    );
  }

  const returnTo =
    typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/')
      ? req.query.returnTo
      : '/facebook-group-tools';

  const state = createOAuthState();
  req.session.oauthState = state;
  req.session.returnTo = returnTo;
  req.session.save(() => {
    res.redirect(buildLoginUrl(req, state));
  });
});

app.get('/auth/facebook/callback', async (req, res) => {
  const { code, state, error, error_description: errorDescription } = req.query;

  if (error) {
    return res.redirect(`/facebook-group-tools?auth_error=${encodeURIComponent(errorDescription || error)}`);
  }

  if (!code || !state || state !== req.session.oauthState) {
    return res.redirect('/facebook-group-tools?auth_error=invalid_state');
  }

  try {
    const user = await loginWithFacebookCode(req, code);
    req.session.user = toSessionUser(user);
    delete req.session.oauthState;

    const returnTo = req.session.returnTo || '/facebook-group-tools';
    delete req.session.returnTo;

    req.session.save(() => {
      res.redirect(returnTo);
    });
  } catch (err) {
    res.redirect(`/facebook-group-tools?auth_error=${encodeURIComponent(err.message)}`);
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/facebook-group-tools');
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.user) {
    return res.status(401).json({ authenticated: false });
  }

  res.json({ authenticated: true, user: req.session.user });
});

app.get('/facebook-group-tools', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'facebook-group-tools.html'));
});

app.get('/api/facebook-tools/sample-csv', (_req, res) => {
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="template-post-facebook.csv"');
  res.send(SAMPLE_CSV);
});

const postTemplateFields = postTemplateUpload.fields([
  { name: 'csv', maxCount: 1 },
  { name: 'photos', maxCount: 200 },
]);

app.post('/api/facebook-tools/generate-post', postTemplateFields, async (req, res) => {
  let uploaded = [];

  try {
    const { uploaded: files, photoFiles, result } = processPostTemplate(req);
    uploaded = files;

    const labeledPhotos = await buildLabeledPhotos({
      items: result.items,
      photoFiles,
    });

    res.json({
      ok: true,
      ...result,
      labeledPhotoCount: labeledPhotos.length,
      labeledPhotos: labeledPhotos.map((photo) => ({
        rowNumber: photo.rowNumber,
        cardCode: photo.cardCode,
        filename: photo.filename,
        dataUrl: `data:image/jpeg;base64,${photo.buffer.toString('base64')}`,
      })),
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Gagal membuat template posting' });
  } finally {
    cleanupUploadedFiles(uploaded);
  }
});

app.post('/api/facebook-tools/download-package', postTemplateFields, async (req, res) => {
  let uploaded = [];

  try {
    const { uploaded: files, photoFiles, result } = processPostTemplate(req);
    uploaded = files;

    const labeledEntries = await buildLabeledPhotoEntries({
      items: result.items,
      photoFiles,
    });

    if (labeledEntries.length === 0) {
      return res.status(400).json({
        error: 'Tidak ada foto yang cocok dengan CSV. Pastikan kolom photo atau nama file sesuai kode kartu.',
      });
    }

    const filename = `facebook-post-${new Date().toISOString().slice(0, 10)}.zip`;
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = createPostPackageZip({
      postText: result.postText,
      labeledEntries,
    });

    archive.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Gagal membuat file ZIP' });
      }
    });

    archive.pipe(res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(400).json({ error: err.message || 'Gagal membuat paket unduhan' });
    }
  } finally {
    cleanupUploadedFiles(uploaded);
  }
});

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
    version: '1.8.0',
    features: {
      cardVariants: ['normal', 'parallel', 'sp', 'manga', 'sec', 'promo'],
      gradeFilters: true,
      languageFilter: true,
    },
    grades: GRADE_OPTIONS.map((g) => ({ key: g.key, label: g.label })),
    languages: LANGUAGE_OPTIONS.map((l) => ({ key: l.key, label: l.label, enabled: l.enabled })),
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

app.post('/api/identify', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Unggah foto kartu terlebih dahulu.' });
  }

  try {
    const identification = await identifyFromImage(req.file.path);
    res.json(identification);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Gagal membaca foto kartu' });
  } finally {
    if (req.file) fs.unlink(req.file.path, () => {});
  }
});

app.post('/api/check', upload.single('image'), async (req, res) => {
  let cardSetId = extractCardId(req.body.cardSetId || '') || (req.body.cardSetId || '').trim().toUpperCase();
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
      const hasImage = Boolean(req.file);
      return res.status(400).json({
        error: hasImage
          ? 'Kode kartu tidak terbaca dari foto. Pastikan bagian bawah kartu (nomor OPxx-xxx) terlihat jelas, atau ketik kode kartu manual.'
          : 'Unggah foto kartu atau masukkan kode kartu (contoh: OP01-001).',
        identification,
      });
    }

    const cardVariant = parseCardVariant(req.body.cardVariant, {
      isParallel: req.body.isParallel,
      isSp: req.body.isSp,
    });
    const gradeKey = parseGradeKey(req.body.gradeKey, { isGraded: req.body.isGraded });
    const languageKey = req.body.language || req.body.languageKey || 'ja';
    const printingKey = (req.body.printingKey || '').trim() || null;
    const cardInfo = await fetchCardInfo(cardSetId, { cardVariant });
    const pricing = attachDistributionToPricing(
      await lookupPrices(cardSetId, { cardVariant, gradeKey, languageKey, printingKey }),
      { cardSetId, cardVariant, cardInfo }
    );
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
      languageKey: pricing.languageKey || languageKey,
      languageLabel: pricing.languageLabel,
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      isGraded: gradeKey !== 'raw',
      cardInfo,
      cardImageUrl: `/api/card-image/${cardSetId}${imageQuery}`,
      uploadedImage,
      identification,
      pricing,
      distribution: pricing.distribution,
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
    const languageKey = req.query.language || req.query.lang || 'ja';
    const cardInfo = await fetchCardInfo(cardSetId, { cardVariant });
    const pricing = attachDistributionToPricing(
      await lookupPrices(cardSetId, { cardVariant, gradeKey, languageKey, printingKey }),
      { cardSetId, cardVariant, cardInfo }
    );
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
      languageKey: pricing.languageKey || languageKey,
      languageLabel: pricing.languageLabel,
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      isGraded: gradeKey !== 'raw',
      cardInfo,
      cardImageUrl: `/api/card-image/${cardSetId}${imageQuery}`,
      pricing,
      distribution: pricing.distribution,
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`One Piece Price Checker running on port ${PORT}`);
});
