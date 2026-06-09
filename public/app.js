const form = document.getElementById('checkForm');
const imageInput = document.getElementById('imageInput');
const dropZone = document.getElementById('dropZone');
const dropText = document.getElementById('dropText');
const preview = document.getElementById('preview');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('error');
const results = document.getElementById('results');
const submitBtn = document.getElementById('submitBtn');
const adminForm = document.getElementById('adminForm');
const adminMsg = document.getElementById('adminMsg');
const cardVariantSelect = document.getElementById('cardVariant');
const gradeKeySelect = document.getElementById('gradeKey');
const parallelDetectHint = document.getElementById('parallelDetectHint');
const cardSetIdInput = document.getElementById('cardSetId');
const cardIdDetectHint = document.getElementById('cardIdDetectHint');
const uploadAutoFillHint = document.getElementById('uploadAutoFillHint');
const printingSection = document.getElementById('printingSection');
const printingPicker = document.getElementById('printingPicker');
const printingHint = document.getElementById('printingHint');
const imageZoomModal = document.getElementById('imageZoomModal');
const imageZoomImg = document.getElementById('imageZoomImg');
const imageZoomCaption = document.getElementById('imageZoomCaption');

let lastResultData = null;
let selectedPrintingKey = null;

const SOURCE_LABELS = {
  'yuyu-tei': { name: 'Yuyu-Tei', class: 'source-badge-yuyu', url: 'https://yuyu-tei.jp/' },
  snkrdunk: { name: 'SNKRDUNK', class: 'source-badge-snkrdunk', url: 'https://snkrdunk.com/' },
  facebook: { name: 'Facebook Group', class: 'source-badge-facebook', url: '#' },
};

function formatIdr(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function formatOriginal(price, currency) {
  if (currency === 'JPY') return `¥${price.toLocaleString('ja-JP')}`;
  if (currency === 'USD') return `$${price.toLocaleString('en-US')}`;
  return formatIdr(price);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isHttpUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url);
}

