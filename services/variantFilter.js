// One Piece parallel cards use a -P suffix on rarity (L-P, SR-P, SEC-P, etc.)
const PARALLEL_PATTERN =
  /parallel|パラレル|\b[A-Z]{1,5}-P\b|\bP-(?:SR|R|UC|C|L|SEC)\b|ラメフォイル|ラメ|alternate\s*art|alt\s*art|\(parallel\)/i;

// SP (Special) — small "SP" logo beside card ID; SNKRDUNK: SR-SPC / SEC-SPC
const SP_PATTERN =
  /\bSPC\b|\bSR-SPC\b|\bSEC-SPC\b|\b[A-Z]{1,4}\d{2}-\d{3}\s+SP\b|スペシャル|special\s*card/i;

// Manga / Comic Parallel — e.g. SEC-SP (Comic Parallel) on OP05-119
const MANGA_PATTERN =
  /comic\s*parallel|manga\s*rare|コミックパラレル|漫画レア|漫画版|\bManga\b|SEC-SP\s*\(|SR-SP\s*\(|SP\s*\(\s*Comic/i;

// Promo printings — same card ID, promotional distribution
const PROMO_PATTERN =
  /promotional\s*card|プロモ(?:ーション)?(?:カード)?|promo\s*card|winner'?s?\s*memento|flagship\s*battle|championship/i;

// SEC (Secret Rare) — base gold secret rare, not parallel/SP/manga
const SEC_PATTERN = /\bSEC\b(?:\s*[\[\(]|(?:\s|$))/i;
const SEC_EXCLUDE_PATTERN = /\bSEC-(?:P|SP|SPC)\b|\bP-SEC\b/i;

const NON_PARALLEL_ALT_PATTERN = /manga|漫画|レカフィグ|recafig|illustration\s*box|box\s*topper/i;

const CARD_VARIANTS = ['normal', 'parallel', 'sp', 'manga', 'sec', 'promo'];
const CARD_VARIANT_FILTER_OPTIONS = ['all', ...CARD_VARIANTS];

function isMangaVariant(text) {
  return MANGA_PATTERN.test(String(text || ''));
}

function isSpVariant(text) {
  const value = String(text || '');
  if (!value || isMangaVariant(value)) return false;
  return SP_PATTERN.test(value);
}

function isParallelVariant(text) {
  const value = String(text || '');
  if (!value || isMangaVariant(value) || isSpVariant(value)) return false;
  if (NON_PARALLEL_ALT_PATTERN.test(value) && !PARALLEL_PATTERN.test(value)) {
    return false;
  }
  return PARALLEL_PATTERN.test(value);
}

function isPromoVariant(text) {
  const value = String(text || '');
  if (isMangaVariant(value) || isSpVariant(value) || isParallelVariant(value)) return false;
  return PROMO_PATTERN.test(value);
}

function isSecVariant(text) {
  const value = String(text || '');
  if (!value || isMangaVariant(value) || isSpVariant(value) || isParallelVariant(value)) return false;
  if (SEC_EXCLUDE_PATTERN.test(value)) return false;
  return SEC_PATTERN.test(value);
}

function classifyCardVariant(text) {
  if (isMangaVariant(text)) return 'manga';
  if (isSpVariant(text)) return 'sp';
  if (isParallelVariant(text)) return 'parallel';
  if (isPromoVariant(text)) return 'promo';
  if (isSecVariant(text)) return 'sec';
  return 'normal';
}

function resolveCardVariant({ cardVariant, isParallel = false, isSp = false } = {}) {
  if (cardVariant === 'all') return 'all';
  if (cardVariant && CARD_VARIANTS.includes(cardVariant)) return cardVariant;
  if (isSp) return 'sp';
  if (isParallel) return 'parallel';
  return 'normal';
}

function parseParallelFlag(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function parseSpFlag(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function parseCardVariant(value, flags = {}) {
  if (value === 'all') return 'all';
  if (value && CARD_VARIANTS.includes(String(value))) return String(value);
  return resolveCardVariant(flags);
}

function entryVariantKind(entry) {
  if (entry.variantKind) return entry.variantKind;
  if (entry.isManga) return 'manga';
  if (entry.isPromo) return 'promo';
  if (entry.isSec) return 'sec';
  if (entry.isSp) return 'sp';
  if (entry.isParallel) return 'parallel';
  const label = `${entry.variantName || ''} ${entry.rarity || ''}`;
  return classifyCardVariant(label);
}

function filterByCardVariant(entries, { cardVariant = 'normal', isParallel, isSp } = {}) {
  const want = resolveCardVariant({ cardVariant, isParallel, isSp });
  if (want === 'all') return entries;
  return entries.filter((entry) => entryVariantKind(entry) === want);
}

function cardVariantLabel(cardVariant = 'normal') {
  const labels = {
    all: 'Semua Varian',
    normal: 'Normal',
    parallel: 'Parallel (★)',
    sp: 'SP',
    manga: 'Manga / Comic',
    sec: 'SEC (Secret Rare)',
    promo: 'Promo',
  };
  return labels[cardVariant] || 'Normal';
}

function attachVariantFlags(entry) {
  const rarity = String(entry.rarity || '').trim();
  const label = `${entry.variantName || ''} ${rarity}`;
  const variantKind = rarity === 'SP' && !isMangaVariant(label) ? 'sp' : classifyCardVariant(label);
  return {
    ...entry,
    variantKind,
    isManga: variantKind === 'manga',
    isPromo: variantKind === 'promo',
    isSec: variantKind === 'sec',
    isSp: variantKind === 'sp',
    isParallel: variantKind === 'parallel',
  };
}

// Legacy graded helpers — prefer gradeFilter.js
const { parseGradeKey, gradeKeyLabel, isGradedGradeKey, filterByGradeKey } = require('./gradeFilter');

function parseGradedFlag(value) {
  return value === true || value === 'true' || value === 'on' || value === '1';
}

function filterByGraded(entries, wantGraded) {
  return filterByGradeKey(entries, wantGraded ? 'PSA10' : 'raw');
}

function gradedLabel(wantGraded) {
  return wantGraded ? 'PSA10' : 'Ungraded (Raw)';
}

module.exports = {
  CARD_VARIANTS,
  CARD_VARIANT_FILTER_OPTIONS,
  isMangaVariant,
  isParallelVariant,
  isSpVariant,
  isPromoVariant,
  isSecVariant,
  classifyCardVariant,
  resolveCardVariant,
  parseCardVariant,
  parseParallelFlag,
  parseSpFlag,
  parseGradedFlag,
  filterByCardVariant,
  filterByVariant: (entries, wantParallel) =>
    filterByCardVariant(entries, { cardVariant: wantParallel ? 'parallel' : 'normal' }),
  cardVariantLabel,
  variantLabel: (wantParallel) => cardVariantLabel(wantParallel ? 'parallel' : 'normal'),
  attachVariantFlags,
  entryVariantKind,
  parseGradeKey,
  gradeKeyLabel,
  isGradedGradeKey,
  filterByGradeKey,
  filterByGraded,
  gradedLabel,
};
