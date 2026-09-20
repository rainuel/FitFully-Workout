// Opens the on-device SQLite database through the Capacitor SQLite plugin.
// This file is the ONLY place that imports the plugin.

import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { createDatabase } from './adapter.js';

export const DB_NAME = 'fitfully';

let dbPromise = null;

function createCapacitorRaw(conn) {
  // We manage transactions ourselves (begin/commit/rollback) and always pass
  // transaction = false to the plugin. With true, the plugin starts its own
  // transaction and fails with "Already in transaction" when one is open.
  return {
    exec: (sql) => conn.execute(sql, false),
    run: async (sql, params) => {
      const res = await conn.run(sql, params, false, 'no');
      return { changes: res.changes?.changes ?? 0, lastId: res.changes?.lastId ?? null };
    },
    all: async (sql, params) => {
      const res = await conn.query(sql, params);
      return res.values ?? [];
    },
    begin: () => conn.beginTransaction(),
    commit: () => conn.commitTransaction(),
    rollback: () => conn.rollbackTransaction(),
  };
}

async function open() {
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // Reuse the connection if the WebView reloaded while native kept it open.
  const consistent = (await sqlite.checkConnectionsConsistency()).result;
  const exists = (await sqlite.isConnection(DB_NAME, false)).result;

  const conn =
    consistent && exists
      ? await sqlite.retrieveConnection(DB_NAME, false)
      : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

  await conn.open();

  // The plugin does not enable foreign keys by itself. Turn them on for this
  // connection so ON DELETE CASCADE / SET NULL actually happen. The Profile
  // screen reads this back so you can confirm it took effect.
  await conn.execute('PRAGMA foreign_keys = ON;', false);

  return createDatabase(createCapacitorRaw(conn));
}

/** Opens the database once; later calls return the same instance. */
export function openDatabase() {
  if (!dbPromise) {
    dbPromise = open().catch((err) => {
      dbPromise = null; // allow retry after a failure
      throw err;
    });
  }
  return dbPromise;
}
