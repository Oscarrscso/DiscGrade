import type { GuideDebugEvent, Identity, SourceEvidence } from "../types/discGuide.ts";
import type { SourceAdapter, SourceRequestTiming, SourceRuntime } from "../types/sources.ts";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

function hasCommentaryEvidence(evidence: SourceEvidence[]): boolean {
  return evidence.some((source) =>
    (source.parsed?.editions || []).some((edition) => (edition.commentaryTracks?.length || 0) > 0)
  );
}

export async function collectEvidence(
  identity: Identity,
  adapters: SourceAdapter[],
  runtime: SourceRuntime,
  options: { debugEvents?: GuideDebugEvent[] } = {}
): Promise<SourceEvidence[]> {
  const sorted = [...adapters].sort((left, right) => left.priority - right.priority);
  const evidence: SourceEvidence[] = [];
  let successfulAdapters = 0;
  const startedAt = Date.now();
  const debugEvents = options.debugEvents;
  const batchA = new Set(["Best Blurays", "Blu-ray.com"]);
  const batchB = new Set(["Arrow Films", "Second Sight Films", "DVDCompare"]);

  function record(name: string, started: number, status: GuideDebugEvent["status"], detail?: string): void {
    debugEvents?.push({
      name,
      durationMs: Date.now() - started,
      status,
      detail
    });
  }

  const runnable: SourceAdapter[] = [];
  for (const adapter of sorted) {
    const canHandleStarted = Date.now();
    if (!adapter.canHandle(identity)) {
      record(`source:${adapter.name}:canHandle`, canHandleStarted, "skipped");
      continue;
    }
    record(`source:${adapter.name}:canHandle`, canHandleStarted, "ok");
    runnable.push(adapter);
  }

  function shouldStop(): boolean {
    if (successfulAdapters < config.maxFastSourceAdapters) return false;
    const elapsedMs = Date.now() - startedAt;
    return hasCommentaryEvidence(evidence) || elapsedMs >= config.commentaryFallbackBudgetMs;
  }

  function mergeBatchResults(
    adaptersInOrder: SourceAdapter[],
    byName: Map<string, SourceEvidence[]>
  ): boolean {
    for (const adapter of adaptersInOrder) {
      const adapterEvidence = byName.get(adapter.name) || [];
      if (adapterEvidence.length > 0) {
        evidence.push(...adapterEvidence);
        successfulAdapters += 1;
      }
      if (shouldStop()) return true;
    }
    return false;
  }

  const primaryAdapters = runnable.filter((adapter) => batchA.has(adapter.name));
  const fallbackAdapters = runnable.filter((adapter) => batchB.has(adapter.name));
  const remainingAdapters = runnable.filter((adapter) => !batchA.has(adapter.name) && !batchB.has(adapter.name));

  const primaryResults = await runBatchParallel(primaryAdapters, identity, runtime, record, debugEvents);
  if (mergeBatchResults(primaryAdapters, primaryResults)) {
    return evidence;
  }

  if (!shouldStop()) {
    const fallbackResults = await runBatchParallel(fallbackAdapters, identity, runtime, record, debugEvents);
    if (mergeBatchResults(fallbackAdapters, fallbackResults)) {
      return evidence;
    }
  }

  if (remainingAdapters.length > 0 && !shouldStop()) {
    const remainingResults = await runBatchParallel(remainingAdapters, identity, runtime, record, debugEvents);
    mergeBatchResults(remainingAdapters, remainingResults);
  }

  return evidence;
}

function describeTiming(timing: SourceRequestTiming): string {
  return `queue ${timing.queueWaitMs}ms, network ${timing.networkMs}ms`;
}

async function executeAdapter(
  adapter: SourceAdapter,
  identity: Identity,
  runtime: SourceRuntime,
  record: (name: string, started: number, status: GuideDebugEvent["status"], detail?: string) => void,
  debugEvents?: GuideDebugEvent[]
): Promise<SourceEvidence[]> {
  const adapterStarted = Date.now();
  const adapterEvidence: SourceEvidence[] = [];
  let searchQueueMs = 0;
  let searchNetworkMs = 0;
  let fetchQueueMs = 0;
  let fetchNetworkMs = 0;
  let parseMs = 0;

  try {
    const timedRuntime: SourceRuntime = {
      fetchText(url, init = {}) {
        return runtime.fetchText(url, {
          ...init,
          onTiming: (timing) => {
            searchQueueMs += timing.queueWaitMs;
            searchNetworkMs += timing.networkMs;
            init.onTiming?.(timing);
          }
        });
      }
    };

    const searchStarted = Date.now();
    const results = await adapter.search(identity, timedRuntime);
    record(
      `source:${adapter.name}:search`,
      searchStarted,
      "ok",
      `${results.length} result(s) | queue ${searchQueueMs}ms | network ${searchNetworkMs}ms`
    );
    const limit = adapter.maxResults ?? 1;
    const selectedResults = results.slice(0, limit);

    const parsedResults = await Promise.all(
      selectedResults.map(async (result) => {
        let fetchTiming: SourceRequestTiming = { queueWaitMs: 0, networkMs: 0, totalMs: 0 };
        const fetchStarted = Date.now();
        const page = await runtime.fetchText(result.url, {
          onTiming: (timing) => {
            fetchTiming = timing;
            fetchQueueMs += timing.queueWaitMs;
            fetchNetworkMs += timing.networkMs;
          }
        });
        record(`source:${adapter.name}:fetch`, fetchStarted, "ok", `${result.url} | ${describeTiming(fetchTiming)}`);

        const parseStarted = Date.now();
        const parsed = await adapter.parse(page, identity, result);
        const parseDurationMs = Date.now() - parseStarted;
        parseMs += parseDurationMs;
        if (parsed) {
          record(`source:${adapter.name}:parse`, parseStarted, "ok", parsed.sourceName);
          return parsed;
        }

        record(`source:${adapter.name}:parse`, parseStarted, "skipped", "No evidence parsed");
        return null;
      })
    );

    for (const parsed of parsedResults) {
      if (parsed) adapterEvidence.push(parsed);
    }

    const totalMs = Date.now() - adapterStarted;
    debugEvents?.push({
      name: `source:${adapter.name}:timing`,
      durationMs: totalMs,
      status: "ok",
      detail: `queue ${searchQueueMs + fetchQueueMs}ms, network ${searchNetworkMs + fetchNetworkMs}ms, parse ${parseMs}ms`
    });
  } catch (error) {
    debugEvents?.push({
      name: `source:${adapter.name}`,
      durationMs: 0,
      status: "error",
      detail: error instanceof Error ? error.message : String(error)
    });
    logger.warn(`Source adapter failed: ${adapter.name}`, {
      imdbId: identity.imdbId,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return adapterEvidence;
}

async function runBatchParallel(
  batch: SourceAdapter[],
  identity: Identity,
  runtime: SourceRuntime,
  record: (name: string, started: number, status: GuideDebugEvent["status"], detail?: string) => void,
  debugEvents?: GuideDebugEvent[]
): Promise<Map<string, SourceEvidence[]>> {
  if (batch.length === 0) return new Map();

  const byName = new Map<string, SourceEvidence[]>();
  const runs = await Promise.all(
    batch.map(async (adapter) => ({
      name: adapter.name,
      evidence: await executeAdapter(adapter, identity, runtime, record, debugEvents)
    }))
  );

  for (const run of runs) {
    byName.set(run.name, run.evidence);
  }

  return byName;
}
