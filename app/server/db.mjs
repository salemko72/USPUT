// Adapter used only by the local runner and integration tests; application SQL is D1-compatible.
export function adaptSqlite(db) {
  function prepare(sql) {
    const make = (args = []) => ({
      bind(...params) {
        return make(params);
      },
      async first() {
        return db.prepare(sql).get(...args) ?? null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args) };
      },
      async run() {
        const r = db.prepare(sql).run(...args);
        return { success: true, meta: { changes: r.changes } };
      },
      _sql: sql,
      _args: args,
    });
    return make();
  }
  return {
    prepare,
    async batch(statements) {
      db.exec("BEGIN IMMEDIATE");
      try {
        const r = [];
        for (const s of statements) {
          const result = db.prepare(s._sql).run(...s._args);
          r.push({ success: true, meta: { changes: result.changes } });
        }
        db.exec("COMMIT");
        return r;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}
