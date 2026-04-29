import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import type { TextSegment } from '../types.js';
import { SCHEMA } from './schema.js';

let SQL: SqlJsStatic | null = null;
let sqlInitPromise: Promise<SqlJsStatic> | null = null;

async function getSQL(): Promise<SqlJsStatic> {
	if (SQL) {
		return SQL;
	}
	if (!sqlInitPromise) {
		sqlInitPromise = initSqlJs();
	}
	SQL = await sqlInitPromise;
	return SQL;
}

export class SegmentStore {
	private db: Database;
	private dbPath: string;

	private constructor(db: Database, dbPath: string) {
		this.db = db;
		this.dbPath = dbPath;
		this.db.run(SCHEMA);
	}

	static async create(dbPath: string): Promise<SegmentStore> {
		const sql = await getSQL();
		let db: Database;

		if (dbPath === ':memory:') {
			db = new sql.Database();
		} else if (existsSync(dbPath)) {
			const buffer = readFileSync(dbPath);
			db = new sql.Database(new Uint8Array(buffer));
		} else {
			db = new sql.Database();
		}

		return new SegmentStore(db, dbPath);
	}

	save(): void {
		if (this.dbPath === ':memory:') {
			return;
		}
		const data = this.db.export();
		writeFileSync(this.dbPath, Buffer.from(data));
	}

	insertBatch(segments: TextSegment[]): void {
		this.db.run('BEGIN');
		try {
			const stmt = this.db.prepare(
				'INSERT OR REPLACE INTO segments (id, text, timestamp, speaker) VALUES (?, ?, ?, ?)',
			);
			for (const s of segments) {
				stmt.run([s.id, s.text, s.timestamp, s.speaker ?? null]);
			}
			stmt.free();
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
		const stmt = this.db.prepare(
			'SELECT MIN(timestamp) as min, MAX(timestamp) as max FROM segments',
		);
		if (!stmt.step()) {
			stmt.free();
			return null;
		}
		const row = stmt.getAsObject() as { min: number | null; max: number | null };
		stmt.free();
		if (row.min === null || row.max === null) {
			return null;
		}
		return { min: row.min, max: row.max };
	}

	dbSize(): number {
		if (this.dbPath === ':memory:') {
			return this.db.export().length;
		}
		try {
			return statSync(this.dbPath).size;
		} catch {
			return 0;
		}
	}

	close(): void {
		this.save();
		this.db.close();
	}
}
