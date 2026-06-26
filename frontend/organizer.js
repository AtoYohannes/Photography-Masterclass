const loginScreen = document.getElementById('loginScreen');
const dashScreen  = document.getElementById('dashScreen');
const loginForm   = document.getElementById('loginForm');
const loginError  = document.getElementById('loginError');
const orgCount    = document.getElementById('orgCount');
const orgTable    = document.getElementById('orgTable');
const orgRefresh  = document.getElementById('orgRefresh');
const signOutBtn  = document.getElementById('signOutBtn');

const SESSION_KEY = 'org_token';

function getToken() {
  return sessionStorage.getItem(SESSION_KEY) || '';
}

function showDash() {
  loginScreen.hidden = true;
  dashScreen.hidden  = false;
  loadRegistrations();
}

function showLogin() {
  loginScreen.hidden = false;
  dashScreen.hidden  = true;
  sessionStorage.removeItem(SESSION_KEY);
}

async function loadRegistrations() {
  orgTable.innerHTML = '<p class="empty-state">Loading…</p>';

  try {
    const res = await fetch('/api/registrations', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });

    if (res.status === 401) { showLogin(); return; }

    const data = await res.json();
    if (!data.success) {
      orgTable.innerHTML = '<p class="empty-state">Unable to load registrations.</p>';
      return;
    }

    const rows = data.registrations || [];
    if (orgCount) orgCount.textContent = rows.length;

    if (rows.length === 0) {
      orgTable.innerHTML = '<p class="empty-state">No registrations yet.</p>';
      return;
    }

    orgTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Registered at</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td class="row-num">${i + 1}</td>
              <td>${escHtml(r.fullName)}</td>
              <td>${escHtml(r.email)}</td>
              <td>${escHtml(r.phone)}</td>
              <td>${new Date(r.registeredAt).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (_) {
    orgTable.innerHTML = '<p class="empty-state">Unable to load registrations right now.</p>';
  }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Login form ──────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const password = document.getElementById('orgPassword').value;

  try {
    const res  = await fetch('/api/auth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password })
    });
    const data = await res.json();

    if (data.success) {
      sessionStorage.setItem(SESSION_KEY, password);
      showDash();
    } else {
      loginError.textContent = data.message || 'Incorrect password.';
    }
  } catch (_) {
    loginError.textContent = 'Unable to connect. Try again.';
  }
});

orgRefresh?.addEventListener('click', loadRegistrations);
signOutBtn?.addEventListener('click', showLogin);

// ── Auto-login if session exists ────────────────────
if (getToken()) {
  showDash();
}
