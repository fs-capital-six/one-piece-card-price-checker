const loginSection = document.getElementById('loginSection');
const toolsSection = document.getElementById('toolsSection');
const userProfileSection = document.getElementById('userProfileSection');
const authError = document.getElementById('authError');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');

function showAuthError(message) {
  if (!message) return;
  authError.textContent = message;
  authError.classList.remove('hidden');
}

function showLoggedIn(user) {
  loginSection.classList.add('hidden');
  toolsSection.classList.remove('hidden');
  userProfileSection.classList.remove('hidden');

  userName.textContent = user.name;
  userEmail.textContent = user.email || 'Email tidak tersedia';
  userAvatar.src = user.pictureUrl || '';
  userAvatar.alt = user.name;
  userAvatar.classList.toggle('hidden', !user.pictureUrl);

  if (typeof window.loadMonitoredPosts === 'function') {
    window.loadMonitoredPosts();
  }
}

function showGuestMode() {
  loginSection.classList.remove('hidden');
  toolsSection.classList.remove('hidden');
  userProfileSection.classList.add('hidden');

  const monitoredPostsSection = document.getElementById('monitoredPostsSection');
  monitoredPostsSection?.classList.add('hidden');
}

async function loadSession() {
  const params = new URLSearchParams(window.location.search);
  const authErrorParam = params.get('auth_error');
  if (authErrorParam) {
    showAuthError(decodeURIComponent(authErrorParam));
    window.history.replaceState({}, '', window.location.pathname);
  }

  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (data.authenticated) {
      showLoggedIn(data.user);
    } else {
      showGuestMode();
    }
  } catch {
    showGuestMode();
  }
}

loadSession();
