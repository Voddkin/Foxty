import { AuditLogEntry } from '../types.js';

export class Logger {
  private static instance: Logger;
  private logs: AuditLogEntry[] = [];
  private readonly maxLogs = 200;

  private constructor() {}

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public log(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): AuditLogEntry {
    const fullEntry: AuditLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      ...entry,
      details: this.sanitize(entry.details),
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const level = entry.success ? 'INFO' : 'WARN';
    const tag = `[FOxty:${entry.actionType}]`;
    console.log(`${new Date().toLocaleTimeString()} ${level} ${tag} ${entry.event} - Decision: ${entry.decision}`);

    return fullEntry;
  }

  public getRecentLogs(limit = 50): AuditLogEntry[] {
    return this.logs.slice(0, limit);
  }

  public clear(): void {
    this.logs = [];
  }

  private sanitize(str?: string): string | undefined {
    if (!str) return undefined;
    return str
      .replace(/DISCORD_TOKEN=[^\s]+/gi, 'DISCORD_TOKEN=[REDACTED]')
      .replace(/DEEPSEEK_API_KEY=[^\s]+/gi, 'DEEPSEEK_API_KEY=[REDACTED]')
      .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]');
  }
}

export const logger = Logger.getInstance();
