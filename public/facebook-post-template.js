const postTemplateForm = document.getElementById('postTemplateForm');
const photosInput = document.getElementById('photosInput');
const photosFolderInput = document.getElementById('photosFolderInput');
const photosFolderBtn = document.getElementById('photosFolderBtn');
const photosClearBtn = document.getElementById('photosClearBtn');
const photosDropZone = document.getElementById('photosDropZone');
const photosDropText = document.getElementById('photosDropText');
const photosSummary = document.getElementById('photosSummary');
const photosPreviewGrid = document.getElementById('photosPreviewGrid');
const generatePostBtn = document.getElementById('generatePostBtn');
const postTemplateError = document.getElementById('postTemplateError');
const postTemplateResult = document.getElementById('postTemplateResult');
const postTemplateOutput = document.getElementById('postTemplateOutput');
const postTemplateWarnings = document.getElementById('postTemplateWarnings');
const postItemCount = document.getElementById('postItemCount');
const copyPostBtn = document.getElementById('copyPostBtn');
const downloadPackageBtn = document.getElementById('downloadPackageBtn');
const labeledPhotosSection = document.getElementById('labeledPhotosSection');
const labeledPhotosGrid = document.getElementById('labeledPhotosGrid');
const labeledPhotosEmpty = document.getElementById('labeledPhotosEmpty');

const MAX_PHOTOS = 200;
let selectedPhotos = [];
const previewUrls = new Map();

function photoKey(file) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function showPostError(message) {
  postTemplateError.textContent = message;
  postTemplateError.classList.remove('hidden');
  postTemplateResult.classList.add('hidden');
  labeledPhotosSection?.classList.add('hidden');
  labeledPhotosGrid.innerHTML = '';
  labeledPhotosEmpty?.classList.add('hidden');
}

function clearPostError() {
  postTemplateError.classList.add('hidden');
}

function revokePreviewUrl(key) {
  const url = previewUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    previewUrls.delete(key);
  }
}

function addPhotos(fileList) {
  const incoming = Array.from(fileList || []).filter((file) => file.type.startsWith('image/'));
  if (!incoming.length) return;

  const existingKeys = new Set(selectedPhotos.map(photoKey));
  let added = 0;

  for (const file of incoming) {
    const key = photoKey(file);
    if (existingKeys.has(key)) continue;
    if (selectedPhotos.length >= MAX_PHOTOS) break;

    selectedPhotos.push(file);
    existingKeys.add(key);
    added += 1;
  }

  if (selectedPhotos.length >= MAX_PHOTOS && incoming.length > added) {
    showPostError(`Maksimal ${MAX_PHOTOS} foto per unggahan.`);
  } else {
    clearPostError();
  }

  renderPhotosPreview();
}

function removePhoto(key) {
  selectedPhotos = selectedPhotos.filter((file) => photoKey(file) !== key);
  revokePreviewUrl(key);
  renderPhotosPreview();
}

function clearPhotos() {
  for (const key of previewUrls.keys()) revokePreviewUrl(key);
  selectedPhotos = [];
  photosInput.value = '';
  photosFolderInput.value = '';
  renderPhotosPreview();
}

function renderPhotosPreview() {
  const count = selectedPhotos.length;
  photosSummary.textContent =
    count === 0
      ? 'Belum ada foto dipilih.'
      : `${count} foto siap diunggah. Cocokkan nama file dengan kolom photo di CSV (opsional).`;

  photosDropText.textContent =
    count === 0 ? 'Klik atau seret banyak foto ke sini' : `${count} foto terpilih — tambah lagi atau lanjut isi CSV`;

  photosClearBtn.classList.toggle('hidden', count === 0);
  photosPreviewGrid.classList.toggle('hidden', count === 0);
  photosPreviewGrid.innerHTML = '';

  for (const file of selectedPhotos) {
    const key = photoKey(file);
    let url = previewUrls.get(key);
    if (!url) {
      url = URL.createObjectURL(file);
      previewUrls.set(key, url);
    }

    const item = document.createElement('div');
    item.className = 'photo-preview-item';
    item.innerHTML = `
      <img src="${url}" alt="${file.name}" />
      <button type="button" class="photo-preview-remove" aria-label="Hapus ${file.name}">&times;</button>
      <span class="photo-preview-name" title="${file.name}">${file.name}</span>
    `;

    item.querySelector('.photo-preview-remove').addEventListener('click', (event) => {
      event.stopPropagation();
      removePhoto(key);
    });

    photosPreviewGrid.appendChild(item);
  }
}

photosDropZone?.addEventListener('click', () => photosInput.click());

