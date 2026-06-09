// SNKRDUNK lists Japanese and English printings under the same card ID.
// English listings are tagged with [EN] in the apparel name.
const ENGLISH_LISTING_PATTERN = /\[EN\]|英語版|english\s*(?:ver(?:sion)?|edition)/i;

function isEnglishCardListing(text = '') {
  return ENGLISH_LISTING_PATTERN.test(String(text));
}

function isJapaneseCardListing(text = '') {
  return !isEnglishCardListing(text);
}

function filterJapaneseApparels(apparels = []) {
  return apparels.filter((item) => {
    const name = item.name || item.localizedName || item.variantName || '';
    return isJapaneseCardListing(name);
  });
}

function filterJapanesePriceEntries(entries = []) {
  return entries.filter((entry) => {
    if (entry.source === 'yuyu-tei') return true;
    const name = entry.variantName || entry.printingLabel || entry.printingRaw || '';
    return isJapaneseCardListing(name);
  });
}

module.exports = {
  ENGLISH_LISTING_PATTERN,
  isEnglishCardListing,
  isJapaneseCardListing,
  filterJapaneseApparels,
  filterJapanesePriceEntries,
};
