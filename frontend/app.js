const form = document.getElementById('registrationForm');
const messageBox = document.getElementById('formMessage');
const countBox = document.getElementById('registrationsCount');
const entriesTable = document.getElementById('entriesTable');
const refreshEntriesButton = document.getElementById('refreshEntries');

async function updateCount() {
  try {
    const response = await fetch('/api/registrations/count');
    const data = await response.json();
    if (data.success) {
      countBox.textContent = data.count;
    }
  } catch (error) {
    console.error(error);
  }
}

async function loadEntries() {
  try {
    const response = await fetch('/api/registrations');
    const data = await response.json();

    if (!data.success) {
      entriesTable.innerHTML = '<p class="empty-state">Unable to load registrations right now.</p>';
      return;
    }

    if (!data.registrations || data.registrations.length === 0) {
      entriesTable.innerHTML = '<p class="empty-state">No registrations yet.</p>';
      return;
    }

    const rows = data.registrations
      .map((entry) => `
        <tr>
          <td>${entry.fullName}</td>
          <td>${entry.email}</td>
          <td>${entry.phone}</td>
          <td>${new Date(entry.registeredAt).toLocaleString()}</td>
        </tr>
      `)
      .join('');

    entriesTable.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Registered at</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  } catch (error) {
    entriesTable.innerHTML = '<p class="empty-state">Unable to load registrations right now.</p>';
  }
}

refreshEntriesButton.addEventListener('click', () => {
  loadEntries();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = {
    fullName: formData.get('fullName')?.toString().trim() || '',
    email: formData.get('email')?.toString().trim() || '',
    phone: formData.get('phone')?.toString().trim() || ''
  };

  messageBox.textContent = '';
  messageBox.className = 'form-message';

  try {
    const response = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (response.ok) {
      messageBox.textContent = data.message;
      messageBox.className = 'form-message success';
      form.reset();
      await updateCount();
      await loadEntries();
    } else {
      messageBox.textContent = data.message || 'Registration failed.';
      messageBox.className = 'form-message error';
    }
  } catch (error) {
    messageBox.textContent = 'Unable to submit right now.';
    messageBox.className = 'form-message error';
  }
});

updateCount();
loadEntries();
