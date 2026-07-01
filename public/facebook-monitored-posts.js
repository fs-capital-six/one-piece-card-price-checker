const monitoredPostsSection = document.getElementById('monitoredPostsSection');
const monitoredPostForm = document.getElementById('monitoredPostForm');
const monitoredPostError = document.getElementById('monitoredPostError');
const monitoredPostSuccess = document.getElementById('monitoredPostSuccess');
const monitoredPostsList = document.getElementById('monitoredPostsList');
const monitoredPostsEmpty = document.getElementById('monitoredPostsEmpty');
const saveMonitoredPostBtn = document.getElementById('saveMonitoredPostBtn');

const STATUS_LABELS = {
  active: 'Aktif',
  closed: 'Selesai',
  cancelled: 'Dibatalkan',
};

function showMonitoredPostError(message) {
  monitoredPostError.textContent = message;
  monitoredPostError.classList.remove('hidden');
  monitoredPostSuccess.classList.add('hidden');
}

function showMonitoredPostSuccess(message) {
  monitoredPostSuccess.textContent = message;
  monitoredPostSuccess.classList.remove('hidden');
  monitoredPostError.classList.add('hidden');
}

function clearMonitoredPostMessages() {
  monitoredPostError.classList.add('hidden');
  monitoredPostSuccess.classList.add('hidden');
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMonitoredPosts(posts = []) {
  monitoredPostsList.innerHTML = '';
  monitoredPostsEmpty.classList.toggle('hidden', posts.length > 0);

  for (const post of posts) {
    const card = document.createElement('article');
    card.className = 'monitored-post-card';
    const title = escapeHtml(post.postTitle || 'Posting tanpa judul');
    const url = escapeHtml(post.postUrl);
    const notes = post.notes ? `<p class="text-sm text-slate-400 mt-2">${escapeHtml(post.notes)}</p>` : '';
    card.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <span class="monitored-post-status monitored-post-status-${post.status}">${STATUS_LABELS[post.status] || post.status}</span>
            <span class="text-xs text-slate-500">${formatDate(post.createdAt)}</span>
          </div>
          <h3 class="font-semibold text-slate-100 break-words">${title}</h3>
          <a href="${url}" target="_blank" rel="noopener noreferrer" class="text-sm text-amber-400 hover:text-amber-300 break-all">${url}</a>
          ${notes}
        </div>
        <div class="flex flex-wrap gap-2 shrink-0">
          ${post.status === 'active' ? `
            <button type="button" class="facebook-tools-btn text-xs font-semibold py-2 px-3 rounded-lg" data-action="close" data-id="${post.id}">Tutup</button>
          ` : ''}
          <button type="button" class="facebook-tools-btn text-xs font-semibold py-2 px-3 rounded-lg" data-action="delete" data-id="${post.id}">Hapus</button>
        </div>
      </div>
    `;
    monitoredPostsList.appendChild(card);
  }
}

async function loadMonitoredPosts() {
  if (!monitoredPostsSection) return;

  try {
    const res = await fetch('/api/facebook-tools/monitored-posts');
    if (res.status === 401) {
      monitoredPostsSection.classList.add('hidden');
      return;
    }

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Gagal memuat daftar posting');

    monitoredPostsSection.classList.remove('hidden');
    renderMonitoredPosts(data.posts || []);
  } catch (err) {
    monitoredPostsSection.classList.remove('hidden');
    showMonitoredPostError(err.message || 'Gagal memuat daftar posting');
  }
}

monitoredPostForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMonitoredPostMessages();

  const postUrl = document.getElementById('monitoredPostUrl').value.trim();
  const postTitle = document.getElementById('monitoredPostTitle').value.trim();
  const notes = document.getElementById('monitoredPostNotes').value.trim();

  saveMonitoredPostBtn.disabled = true;
  saveMonitoredPostBtn.textContent = 'Menyimpan...';

  try {
    const res = await fetch('/api/facebook-tools/monitored-posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postUrl, postTitle, notes }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Gagal menyimpan link posting');

    monitoredPostForm.reset();
    showMonitoredPostSuccess('Link posting berhasil disimpan.');
    await loadMonitoredPosts();
  } catch (err) {
    showMonitoredPostError(err.message || 'Gagal menyimpan link posting');
  } finally {
    saveMonitoredPostBtn.disabled = false;
    saveMonitoredPostBtn.textContent = 'Simpan Link Posting';
  }
});

monitoredPostsList?.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = button.dataset.id;
  const action = button.dataset.action;
  clearMonitoredPostMessages();

  try {
    if (action === 'delete') {
      const res = await fetch(`/api/facebook-tools/monitored-posts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menghapus posting');
      showMonitoredPostSuccess('Link posting dihapus.');
    }

    if (action === 'close') {
      const res = await fetch(`/api/facebook-tools/monitored-posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'closed' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal menutup posting');
      showMonitoredPostSuccess('Posting ditandai selesai.');
    }

    await loadMonitoredPosts();
  } catch (err) {
    showMonitoredPostError(err.message || 'Aksi gagal');
  }
});

window.loadMonitoredPosts = loadMonitoredPosts;
