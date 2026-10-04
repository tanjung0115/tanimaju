// Optional portfolio setup AFTER validation, on its already isolated demo DB.
// Adds a pending account/unlinked profile and new unread events; never resets history.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
dotenv.config({ quiet: true });
const statePath = new URL('../../.validation/demo-state.json', import.meta.url);
const state = JSON.parse(await fs.readFile(statePath, 'utf8'));
assert.equal(process.env.MYSQL_DATABASE, state.database);
assert.match(state.database, /^tanimaju_demo_[a-z0-9_]+$/);
assert.equal(process.env.FINAL_DEMO_PREPARE, 'demo-only');
const pool = (await import('../dist/config/mysql-database.js')).default;
const { generateReminders, jakartaTimestamp } = await import('../dist/services/reminderScheduler.js');
try {
  const [admins] = await pool.execute("SELECT id FROM users WHERE email=? AND role='admin' AND status='approved' AND is_active=1", [state.accounts.admin]);
  assert.equal(admins.length, 1);
  const creator = admins[0].id;
  state.pendingEmail = 'agus@demo.tanimaju.test';
  const [existing] = await pool.execute('SELECT id,status FROM users WHERE email=?', [state.pendingEmail]);
  if (!existing.length) {
    const hash = await bcrypt.hash(state.password, 12);
    const [created] = await pool.execute("INSERT INTO users (username,email,password,role,status,is_active) VALUES (?,?,?,'petani','pending',1)", ['Agus Hermawan', state.pendingEmail, hash]);
    state.pendingUser = created.insertId;
  }
  else { assert.equal(existing[0].status, 'pending', 'Demo approval already used; prepare a new disposable dataset.'); state.pendingUser = existing[0].id; }
  const [profiles] = await pool.execute('SELECT id,user_id FROM petani WHERE nama=?', ['Agus Hermawan']);
  if (!profiles.length) {
    const [profile] = await pool.execute('INSERT INTO petani (nama,alamat,nomorKontak,user_id) VALUES (?,?,?,NULL)', ['Agus Hermawan', 'Desa Sukamaju (data demo)', '']);
    state.pendingProfile = profile.insertId;
  } else { assert.equal(profiles[0].user_id, null); state.pendingProfile = profiles[0].id; }
  const today = jakartaTimestamp(new Date()).slice(0, 10);
  if (state.preparedDate !== today) {
    for (const type of ['pemupukan', 'pengobatan']) await pool.execute('INSERT INTO activity_reminders (siklus_tanam_id,jenis_aktivitas,tanggal_rencana,nama_material,created_by) VALUES (?,?,?,?,?)', [state.aCycle, type, today, type === 'pemupukan' ? 'Kompos - persiapan demonstrasi' : 'Pestisida nabati - persiapan demonstrasi', creator]);
    await generateReminders(new Date(), { enabled: true, intervalMinutes: 30, hour: 0, catchupHours: 48, plantingDays: [0], harvestDays: [1], activityDays: [0] });
    state.preparedDate = today;
  }
  const [rows] = await pool.execute('SELECT COUNT(*) AS unread FROM notifications WHERE user_id=? AND read_at IS NULL AND cancelled_at IS NULL AND scheduled_at<=NOW()', [state.aUser]);
  assert.ok(Number(rows[0].unread) > 0);
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
  await fs.writeFile(new URL('../../docs/validation/demo-preparation.json', import.meta.url), JSON.stringify({ database: state.database, preparedAt: new Date().toISOString(), pendingAccount: state.pendingEmail, unlinkedProfile: 'Agus Hermawan', petaniUnread: Number(rows[0].unread), noReadHistoryReset: true }, null, 2) + '\n');
  console.log('Prepared: pending Agus account + unlinked profile + new unread reminders. Read history retained.');
} finally { await pool.end(); }