photosDropZone?.addEventListener('dragover', (event) => {
  event.preventDefault();
  photosDropZone.classList.add('is-dragover');
});

photosDropZone?.addEventListener('dragleave', () => {
  photosDropZone.classList.remove('is-dragover');
});

photosDropZone?.addEventListener('drop', (event) => {
  event.preventDefault();
  photosDropZone.classList.remove('is-dragover');
  addPhotos(event.dataTransfer.files);
});

photosInput?.addEventListener('change', () => {
  addPhotos(photosInput.files);
  photosInput.value = '';
});

photosFolderBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  photosFolderInput.click();
});

photosFolderInput?.addEventListener('change', () => {
  addPhotos(photosFolderInput.files);
  photosFolderInput.value = '';
});

photosClearBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  clearPhotos();
});

function renderLabeledPhotos(photos = []) {
  labeledPhotosSection.classList.remove('hidden');
  labeledPhotosGrid.innerHTML = '';

  if (!photos.length) {
    labeledPhotosEmpty?.classList.remove('hidden');
    labeledPhotosGrid.classList.add('hidden');
    return;
  }

  labeledPhotosEmpty?.classList.add('hidden');
  labeledPhotosGrid.classList.remove('hidden');

  for (const photo of photos) {
    const card = document.createElement('div');
    card.className = 'labeled-photo-card';
    card.innerHTML = `
      <img src="${photo.dataUrl}" alt="${photo.filename}" loading="lazy" />
      <a href="${photo.dataUrl}" download="${photo.filename}" class="labeled-photo-save">Simpan</a>
    `;
    labeledPhotosGrid.appendChild(card);
  }
}

function buildFormData() {
  const csvFile = document.getElementById('csvInput').files?.[0];
  if (!csvFile) {
    throw new Error('File CSV wajib diunggah.');
  }

  const formData = new FormData();
  formData.append('csv', csvFile);
  formData.append('title', document.getElementById('postTitle').value);
  formData.append('footer', document.getElementById('postFooter').value);
  selectedPhotos.forEach((photo) => formData.append('photos', photo));
  return formData;
}

downloadPackageBtn?.addEventListener('click', async () => {
  clearPostError();

  try {
    const formData = buildFormData();
    downloadPackageBtn.disabled = true;
    downloadPackageBtn.textContent = 'Menyiapkan ZIP...';

    const res = await fetch('/api/facebook-tools/download-package', {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      let message = 'Gagal mengunduh ZIP';
      try {
        const data = await res.json();
        message = data.error || message;
      } catch {
        // response may not be JSON
      }
      throw new Error(message);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `facebook-post-${date}.zip`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showPostError(err.message || 'Gagal mengunduh ZIP');
  } finally {
    downloadPackageBtn.disabled = false;
    downloadPackageBtn.textContent = 'Unduh ZIP (foto ber-label)';
  }
});

copyPostBtn?.addEventListener('click', async () => {
  const text = postTemplateOutput.value;
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
    copyPostBtn.textContent = 'Tersalin!';
    setTimeout(() => {
      copyPostBtn.textContent = 'Salin Teks';
    }, 1800);
  } catch {
    postTemplateOutput.focus();
    postTemplateOutput.select();
    document.execCommand('copy');
    copyPostBtn.textContent = 'Tersalin!';
    setTimeout(() => {
      copyPostBtn.textContent = 'Salin Teks';
    }, 1800);
  }
});

postTemplateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearPostError();

  let formData;
  try {
    formData = buildFormData();
  } catch (err) {
    showPostError(err.message);
    return;
  }

  generatePostBtn.disabled = true;
  generatePostBtn.textContent = 'Memproses...';

  try {
    const res = await fetch('/api/facebook-tools/generate-post', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Gagal membuat template posting');
    }

    postTemplateOutput.value = data.postText;
    postItemCount.textContent = String(data.itemCount || 0);
    postTemplateResult.classList.remove('hidden');

    if (data.warnings?.length) {
      postTemplateWarnings.innerHTML = data.warnings.map((warning) => `<p>• ${warning}</p>`).join('');
      postTemplateWarnings.classList.remove('hidden');
    } else {
      postTemplateWarnings.classList.add('hidden');
      postTemplateWarnings.innerHTML = '';
    }

    renderLabeledPhotos(data.labeledPhotos || []);
  } catch (err) {
    showPostError(err.message || 'Terjadi kesalahan');
  } finally {
    generatePostBtn.disabled = false;
    generatePostBtn.textContent = 'Buat Template Posting';
  }
});

renderPhotosPreview();
