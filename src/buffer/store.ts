import initSqlJs, { type Database, type SqlJsStatic, type Statement } from 'sql.js';
import type { TextSegment } from '../types.js';
import { SCHEMA } from './schema.js';

let SQL: SqlJsStatic | null = null;
let sqlInitPromise: Promise<SqlJsStatic> | null = null;

async function getSQL(): Promise<SqlJsStatic> {
  if (SQL) return SQL;
  if (!sqlInitPromise) {
    sqlInitPromise = initSqlJs();
  }
  SQL = await sqlInitPromise;
  return SQL;
}

export class SegmentStore {
  private db: Database;
  private insertStmt: Statement;
  private queryStmt: Statement;
  private deleteStmt: Statement;
  private rangeStmt: Statement;

  private constructor(db: Database) {
    this.db = db;
    this.db.run(SCHEMA);

    this.insertStmt = this.db.prepare(
      'INSERT OR REPLACE INTO segments (id, text, timestamp, speaker) VALUES (?, ?, ?, ?)',
    );
    this.queryStmt = this.db.prepare(
      'SELECT id, text, timestamp, speaker FROM segments WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    );
    this.deleteStmt = this.db.prepare(
      'DELETE FROM segments WHERE timestamp < ?',
    );
    this.rangeStmt = this.db.prepare(
      'SELECT MIN(timestamp) as min, MAX(timestamp) as max FROM segments',
    );
  }

  static async create(dbPath: string): Promise<SegmentStore> {
    const sql = await getSQL();
    const db = new sql.Database();
    // sql.js is in-memory by default; dbPath is accepted for API compat but
    // file persistence would require manual export/import of the binary data.
    return new SegmentStore(db);
  }

  insertBatch(segments: TextSegment[]): void {
    this.db.run('BEGIN');
    try {
      for (const s of segments) {
        this.insertStmt.run([s.id, s.text, s.timestamp, s.speaker ?? null]);
      }
      this.db.run('COMMIT');
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    }
  }

  query(from: number, to: number): TextSegment[] {
    const stmt = this.db.prepare(
      'SELECT id, text, timestamp, speaker FROM segments WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC',
    );
    stmt.bind([from, to]);
    const results: TextSegment[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        id: row.id as string,
        text: row.text as string,
        timestamp: row.timestamp as number,
        speaker: (row.speaker as string) || undefined,
      });
    }
    stmt.free();
    return results;
  }

  deleteOlderThan(timestamp: number): number {
    this.deleteStmt.bind([timestamp]);
    // sql.js doesn't return changes count directly from run; we track via a count first
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM segments WHERE timestamp < ?',
    );
    countStmt.bind([timestamp]);
    countStmt.step();
    const { cnt } = countStmt.getAsObject() as { cnt: number };
    countStmt.free();
    this.db.run('DELETE FROM segments WHERE timestamp < ?', [timestamp]);
    return cnt;
  }

  getTimeRange(): { min: number; max: number } | null {
    this.rangeStmt.reset();
    if (!this.rangeStmt.step()) {
      this.rangeStmt.reset();
      return null;
    }
    const row = this.rangeStmt.getAsObject() as { min: number | null; max: number | null };
    this.rangeStmt.reset();
    if (row.min === null || row.max === null) return null;
    return { min: row.min, max: row.max };
  }

  dbSize(): number {
    // sql.js in-memory: return the binary export size as a proxy for db size
    const data = this.db.export();
    return data.length;
  }

  close(): void {
    this.insertStmt.free();
    this.queryStmt.free();
    this.deleteStmt.free();
    this.rangeStmt.free();
    this.db.close();
  }
}
