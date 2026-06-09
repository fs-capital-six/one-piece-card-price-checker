const { findApparels, pickBestApparel } = require('./snkrdunk');

const OFFICIAL_BASE = 'https://en.onepiece-cardgame.com/images/cardlist/card';

function officialImageUrls(cardSetId, { isParallel = false, isSp = false } = {}) {
  const urls = [];
  if (isSp) urls.push(`${OFFICIAL_BASE}/${cardSetId}_p2.png`);
  if (isParallel) urls.push(`${OFFICIAL_BASE}/${cardSetId}_p1.png`);
  urls.push(`${OFFICIAL_BASE}/${cardSetId}.png`);
  return urls;
}

async function fetchSnkrdunkCardImage(cardSetId, { cardVariant = 'normal', isParallel = false, isSp = false } = {}) {
  const apparels = await findApparels(cardSetId);
  const apparel = pickBestApparel(apparels, { cardVariant, isParallel, isSp });
  return apparel?.primaryMedia?.imageUrl || null;
}

async function resolveCardImageSources(
  cardSetId,
  { cardVariant = 'normal', isParallel = false, isSp = false, cardInfo = null, imageUrl = null, apparelId = null } = {}
) {
  const sources = [];

  if (imageUrl) sources.push(imageUrl);

  if (cardInfo?.imageUrl && cardInfo.isSp === isSp && cardInfo.isParallel === isParallel) {
    sources.push(cardInfo.imageUrl);
  }

  try {
    if (apparelId) {
      const apparels = await findApparels(cardSetId);
      const apparel = apparels.find((item) => item.id === Number(apparelId));
      if (apparel?.primaryMedia?.imageUrl) sources.push(apparel.primaryMedia.imageUrl);
    }

    const snkrImage = await fetchSnkrdunkCardImage(cardSetId, { cardVariant, isParallel, isSp });
    if (snkrImage) sources.push(snkrImage);
  } catch {
    // SNKRDUNK is optional
  }

  sources.push(...officialImageUrls(cardSetId, { isParallel, isSp }));
  sources.push(`https://optcgapi.com/media/static/Card_Images/${cardSetId}.jpg`);

  return [...new Set(sources.filter(Boolean))];
}

module.exports = {
  officialImageUrls,
  fetchSnkrdunkCardImage,
  resolveCardImageSources,
};
