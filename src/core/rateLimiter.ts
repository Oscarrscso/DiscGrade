export interface ScheduledRequestTiming {
  queueWaitMs: number;
  networkMs: number;
  totalMs: number;
}

type ScheduledJob<T> = {
  host: string;
  enqueuedAt: number;
  run: () => Promise<T>;
  resolve: (value: { value: T; timing: ScheduledRequestTiming }) => void;
  reject: (reason: unknown) => void;
};

export class RequestScheduler {
  #lastStartedByHost = new Map<string, number>();
  #activeByHost = new Map<string, number>();
  #queue: ScheduledJob<unknown>[] = [];
  #activeGlobal = 0;
  #drainTimer: NodeJS.Timeout | null = null;
  readonly minIntervalMs: number;
  readonly hostConcurrency: number;
  readonly globalConcurrency: number;

  constructor(minIntervalMs: number, hostConcurrency: number, globalConcurrency: number) {
    this.minIntervalMs = minIntervalMs;
    this.hostConcurrency = hostConcurrency;
    this.globalConcurrency = globalConcurrency;
  }

  async schedule<T>(url: string, run: () => Promise<T>): Promise<{ value: T; timing: ScheduledRequestTiming }> {
    const host = new URL(url).host;
    return await new Promise((resolve, reject) => {
      this.#queue.push({
        host,
        enqueuedAt: Date.now(),
        run,
        resolve: resolve as ScheduledJob<unknown>["resolve"],
        reject
      });
      this.#drain();
    });
  }

  #drain(): void {
    if (this.#drainTimer) {
      clearTimeout(this.#drainTimer);
      this.#drainTimer = null;
    }

    while (this.#activeGlobal < this.globalConcurrency) {
      const { index, waitMs } = this.#findNextEligibleIndex();
      if (index === -1) {
        if (typeof waitMs === "number" && Number.isFinite(waitMs) && waitMs > 0) {
          this.#drainTimer = setTimeout(() => {
            this.#drainTimer = null;
            this.#drain();
          }, waitMs);
        }
        return;
      }

      const job = this.#queue.splice(index, 1)[0];
      if (!job) continue;
      this.#startJob(job);
    }
  }

  #findNextEligibleIndex(): { index: number; waitMs?: number } {
    const now = Date.now();
    let shortestWait: number | undefined;

    for (let index = 0; index < this.#queue.length; index += 1) {
      const job = this.#queue[index];
      if (!job) continue;

      const activeForHost = this.#activeByHost.get(job.host) ?? 0;
      if (activeForHost >= this.hostConcurrency) continue;

      const lastStarted = this.#lastStartedByHost.get(job.host) ?? 0;
      const waitMs = Math.max(0, this.minIntervalMs - (now - lastStarted));
      if (waitMs > 0) {
        shortestWait = typeof shortestWait === "number" ? Math.min(shortestWait, waitMs) : waitMs;
        continue;
      }

      return { index };
    }

    return { index: -1, waitMs: shortestWait };
  }

  #startJob(job: ScheduledJob<unknown>): void {
    const startedAt = Date.now();
    const hostActive = this.#activeByHost.get(job.host) ?? 0;
    this.#activeByHost.set(job.host, hostActive + 1);
    this.#activeGlobal += 1;
    this.#lastStartedByHost.set(job.host, startedAt);

    const queueWaitMs = startedAt - job.enqueuedAt;
    Promise.resolve()
      .then(job.run)
      .then((value) => {
        const finishedAt = Date.now();
        job.resolve({
          value,
          timing: {
            queueWaitMs,
            networkMs: finishedAt - startedAt,
            totalMs: finishedAt - job.enqueuedAt
          }
        });
      })
      .catch((error) => {
        job.reject(error);
      })
      .finally(() => {
        const activeForHost = this.#activeByHost.get(job.host) ?? 0;
        if (activeForHost <= 1) this.#activeByHost.delete(job.host);
        else this.#activeByHost.set(job.host, activeForHost - 1);

        this.#activeGlobal = Math.max(0, this.#activeGlobal - 1);
        this.#drain();
      });
  }
}
