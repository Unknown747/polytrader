import { existsSync, readFileSync, writeFileSync } from "node:fs";

// ─── Types matching sql.js internals ─────────────────────────────────────────

interface SqlJsStmt {
  bind(params: unknown): boolean;
  step(): boolean;
  getAsObject(params?: unknown): Record<string, unknown>;
  reset(): void;
  free(): void;
}

interface SqlJsQueryResult {
  columns: string[];
  values: unknown[][];
}

interface SqlJsDb {
  run(sql: string, params?: unknown): void;
  exec(sql: string): SqlJsQueryResult[];
  prepare(sql: string): SqlJsStmt;
  export(): Uint8Array;
  getRowsModified(): number;
  close(): void;
}

export interface SqlJsNamespace {
  Database: new (data?: Buffer | Uint8Array) => SqlJsDb;
}

// ─── Param normalisation ──────────────────────────────────────────────────────
// better-sqlite3 accepts named params as plain objects: { id: "x", name: "y" }
// and SQL uses @id, @name.
// sql.js requires the object keys to carry the prefix: { "@id": "x", "@name": "y" }.

function toSqlJsParams(args: unknown[]): unknown {
  if (args.length === 0) return [];

  if (
    args.length === 1 &&
    typeof args[0] === "object" &&
    !Array.isArray(args[0]) &&
    args[0] !== null
  ) {
    const obj = args[0] as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      const prefixed =
        k.startsWith("@") || k.startsWith("$") || k.startsWith(":")
          ? k
          : `@${k}`;
      result[prefixed] = v ?? null;
    }
    return result;
  }

  return args.map((v) => (v === undefined ? null : v));
}

// ─── Statement wrapper ────────────────────────────────────────────────────────

class SqlJsStatement {
  private readonly sql: string;
  private readonly db: SqlJsAdapter;

  constructor(sql: string, db: SqlJsAdapter) {
    this.sql = sql;
    this.db = db;
  }

  run(...args: unknown[]): { lastInsertRowid: number; changes: number } {
    const params = toSqlJsParams(args);
    this.db.rawRun(this.sql, params);
    const changes = this.db.rawDb.getRowsModified();
    if (!this.db.inTransaction) this.db.save();
    const res = this.db.rawDb.exec("SELECT last_insert_rowid()");
    const lastInsertRowid =
      res[0]?.values[0]?.[0] != null ? Number(res[0].values[0][0]) : 0;
    return { lastInsertRowid, changes };
  }

  get(...args: unknown[]): Record<string, unknown> | undefined {
    const params = toSqlJsParams(args);
    const stmt = this.db.rawDb.prepare(this.sql);
    try {
      stmt.bind(params);
      if (!stmt.step()) return undefined;
      return stmt.getAsObject();
    } finally {
      stmt.free();
    }
  }

  all(...args: unknown[]): Record<string, unknown>[] {
    const params = toSqlJsParams(args);
    const stmt = this.db.rawDb.prepare(this.sql);
    const results: Record<string, unknown>[] = [];
    try {
      stmt.bind(params);
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
    } finally {
      stmt.free();
    }
    return results;
  }
}

// ─── Database adapter ─────────────────────────────────────────────────────────

export class SqlJsAdapter {
  readonly rawDb: SqlJsDb;
  private readonly dbPath: string;
  inTransaction = false;

  constructor(dbPath: string, SQL: SqlJsNamespace) {
    this.dbPath = dbPath;
    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      this.rawDb = new SQL.Database(buffer);
    } else {
      this.rawDb = new SQL.Database();
    }
  }

  save(): void {
    const data = this.rawDb.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  rawRun(sql: string, params: unknown): void {
    this.rawDb.run(sql, params);
  }

  prepare(sql: string): SqlJsStatement {
    return new SqlJsStatement(sql, this);
  }

  exec(sql: string): void {
    // Split on semicolons to handle multi-statement DDL blocks
    const stmts = sql
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of stmts) {
      this.rawDb.run(stmt);
    }
    if (!this.inTransaction) this.save();
  }

  pragma(nameExpr: string): unknown {
    const trimmed = nameExpr.trim();
    try {
      const result = this.rawDb.exec(`PRAGMA ${trimmed}`);
      if (!result[0]) return [];
      return result[0].values.map((row) => {
        const obj: Record<string, unknown> = {};
        result[0].columns.forEach((col, i) => {
          obj[col] = row[i];
        });
        return obj;
      });
    } catch {
      return [];
    }
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      this.rawDb.run("BEGIN");
      this.inTransaction = true;
      try {
        const result = fn();
        this.rawDb.run("COMMIT");
        this.inTransaction = false;
        this.save();
        return result;
      } catch (err) {
        this.rawDb.run("ROLLBACK");
        this.inTransaction = false;
        throw err;
      }
    };
  }

  close(): void {
    this.save();
    this.rawDb.close();
  }
}
