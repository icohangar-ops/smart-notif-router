import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

export type Priority = 'low' | 'normal' | 'urgent' | 'critical';
export type NotificationStatus = 'pending' | 'routed' | 'delivered' | 'failed';
export type DeliveryStatus = 'sent' | 'delivered' | 'failed' | 'bounced';
export type ChannelType = 'email' | 'webhook' | 'sms';

export interface NotificationRow {
  id: string;
  title: string;
  message: string;
  source: string;
  priority: Priority;
  status: NotificationStatus;
  channels: string; // JSON array
  created_at: string;
  updated_at: string;
}

export interface DeliveryLogRow {
  id: number;
  notification_id: string;
  channel: ChannelType;
  recipient: string;
  status: DeliveryStatus;
  message_id: string | null;
  response: string; // JSON
  created_at: string;
}

export interface RoutingRuleRow {
  id: number;
  name: string;
  description: string | null;
  conditions: string; // JSON
  channel: ChannelType;
  priority_override: Priority | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface ChannelRow {
  id: number;
  type: ChannelType;
  name: string;
  config: string; // JSON
  is_active: number;
  created_at: string;
}

class DatabaseManager {
  private db: Database.Database;

  constructor(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initializeTables();
  }

  private initializeTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'api',
        priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'urgent', 'critical')),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'routed', 'delivered', 'failed')),
        channels TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS delivery_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        notification_id TEXT NOT NULL,
        channel TEXT NOT NULL CHECK(channel IN ('email', 'webhook', 'sms')),
        recipient TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'sent' CHECK(status IN ('sent', 'delivered', 'failed', 'bounced')),
        message_id TEXT,
        response TEXT DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS routing_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        conditions TEXT NOT NULL DEFAULT '{}',
        channel TEXT NOT NULL CHECK(channel IN ('email', 'webhook', 'sms')),
        priority_override TEXT CHECK(priority_override IN ('low', 'normal', 'urgent', 'critical')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('email', 'webhook', 'sms')),
        name TEXT NOT NULL,
        config TEXT NOT NULL DEFAULT '{}',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
      CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(priority);
      CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_notification ON delivery_logs(notification_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_channel ON delivery_logs(channel);
      CREATE INDEX IF NOT EXISTS idx_routing_rules_active ON routing_rules(is_active);
      CREATE INDEX IF NOT EXISTS idx_channels_type ON channels(type);
    `);
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}

let dbInstance: DatabaseManager | null = null;

export function initDatabase(): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager(config.db.path);
    console.log(`[DB] SQLite database initialized at ${config.db.path}`);
  }
  return dbInstance;
}

export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance.getDb();
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
