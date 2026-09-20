// Test-only driver: runs the app's real adapter on Node's built-in SQLite
// (node:sqlite, Node 22.13+) so migrations, seeds, and models can be tested
// without a phone. Same SQL engine family as Android's, same adapter code.

import { DatabaseSync } from 'node:sqlite';
import { createDatabase } from '../../www/js/db/adapter.js';

export function createTestDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');

  const raw = {
    exec: async (sql) => {
      sqlite.exec(sql);
    },
    run: async (sql, params = []) => {
      const res = sqlite.prepare(sql).run(...params);
      return { changes: Number(res.changes), lastId: Number(res.lastInsertRowid) };
    },
    all: async (sql, params = []) => sqlite.prepare(sql).all(...params).map((row) => ({ ...row })),
    begin: async () => sqlite.exec('BEGIN'),
    commit: async () => sqlite.exec('COMMIT'),
    rollback: async () => sqlite.exec('ROLLBACK'),
  };

  return createDatabase(raw);
}
