export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeoutMs: number;
  halfOpenAttempts: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
  halfOpenSuccesses: number;
}

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitBreakerState;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? 3,
      recoveryTimeoutMs: config.recoveryTimeoutMs ?? 30000,
      halfOpenAttempts: config.halfOpenAttempts ?? 1,
    };
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      halfOpenSuccesses: 0,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state.state === 'open') {
      if (Date.now() - this.state.lastFailureTime >= this.config.recoveryTimeoutMs) {
        this.state.state = 'half-open';
        this.state.halfOpenSuccesses = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state.state === 'half-open') {
      this.state.halfOpenSuccesses++;
      if (this.state.halfOpenSuccesses >= this.config.halfOpenAttempts) {
        this.state.state = 'closed';
        this.state.failures = 0;
      }
    } else {
      this.state.failures = 0;
    }
  }

  private onFailure(): void {
    this.state.failures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.state === 'half-open') {
      this.state.state = 'open';
    } else if (this.state.failures >= this.config.failureThreshold) {
      this.state.state = 'open';
    }
  }

  getState(): CircuitBreakerState {
    return { ...this.state };
  }

  isAvailable(): boolean {
    return this.state.state !== 'open' || 
           Date.now() - this.state.lastFailureTime >= this.config.recoveryTimeoutMs;
  }

  reset(): void {
    this.state = {
      failures: 0,
      lastFailureTime: 0,
      state: 'closed',
      halfOpenSuccesses: 0,
    };
  }
}

export interface QueuedRequest<T> {
  id: string;
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

export interface RequestQueueConfig {
  maxConcurrent: number;
  maxQueueSize?: number;
}

export class RequestQueue {
  private readonly config: RequestQueueConfig;
  private running = 0;
  private queue: Array<() => void> = [];
  private readonly inFlightRequests = new Map<string, QueuedRequest<unknown>>();

  constructor(config: RequestQueueConfig) {
    this.config = {
      maxConcurrent: config.maxConcurrent ?? 3,
      maxQueueSize: config.maxQueueSize ?? 100,
    };
  }

  async add<T>(key: string, fn: () => Promise<T>): Promise<T> {
    if (this.inFlightRequests.has(key)) {
      const existing = this.inFlightRequests.get(key) as QueuedRequest<T>;
      return existing.promise;
    }

    return new Promise<T>((resolve, reject) => {
      const execute = async () => {
        const request: QueuedRequest<T> = {
          id: key,
          promise: null as unknown as Promise<T>,
          resolve,
          reject,
        };
        request.promise = (async () => {
          try {
            const result = await fn();
            this.inFlightRequests.delete(key);
            return result;
          } catch (error) {
            this.inFlightRequests.delete(key);
            throw error;
          }
        })();
        this.inFlightRequests.set(key, request as QueuedRequest<unknown>);

        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error as Error);
        } finally {
          this.running--;
          this.processQueue();
        }
      };

      if (this.running >= this.config.maxConcurrent) {
        if (this.queue.length >= (this.config.maxQueueSize ?? 100)) {
          reject(new Error('Queue is full'));
          return;
        }
        this.queue.push(execute);
      } else {
        this.running++;
        execute();
      }
    });
  }

  private processQueue(): void {
    while (this.running < this.config.maxConcurrent && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) {
        this.running++;
        next();
      }
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getRunningCount(): number {
    return this.running;
  }

  hasInFlight(key: string): boolean {
    return this.inFlightRequests.has(key);
  }

  clear(): void {
    this.queue = [];
    this.inFlightRequests.clear();
    this.running = 0;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: Error) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 10000,
    backoffMultiplier = 2,
    shouldRetry = () => true,
  } = options;

  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries || !shouldRetry(lastError)) {
        throw lastError;
      }

      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}