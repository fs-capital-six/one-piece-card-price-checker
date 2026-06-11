const { toIdr } = require('./currency');
const { classifyCardVariant, attachVariantFlags } = require('./variantFilter');
const { parsePrintingFromVariantName, scorePrinting, normalizePrintingKey } = require('./printingParser');
const { filterJapaneseApparels } = require('./regionFilter');

const API = 'https://snkrdunk.com/v1/apparels';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (compatible; OPCPriceChecker/1.0)',
};

const GRADE_ORDER = [
  'A',
  'B',
  'C',
  'D',
  'PSA10',
  'PSA9',
  'PSA8以下',
  'BGS10 BL',
  'BGS10 GL',
  'BGS9.5',
  'BGS9以下',
  'ARS10+',
  'ARS10',
  'ARS9',
  'ARS8以下',
  '他鑑定品',
];

function isGradedCategory(grade) {
  return /^(PSA|BGS|ARS)/.test(grade) || grade === '他鑑定品';
}

function gradeSortIndex(grade) {
  const idx = GRADE_ORDER.indexOf(grade);
  return idx === -1 ? GRADE_ORDER.length : idx;
}

async function apiGet(path, params = {}) {
  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`SNKRDUNK request failed (${res.status})`);
  return res.json();
}

function matchesCard(apparel, cardSetId) {
  const id = cardSetId.toUpperCase();
  const productNumber = (apparel.productNumber || '').toUpperCase();
  const name = apparel.name || apparel.localizedName || '';
  return productNumber === id || name.toUpperCase().includes(id);
}

function scoreApparel(apparel) {
  const name = apparel.name || '';
  let score = 0;
  if (!/\[EN\]/i.test(name)) score += 10;
  if (/Booster Pack|ブースターパック/i.test(name)) score += 8;
  if ((apparel.usedListingCount || 0) > 0) score += 20;
  if ((apparel.usedMinPrice || 0) > 0) score += 10;
  if (/Promotional|プロモ|Weekly Shonen|週刊少年/i.test(name)) score -= 5;
  return score;
}

async function findApparels(cardSetId) {
  const data = await apiGet('', { productNumber: cardSetId.toUpperCase() });
  const fromProduct = filterJapaneseApparels(
    (data.apparels || []).filter((item) => matchesCard(item, cardSetId))
  );

  if (fromProduct.length > 0) return fromProduct;

  const search = await apiGet('/market/search', {
    keyword: cardSetId,
    page: 1,
    perPage: 20,
  });
  return filterJapaneseApparels((search.apparels || []).filter((item) => matchesCard(item, cardSetId)));
}

function pickBestApparel(apparels, { cardVariant = 'normal', isParallel = false, isSp = false } = {}) {
  const want =
    cardVariant === 'all'
      ? 'normal'
      : cardVariant || (isSp ? 'sp' : isParallel ? 'parallel' : 'normal');
  const matching = apparels.filter((item) => {
    const name = item.name || item.localizedName || '';
    return classifyCardVariant(name) === want;
  });

  if (matching.length === 0) return null;

  return matching.sort((a, b) => scoreApparel(b) - scoreApparel(a))[0];
}

async function fetchApparelDetail(apparelId) {
  return apiGet(`/${apparelId}`);
}

async function fetchConditionOptions(apparelId) {
  const data = await apiGet(`/${apparelId}/sales-chart/used`);
  const options = new Map();
  for (const option of data.salesChartOption || []) {
    if (option.id > 0 && option.localizedName) {
      options.set(option.localizedName, option.id);
    }
  }
  return options;
}

async function fetchUsedListings(apparelId, sizeId) {
  const listings = [];
  const maxPages = 8;

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await apiGet(`/${apparelId}/used`, {
      perPage: 50,
      page,
      sizeId,
      isSaleOnly: false,
    });
    const batch = data.apparelUsedItems || [];
    listings.push(...batch);
    if (batch.length < 50) break;
  }

  return listings;
}

function isSoldListing(listing) {
  return Boolean(listing?.isDisplaySold);
}

function soldListingTime(listing) {
  return new Date(listing.createdAt || listing.updatedAt || 0).getTime();
}

async function fetchLatestChartPricesByGrade(apparelId, conditionOptions) {
  const chartPrices = new Map();

  await Promise.all(
    [...conditionOptions.entries()].map(async ([grade, conditionId]) => {
      try {
        const data = await apiGet(`/${apparelId}/sales-chart/used`, {
          rangeKey: 'oneMonth',
          salesChartOptionId: conditionId,
        });
        const points = data.points || [];
        if (points.length === 0) return;
        chartPrices.set(grade, points[points.length - 1][1]);
      } catch {
        // optional per-grade chart
      }
    })
  );

  return chartPrices;
}

