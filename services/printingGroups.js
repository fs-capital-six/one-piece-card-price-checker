const { formatIdr } = require('./currency');
const { attachPrinting } = require('./printingParser');
const { getGradeOption } = require('./gradeFilter');

const INDONESIA_SOURCES = new Set(['facebook']);

function isIndonesiaSource(source) {
  return INDONESIA_SOURCES.has(source);
}

function summarizeRegion(entries, { gradeKey = 'raw', region = 'all' } = {}) {
  let filtered = entries;
  if (region === 'indonesia') {
    filtered = entries.filter((entry) => isIndonesiaSource(entry.source));
  } else if (region === 'international') {
    filtered = entries.filter((entry) => !isIndonesiaSource(entry.source));
  }
  return summarize(filtered, { gradeKey });
}

function pickSnkrdunkForAverage(snkrdunkEntries, gradeKey = 'raw') {
  if (snkrdunkEntries.length === 0) return [];

  const option = getGradeOption(gradeKey);
  const matching = snkrdunkEntries.filter((entry) => option.categories.includes(entry.gradeCategory));

  if (matching.length > 0) {
    return [matching[0]];
  }

  if (gradeKey === 'raw') {
    const gradeA = snkrdunkEntries.find((entry) => entry.gradeCategory === 'A');
    if (gradeA) return [gradeA];
    const raw = snkrdunkEntries.filter((entry) => !entry.isGraded);
    return raw.length ? [raw[0]] : [];
  }

  return [];
}

function entriesForAverage(entries, { gradeKey = 'raw' } = {}) {
  const option = getGradeOption(gradeKey);
  const eligible = option.isGraded
    ? entries.filter((entry) => entry.source !== 'yuyu-tei' && entry.supportsGraded !== false)
    : entries;
  const snkrdunk = eligible.filter((entry) => entry.source === 'snkrdunk' && entry.gradeCategory);
  const others = eligible.filter((entry) => entry.source !== 'snkrdunk' || !entry.gradeCategory);
  return [...pickSnkrdunkForAverage(snkrdunk, gradeKey), ...others];
}

function summarize(entries, { gradeKey = 'raw' } = {}) {
  const idrValues = entriesForAverage(entries, { gradeKey })
    .map((e) => e.priceIdr)
    .filter((v) => v > 0);
  const averageIdr =
    idrValues.length > 0
      ? Math.round(idrValues.reduce((a, b) => a + b, 0) / idrValues.length)
      : 0;

  return {
    averageIdr,
    averageFormatted: formatIdr(averageIdr),
    minIdr: idrValues.length ? Math.min(...idrValues) : 0,
    minFormatted: formatIdr(idrValues.length ? Math.min(...idrValues) : 0),
    maxIdr: idrValues.length ? Math.max(...idrValues) : 0,
    maxFormatted: formatIdr(idrValues.length ? Math.max(...idrValues) : 0),
    count: idrValues.length,
  };
}

function groupBySource(entries) {
  return {
    'yuyu-tei': entries.filter((entry) => entry.source === 'yuyu-tei'),
    snkrdunk: entries.filter((entry) => entry.source === 'snkrdunk'),
    facebook: entries.filter((entry) => entry.source === 'facebook'),
  };
}

function entryVariantKind(entry) {
  if (entry.variantKind) return entry.variantKind;
  if (entry.isManga) return 'manga';
  if (entry.isPromo) return 'promo';
  if (entry.isSec) return 'sec';
  if (entry.isSp) return 'sp';
  if (entry.isParallel) return 'parallel';
  return 'normal';
}

function assignEntriesToDefaultPrinting(entries, defaultKey, defaultLabel) {
  if (!defaultKey) return entries;

  const defaultVariants = new Set(
    entries
      .filter((entry) => entry.source === 'snkrdunk' && entry.printingKey === defaultKey)
      .map(entryVariantKind)
  );

  return entries.map((entry) => {
    if (entry.source === 'snkrdunk' || entry.printingKey !== 'standard') {
      return entry;
    }

    const kind = entryVariantKind(entry);
    if (defaultVariants.size > 0 && !defaultVariants.has(kind)) {
      return entry;
    }

    return {
      ...entry,
      printingKey: defaultKey,
      printingLabel: defaultLabel,
    };
  });
}

function mergeCatalogPrintings(printings, catalog = []) {
  const merged = new Map(printings.map((printing) => [printing.key, printing]));

  for (const item of catalog) {
    if (merged.has(item.key)) {
      const existing = merged.get(item.key);
      existing.imageUrl = existing.imageUrl || item.imageUrl;
      existing.apparelId = existing.apparelId || item.apparelId;
      existing.score = Math.max(existing.score || 0, item.printingScore || 0);
      continue;
    }

    merged.set(item.key, {
      key: item.key,
      label: item.label,
      imageUrl: item.imageUrl,
      apparelId: item.apparelId,
      score: item.printingScore || 0,
      entries: [],
      isDefault: false,
      summary: summarize([], { gradeKey: 'raw' }),
      bySource: groupBySource([]),
      prices: [],
    });
  }

  return [...merged.values()]
    .map((printing) => ({
      ...printing,
      summary: printing.entries?.length
        ? summarize(printing.entries, { gradeKey: printing.gradeKey || 'raw' })
        : printing.summary || summarize([], {}),
      bySource: printing.entries?.length ? groupBySource(printing.entries) : printing.bySource,
      prices: printing.entries || printing.prices || [],
    }))
    .sort((a, b) => {
      const countDiff = (b.summary?.count || 0) - (a.summary?.count || 0);
      if (countDiff !== 0) return countDiff;
      return (b.score || 0) - (a.score || 0);
    });
}

