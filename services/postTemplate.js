const { parseCsv } = require('./csvParser');
const { formatIdr } = require('./currency');
const { extractCardId } = require('./cardIdentifier');

function normalizeFilename(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^.*[\\/]/, '');
}

function parsePrice(value) {
  if (value === undefined || value === null || value === '') return null;

  const raw = String(value).trim().toLowerCase().replace(/rp\.?/g, '').replace(/\s/g, '');
  if (!raw) return null;

  const jtMatch = raw.match(/^([\d.,]+)\s*jt$/);
  if (jtMatch) {
    const amount = Number(jtMatch[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(amount) ? Math.round(amount * 1_000_000) : null;
  }

  const kMatch = raw.match(/^([\d.,]+)\s*(k|rb)$/);
  if (kMatch) {
    const amount = Number(kMatch[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(amount) ? Math.round(amount * 1000) : null;
  }

  const digitsOnly = raw.replace(/\./g, '').replace(',', '.');
  const amount = Number(digitsOnly);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function getField(row, key) {
  const value = row[key];
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function findCardCodeInRow(row) {
  const direct =
    getField(row, 'cardCode') ||
    getField(row, 'kode') ||
    getField(row, 'kode_kartu') ||
    getField(row, 'kartu') ||
    getField(row, 'card_set_id');

  if (direct) {
    return extractCardId(direct) || direct;
  }

  for (const value of Object.values(row)) {
    const text = String(value || '').trim();
    if (!text) continue;
    const extracted = extractCardId(text);
    if (extracted) return extracted;
  }

  return '';
}

function normalizeRow(row, index, headers = []) {
  const cardCode = findCardCodeInRow(row).toUpperCase();

  if (!cardCode) {
    const detectedHeaders = headers.length ? headers.join(', ') : Object.keys(row).join(', ');
    throw new Error(
      `Baris ${index + 2}: kode kartu wajib diisi. Pastikan ada kolom "kode" (contoh: OP01-001). Kolom terdeteksi: ${detectedHeaders}`
    );
  }

  const price = parsePrice(getField(row, 'price') || getField(row, 'harga'));

  return {
    rowNumber: index + 1,
    photo: getField(row, 'photo') || getField(row, 'foto'),
    cardCode,
    cardName: getField(row, 'cardName') || getField(row, 'nama'),
    variant: getField(row, 'variant') || getField(row, 'varian'),
    price,
    priceFormatted: price != null ? formatIdr(price) : null,
    condition: getField(row, 'condition') || getField(row, 'kondisi'),
    notes: getField(row, 'notes') || getField(row, 'catatan'),
  };
}

function matchPhotosToRows(rows, photoFiles) {
  const photoMap = new Map();
  for (const file of photoFiles) {
    photoMap.set(normalizeFilename(file.originalname), file.originalname);
  }

  const usedPhotos = new Set();

  const items = rows.map((row) => {
    let matchedPhoto = null;

    if (row.photo) {
      matchedPhoto = photoMap.get(normalizeFilename(row.photo)) || null;
    } else {
      const codeGuess = `${row.cardCode}.jpg`;
      matchedPhoto = photoMap.get(normalizeFilename(codeGuess)) || null;
      if (!matchedPhoto) {
        matchedPhoto = photoMap.get(normalizeFilename(`${row.cardCode}.jpeg`)) || null;
      }
    }

    if (matchedPhoto) usedPhotos.add(normalizeFilename(matchedPhoto));

    return { ...row, matchedPhoto };
  });

  const unmatchedPhotos = photoFiles
    .map((file) => file.originalname)
    .filter((name) => !usedPhotos.has(normalizeFilename(name)));

  const rowsMissingPhoto = items.filter((item) => !item.matchedPhoto).map((item) => item.cardCode);

  return { items, unmatchedPhotos, rowsMissingPhoto };
}

function formatItemLine(item) {
  const titleParts = [item.cardCode];
  if (item.cardName) titleParts.push(item.cardName);
  if (item.variant) titleParts.push(`(${item.variant})`);

  const detailParts = [];
  if (item.priceFormatted) detailParts.push(item.priceFormatted);
  if (item.condition) detailParts.push(item.condition);
  if (item.notes) detailParts.push(item.notes);

  const lines = [`${item.rowNumber}. ${titleParts.join(' · ')}`];
  if (detailParts.length) lines.push(`   ${detailParts.join(' · ')}`);
  if (item.matchedPhoto) lines.push(`   📷 ${item.matchedPhoto}`);

  return lines.join('\n');
}

function buildPostTemplate({ items, title, footer, warnings = [] }) {
  const header = (title || 'WTS — One Piece TCG').trim();
  const body = items.map(formatItemLine).join('\n\n');
  const footerText = (footer || 'Minat? DM / comment deal.').trim();

  const warningBlock =
    warnings.length > 0 ? `\n\n⚠️ Catatan:\n${warnings.map((w) => `• ${w}`).join('\n')}` : '';

  const postText = `${header}\n\n${body}\n\n---\n${footerText}${warningBlock}`;

  return { postText, header, body, footer: footerText, itemCount: items.length };
}

function generatePostFromCsv({ csvText, photoFiles, title, footer }) {
  const { rows, headers } = parseCsv(csvText);
  const normalizedRows = rows.map((row, index) => normalizeRow(row, index, headers));
  const { items, unmatchedPhotos, rowsMissingPhoto } = matchPhotosToRows(normalizedRows, photoFiles);

  const warnings = [];
  if (unmatchedPhotos.length) {
    warnings.push(`Foto belum dipasangkan: ${unmatchedPhotos.join(', ')}`);
  }
  if (rowsMissingPhoto.length) {
    warnings.push(`Baris tanpa foto: ${rowsMissingPhoto.join(', ')}`);
  }

  const template = buildPostTemplate({ items, title, footer, warnings });

  return {
    ...template,
    items,
    warnings,
    unmatchedPhotos,
    rowsMissingPhoto,
  };
}

const SAMPLE_CSV = `photo,kode,nama,varian,harga,kondisi,catatan
OP01-001.jpg,OP01-001,Shanks,Leader Parallel,450000,Raw,
OP05-067.jpg,OP05-067,Monkey.D.Luffy,Manga Rare,8500000,PSA 10,
,OP09-001,,Leader,180000,Raw,No box`;

module.exports = { generatePostFromCsv, SAMPLE_CSV, parsePrice };