function aggregateSoldByGrade(listings, chartPricesByGrade = new Map()) {
  const byGrade = new Map();

  for (const [grade, price] of chartPricesByGrade.entries()) {
    byGrade.set(grade, {
      grade,
      price,
      soldAt: 0,
      listings: 0,
      priceSource: 'sales-chart',
    });
  }

  for (const listing of listings) {
    if (!isSoldListing(listing)) continue;

    const grade = listing.displayShortConditionTitle;
    const price = listing.price;
    if (!grade || !price) continue;

    const soldAt = soldListingTime(listing);
    const current = byGrade.get(grade);

    if (!current || current.priceSource !== 'sold-listing' || soldAt >= current.soldAt) {
      byGrade.set(grade, {
        grade,
        price,
        soldAt,
        listings: (current?.priceSource === 'sold-listing' && current?.soldAt === soldAt
          ? current.listings
          : 0) + 1,
        priceSource: 'sold-listing',
      });
    } else if (current.priceSource === 'sold-listing') {
      current.listings += 1;
    }
  }

  if (byGrade.size === 0) {
    for (const listing of listings) {
      const grade = listing.displayShortConditionTitle;
      const price = listing.price;
      if (!grade || !price) continue;

      const soldAt = soldListingTime(listing);
      const current = byGrade.get(grade);
      if (!current || price < current.price) {
        byGrade.set(grade, {
          grade,
          price,
          soldAt,
          listings: (current?.listings || 0) + 1,
          priceSource: 'active-listing',
        });
      } else {
        current.listings += 1;
      }
    }
  }

  return [...byGrade.values()]
    .map(({ grade, price, listings, priceSource }) => ({
      grade,
      minPrice: price,
      listings,
      priceSource,
    }))
    .sort((a, b) => gradeSortIndex(a.grade) - gradeSortIndex(b.grade));
}

function gradeListingUrl(apparelId, conditionId) {
  const base = `https://snkrdunk.com/apparels/${apparelId}/used`;
  if (!conditionId) return base;
  return `${base}?conditionIds=${conditionId}`;
}

async function fetchPricesForApparel(apparel, cardSetId) {
  const detail = await fetchApparelDetail(apparel.id);
  const sizeId = detail.sizes?.[0]?.id;
  if (!sizeId) return [];

  const conditionOptions = await fetchConditionOptions(apparel.id);
  const [chartPricesByGrade, listings] = await Promise.all([
    fetchLatestChartPricesByGrade(apparel.id, conditionOptions),
    fetchUsedListings(apparel.id, sizeId),
  ]);

  const grades = aggregateSoldByGrade(listings, chartPricesByGrade);
  const apparelName = detail.name || detail.localizedName || cardSetId;
  const variantFlags = attachVariantFlags({ variantName: apparelName });
  const printing = parsePrintingFromVariantName(apparelName, cardSetId);
  const imageUrl = apparel.primaryMedia?.imageUrl || detail.primaryMedia?.imageUrl || null;
  const results = [];

  for (const { grade, minPrice, listings: count, priceSource } of grades) {
    results.push({
      source: 'snkrdunk',
      variantName: apparelName,
      gradeCategory: grade,
      isGraded: isGradedCategory(grade),
      isParallel: variantFlags.isParallel,
      isSp: variantFlags.isSp,
      variantKind: variantFlags.variantKind,
      priceOriginal: minPrice,
      currency: 'JPY',
      url: gradeListingUrl(apparel.id, conditionOptions.get(grade)),
      rarity: '',
      listings: count,
      priceSource: priceSource || 'sold-listing',
      printingKey: normalizePrintingKey(printing.key),
      printingLabel: printing.label,
      printingRaw: printing.raw,
      printingScore: scorePrinting(printing.label, printing.raw) + scoreApparel(apparel),
      imageUrl,
      apparelId: apparel.id,
    });
  }

  for (const item of results) {
    item.priceIdr = await toIdr(item.priceOriginal, 'JPY');
  }

  return results;
}

function filterApparelsByVariant(apparels, want) {
  if (want === 'all') return apparels;
  return apparels.filter((item) => {
    const name = item.name || item.localizedName || '';
    return classifyCardVariant(name) === want;
  });
}

async function fetchSnkrdunkPrintingsCatalog(cardSetId, { cardVariant = 'normal', isParallel = false, isSp = false } = {}) {
  const apparels = await findApparels(cardSetId);
  const want = cardVariant || (isSp ? 'sp' : isParallel ? 'parallel' : 'normal');

  const catalog = filterApparelsByVariant(apparels, want)
    .map((item) => {
      const apparelName = item.name || item.localizedName || cardSetId;
      const printing = parsePrintingFromVariantName(apparelName, cardSetId);
      return {
        key: normalizePrintingKey(printing.key),
        label: printing.label,
        raw: printing.raw,
        imageUrl: item.primaryMedia?.imageUrl || null,
        apparelId: item.id,
        printingScore: scorePrinting(printing.label, printing.raw) + scoreApparel(item),
        variantName: apparelName,
      };
    });

  const byKey = new Map();
  for (const item of catalog) {
    const existing = byKey.get(item.key);
    if (!existing || item.printingScore > existing.printingScore) {
      byKey.set(item.key, item);
    }
  }

  return [...byKey.values()];
}

async function fetchSnkrdunkPrices(cardSetId, { cardVariant = 'normal', isParallel = false, isSp = false } = {}) {
  const apparels = await findApparels(cardSetId);
  const want = cardVariant || (isSp ? 'sp' : isParallel ? 'parallel' : 'normal');
  const matching = filterApparelsByVariant(apparels, want);

  if (matching.length === 0) return [];

  const batches = await Promise.all(matching.map((apparel) => fetchPricesForApparel(apparel, cardSetId)));
  return batches.flat();
}

module.exports = {
  fetchSnkrdunkPrices,
  fetchSnkrdunkPrintingsCatalog,
  fetchPricesForApparel,
  findApparels,
  pickBestApparel,
  isGradedCategory,
  GRADE_ORDER,
};
