const db = require('../db');
const { fetchYuyuTeiPrices } = require('./yuyuTei');
const { fetchSnkrdunkPrices, fetchSnkrdunkPrintingsCatalog } = require('./snkrdunk');
const { getFacebookPrices } = require('./facebook');
const {
  filterByCardVariant,
  filterByGradeKey,
  cardVariantLabel,
  gradeKeyLabel,
  parseCardVariant,
  parseGradeKey,
  isGradedGradeKey,
} = require('./variantFilter');
const { attachPrinting } = require('./printingParser');
const { summarize, buildPrintings, selectPrinting } = require('./printingGroups');
const { filterJapanesePriceEntries } = require('./regionFilter');
const { parseLanguageKey, languageKeyLabel, isLanguageEnabled } = require('./languageFilter');

function savePrices(cardSetId, entries) {
  const insert = db.prepare(`
    INSERT INTO price_entries (card_set_id, source, variant_name, price_original, currency, price_idr, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction((rows) => {
    for (const row of rows) {
      insert.run(
        cardSetId.toUpperCase(),
        row.source,
        row.variantName,
        row.priceOriginal,
        row.currency,
        row.priceIdr,
        row.url || ''
      );
    }
  });

  tx(entries);
}

function applyFilters(entries, { cardVariant, gradeKey }) {
  return filterByGradeKey(filterByCardVariant(entries, { cardVariant }), gradeKey);
}

function tagEntries(entries, cardSetId) {
  return entries.map((entry) => attachPrinting(entry, cardSetId));
}

function resolveLookupOptions(options = {}) {
  const cardVariant = parseCardVariant(options.cardVariant, {
    isParallel: options.isParallel,
    isSp: options.isSp,
  });
  const gradeKey = parseGradeKey(options.gradeKey, { isGraded: options.isGraded });
  const languageKey = parseLanguageKey(options.language || options.languageKey);
  return { cardVariant, gradeKey, languageKey };
}

async function lookupPrices(cardSetId, options = {}) {
  const { cardVariant, gradeKey, languageKey } = resolveLookupOptions(options);
  const { printingKey = null } = options;
  const normalized = cardSetId.toUpperCase();
  const errors = [];
  const variantFlags = { cardVariant, isParallel: cardVariant === 'parallel', isSp: cardVariant === 'sp' };
  const isGradedLookup = isGradedGradeKey(gradeKey);

  if (!isLanguageEnabled(languageKey)) {
    return {
      cardSetId: normalized,
      cardVariant,
      gradeKey,
      languageKey,
      languageLabel: languageKeyLabel(languageKey),
      isParallel: cardVariant === 'parallel',
      isSp: cardVariant === 'sp',
      isGraded: isGradedLookup,
      variantType: cardVariantLabel(cardVariant),
      gradedType: gradeKeyLabel(gradeKey),
      prices: [],
      bySource: { 'yuyu-tei': [], snkrdunk: [], facebook: [] },
      summary: summarize([], { gradeKey }),
      indonesiaSummary: summarize([], { gradeKey }),
      internationalSummary: summarize([], { gradeKey }),
      allSummary: summarize([], { gradeKey }),
      allIndonesiaSummary: summarize([], { gradeKey }),
      allInternationalSummary: summarize([], { gradeKey }),
      printings: [],
      hasMultiplePrintings: false,
      defaultPrintingKey: null,
      selectedPrintingKey: null,
      selectedPrinting: null,
      sourceMeta: {},
      marketScope: { international: languageKey.toUpperCase() },
      errors: [],
      message: `${languageKeyLabel(languageKey)} belum tersedia — saat ini hanya Japanese (日本語).`,
    };
  }

  const [yuyuTeiRaw, snkrdunkRaw, facebookRaw, printingCatalog] = await Promise.all([
    fetchYuyuTeiPrices(normalized).catch((err) => {
      errors.push({ source: 'yuyu-tei', message: err.message });
      return [];
    }),
    fetchSnkrdunkPrices(normalized, variantFlags).catch((err) => {
      errors.push({ source: 'snkrdunk', message: err.message });
      return [];
    }),
    Promise.resolve(getFacebookPrices(normalized)),
    fetchSnkrdunkPrintingsCatalog(normalized, variantFlags).catch(() => []),
  ]);

  const yuyuTei = isGradedLookup
    ? []
    : tagEntries(applyFilters(yuyuTeiRaw, { cardVariant, gradeKey: 'raw' }), normalized);
  const snkrdunkRawFiltered =
    languageKey === 'ja' ? filterJapanesePriceEntries(snkrdunkRaw) : snkrdunkRaw;
  const snkrdunk = applyFilters(snkrdunkRawFiltered, { cardVariant, gradeKey });
  const facebook = tagEntries(applyFilters(facebookRaw, { cardVariant, gradeKey }), normalized);
  const allEntries = [...yuyuTei, ...snkrdunk, ...facebook];

  if (allEntries.length > 0) {
    savePrices(normalized, allEntries);
  }

  const printingData = buildPrintings(allEntries, normalized, { gradeKey, catalog: printingCatalog });
  const selected = selectPrinting(printingData, printingKey || printingData.defaultPrintingKey);
  const variantDesc = `${cardVariantLabel(cardVariant)}, ${gradeKeyLabel(gradeKey).toLowerCase()}`;

  let message = null;
  if (selected.summary.count === 0) {
    if (isGradedLookup) {
      message = `${gradeKeyLabel(gradeKey)} tidak tersedia — belum ada riwayat penjualan ${gradeKeyLabel(gradeKey)} untuk kartu ${cardVariantLabel(cardVariant).toLowerCase()} di SNKRDUNK. Yuyu-Tei hanya menjual kartu raw/ungraded.`;
    } else {
      message = `Tidak ada harga ${variantDesc} ditemukan. Coba ubah opsi varian/grade atau tambahkan harga Facebook manual.`;
    }
  } else if (printingData.hasMultiplePrintings) {
    const range = printingData.allSummary;
    message = `${printingData.printings.length} edisi cetak ditemukan. Menampilkan ${selected.selectedPrinting?.label || 'default'} (rentang semua edisi: ${range.minFormatted} – ${range.maxFormatted}).`;
  }

  return {
    cardSetId: normalized,
    cardVariant,
    gradeKey,
    languageKey,
    languageLabel: languageKeyLabel(languageKey),
    isParallel: cardVariant === 'parallel',
    isSp: cardVariant === 'sp',
    isGraded: isGradedLookup,
    variantType: cardVariantLabel(cardVariant),
    gradedType: gradeKeyLabel(gradeKey),
    prices: selected.prices,
    bySource: selected.bySource,
    summary: selected.summary,
    indonesiaSummary: selected.indonesiaSummary,
    internationalSummary: selected.internationalSummary,
    allSummary: printingData.allSummary,
    allIndonesiaSummary: printingData.allIndonesiaSummary,
    allInternationalSummary: printingData.allInternationalSummary,
    printings: printingData.printings,
    hasMultiplePrintings: printingData.hasMultiplePrintings,
    defaultPrintingKey: printingData.defaultPrintingKey,
    selectedPrintingKey: selected.selectedPrintingKey,
    selectedPrinting: selected.selectedPrinting,
    sourceMeta: {
      'yuyu-tei': { supportsGraded: false, market: 'JP' },
      snkrdunk: { supportsGraded: true, market: 'JP' },
      facebook: { supportsGraded: true, market: 'ID', note: 'Harga komunitas — bisa JP atau EN' },
    },
    marketScope: {
      international: 'JP',
      description:
        'Referensi internasional hanya dari kartu versi Jepang. Listing SNKRDUNK bertag [EN] diabaikan.',
    },
    errors,
    message,
  };
}

module.exports = { lookupPrices, resolveLookupOptions };
