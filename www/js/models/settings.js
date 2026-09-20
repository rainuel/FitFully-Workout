// App settings: a simple key/value table. All values are stored as text.

export async function getSetting(db, key, fallback = null) {
  const row = await db.get('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : fallback;
}

export async function setSetting(db, key, value) {
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)],
  );
}

export async function getAllSettings(db) {
  const rows = await db.all('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** Counts one app start. Returns { launchCount, firstLaunchAt }. */
export async function recordLaunch(db) {
  return db.transaction(async (tx) => {
    const current = await tx.get(`SELECT value FROM settings WHERE key = 'launch_count'`);
    const launchCount = (current ? Number(current.value) : 0) + 1;
    await tx.run(
      `INSERT INTO settings (key, value) VALUES ('launch_count', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(launchCount)],
    );
    const first = await tx.get(`SELECT value FROM settings WHERE key = 'first_launch_at'`);
    return { launchCount, firstLaunchAt: first ? first.value : null };
  });
}
