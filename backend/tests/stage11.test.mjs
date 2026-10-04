import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../dist/config/mysql-database.js';
import authRoutes from '../dist/routes/mysql/authRoutes.js';
import { authenticateToken, requireAdmin, requireRole } from '../dist/middleware/auth.js';
import { generateToken } from '../dist/utils/jwt.js';
import { createImageUpload, isAllowedImage, uploadErrorHandler } from '../dist/middleware/imageUpload.js';
import { prepareMigrationSql } from '../dist/database/migrationCompatibility.js';
import ts from 'typescript';
const source = await fs.readFile(new URL('../../src/lib/api.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
const { apiFetch, ApiError, errorMessage } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);

async function listen(app) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}
const stop = server => new Promise(resolve => server.close(resolve));

test('real HTTP auth: cookie/header, expired token, stored role, approval, register and logout', async () => {
  const original = pool.execute;
  const password = await bcrypt.hash('test-password-only', 4);
  const users = ['admin', 'petani', 'penyuluh', 'user', 'petani', 'petani', 'petani'].map((role, index) => ({
    id: index + 1, username: `Fixture ${index + 1}`, email: `fixture${index + 1}@example.test`, password, role,
    status: index === 4 ? 'pending' : index === 5 ? 'rejected' : 'approved', is_active: index !== 6,
  }));
  const writes = [];
  pool.execute = async (sql, values = []) => {
    sql = sql.trim();
    if (sql.startsWith('SELECT') && sql.includes('FROM users')) {
      let matches = users.filter(user => sql.includes('WHERE email = ?') ? user.email === values[0] : user.id === values[0]);
      if (sql.includes('is_active = true')) {
        assert.ok(sql.includes('status = "approved"'), 'auth excludes pending/rejected at repository boundary');
        matches = matches.filter(user => user.is_active && user.status === 'approved');
      }
      return [matches, []];
    }
    if (sql.startsWith('UPDATE users') || sql.includes('INSERT INTO users')) {
      writes.push({ sql, values }); return [{ affectedRows: 1, insertId: 60 }, []];
    }
    throw new Error('Unexpected fixture query');
  };
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use('/auth', authRoutes);
  app.get('/protected', authenticateToken, (req, res) => res.json(req.user));
  app.get('/admin', authenticateToken, requireAdmin, (_req, res) => res.json({ allowed: true }));
  app.get('/field', authenticateToken, requireRole(['admin', 'petani', 'penyuluh']), (_req, res) => res.json({ allowed: true }));
  const { server, base } = await listen(app);
  const token = (id, role = users[id - 1].role) => generateToken({ userId: id, email: users[id - 1].email, role });
  const request = (route, options = {}) => fetch(base + route, options);
  const post = (route, body, id) => request(route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(id ? { authorization: `Bearer ${token(id)}` } : {}) }, body: JSON.stringify(body) });
  try {
    assert.equal((await request('/protected')).status, 401);
    assert.equal((await request('/protected', { headers: { authorization: 'Bearer broken' } })).status, 401);
    const expired = jwt.sign({ userId: 1, exp: 1 }, process.env.JWT_SECRET || 'your-fallback-secret-key', { issuer: 'tanimaju-backend', audience: 'tanimaju-frontend' });
    assert.equal((await request('/protected', { headers: { authorization: `Bearer ${expired}` } })).status, 401);
    for (const id of [5, 6, 7, 99]) {
      const auth = generateToken({ userId: id, email: 'fixture@example.test', role: 'admin' });
      assert.equal((await request('/protected', { headers: { authorization: `Bearer ${auth}` } })).status, 401);
    }
    // Claiming admin in a signed token cannot override the current role in MySQL.
    assert.equal((await request('/admin', { headers: { authorization: `Bearer ${token(2, 'admin')}` } })).status, 403);
    for (const id of [1, 2, 3]) assert.equal((await request('/field', { headers: { cookie: `authToken=${token(id)}` } })).status, 200);
    assert.equal((await request('/field', { headers: { authorization: `Bearer ${token(4)}` } })).status, 403);
    assert.equal((await post('/auth/login', { email: [], password: 'x' })).status, 400);
    for (const id of [5, 6, 7]) assert.equal((await post('/auth/login', { email: users[id - 1].email, password: 'test-password-only' })).status, 401);
    assert.equal((await post('/auth/login', { email: users[1].email, password: 'wrong' })).status, 401);
    const login = await post('/auth/login', { email: users[1].email, password: 'test-password-only' });
    assert.equal(login.status, 200); assert.match(login.headers.get('set-cookie'), /HttpOnly/i); assert.match(login.headers.get('set-cookie'), /SameSite=Lax/i);
    assert.equal((await login.json()).user.role, 'petani');
    assert.equal((await post('/auth/register', { nama: 'Fixture', email: users[4].email, password: 'test-password-only' })).status, 400, 'duplicate pending email is validation, not SQL failure');
    assert.equal((await post('/auth/register', { nama: [], email: 'invalid', password: {} })).status, 400);
    assert.equal((await post('/auth/register', { nama: 'New Fixture', email: 'new@example.test', password: 'test-password-only', role: 'admin' })).status, 201);
    const registration = writes.find(write => write.sql.includes('INSERT INTO users'));
    assert.equal(registration.values[3], 'petani'); assert.equal(registration.values[4], 'pending');
    assert.ok(await bcrypt.compare('test-password-only', registration.values[2]));
    const logout = await post('/auth/logout', {}, 2);
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/i);
    assert.ok(writes.some(write => write.sql.includes('session_key = NULL') && write.values[0] === 2));
  } finally { await stop(server); pool.execute = original; }
});