function buildPrintings(entries, cardSetId, { gradeKey = 'raw', catalog = [] } = {}) {
  let tagged = entries.map((entry) => attachPrinting(entry, cardSetId));

  const snkrdunkPrintings = [
    ...new Map(
      tagged
        .filter((entry) => entry.source === 'snkrdunk' && entry.printingKey)
        .map((entry) => [entry.printingKey, entry.printingLabel])
    ).entries(),
  ];

  if (snkrdunkPrintings.length > 0) {
    const [defaultKey, defaultLabel] = snkrdunkPrintings.sort((a, b) => {
      const scoreA = tagged.find((entry) => entry.printingKey === a[0])?.printingScore || 0;
      const scoreB = tagged.find((entry) => entry.printingKey === b[0])?.printingScore || 0;
      return scoreB - scoreA;
    })[0];
    tagged = assignEntriesToDefaultPrinting(tagged, defaultKey, defaultLabel);
  }

  const groups = new Map();

  for (const entry of tagged) {
    const key = entry.printingKey || 'standard';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: entry.printingLabel || 'Standard',
        imageUrl: entry.imageUrl || null,
        apparelId: entry.apparelId || null,
        score: entry.printingScore || 0,
        entries: [],
      });
    }

    const group = groups.get(key);
    group.entries.push(entry);
    if (entry.imageUrl && !group.imageUrl) group.imageUrl = entry.imageUrl;
    if (entry.apparelId && !group.apparelId) group.apparelId = entry.apparelId;
    if ((entry.printingScore || 0) > group.score) group.score = entry.printingScore || 0;
  }

  let printings = [...groups.values()].map((group) => ({
    key: group.key,
    label: group.label,
    imageUrl: group.imageUrl,
    apparelId: group.apparelId,
    score: group.score,
    isDefault: false,
    entries: group.entries,
    summary: summarize(group.entries, { gradeKey }),
    indonesiaSummary: summarizeRegion(group.entries, { gradeKey, region: 'indonesia' }),
    internationalSummary: summarizeRegion(group.entries, { gradeKey, region: 'international' }),
    bySource: groupBySource(group.entries),
    prices: group.entries,
  }));

  printings = mergeCatalogPrintings(printings, catalog).map((printing) => {
    const entries = printing.entries || [];
    return {
      ...printing,
      summary: entries.length ? summarize(entries, { gradeKey }) : summarize([], { gradeKey }),
      indonesiaSummary: entries.length
        ? summarizeRegion(entries, { gradeKey, region: 'indonesia' })
        : summarize([], { gradeKey }),
      internationalSummary: entries.length
        ? summarizeRegion(entries, { gradeKey, region: 'international' })
        : summarize([], { gradeKey }),
      bySource: entries.length ? groupBySource(entries) : groupBySource([]),
      prices: entries,
    };
  });

  printings.sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0);
    if (scoreDiff !== 0) return scoreDiff;
    return (b.summary?.count || 0) - (a.summary?.count || 0);
  });

  const pricedPrintings = printings.filter((printing) => (printing.summary?.count || 0) > 0);
  const defaultPrinting = pricedPrintings[0] || printings[0] || null;

  if (defaultPrinting) {
    printings = printings.map((printing) => ({
      ...printing,
      isDefault: printing.key === defaultPrinting.key,
    }));
  }
  const allSummary = summarize(tagged, { gradeKey });
  const allIndonesiaSummary = summarizeRegion(tagged, { gradeKey, region: 'indonesia' });
  const allInternationalSummary = summarizeRegion(tagged, { gradeKey, region: 'international' });

  return {
    printings,
    defaultPrintingKey: defaultPrinting?.key || null,
    hasMultiplePrintings: printings.length > 1,
    allSummary,
    allIndonesiaSummary,
    allInternationalSummary,
    allPrices: tagged,
    allBySource: groupBySource(tagged),
  };
}

function selectPrinting(printingData, printingKey) {
  if (!printingData?.printings?.length) {
    return {
      ...printingData,
      selectedPrintingKey: null,
      selectedPrinting: null,
      summary: printingData.allSummary || summarize([], {}),
      indonesiaSummary: printingData.allIndonesiaSummary || summarize([], {}),
      internationalSummary: printingData.allInternationalSummary || summarize([], {}),
      prices: printingData.allPrices || [],
      bySource: printingData.allBySource || groupBySource([]),
    };
  }

  const selected =
    printingData.printings.find((printing) => printing.key === printingKey) ||
    printingData.printings.find((printing) => printing.isDefault) ||
    printingData.printings[0];

  return {
    ...printingData,
    selectedPrintingKey: selected.key,
    selectedPrinting: selected,
    summary: selected.summary,
    indonesiaSummary: selected.indonesiaSummary,
    internationalSummary: selected.internationalSummary,
    prices: selected.prices,
    bySource: selected.bySource,
  };
}

module.exports = {
  summarize,
  summarizeRegion,
  isIndonesiaSource,
  INDONESIA_SOURCES,
  groupBySource,
  buildPrintings,
  selectPrinting,
  entriesForAverage,
  mergeCatalogPrintings,
};
