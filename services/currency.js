const db = require('../db');

const FALLBACK_RATES = {
  JPY: 112.59,
  USD: 16500,
  IDR: 1,
};

async function fetchRate(currency) {
  if (currency === 'IDR') return 1;

  try {
    const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${currency}`);
    if (!res.ok) throw new Error('rate fetch failed');
    const data = await res.json();
    const rate = data.rates?.IDR;
    if (!rate) throw new Error('IDR rate missing');

    db.prepare(`
      INSERT INTO exchange_rates (currency, rate_to_idr, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(currency) DO UPDATE SET
        rate_to_idr = excluded.rate_to_idr,
        updated_at = excluded.updated_at
    `).run(currency, rate);

    return rate;
  } catch {
    const cached = db.prepare('SELECT rate_to_idr FROM exchange_rates WHERE currency = ?').get(currency);
    return cached?.rate_to_idr ?? FALLBACK_RATES[currency] ?? 1;
  }
}

async function toIdr(amount, currency) {
  const rate = await fetchRate(currency);
  return Math.round(amount * rate);
}

function formatIdr(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

module.exports = { toIdr, formatIdr, fetchRate };
