export interface ObservationCandidate {
  id: string;
  messageId: string;
  channelId: string;
  author: string;
  content: string;
  timestamp: number;
  relevance: number; // 0.0 to 1.0
  reason: string;
  expiresAt: number;
  processed: boolean;
  topic?: string;
  replyToMessageId?: string;
  metadata?: Record<string, any>;
}

export class ObservationQueue {
  private candidates: Map<string, ObservationCandidate> = new Map();
  private maxQueueSize: number;

  constructor(maxQueueSize = 100) {
    this.maxQueueSize = maxQueueSize;
  }

  /**
   * Adds an intervention candidate to the queue
   */
  public addCandidate(candidate: Omit<ObservationCandidate, 'id' | 'processed'> & { id?: string }): ObservationCandidate {
    this.purgeExpired();

    const id = candidate.id || `cand-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const fullCandidate: ObservationCandidate = {
      ...candidate,
      id,
      processed: false,
    };

    // If queue is full, evict the lowest relevance candidate
    if (this.candidates.size >= this.maxQueueSize) {
      let lowestId: string | null = null;
      let lowestRel = Infinity;
      for (const [cId, cand] of this.candidates.entries()) {
        if (!cand.processed && cand.relevance < lowestRel) {
          lowestRel = cand.relevance;
          lowestId = cId;
        }
      }
      if (lowestId) {
        this.candidates.delete(lowestId);
      }
    }

    this.candidates.set(id, fullCandidate);
    return fullCandidate;
  }

  /**
   * Returns all pending (unprocessed & non-expired) candidates sorted by relevance descending
   */
  public getPendingCandidates(channelId?: string): ObservationCandidate[] {
    this.purgeExpired();
    const now = Date.now();

    return Array.from(this.candidates.values())
      .filter((c) => !c.processed && c.expiresAt > now && (!channelId || c.channelId === channelId))
      .sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Returns candidate by ID
   */
  public getCandidate(id: string): ObservationCandidate | undefined {
    return this.candidates.get(id);
  }

  /**
   * Marks a candidate as processed by id or messageId
   */
  public markProcessed(idOrMessageId: string): void {
    for (const item of this.candidates.values()) {
      if (item.id === idOrMessageId || item.messageId === idOrMessageId) {
        item.processed = true;
      }
    }
  }

  /**
   * Purges expired or processed candidates older than 1 hour
   */
  public purgeExpired(): void {
    const now = Date.now();
    for (const [id, c] of this.candidates.entries()) {
      if (c.expiresAt <= now || (c.processed && now - c.timestamp > 3600000)) {
        this.candidates.delete(id);
      }
    }
  }

  /**
   * Gets total count of active pending candidates
   */
  public getPendingCount(): number {
    return this.getPendingCandidates().length;
  }

  /**
   * Clears all candidates from queue
   */
  public clear(): void {
    this.candidates.clear();
  }
}
