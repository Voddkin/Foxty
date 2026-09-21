export interface CoreMetrics {
  messagesObserved: number;
  brainConsultations: number;
  brainSkipped: number;
  aiResponses: number;
  fallbackResponses: number;
  silences: number;
  toolExecutions: number;
  memoryWrites: number;
  memoryReads: number;
  tokensUsed: number;
}

export class FoxtyMetrics {
  private metrics: CoreMetrics = {
    messagesObserved: 0,
    brainConsultations: 0,
    brainSkipped: 0,
    aiResponses: 0,
    fallbackResponses: 0,
    silences: 0,
    toolExecutions: 0,
    memoryWrites: 0,
    memoryReads: 0,
    tokensUsed: 0,
  };

  public recordMessageObserved(): void {
    this.metrics.messagesObserved++;
  }

  public recordBrainConsultation(): void {
    this.metrics.brainConsultations++;
  }

  public recordBrainSkipped(): void {
    this.metrics.brainSkipped++;
  }

  public recordAiResponse(tokens: number): void {
    this.metrics.aiResponses++;
    if (tokens > 0) {
      this.metrics.tokensUsed += tokens;
    }
  }

  public recordFallbackResponse(): void {
    this.metrics.fallbackResponses++;
  }

  public recordSilence(): void {
    this.metrics.silences++;
  }

  public recordToolExecution(): void {
    this.metrics.toolExecutions++;
  }

  public recordMemoryWrite(): void {
    this.metrics.memoryWrites++;
  }

  public recordMemoryRead(count = 1): void {
    this.metrics.memoryReads += count;
  }

  public getMetrics(): Readonly<CoreMetrics> {
    return { ...this.metrics };
  }

  public getSnapshot(): Readonly<CoreMetrics> {
    return { ...this.metrics };
  }

  public reset(): void {
    this.metrics = {
      messagesObserved: 0,
      brainConsultations: 0,
      brainSkipped: 0,
      aiResponses: 0,
      fallbackResponses: 0,
      silences: 0,
      toolExecutions: 0,
      memoryWrites: 0,
      memoryReads: 0,
      tokensUsed: 0,
    };
  }
}

export const coreMetrics = new FoxtyMetrics();
