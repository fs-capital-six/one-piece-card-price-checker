function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function normalizePrintingKey(key) {
  return String(key)
    .replace(/^starter-deck-ex-/, 'start-deck-ex-')
    .replace(/^starter-deck-/, 'start-deck-');
}

function extractQuotedName(text) {
  const match = String(text || '').match(/"([^"]+)"/);
  return match ? match[1].trim() : null;
}

function extractPrizeSuffix(variantName) {
  const match = String(variantName || '').match(/:\s*([^[\(]+?)\s*\[/);
  return match ? match[1].trim() : '';
}

function shortenPrintingLabel(raw, { prizeSuffix = '' } = {}) {
  const label = String(raw || '').trim();
  const isPromoWrapper = /promotional card|promotion card|プロモ/i.test(label);
  const quoted = isPromoWrapper ? extractQuotedName(label) : null;

  if (quoted) {
    const quotedShortcuts = [
      [/one piece magazine|ワンピース・?マガジン/i, 'ONE PIECE Magazine'],
      [/flagship battle.*memento/i, 'Flagship Battle (Winner Memento)'],
      [/flagship battle/i, 'Flagship Battle Promo'],
      [/championship.*japan finals/i, 'Championship Japan Finals'],
      [/championship.*asia final/i, 'Championship Asia Finals'],
      [/gift collection/i, 'Gift Collection'],
      [/weekly shonen jump.*one piece/i, 'ONE PIECE Magazine'],
      [/weekly shonen jump/i, 'Weekly Shonen Jump Promo'],
      [/promotion card set/i, 'Promo Set'],
    ];

    for (const [pattern, short] of quotedShortcuts) {
      if (pattern.test(quoted)) {
        return prizeSuffix ? `${short} (${prizeSuffix})` : short;
      }
    }

    const trimmed = quoted.length > 50 ? `${quoted.slice(0, 47)}…` : quoted;
    return prizeSuffix ? `${trimmed} (${prizeSuffix})` : trimmed;
  }

  const shortcuts = [
    [/premium card collection.*25th/i, 'Premium 25th Anniversary'],
    [/gift collection.*2023/i, 'Gift Collection 2023'],
    [/start(?:er)? deck ex.*gear 5/i, 'Start Deck EX "Gear 5"'],
    [/start(?:er)? deck.*straw hat/i, 'Start Deck'],
    [/スタートデック.*麦わら/i, 'Start Deck'],
    [/booster pack/i, 'Booster Pack'],
    [/ブースターパック/i, 'Booster Pack'],
    [/promotion card set/i, 'Promo Set'],
    [/promotional card/i, 'Promo'],
    [/プロモ/i, 'Promo'],
    [/winner prize/i, 'Winner Prize'],
    [/flagship battle/i, 'Flagship Battle Promo'],
    [/weekly shonen/i, 'Weekly Shonen Promo'],
    [/週刊少年/i, 'Weekly Shonen Promo'],
  ];

  for (const [pattern, short] of shortcuts) {
    if (pattern.test(label)) {
      return prizeSuffix ? `${short} (${prizeSuffix})` : short;
    }
  }

  const base = label.length > 48 ? `${label.slice(0, 45)}…` : label || 'Standard';
  return prizeSuffix ? `${base} (${prizeSuffix})` : base;
}

function parsePrintingFromVariantName(variantName, cardSetId = '') {
  const name = String(variantName || '');
  const prizeSuffix = extractPrizeSuffix(name);
  const matches = [...name.matchAll(/\(([^)]+)\)/g)].map((match) => match[1].trim()).filter(Boolean);

  if (matches.length === 0) {
    const fallbackLabel = prizeSuffix || 'Standard';
    return {
      key: normalizePrintingKey(slugify(fallbackLabel) || 'standard'),
      label: fallbackLabel,
      raw: '',
    };
  }

  const raw = matches[matches.length - 1];
  const label = shortenPrintingLabel(raw, { prizeSuffix });
  return {
    key: normalizePrintingKey(slugify(label) || 'standard'),
    label,
    raw,
  };
}

function scorePrinting(label = '', raw = '') {
  const text = `${label} ${raw}`;
  let score = 0;

  if (/start deck|スタートデック|starter/i.test(text)) score += 100;
  if (/booster pack|ブースターパック/i.test(text)) score += 90;
  if (/one piece magazine|ワンピース・?マガジン/i.test(text)) score += 35;
  if (/standard/i.test(text)) score += 50;
  if (/premium|gift collection|winner prize|flagship|championship|promo|プロモ|週刊少年/i.test(text)) score += 20;
  if (/\[EN\]/i.test(text)) score -= 5;

  return score;
}

function attachPrinting(entry, cardSetId) {
  const parsed = parsePrintingFromVariantName(entry.variantName, cardSetId);
  return {
    ...entry,
    printingKey: entry.printingKey || parsed.key,
    printingLabel: entry.printingLabel || parsed.label,
    printingRaw: entry.printingRaw || parsed.raw,
    printingScore: entry.printingScore ?? scorePrinting(parsed.label, parsed.raw),
  };
}

module.exports = {
  parsePrintingFromVariantName,
  shortenPrintingLabel,
  scorePrinting,
  attachPrinting,
  slugify,
  normalizePrintingKey,
};