function sourceLinkHtml(url, label = 'Buka halaman →') {
  if (!isHttpUrl(url)) return '<span class="text-slate-600">—</span>';
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="source-link">${escapeHtml(label)}</a>`;
}

const VARIANT_LABELS = {
  normal: 'Normal',
  parallel: 'Parallel (★)',
  sp: 'SP',
  manga: 'Manga / Comic',
  sec: 'SEC (Secret Rare)',
  promo: 'Promo',
};

const VARIANT_BADGE_CLASS = {
  normal: 'variant-badge-normal',
  parallel: 'variant-badge-parallel',
  sp: 'variant-badge-sp',
  manga: 'variant-badge-manga',
  sec: 'variant-badge-sec',
  promo: 'variant-badge-promo',
};

function buildGradeUnavailableMessage({ cardVariant, gradeLabel }) {
  const variant = VARIANT_LABELS[cardVariant] || cardVariant;
  return `Tidak tersedia — belum ada riwayat penjualan ${gradeLabel} untuk kartu ${variant} di SNKRDUNK. Yuyu-Tei hanya menjual kartu raw/ungraded.`;
}

function openImageZoom(src, { alt = 'Card image', caption = '' } = {}) {
  if (!src || !imageZoomModal || !imageZoomImg) return;

  imageZoomImg.src = src;
  imageZoomImg.alt = alt;
  imageZoomCaption.textContent = caption;
  imageZoomCaption.classList.toggle('hidden', !caption);
  imageZoomModal.classList.remove('hidden');
  imageZoomModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeImageZoom() {
  if (!imageZoomModal || !imageZoomImg) return;

  imageZoomModal.classList.add('hidden');
  imageZoomModal.setAttribute('aria-hidden', 'true');
  imageZoomImg.src = '';
  imageZoomCaption.textContent = '';
  document.body.style.overflow = '';
}

function bindImageZoom(img, getMeta = () => ({})) {
  if (!img) return;
  img.addEventListener('click', (event) => {
    event.stopPropagation();
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:image/svg+xml')) return;
    const meta = typeof getMeta === 'function' ? getMeta() : {};
    openImageZoom(src, meta);
  });
}

dropZone.addEventListener('click', () => imageInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('border-amber-500');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-amber-500'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('border-amber-500');
  const file = e.dataTransfer.files[0];
  if (file) setPreview(file);
});

imageInput.addEventListener('change', () => {
  if (imageInput.files[0]) setPreview(imageInput.files[0]);
});

function setSelectValue(select, value) {
  if (!select || !value) return false;
  const option = select.querySelector(`option[value="${CSS.escape(value)}"]`);
  if (!option) return false;
  select.value = value;
  return true;
}

function flashAutoFilledField(el) {
  if (!el) return;
  el.classList.add('auto-filled-field');
  window.setTimeout(() => el.classList.remove('auto-filled-field'), 1600);
}

function showParallelDetectHint(message, detected) {
  if (!parallelDetectHint) return;
  parallelDetectHint.textContent = message;
  parallelDetectHint.className = detected
    ? 'text-xs text-amber-400/90 mt-3'
    : 'text-xs text-slate-500 mt-3';
  parallelDetectHint.classList.toggle('hidden', !message);
}

function showUploadAutoFillHint(message) {
  if (!uploadAutoFillHint) return;
  uploadAutoFillHint.textContent = message;
  uploadAutoFillHint.classList.toggle('hidden', !message);
}

function applyUploadAnalysis(data) {
  const filled = [];

  if (data.cardId) {
    cardSetIdInput.value = data.cardId;
    flashAutoFilledField(cardSetIdInput);
    filled.push(`kode ${data.cardId}`);
  }

  if (data.cardVariant && setSelectValue(cardVariantSelect, data.cardVariant)) {
    flashAutoFilledField(cardVariantSelect);
    if (data.cardVariant !== 'normal') {
      filled.push(`varian ${VARIANT_LABELS[data.cardVariant] || data.cardVariant}`);
    }
  }

  if (data.gradeKey && setSelectValue(gradeKeySelect, data.gradeKey)) {
    flashAutoFilledField(gradeKeySelect);
    if (data.gradeKey !== 'raw') {
      filled.push(`grade ${gradeKeySelect.selectedOptions[0]?.textContent || data.gradeKey}`);
    }
  }

  if (data.cardId) {
    showCardIdDetectHint(`Kode terdeteksi: ${data.cardId}`, true);
  } else {
    showCardIdDetectHint(
      'Kode kartu tidak terbaca otomatis. Pastikan nomor di bagian bawah kartu terlihat jelas, atau ketik manual.',
      false
    );
  }

  if (data.hasParallelStar && data.cardVariant === 'parallel') {
    showParallelDetectHint('Bintang ★ terdeteksi — varian Parallel dipilih otomatis.', true);
  } else if (data.cardVariant === 'normal') {
    showParallelDetectHint('', false);
  } else if (data.cardVariant && data.cardVariant !== 'normal') {
    showParallelDetectHint(
      `Varian ${VARIANT_LABELS[data.cardVariant] || data.cardVariant} dipilih otomatis dari foto.`,
      true
    );
  } else {
    showParallelDetectHint('', false);
  }

  if (filled.length > 0) {
    showUploadAutoFillHint(`Terisi otomatis: ${filled.join(', ')}. Periksa jika perlu diubah.`);
  } else if (data.autoFillHints?.length) {
    showUploadAutoFillHint(`Terisi otomatis: ${data.autoFillHints.join(' · ')}. Periksa jika perlu diubah.`);
  } else {
    showUploadAutoFillHint('');
  }
}

function showCardIdDetectHint(message, detected = false) {
  if (!cardIdDetectHint) return;
  cardIdDetectHint.textContent = message;
  cardIdDetectHint.className = detected
    ? 'text-xs text-emerald-400/90 mb-2'
    : 'text-xs text-amber-400/90 mb-2';
  cardIdDetectHint.classList.toggle('hidden', !message);
}

async function analyzeUploadedImage(file) {
  showCardIdDetectHint('Menganalisis foto…', false);
  showUploadAutoFillHint('Membaca kode kartu, varian, dan grade dari foto…');
  showParallelDetectHint('', false);

  const formData = new FormData();
  formData.append('image', file);

  try {
    const res = await fetch('/api/identify', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      showCardIdDetectHint(data.error || 'Gagal membaca foto.', false);
      showUploadAutoFillHint('');
      return;
    }

    applyUploadAnalysis(data);
  } catch {
    showCardIdDetectHint('Gagal membaca foto. Anda masih bisa isi form manual.', false);
    showUploadAutoFillHint('');
  }
}

function setPreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.src = e.target.result;
    preview.classList.remove('hidden');
    dropText.textContent = file.name;
  };
  reader.readAsDataURL(file);

  const dt = new DataTransfer();
  dt.items.add(file);
  imageInput.files = dt.files;

  analyzeUploadedImage(file);
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
  results.classList.add('hidden');
}

function hideError() {
  errorBox.classList.add('hidden');
}

function buildCardImageUrl(cardSetId, { cardVariant = 'normal' } = {}, printing) {
  const params = new URLSearchParams();
  if (cardVariant && cardVariant !== 'normal') params.set('variant', cardVariant);
  if (cardVariant === 'parallel') params.set('parallel', 'true');
  if (cardVariant === 'sp') params.set('sp', 'true');
  if (printing?.imageUrl) params.set('imageUrl', printing.imageUrl);
  if (printing?.apparelId) params.set('apparelId', String(printing.apparelId));
  const query = params.toString();
  return `/api/card-image/${cardSetId}${query ? `?${query}` : ''}`;
}

function getPrintingView(pricing, printingKey) {
  const selectedKey = printingKey || pricing.selectedPrintingKey || pricing.defaultPrintingKey;
  const selected =
    pricing.printings?.find((printing) => printing.key === selectedKey) ||
    pricing.selectedPrinting ||
    pricing.printings?.[0];

  if (!selected) {
    return {
      printing: null,
      summary: pricing.summary,
      indonesiaSummary: pricing.indonesiaSummary,
      internationalSummary: pricing.internationalSummary,
      prices: pricing.prices,
      bySource: pricing.bySource,
    };
  }

  return {
    printing: selected,
    summary: selected.summary,
    indonesiaSummary: selected.indonesiaSummary,
    internationalSummary: selected.internationalSummary,
    prices: selected.prices,
    bySource: selected.bySource,
  };
}

function renderRegionSummary({ summary, priceEl, rangeEl, emptyLabel, note }) {
  if (summary?.count) {
    priceEl.textContent = summary.averageFormatted;
    priceEl.className = priceEl.dataset.activeClass || '';
    rangeEl.textContent = `Rentang ${summary.minFormatted} – ${summary.maxFormatted} (${summary.count} entri${note ? ` · ${note}` : ''})`;
    rangeEl.className = 'text-xs text-slate-500 mt-1';
    return;
  }

  priceEl.textContent = emptyLabel;
  priceEl.className = priceEl.dataset.emptyClass || 'text-2xl font-bold text-slate-500';
  rangeEl.textContent = summary?.hint || '';
  rangeEl.className = 'text-xs text-slate-500 mt-1';
}

function renderPrintingPicker(pricing, activeKey) {
  if (!pricing.hasMultiplePrintings || !pricing.printings?.length) {
    printingSection.classList.add('hidden');
    printingPicker.innerHTML = '';
    return;
  }

  printingSection.classList.remove('hidden');
  printingHint.textContent = 'Kartu ini punya beberapa edisi cetak. Pilih yang sesuai dengan kartu Anda.';
  printingPicker.innerHTML = '';

  for (const printing of pricing.printings) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `printing-chip${printing.key === activeKey ? ' printing-chip-active' : ''}`;
    button.title = printing.label;

    const thumb = printing.imageUrl
      ? `<img src="${printing.imageUrl}" alt="" class="printing-chip-thumb zoomable-thumb" loading="lazy" data-zoom-caption="${escapeHtml(printing.label)}" />`
      : '';
    const avg = printing.summary?.count ? printing.summary.averageFormatted : '—';

    button.innerHTML = `
      ${thumb}
      <span>
        <span class="block font-medium text-left">${printing.label}</span>
        <span class="block text-xs text-slate-500 text-left">${avg}</span>
      </span>
    `;

    button.addEventListener('click', () => {
      selectedPrintingKey = printing.key;
      renderResults(lastResultData);
    });

    const thumbImg = button.querySelector('.printing-chip-thumb');
    if (thumbImg) {
      bindImageZoom(thumbImg, () => ({
        alt: printing.label,
        caption: printing.label,
      }));
    }

    printingPicker.appendChild(button);
  }
}

const DISTRIBUTION_CATEGORY_LABELS = {
  booster_pack: 'Booster Pack / Box',
  extra_booster: 'Extra Booster Pack / Box',
  premium_booster: 'Premium Booster Pack / Box',
  starter_deck: 'Starter Deck',
  magazine: 'Majalah / Publikasi',
  competition: 'Kompetisi / Turnamen',
  promo_product: 'Produk Promo Khusus',
  promo: 'Kartu Promo',
  unknown: 'Sumber tidak diketahui',
};

function renderDistribution(distribution) {
  const section = document.getElementById('resultDistribution');
  const titleEl = document.getElementById('resultDistributionTitle');
  const descEl = document.getElementById('resultDistributionDesc');

  if (!section || !titleEl || !descEl) return;

  if (!distribution?.description) {
    section.classList.add('hidden');
    titleEl.textContent = '';
    descEl.textContent = '';
    return;
  }

  const categoryLabel =
    DISTRIBUTION_CATEGORY_LABELS[distribution.category] || distribution.title || 'Asal distribusi';
  section.dataset.category = distribution.category || 'unknown';
  titleEl.textContent = categoryLabel;
  descEl.textContent = distribution.description;
  section.classList.remove('hidden');
}

function renderResults(data) {
  lastResultData = data;
  const { cardSetId, cardInfo, pricing, identification } = data;
  const cardVariant = data.cardVariant || pricing.cardVariant || 'normal';
  const gradeKey = data.gradeKey || pricing.gradeKey || 'raw';
  const gradeLabel = pricing.gradedType || gradeKey;
  const isGraded = gradeKey !== 'raw';

  if (!selectedPrintingKey || !pricing.printings?.some((printing) => printing.key === selectedPrintingKey)) {
    selectedPrintingKey = pricing.selectedPrintingKey || pricing.defaultPrintingKey || null;
  }

  const view = getPrintingView(pricing, selectedPrintingKey);
  const { summary, indonesiaSummary, internationalSummary, prices, bySource } = view;
  const { errors } = pricing;
  const activePrinting = view.printing;

  document.getElementById('resultCardId').textContent = cardSetId;
  document.getElementById('resultCardName').textContent = cardInfo?.cardName || 'Kartu One Piece';
  document.getElementById('resultSetName').textContent = cardInfo
    ? `${cardInfo.setName || ''} · ${cardInfo.rarity || ''}`
    : identification?.cardId
      ? 'Terdeteksi dari gambar'
      : '';

  const variantBadge = document.getElementById('resultVariantBadge');
  const gradedBadge = document.getElementById('resultGradedBadge');

  variantBadge.textContent = VARIANT_LABELS[cardVariant] || cardVariant;
  variantBadge.className = `text-xs font-semibold px-2 py-1 rounded ${
    VARIANT_BADGE_CLASS[cardVariant] || 'variant-badge-normal'
  }`;

  gradedBadge.textContent = gradeLabel;
  gradedBadge.className = `text-xs font-semibold px-2 py-1 rounded ${
    isGraded ? 'variant-badge-graded' : 'variant-badge-ungraded'
  }`;

  renderDistribution(activePrinting?.distribution || pricing.distribution || data.distribution);

  const gradeUnavailable = isGraded && internationalSummary?.count === 0;
  const indonesiaAvgEl = document.getElementById('indonesiaAvgPrice');
  const internationalAvgEl = document.getElementById('internationalAvgPrice');
  const indonesiaRangeEl = document.getElementById('indonesiaPriceRange');
  const internationalRangeEl = document.getElementById('internationalPriceRange');

  indonesiaAvgEl.dataset.activeClass = 'text-3xl font-bold text-emerald-300';
  indonesiaAvgEl.dataset.emptyClass = 'text-2xl font-bold text-slate-500';
  internationalAvgEl.dataset.activeClass = 'text-3xl font-bold text-amber-300';
  internationalAvgEl.dataset.emptyClass = gradeUnavailable
    ? 'text-2xl font-bold text-slate-400'
    : 'text-2xl font-bold text-slate-500';

  renderRegionSummary({
    summary: indonesiaSummary,
    priceEl: indonesiaAvgEl,
    rangeEl: indonesiaRangeEl,
    emptyLabel: 'Belum ada data',
    note: 'Forum One Piece TCG Indonesia',
  });

  const intlNote = isGraded
    ? `${gradeLabel} SNKRDUNK JP (sold)`
    : 'Yuyu-Tei + SNKRDUNK JP (sold)';
  renderRegionSummary({
    summary: internationalSummary,
    priceEl: internationalAvgEl,
    rangeEl: internationalRangeEl,
    emptyLabel: gradeUnavailable ? 'Tidak tersedia' : 'Belum ada data',
    note: intlNote,
  });

  const variantDesc = `${VARIANT_LABELS[cardVariant] || cardVariant}, ${gradeLabel}`;
  const priceRangeEl = document.getElementById('priceRange');

  if (summary.count) {
    const printingNote = activePrinting ? ` · ${activePrinting.label}` : '';
    const allRange =
      pricing.hasMultiplePrintings && pricing.allSummary?.count
        ? ` · gabungan semua edisi ${pricing.allSummary.minFormatted} – ${pricing.allSummary.maxFormatted}`
        : '';
    priceRangeEl.textContent = `Gabungan semua sumber untuk ${variantDesc}${printingNote}${allRange}`;
    priceRangeEl.className = 'text-sm text-slate-500 mt-1';
  } else if (gradeUnavailable) {
    priceRangeEl.textContent = buildGradeUnavailableMessage({ cardVariant, gradeLabel });
    priceRangeEl.className = 'text-sm text-amber-400/90 mt-1';
  } else if (activePrinting) {
    priceRangeEl.textContent = `Belum ada listing untuk edisi ${activePrinting.label}. Coba edisi lain di atas atau tambahkan harga Facebook manual.`;
    priceRangeEl.className = 'text-sm text-amber-400/90 mt-1';
  } else {
    priceRangeEl.textContent =
      pricing.message || 'Coba tambahkan harga Facebook manual atau periksa kode kartu.';
    priceRangeEl.className = 'text-sm text-slate-500 mt-1';
  }

  const cardImage = document.getElementById('cardImage');
  const cardImageCaption = document.getElementById('cardImageCaption');
  const officialCardImage = buildCardImageUrl(cardSetId, { cardVariant }, activePrinting);
  const imageSrc = data.uploadedImage || officialCardImage;

  const cardAlt = `${cardInfo?.cardName || cardSetId} card image`;
  cardImage.alt = cardAlt;
  cardImage.src = imageSrc;
  cardImageCaption.textContent = data.uploadedImage
    ? 'Foto yang Anda unggah'
    : activePrinting
      ? `Gambar resmi · ${activePrinting.label}`
      : `Gambar resmi kartu (${VARIANT_LABELS[cardVariant] || cardVariant})`;

  cardImage.onerror = () => {
    if (data.uploadedImage && imageSrc !== officialCardImage) {
      cardImage.src = officialCardImage;
      cardImageCaption.textContent = 'Gambar resmi kartu';
      return;
    }
    cardImage.src =
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 200 280">
          <rect width="200" height="280" fill="#1e293b"/>
          <text x="100" y="140" text-anchor="middle" fill="#94a3b8" font-size="14" font-family="sans-serif">${cardSetId}</text>
        </svg>`
      );
    cardImageCaption.textContent = 'Gambar tidak tersedia';
  };

  const sourceCards = document.getElementById('sourceCards');
  sourceCards.innerHTML = '';

  const sourceMeta = pricing.sourceMeta || {};

  for (const [key, meta] of Object.entries(SOURCE_LABELS)) {
    const entries = bySource[key] || [];
    const supportsGraded = sourceMeta[key]?.supportsGraded !== false;
    const unavailableGraded = isGraded && !supportsGraded;
    const gradeEntries = entries.filter((e) => e.gradeCategory);
    let avgEntries = [];

    if (unavailableGraded) {
      avgEntries = [];
    } else if (isGraded) {
      avgEntries = entries;
    } else if (gradeEntries.length) {
      avgEntries = entries.filter(
        (e) => e.gradeCategory === 'A' || (!e.gradeCategory && !e.isGraded)
      );
    } else {
      avgEntries = entries;
    }

    const avg =
      avgEntries.length > 0
        ? Math.round(avgEntries.reduce((s, e) => s + e.priceIdr, 0) / avgEntries.length)
        : null;
    const err = errors.find((e) => e.source === key);
    const itemLabel = unavailableGraded
      ? 'Tidak tersedia'
      : key === 'snkrdunk' && gradeEntries.length
        ? `${gradeEntries.length} kondisi`
        : `${entries.length} item`;
    const primaryEntry = unavailableGraded ? null : avgEntries[0] || entries[0];
    const detailName = primaryEntry?.variantName
      ? `<p class="text-xs text-slate-400 mt-2 line-clamp-2" title="${escapeHtml(primaryEntry.variantName)}">${escapeHtml(primaryEntry.variantName)}</p>`
      : '';
    const detailLink = primaryEntry ? sourceLinkHtml(primaryEntry.url, 'Buka halaman sumber →') : '';
    const footnote = unavailableGraded
      ? 'Yuyu-Tei hanya menjual kartu raw/ungraded'
      : err
        ? escapeHtml(err.message)
        : meta.name === 'Facebook Group'
          ? 'Forum One Piece TCG Indonesia'
          : isGraded && key === 'snkrdunk'
            ? `Harga terjual (sold) ${gradeLabel}`
            : 'Diperbarui live';

    const card = document.createElement('div');
    card.className = 'bg-slate-900 border border-slate-800 rounded-xl p-4';
    card.innerHTML = `
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-bold px-2 py-1 rounded ${meta.class}">${meta.name}</span>
        <span class="text-xs text-slate-500">${itemLabel}</span>
      </div>
      <p class="text-xl font-bold ${avg ? 'text-white' : 'text-slate-500'}">${avg ? formatIdr(avg) : '—'}</p>
      ${detailName}
      <div class="mt-2">${detailLink}</div>
      <p class="text-xs ${unavailableGraded ? 'text-amber-400/80' : 'text-slate-500'} mt-2">${footnote}</p>
    `;
    sourceCards.appendChild(card);
  }

  const tbody = document.getElementById('priceTable');
  tbody.innerHTML = '';

  const tablePrices = prices;

  if (gradeUnavailable) {
    const noteRow = document.createElement('tr');
    noteRow.className = 'border-b border-slate-800/80';
    noteRow.innerHTML = `
      <td colspan="7" class="py-3 text-amber-400/90 text-xs">
        ${escapeHtml(buildGradeUnavailableMessage({ cardVariant, gradeLabel }))}
      </td>
    `;
    tbody.appendChild(noteRow);
  }

  for (const item of tablePrices) {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-slate-800/80';
    const label = SOURCE_LABELS[item.source]?.name || item.source;
    const gradeLabel = item.gradeCategory || '—';
    const soldNote =
      item.source === 'snkrdunk' && item.priceSource
        ? item.priceSource === 'sold-listing'
          ? 'sold'
          : item.priceSource === 'sales-chart'
            ? 'sold (chart)'
            : 'listing'
        : '';
    tr.innerHTML = `
      <td class="py-3 pr-4">${label}</td>
      <td class="py-3 pr-4 text-slate-400">${escapeHtml(item.printingLabel || '—')}</td>
      <td class="py-3 pr-4 text-slate-300">${escapeHtml(item.variantName)}</td>
      <td class="py-3 pr-4"><span class="grade-badge">${escapeHtml(gradeLabel)}${soldNote ? ` · ${soldNote}` : ''}</span></td>
      <td class="py-3 pr-4">${formatOriginal(item.priceOriginal, item.currency)}</td>
      <td class="py-3 pr-4 font-medium">${formatIdr(item.priceIdr)}</td>
      <td class="py-3">${sourceLinkHtml(item.url)}</td>
    `;
    tbody.appendChild(tr);
  }

  renderPrintingPicker(pricing, selectedPrintingKey);
  results.classList.remove('hidden');
}

