// Browser database implementation.
//
// Uses sql.js (SQLite compiled to WebAssembly) for the same SQL API used by
// the native Capacitor SQLite adapter, and persists the SQLite file in
// IndexedDB so browser development keeps data across reloads.
//
// This file is browser-only. Android continues to use database.js.

import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { createDatabase } from './adapter.js';

const DB_NAME = 'fitfully';
const STORE_NAME = 'databases';
const KEY = 'main';

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('fitfully-browser-storage', 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadBytes() {
  const idb = await openStore();
  return new Promise((resolve, reject) => {
    const request = idb.transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(KEY);

    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function saveBytes(bytes) {
  const idb = await openStore();
  return new Promise((resolve, reject) => {
    const tx = idb.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(bytes, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function createSqlJsRaw(database) {
  let transactionDepth = 0;

  async function persistIfOutsideTransaction() {
    if (transactionDepth === 0) {
      await saveBytes(database.export());
    }
  }

  return {
    exec: async (sql) => {
      database.run(sql);
      await persistIfOutsideTransaction();
    },

    run: async (sql, params = []) => {
      database.run(sql, params);
      const changes = database.getRowsModified();
      const result = database.exec('SELECT last_insert_rowid() AS id');
      const lastId = result[0]?.values?.[0]?.[0] ?? null;
      await persistIfOutsideTransaction();
      return { changes, lastId };
    },

    all: async (sql, params = []) => {
      const statement = database.prepare(sql);
      try {
        statement.bind(params);
        const rows = [];
        while (statement.step()) {
          rows.push(statement.getAsObject());
        }
        return rows;
      } finally {
        statement.free();
      }
    },

    begin: async () => {
      database.run('BEGIN');
      transactionDepth += 1;
    },

    commit: async () => {
      database.run('COMMIT');
      transactionDepth = Math.max(0, transactionDepth - 1);
      await saveBytes(database.export());
    },

    rollback: async () => {
      database.run('ROLLBACK');
      transactionDepth = Math.max(0, transactionDepth - 1);
    },
  };
}

async function open() {
  const SQL = await initSqlJs({
    locateFile: () => wasmUrl,
  });

  const saved = await loadBytes();
  const sqlite = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();

  // Match the native database's foreign-key behaviour.
  sqlite.run('PRAGMA foreign_keys = ON;');

  return createDatabase(createSqlJsRaw(sqlite));
}

/** Opens the browser database once; later calls return the same instance. */
export function openBrowserDatabase() {
  if (!window.__fitFullyBrowserDbPromise) {
    window.__fitFullyBrowserDbPromise = open().catch((err) => {
      window.__fitFullyBrowserDbPromise = null;
      throw err;
    });
  }
  return window.__fitFullyBrowserDbPromise;
}
