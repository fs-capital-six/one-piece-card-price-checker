const SET_PREFIX_LABELS = {
  OP: 'Booster Pack / Booster Box',
  EB: 'Extra Booster Pack / Box',
  ST: 'Starter Deck',
  PRB: 'Premium Booster Pack / Box',
  P: 'Kartu Promo',
};

const VARIANT_NOTES = {
  parallel:
    'Versi Parallel (★) didapat dari produk yang sama, biasanya dengan tingkat kemunculan (pull rate) lebih rendah daripada versi normal.',
  sp: 'Kartu SP (Special) biasanya hadir di edisi produk tertentu atau dengan pull rate sangat rendah.',
  manga:
    'Comic Parallel / Manga Rare adalah varian sangat langka yang didapat dari booster pack, bukan dari promo terpisah.',
  sec: 'Secret Rare (SEC) didapat dari booster pack/box set terkait.',
  promo: 'Kartu promo tidak dijual lewat booster reguler — biasanya dari event, hadiah, atau produk khusus.',
  normal: null,
};

function parseSetPrefix(cardSetId) {
  const id = String(cardSetId || '').toUpperCase();
  const match = id.match(/^(OP|EB|ST|PRB|P)/);
  return match ? match[1] : null;
}

function classifyPrintingChannel(label = '', raw = '') {
  const text = `${label} ${raw}`.toLowerCase();

  if (/one piece magazine|ワンピース・?マガジン|weekly shonen|週刊少年/i.test(text)) {
    return {
      category: 'magazine',
      title: 'Majalah / Publikasi',
      channel: 'ONE PIECE Magazine atau Weekly Shonen Jump',
    };
  }

  if (/championship|flagship battle|winner prize|top players|store tournament|asia final|japan final|優勝|大会|チャンピオンシップ/i.test(text)) {
    return {
      category: 'competition',
      title: 'Kompetisi / Turnamen',
      channel: 'Hadiah atau merchandise turnamen resmi (Flagship Battle, Championship, dll.)',
    };
  }

  if (/gift collection|premium card collection|promotion card set|promo set|プロモーションカードセット|プロモセット/i.test(text)) {
    return {
      category: 'promo_product',
      title: 'Produk Promo Khusus',
      channel: 'Set promo atau koleksi kartu khusus (bukan booster reguler)',
    };
  }

  if (/start deck|starter deck|スタートデック/i.test(text)) {
    return {
      category: 'starter_deck',
      title: 'Starter Deck',
      channel: 'Deck siap pakai (Starter Deck)',
    };
  }

  if (/extra booster|エクストラブースター|eb-?\d/i.test(text)) {
    return {
      category: 'extra_booster',
      title: 'Extra Booster Pack / Box',
      channel: 'Extra Booster Pack / Box',
    };
  }

  if (/premium booster|プレミアムブースター|prb-?\d/i.test(text)) {
    return {
      category: 'premium_booster',
      title: 'Premium Booster Pack / Box',
      channel: 'Premium Booster Pack / Box',
    };
  }

  if (/booster pack|ブースターパック|booster box|ブースター/i.test(text)) {
    return {
      category: 'booster_pack',
      title: 'Booster Pack / Booster Box',
      channel: 'Booster Pack / Booster Box',
    };
  }

  if (/promo|プロモ|promotional/i.test(text)) {
    return {
      category: 'promo',
      title: 'Kartu Promo',
      channel: 'Distribusi promo (event, hadiah, atau kampanye)',
    };
  }

  return null;
}

function classifyBySetPrefix(cardSetId, cardInfo) {
  const prefix = parseSetPrefix(cardSetId);
  const setName = cardInfo?.setName || null;

  if (!prefix) {
    return {
      category: 'unknown',
      title: 'Sumber tidak diketahui',
      channel: 'Informasi distribusi belum tersedia',
    };
  }

  if (prefix === 'P') {
    return {
      category: 'promo',
      title: 'Kartu Promo',
      channel: 'Kartu promo resmi (bukan booster reguler)',
    };
  }

  const channel = SET_PREFIX_LABELS[prefix];
  const title = channel;
  const setNote = setName ? ` — set ${setName}` : '';

  return {
    category:
      prefix === 'ST'
        ? 'starter_deck'
        : prefix === 'EB'
          ? 'extra_booster'
          : prefix === 'PRB'
            ? 'premium_booster'
            : 'booster_pack',
    title,
    channel: `${channel}${setNote}`,
  };
}

function buildDistributionDescription({ cardSetId, cardVariant = 'normal', printing, cardInfo } = {}) {
  const printingLabel = printing?.label || printing?.printingLabel || '';
  const printingRaw = printing?.raw || printing?.printingRaw || '';
  const setCode = String(cardSetId || '').toUpperCase().match(/^(OP|EB|ST|PRB)\d{2}/)?.[0] || null;
  const fromPrinting = classifyPrintingChannel(printingLabel, printingRaw);
  const fromSet = classifyBySetPrefix(cardSetId, cardInfo);
  const channel = fromPrinting || fromSet;

  const variantKey = cardVariant === 'all' ? 'normal' : cardVariant;
  const variantNote = VARIANT_NOTES[variantKey] || null;
  const editionNote =
    printingLabel && printingLabel !== 'Standard' && printingLabel !== 'Booster Pack'
      ? `Edisi cetak: ${printingLabel}.`
      : null;

  const lines = [];

  if (channel.category === 'magazine') {
    lines.push(
      `Kartu ini awalnya didistribusikan lewat ${channel.channel} — biasanya sebagai kartu promo atau bonus terbatas, bukan dari booster pack reguler.`
    );
  } else if (channel.category === 'competition') {
    lines.push(
      `Kartu ini awalnya didistribusikan lewat ${channel.title} — ${channel.channel}.`
    );
  } else if (channel.category === 'promo_product' || channel.category === 'promo') {
    lines.push(
      `Kartu ini awalnya didistribusikan sebagai kartu promo (${printingLabel || channel.channel}).`
    );
  } else if (channel.category === 'starter_deck') {
    lines.push(
      `Kartu ini awalnya didistribusikan lewat Starter Deck${cardInfo?.setName ? ` (${cardInfo.setName})` : ''}.`
    );
  } else if (channel.category === 'booster_pack' || channel.category === 'extra_booster' || channel.category === 'premium_booster') {
    const product =
      channel.category === 'extra_booster'
        ? 'Extra Booster Pack / Box'
        : channel.category === 'premium_booster'
          ? 'Premium Booster Pack / Box'
          : 'Booster Pack / Booster Box';
    const setLabel = cardInfo?.setName || (setCode ? `kode set ${setCode}` : '');
    lines.push(
      `Kartu ini awalnya didistribusikan lewat ${product}${setLabel ? ` — ${cardInfo?.setName ? `set ${cardInfo.setName}` : setLabel}` : ''}.`
    );
  } else {
    lines.push(`Asal distribusi: ${channel.channel}.`);
  }

  if (editionNote) lines.push(editionNote);
  if (variantNote) lines.push(variantNote);

  return {
    category: channel.category,
    title: channel.title,
    description: lines.join(' '),
    printingLabel: printingLabel || null,
    setName: cardInfo?.setName || null,
  };
}

module.exports = {
  buildDistributionDescription,
  classifyPrintingChannel,
  classifyBySetPrefix,
};
