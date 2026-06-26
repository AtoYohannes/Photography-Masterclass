const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createServer } = require('../server');

test('stores a new registration and rejects duplicates', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaa-reg-'));
  const dataFile = path.join(tempDir, 'registrations.sqlite');
  process.env.DATABASE_PATH = dataFile;

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    assert.equal(fs.existsSync(dataFile), true);

    const firstResponse = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Amanuel Sileshi', email: 'amanuel@example.com', phone: '+251911000111' })
    });

    assert.equal(firstResponse.status, 201);
    const firstBody = await firstResponse.json();
    assert.equal(firstBody.success, true);

    const duplicateResponse = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Another Person', email: 'amanuel@example.com', phone: '+251911000222' })
    });

    assert.equal(duplicateResponse.status, 409);
    const duplicateBody = await duplicateResponse.json();
    assert.match(duplicateBody.message, /already registered/i);

    const countResponse = await fetch(`http://127.0.0.1:${port}/api/registrations/count`);
    const countBody = await countResponse.json();
    assert.equal(countBody.count, 1);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    delete process.env.DATABASE_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('migrates legacy JSON registrations into the database on startup', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vaa-reg-legacy-'));
  const dataFile = path.join(tempDir, 'registrations.sqlite');
  const legacyDataFile = path.join(tempDir, 'registrations.json');
  process.env.DATABASE_PATH = dataFile;

  fs.writeFileSync(legacyDataFile, JSON.stringify([
    {
      id: 'legacy-1',
      fullName: 'Legacy Person',
      email: 'legacy@example.com',
      phone: '+251900000001',
      registeredAt: '2026-01-01T00:00:00.000Z'
    }
  ]), 'utf8');

  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();

  try {
    const countResponse = await fetch(`http://127.0.0.1:${port}/api/registrations/count`);
    const countBody = await countResponse.json();
    assert.equal(countBody.count, 1);

    const listResponse = await fetch(`http://127.0.0.1:${port}/api/registrations`);
    const listBody = await listResponse.json();
    assert.equal(listBody.registrations[0].email, 'legacy@example.com');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    delete process.env.DATABASE_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
