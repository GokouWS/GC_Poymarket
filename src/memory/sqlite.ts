import Database from 'better-sqlite3';
import path from 'path';

// ── Database Initialization ──────────────────────────────────────────

const dbPath = path.join(process.cwd(), 'gravity-claw.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

// ── Schemas ──────────────────────────────────────────────────────────

db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        telegram_chat_id INTEGER UNIQUE NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        summary TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS core_facts (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        fact TEXT NOT NULL,
        source_message_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tracked_wallets (
        address TEXT PRIMARY KEY,
        first_detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_pnl_usd REAL DEFAULT 0,
        insider_confidence_score INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        notes TEXT
    );

    CREATE INDEX IF NOT EXISTS msg_conv_idx ON messages(conversation_id);
`);


// ── Types ────────────────────────────────────────────────────────────

export interface Conversation {
    id: string;
    telegram_chat_id: number;
    started_at: string;
    summary: string | null;
}

export interface MessageRow {
    id: string;
    conversation_id: string;
    role: "user" | "assistant" | "system";
    content: string;
    created_at: string;
}

export interface CoreFact {
    id: string;
    category: string;
    fact: string;
    source_message_id?: string;
    created_at: string;
    updated_at: string;
}
export interface TrackedWallet {
    address: string;
    first_detected_at: string;
    last_active_at: string;
    total_pnl_usd: number;
    insider_confidence_score: number;
    tags: string; // JSON string
    notes: string | null;
}

// ── API: Conversations ───────────────────────────────────────────────

export function getOrCreateConversation(chatId: number): Conversation {
    const existing = db.prepare('SELECT * FROM conversations WHERE telegram_chat_id = ?').get(chatId) as Conversation | undefined;
    
    if (existing) {
        return existing;
    }

    const newId = crypto.randomUUID();
    db.prepare('INSERT INTO conversations (id, telegram_chat_id) VALUES (?, ?)').run(newId, chatId);
    
    return db.prepare('SELECT * FROM conversations WHERE id = ?').get(newId) as Conversation;
}

export function updateConversationSummary(conversationId: string, summary: string) {
    db.prepare('UPDATE conversations SET summary = ? WHERE id = ?').run(summary, conversationId);
}

// ── API: Messages ────────────────────────────────────────────────────

export function saveMessage(conversationId: string, role: string, content: string): MessageRow {
    const newId = crypto.randomUUID();
    db.prepare('INSERT INTO messages (id, conversation_id, role, content) VALUES (?, ?, ?, ?)').run(newId, conversationId, role, content);
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(newId) as MessageRow;
}

export function getRecentMessages(conversationId: string, limit: number = 20): MessageRow[] {
    const rows = db.prepare(`
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY created_at DESC 
        LIMIT ?
    `).all(conversationId, limit) as MessageRow[];
    
    return rows.reverse();
}

export function getAllMessages(conversationId: string): MessageRow[] {
    return db.prepare(`
        SELECT * FROM messages 
        WHERE conversation_id = ? 
        ORDER BY created_at ASC
    `).all(conversationId) as MessageRow[];
}

export function countMessages(conversationId: string): number {
    const result = db.prepare('SELECT COUNT(*) as count FROM messages WHERE conversation_id = ?').get(conversationId) as { count: number };
    return result.count;
}

export function pruneMessagesExceptNewest(conversationId: string, keepCount: number = 0) {
    if (keepCount === 0) {
        db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
    } else {
        db.prepare(`
            DELETE FROM messages 
            WHERE conversation_id = ? 
            AND id NOT IN (
                SELECT id FROM messages 
                WHERE conversation_id = ? 
                ORDER BY created_at DESC 
                LIMIT ?
            )
        `).run(conversationId, conversationId, keepCount);
    }
}

// ── API: Core Facts ──────────────────────────────────────────────────

export function getAllFacts(): CoreFact[] {
    return db.prepare('SELECT * FROM core_facts ORDER BY updated_at DESC').all() as CoreFact[];
}

export function upsertFact(category: string, fact: string, sourceMessageId?: string): CoreFact {
    const newId = crypto.randomUUID();
    db.prepare(`
        INSERT INTO core_facts (id, category, fact, source_message_id) 
        VALUES (?, ?, ?, ?)
    `).run(newId, category, fact, sourceMessageId ?? null);
    
    return db.prepare('SELECT * FROM core_facts WHERE id = ?').get(newId) as CoreFact;
}

export function deleteFact(id: string) {
    db.prepare('DELETE FROM core_facts WHERE id = ?').run(id);
}
// ── API: Tracked Wallets ─────────────────────────────────────────────

export function getTrackedWallet(address: string): TrackedWallet | undefined {
    return db.prepare('SELECT * FROM tracked_wallets WHERE address = ?').get(address.toLowerCase()) as TrackedWallet | undefined;
}

export function upsertTrackedWallet(address: string, stats: Partial<TrackedWallet>): TrackedWallet {
    const existing = getTrackedWallet(address);
    const addr = address.toLowerCase();

    if (existing) {
        const updateFields: string[] = [];
        const values: any[] = [];

        if (stats.total_pnl_usd !== undefined) {
            updateFields.push('total_pnl_usd = ?');
            values.push(stats.total_pnl_usd);
        }
        if (stats.insider_confidence_score !== undefined) {
            updateFields.push('insider_confidence_score = ?');
            values.push(stats.insider_confidence_score);
        }
        if (stats.tags !== undefined) {
            updateFields.push('tags = ?');
            values.push(stats.tags);
        }
        if (stats.notes !== undefined) {
            updateFields.push('notes = ?');
            values.push(stats.notes);
        }

        updateFields.push('last_active_at = CURRENT_TIMESTAMP');

        if (updateFields.length > 0) {
            db.prepare(`UPDATE tracked_wallets SET ${updateFields.join(', ')} WHERE address = ?`).run(...values, addr);
        }
    } else {
        db.prepare(`
            INSERT INTO tracked_wallets (address, total_pnl_usd, insider_confidence_score, tags, notes)
            VALUES (?, ?, ?, ?, ?)
        `).run(
            addr,
            stats.total_pnl_usd ?? 0,
            stats.insider_confidence_score ?? 0,
            stats.tags ?? '[]',
            stats.notes ?? null
        );
    }

    return getTrackedWallet(addr)!;
}

export function incrementInsiderScore(address: string, amount: number = 1) {
    db.prepare(`
        UPDATE tracked_wallets 
        SET insider_confidence_score = insider_confidence_score + ?, 
            last_active_at = CURRENT_TIMESTAMP 
        WHERE address = ?
    `).run(amount, address.toLowerCase());
}
