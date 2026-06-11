const { ZipArchive } = require('archiver');
const { labelPhotoFromFile } = require('./photoLabel');

function normalizeFilename(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/^.*[\\/]/, '');
}

function buildPhotoFilename(cardCode, index) {
  const code = String(cardCode || 'card')
    .replace(/[^\w-]/g, '')
    .toUpperCase();
  return `${String(index).padStart(2, '0')}-${code}.jpg`;
}

async function buildLabeledPhotos({ items, photoFiles }) {
  const photoByName = new Map();
  for (const file of photoFiles) {
    photoByName.set(normalizeFilename(file.originalname), file);
  }

  const labeledPhotos = [];

  for (const item of items) {
    if (!item.matchedPhoto) continue;

    const file = photoByName.get(normalizeFilename(item.matchedPhoto));
    if (!file) continue;

    const buffer = await labelPhotoFromFile(file.path, {
      rowNumber: item.rowNumber,
      cardCode: item.cardCode,
      priceFormatted: item.priceFormatted,
    });

    labeledPhotos.push({
      rowNumber: item.rowNumber,
      cardCode: item.cardCode,
      filename: buildPhotoFilename(item.cardCode, item.rowNumber),
      buffer,
    });
  }

  return labeledPhotos;
}

async function buildLabeledPhotoEntries(options) {
  const labeledPhotos = await buildLabeledPhotos(options);
  return labeledPhotos.map((photo) => ({
    name: `photos/${photo.filename}`,
    buffer: photo.buffer,
  }));
}

function createPostPackageZip({ postText, labeledEntries }) {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.append(postText, { name: 'post.txt' });

  for (const entry of labeledEntries) {
    archive.append(entry.buffer, { name: entry.name });
  }

  archive.finalize();
  return archive;
}

module.exports = { buildLabeledPhotos, buildLabeledPhotoEntries, createPostPackageZip };
