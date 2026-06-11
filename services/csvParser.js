function detectDelimiter(line) {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && Object.hasOwn(counts, char)) {
      counts[char] += 1;
    }
  }

  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 ? ranked[0][0] : ',';
}

function parseCsvLine(line, delimiter = ',') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function normalizeHeader(header) {
  return header
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '');
}

const COLUMN_ALIASES = {
  photo: ['photo', 'foto', 'filename', 'file', 'gambar', 'image', 'picture'],
  cardCode: [
    'kode',
    'kode_kartu',
    'kodekartu',
    'kode_card',
    'kodecard',
    'kartu',
    'card_code',
    'cardcode',
    'card_set_id',
    'cardsetid',
    'card_id',
    'cardid',
    'set_id',
    'setid',
    'nomor_kartu',
    'nomorkartu',
    'no_kartu',
    'nokartu',
  ],
  cardName: ['nama', 'name', 'card_name', 'cardname', 'nama_kartu', 'namakartu'],
  variant: ['varian', 'variant', 'variant_name', 'variantname', 'tipe', 'type'],
  price: ['harga', 'price', 'price_idr', 'priceidr', 'idr', 'harga_idr', 'hargaidr'],
  condition: ['kondisi', 'condition', 'grade', 'grading', 'kondisi_kartu', 'kondisikartu'],
  notes: ['catatan', 'notes', 'note', 'keterangan', 'remark', 'remarks'],
};

function resolveColumnKey(header) {
  const normalized = normalizeHeader(header);
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }

  if (/kode.*kartu|kartu.*kode/.test(normalized)) return 'cardCode';
  if (/^card.?code$|^card.?set|^card.?id$/.test(normalized)) return 'cardCode';

  return normalized;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    throw new Error('File CSV kosong');
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter).map(resolveColumnKey);
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseCsvLine(lines[i], delimiter);
    if (values.every((value) => !value)) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error('CSV tidak memiliki baris data');
  }

  return { headers, rows, delimiter };
}

module.exports = { parseCsv, COLUMN_ALIASES, detectDelimiter };