test('UI API client: cookies, permission/validation/network errors, hidden internals and abort', async () => {
  const original = globalThis.fetch;
  try {
    let options;
    globalThis.fetch = async (_url, init) => { options = init; return new Response('{}'); };
    await apiFetch('/api/test'); assert.equal(options.credentials, 'include');
    for (const [status, expected] of [[401, /masuk/], [403, /izin/], [500, /Server/], [413, /besar/]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error: 'SQL stack secret' }), { status });
      await assert.rejects(apiFetch('/api/test'), error => error instanceof ApiError && expected.test(errorMessage(error)) && !error.message.includes('secret'));
    }
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Tanggal akhir harus setelah tanggal awal.' }), { status: 400 });
    await assert.rejects(apiFetch('/api/test'), /Tanggal akhir/);
    globalThis.fetch = async () => new Response('<html>internal stack</html>', { status: 400 });
    await assert.rejects(apiFetch('/api/test'), /Periksa data/);
    globalThis.fetch = async () => { throw new TypeError('private network internals'); };
    await assert.rejects(apiFetch('/api/test'), /Periksa koneksi/);
    globalThis.fetch = async () => { throw new DOMException('aborted', 'AbortError'); };
    await assert.rejects(apiFetch('/api/test'), error => error.name === 'AbortError');
    assert.equal(errorMessage(new Error('internal stack'), 'Gagal memuat'), 'Gagal memuat');
  } finally { globalThis.fetch = original; }
});

test('upload HTTP: extension/MIME allowlist, size, safe filenames and JSON errors', async () => {
  assert.equal(isAllowedImage('image/svg+xml', 'script.svg'), false);
  assert.equal(isAllowedImage('image/png', 'payload.html'), false);
  assert.equal(isAllowedImage('image/jpeg', 'photo.JPG'), true);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tanimaju-upload-test-'));
  const originalSize = process.env.MAX_FILE_SIZE; process.env.MAX_FILE_SIZE = '64';
  const app = express();
  app.post('/upload', createImageUpload('products', root).single('image'), (req, res) => res.json({ filename: req.file.filename }));
  app.use(uploadErrorHandler);
  const { server, base } = await listen(app);
  const upload = (name, type, contents = 'fixture') => {
    const form = new FormData(); form.append('image', new Blob([contents], { type }), name);
    return fetch(base + '/upload', { method: 'POST', body: form });
  };
  try {
    const accepted = await upload('../../secret.PNG', 'image/png'); assert.equal(accepted.status, 200);
    assert.match((await accepted.json()).filename, /^products-[a-f0-9-]+\.png$/);
    for (const [name, type] of [['x.svg', 'image/svg+xml'], ['x.exe', 'image/png'], ['x.jpg', 'image/png']]) {
      const rejected = await upload(name, type); assert.equal(rejected.status, 400); assert.ok((await rejected.json()).error);
    }
    const tooLarge = await upload('large.png', 'image/png', 'a'.repeat(65)); assert.equal(tooLarge.status, 413);
    assert.match((await tooLarge.json()).error, /Ukuran/);
  } finally {
    await stop(server);
    if (originalSize === undefined) delete process.env.MAX_FILE_SIZE; else process.env.MAX_FILE_SIZE = originalSize;
    // Remove only known fixture files, without a recursive delete.
    for (const name of await fs.readdir(path.join(root, 'products'))) await fs.unlink(path.join(root, 'products', name));
    await fs.rmdir(path.join(root, 'products')); await fs.rmdir(root);
  }
});