const cardImageEl = document.getElementById('cardImage');
const cardImageCaptionEl = document.getElementById('cardImageCaption');

bindImageZoom(preview, () => ({
  alt: 'Uploaded card preview',
  caption: dropText.textContent || 'Foto yang diunggah',
}));

bindImageZoom(cardImageEl, () => ({
  alt: cardImageEl?.alt || 'Card image',
  caption: cardImageCaptionEl?.textContent || cardImageEl?.alt || '',
}));

imageZoomModal?.addEventListener('click', (event) => {
  if (event.target.closest('[data-zoom-close]')) closeImageZoom();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && imageZoomModal && !imageZoomModal.classList.contains('hidden')) {
    closeImageZoom();
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const hasImage = Boolean(imageInput.files?.[0]);
  const hasCode = cardSetIdInput.value.trim().length > 0;
  if (!hasImage && !hasCode) {
    showError('Unggah foto kartu atau masukkan kode kartu (contoh: OP01-001).');
    return;
  }

  loading.classList.remove('hidden');
  results.classList.add('hidden');
  selectedPrintingKey = null;
  submitBtn.disabled = true;

  const formData = new FormData(form);
  formData.set('cardVariant', cardVariantSelect.value);
  formData.set('gradeKey', gradeKeySelect.value);

  try {
    const res = await fetch('/api/check', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      showError(data.error || 'Gagal memeriksa harga');
      if (data.identification?.rawText) {
        showError(`${data.error}\n\nTeks terbaca OCR: ${data.identification.rawText.slice(0, 200)}`);
      }
      return;
    }

    if (data.identification) {
      applyUploadAnalysis(data.identification);
    }

    renderResults(data);
  } catch (err) {
    showError('Koneksi gagal. Pastikan server berjalan.');
  } finally {
    loading.classList.add('hidden');
    submitBtn.disabled = false;
  }
});

adminForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  adminMsg.classList.add('hidden');

  const body = {
    cardSetId: document.getElementById('fbCardId').value.trim(),
    variantName: document.getElementById('fbVariant').value.trim(),
    priceIdr: document.getElementById('fbPrice').value,
    url: document.getElementById('fbUrl').value.trim(),
  };

  const res = await fetch('/api/admin/facebook-price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (res.ok) {
    adminMsg.textContent = data.message;
    adminMsg.classList.remove('hidden');
    adminForm.reset();
  } else {
    adminMsg.textContent = data.error;
    adminMsg.classList.remove('hidden');
    adminMsg.classList.remove('text-emerald-400');
    adminMsg.classList.add('text-red-400');
  }
});
