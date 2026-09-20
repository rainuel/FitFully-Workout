// Database adapter.
//
// Wraps a "raw" driver (Capacitor SQLite on the device, node:sqlite in tests)
// with one consistent API and a single-file queue so async UI code can never
// interleave its queries inside somebody else's transaction.
//
// Raw driver contract (all async):
//   exec(sql)                 run one statement, no parameters
//   run(sql, params)       -> { changes, lastId }
//   all(sql, params)       -> array of row objects
//   begin() / commit() / rollback()
//
// Public API:
//   db.exec(sql)
//   db.run(sql, params)    -> { changes, lastId }
//   db.all(sql, params)    -> rows
//   db.get(sql, params)    -> first row or null
//   db.transaction(async (tx) => { ... })
//
// Inside a transaction callback use ONLY the `tx` object it receives (same
// methods as above, minus transaction). Calling `db.*` from inside the
// callback would wait for the transaction that is waiting for it: a deadlock.

function cleanParams(params = []) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });
}

function wrap(raw) {
  return {
    exec: (sql) => raw.exec(sql),
    run: (sql, params) => raw.run(sql, cleanParams(params)),
    all: (sql, params) => raw.all(sql, cleanParams(params)),
    get: async (sql, params) => {
      const rows = await raw.all(sql, cleanParams(params));
      return rows.length > 0 ? rows[0] : null;
    },
  };
}

export function createDatabase(raw) {
  const inner = wrap(raw);
  let queue = Promise.resolve();

  // Run fn after everything queued before it has settled.
  function enqueue(fn) {
    const result = queue.then(fn);
    queue = result.catch(() => {});
    return result;
  }

  return {
    exec: (sql) => enqueue(() => inner.exec(sql)),
    run: (sql, params) => enqueue(() => inner.run(sql, params)),
    all: (sql, params) => enqueue(() => inner.all(sql, params)),
    get: (sql, params) => enqueue(() => inner.get(sql, params)),
    transaction: (fn) =>
      enqueue(async () => {
        await raw.begin();
        try {
          const result = await fn(inner);
          await raw.commit();
          return result;
        } catch (err) {
          try {
            await raw.rollback();
          } catch {
            // rollback failure must not hide the original error
          }
          throw err;
        }
      }),
  };
}