test('migrations 001–013: dependency order, additive SQL and portable column guards', async () => {
  const directory = new URL('../src/database/migrations/', import.meta.url);
  const names = (await fs.readdir(directory)).filter(name => /^\d+_.*\.sql$/.test(name)).sort();
  assert.deepEqual(names.map(name => Number(name.slice(0, 3))), Array.from({ length: 13 }, (_, index) => index + 1));
  const tables = new Set(); const columns = new Set();
  for (const name of names) {
    const raw = await fs.readFile(new URL(name, directory), 'utf8');
    const sql = raw.replace(/^\s*--.*$/gm, '');
    assert.doesNotMatch(sql, /\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE)|TRUNCATE|DELETE\s+FROM)\b/i);
    for (const statement of sql.split(';')) {
      for (const match of statement.matchAll(/REFERENCES\s+(\w+)\(/g)) assert.ok(tables.has(match[1]), `${name}: ${match[1]} must exist first`);
      const created = statement.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (created) {
        tables.add(created[1]);
        for (const match of statement.matchAll(/^\s+(\w+)\s+(?:INT|BIGINT|VARCHAR|ENUM|DATETIME|TIMESTAMP|DATE|DECIMAL|TEXT|FLOAT|BOOLEAN)\b/gm)) columns.add(`${created[1]}.${match[1]}`);
      }
    }
    const prepared = await prepareMigrationSql(raw, async (table, column) => columns.has(`${table}.${column}`));
    assert.ok(!prepared.includes('ADD COLUMN IF NOT EXISTS'));
  }
  const compatibility = "ALTER TABLE users ADD COLUMN IF NOT EXISTS status ENUM('pending', 'approved'), ADD COLUMN IF NOT EXISTS session_key VARCHAR(255);";
  assert.equal((await prepareMigrationSql(compatibility, async () => true)).trim(), '');
  const fresh = await prepareMigrationSql(compatibility, async () => false);
  assert.match(fresh, /ADD COLUMN status ENUM\('pending', 'approved'\)/);
  assert.match(fresh, /ADD COLUMN session_key/);
  const linked = await prepareMigrationSql('ALTER TABLE petani ADD COLUMN IF NOT EXISTS user_id INT NULL, ADD UNIQUE KEY unique_petani_user (user_id);', async () => true);
  assert.match(linked, /ADD UNIQUE KEY/); assert.doesNotMatch(linked, /ADD COLUMN/);
});

test('production refuses fallback JWT credentials', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./dist/utils/jwt.js')"], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, NODE_ENV: 'production', JWT_SECRET: '' }, encoding: 'utf8',
  });
  assert.notEqual(result.status, 0); assert.match(result.stderr, /Production requires a unique JWT_SECRET/);
});

test('dashboard dates use WIB consistently at midnight, year change and leap month', async () => {
  const periodSource = await fs.readFile(new URL('../../src/lib/dashboardPeriod.ts', import.meta.url), 'utf8');
  const periodCompiled = ts.transpileModule(periodSource, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText;
  const { getDashboardRange } = await import(`data:text/javascript;base64,${Buffer.from(periodCompiled).toString('base64')}`);
  assert.deepEqual(getDashboardRange('month', '', '', new Date('2026-09-30T17:00:00Z')), { start: '2026-10-01', end: '2026-10-01' });
  assert.deepEqual(getDashboardRange('year', '', '', new Date('2026-12-31T17:00:00Z')), { start: '2027-01-01', end: '2027-01-01' });
  assert.deepEqual(getDashboardRange('30days', '', '', new Date('2024-02-29T17:00:00Z')), { start: '2024-02-01', end: '2024-03-01' });
  assert.deepEqual(getDashboardRange('custom', '2026-01-01', '2026-02-01'), { start: '2026-01-01', end: '2026-02-01' });
});
