const db = require('../db');
const { attachVariantFlags } = require('./variantFilter');

function getFacebookPrices(cardSetId) {
  const rows = db
    .prepare(
      `SELECT variant_name, price_original, currency, price_idr, url, fetched_at
       FROM price_entries
       WHERE source = 'facebook' AND UPPER(card_set_id) = UPPER(?)
       ORDER BY fetched_at DESC`
    )
    .all(cardSetId);

  return rows.map((row) =>
    attachVariantFlags({
      source: 'facebook',
      variantName: row.variant_name,
      priceOriginal: row.price_original,
      currency: row.currency,
      priceIdr: row.price_idr,
      url: row.url || 'Forum One Piece TCG Indonesia',
      note: 'Harga komunitas — masukkan manual lewat halaman Admin',
      fetchedAt: row.fetched_at,
    })
  );
}

function addFacebookPrice({ cardSetId, variantName, priceIdr, url }) {
  const stmt = db.prepare(`
    INSERT INTO price_entries (card_set_id, source, variant_name, price_original, currency, price_idr, url)
    VALUES (?, 'facebook', ?, ?, 'IDR', ?, ?)
  `);
  stmt.run(cardSetId.toUpperCase(), variantName, priceIdr, priceIdr, url || 'Forum One Piece TCG Indonesia');
}

module.exports = { getFacebookPrices, addFacebookPrice };
