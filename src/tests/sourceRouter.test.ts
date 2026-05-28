import test from "node:test";
import assert from "node:assert/strict";

import { collectEvidence } from "../core/sourceRouter.ts";
import type { Identity, SourceEvidence } from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime, SourceSearchResult } from "../types/sources.ts";

const identity: Identity = {
  imdbId: "tt0000001",
  title: "Test Movie",
  year: 2000,
  alternateTitles: [],
  directors: []
};

const runtime: SourceRuntime = {
  async fetchText(url: string): Promise<string> {
    return url;
  }
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildEvidence(sourceName: string, commentaryCount = 0): SourceEvidence {
  return {
    sourceName,
    url: `https://example.com/${sourceName}`,
    fetchedAt: new Date().toISOString(),
    matchedBy: "title_year",
    confidence: 0.95,
    extractedClaims: [],
    parsed: {
      editions: [
        {
          title: `${sourceName} edition`,
          commentaryTracks:
            commentaryCount > 0
              ? Array.from({ length: commentaryCount }, (_, index) => ({ description: `Commentary ${index + 1}` }))
              : []
        }
      ]
    }
  };
}

function buildAdapter(
  name: string,
  priority: number,
  parseResult: SourceEvidence | null,
  events: string[],
  delays: { searchMs?: number; parseMs?: number } = {}
): SourceAdapter {
  return {
    name,
    priority,
    maxResults: 1,
    canHandle() {
      return true;
    },
    async search(): Promise<SourceSearchResult[]> {
      events.push(`search:${name}`);
      if (delays.searchMs) await sleep(delays.searchMs);
      return [{ url: `https://example.com/${name}`, title: name, matchedBy: "title_year", confidence: 0.95 }];
    },
    async parse(): Promise<SourceEvidence | null> {
      events.push(`parse:${name}`);
      if (delays.parseMs) await sleep(delays.parseMs);
      return parseResult;
    }
  };
}

test("collectEvidence keeps deterministic source order even when adapters finish out of order", async () => {
  const events: string[] = [];
  const adapters = [
    buildAdapter("Best Blurays", 1, buildEvidence("Best Blurays"), events, { searchMs: 30 }),
    buildAdapter("Blu-ray.com", 2, buildEvidence("Blu-ray.com"), events, { searchMs: 1 }),
    buildAdapter("Arrow Films", 3, buildEvidence("Arrow Films", 1), events, { parseMs: 20 }),
    buildAdapter("Second Sight Films", 4, buildEvidence("Second Sight Films", 1), events, { parseMs: 1 }),
    buildAdapter("DVDCompare", 5, buildEvidence("DVDCompare", 1), events, { parseMs: 5 })
  ];

  const evidence = await collectEvidence(identity, adapters, runtime);
  assert.deepEqual(
    evidence.map((item) => item.sourceName),
    ["Best Blurays", "Blu-ray.com", "Arrow Films"]
  );
  assert.ok(events.includes("search:Best Blurays"));
  assert.ok(events.includes("search:Blu-ray.com"));
});

test("collectEvidence runs fallback batch when commentary is still missing after the primary batch", async () => {
  const events: string[] = [];
  const adapters = [
    buildAdapter("Best Blurays", 1, buildEvidence("Best Blurays"), events),
    buildAdapter("Blu-ray.com", 2, buildEvidence("Blu-ray.com"), events),
    buildAdapter("Arrow Films", 3, buildEvidence("Arrow Films"), events),
    buildAdapter("Second Sight Films", 4, buildEvidence("Second Sight Films"), events),
    buildAdapter("DVDCompare", 5, buildEvidence("DVDCompare", 1), events)
  ];

  const evidence = await collectEvidence(identity, adapters, runtime);
  assert.deepEqual(
    evidence.map((item) => item.sourceName),
    ["Best Blurays", "Blu-ray.com", "Arrow Films", "Second Sight Films", "DVDCompare"]
  );
  assert.ok(events.includes("search:Arrow Films"));
  assert.ok(events.includes("search:Second Sight Films"));
  assert.ok(events.includes("search:DVDCompare"));
});

test("collectEvidence records source timing events when debug collection is provided", async () => {
  const events: string[] = [];
  const debugEvents = [];
  const adapters = [buildAdapter("Best Blurays", 1, buildEvidence("Best Blurays"), events)];

  const evidence = await collectEvidence(identity, adapters, runtime, { debugEvents });

  assert.equal(evidence.length, 1);
  assert.ok(debugEvents.some((event) => event.name === "source:Best Blurays:search"));
  assert.ok(debugEvents.some((event) => event.name === "source:Best Blurays:fetch"));
  assert.ok(debugEvents.some((event) => event.name === "source:Best Blurays:parse"));
  assert.ok(debugEvents.some((event) => event.name === "source:Best Blurays:timing"));
  assert.ok(debugEvents.every((event) => Number.isFinite(event.durationMs)));
});

test("collectEvidence executes primary adapters in parallel to reduce elapsed time", async () => {
  const events: string[] = [];
  const adapters = [
    buildAdapter("Best Blurays", 1, buildEvidence("Best Blurays"), events, { searchMs: 40, parseMs: 20 }),
    buildAdapter("Blu-ray.com", 2, buildEvidence("Blu-ray.com"), events, { searchMs: 40, parseMs: 20 })
  ];

  const started = Date.now();
  const evidence = await collectEvidence(identity, adapters, runtime);
  const elapsed = Date.now() - started;

  assert.equal(evidence.length, 2);
  assert.ok(elapsed < 115);
});
