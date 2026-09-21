import { AuditLogEntry } from '../types.js';

export function sanitizeSensitiveData(str?: string): string {
  if (!str) return '';
  let sanitized = str
    .replace(/DISCORD_TOKEN=[^\s]+/gi, 'DISCORD_TOKEN=[REDACTED]')
    .replace(/DEEPSEEK_API_KEY=[^\s]+/gi, 'DEEPSEEK_API_KEY=[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/Bot\s+[A-Za-z0-9_\-\.]+/gi, 'Bot [REDACTED_DISCORD_TOKEN]')
    .replace(/sk-[A-Za-z0-9]{10,}/gi, 'sk-[REDACTED]')
    .replace(/[A-Za-z0-9_\-]{20,38}\.[A-Za-z0-9_\-]{4,10}\.[A-Za-z0-9_\-]{10,45}/g, '[REDACTED_DISCORD_TOKEN]')
    .replace(/carta:[^\n,]+/gi, 'carta:[CONTEUDO_PRIVADO_REDACTED]')
    .replace(/letter_content:[^\n,]+/gi, 'letter_content:[CONTEUDO_PRIVADO_REDACTED]');

  const envToken = process.env.DISCORD_TOKEN;
  if (envToken && envToken.length > 8) {
    sanitized = sanitized.split(envToken).join('[REDACTED_DISCORD_TOKEN]');
  }

  const envDeepseek = process.env.DEEPSEEK_API_KEY;
  if (envDeepseek && envDeepseek.length > 8) {
    sanitized = sanitized.split(envDeepseek).join('[REDACTED_DEEPSEEK_KEY]');
  }

  return sanitized;
}

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
      event: this.sanitize(entry.event) || entry.event,
      details: this.sanitize(entry.details),
      error: this.sanitize(entry.error),
    };

    this.logs.unshift(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const isControlledPersonaDecision =
      fullEntry.decision === 'SILENCE' ||
      fullEntry.decision === 'FALLBACK' ||
      fullEntry.decision === 'PERFECT_MATCH' ||
      fullEntry.decision === 'COMPLIANT_WITH_WARNINGS' ||
      fullEntry.decision === 'STANDALONE' ||
      fullEntry.decision === 'CONTROLLED_ERROR' ||
      fullEntry.decision === 'CIRCUIT_BREAKER' ||
      fullEntry.decision === 'DENIED' ||
      fullEntry.decision === 'OBSERVED';
    const level = entry.success || isControlledPersonaDecision ? 'INFO' : 'WARN';
    const tag = `[FOxty:${entry.actionType}]`;
    console.log(`${new Date().toLocaleTimeString()} ${level} ${tag} ${fullEntry.event} - Decision: ${fullEntry.decision}`);

    return fullEntry;
  }

  public info(actionType: string, event: string, details?: string): AuditLogEntry {
    return this.log({
      actionType,
      event,
      decision: 'INFO',
      success: true,
      aiUsed: false,
      durationMs: 0,
      details,
    });
  }

  public warn(actionType: string, event: string, details?: string): AuditLogEntry {
    return this.log({
      actionType,
      event,
      decision: 'WARN',
      success: false,
      aiUsed: false,
      durationMs: 0,
      details,
    });
  }

  public error(actionType: string, event: string, error?: string): AuditLogEntry {
    return this.log({
      actionType,
      event,
      decision: 'CONTROLLED_ERROR',
      success: false,
      aiUsed: false,
      durationMs: 0,
      error,
    });
  }

  public getRecentLogs(limit = 50): AuditLogEntry[] {
    return this.logs.slice(0, limit);
  }

  public clear(): void {
    this.logs = [];
  }

  private sanitize(str?: string): string | undefined {
    if (!str) return undefined;
    return sanitizeSensitiveData(str);
  }
}

export const logger = Logger.getInstance();

