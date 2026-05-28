import test from "node:test";
import assert from "node:assert/strict";

import { collectSourcesWithStreamingFallback, statusFromPhysicalSourceCount } from "../core/guideBuilder.ts";
import type { Identity, SourceEvidence } from "../types/discGuide.ts";
import type { SourceAdapter, SourceRuntime, SourceSearchResult } from "../types/sources.ts";

const identity: Identity = {
  imdbId: "tt0000001",
  tmdbId: 101,
  title: "Fallback Test Movie",
  year: 2000,
  alternateTitles: [],
  directors: []
};

const runtime: SourceRuntime = {
  async fetchText(url: string): Promise<string> {
    return url;
  }
};

function buildAdapter(name: string, parseResult: SourceEvidence | null): SourceAdapter {
  return {
    name,
    priority: 1,
    maxResults: 1,
    canHandle() {
      return true;
    },
    async search(): Promise<SourceSearchResult[]> {
      return [
        {
          url: `https://example.com/${name}`,
          title: name,
          matchedBy: "title_year",
          confidence: 0.9
        }
      ];
    },
    async parse(): Promise<SourceEvidence | null> {
      return parseResult;
    }
  };
}

test("streaming fallback is used when no physical evidence is available", async () => {
  let fallbackCalls = 0;
  const fallbackEvidence: SourceEvidence = {
    sourceName: "TMDB Watch",
    url: "https://www.themoviedb.org/movie/101/watch?locale=US",
    fetchedAt: new Date().toISOString(),
    matchedBy: "tmdb",
    confidence: 0.62,
    extractedClaims: [],
    parsed: {
      streamingAvailability: {
        region: "US",
        stream: [{ provider: "Netflix", url: "https://www.themoviedb.org/provider/netflix" }],
        rent: [],
        buy: []
      }
    }
  };

  const result = await collectSourcesWithStreamingFallback(
    identity,
    [buildAdapter("empty-source", null)],
    runtime,
    {
      streamingRegion: "US",
      async streamingFallbackFetcher(requestIdentity, _runtime, region): Promise<SourceEvidence | null> {
        fallbackCalls += 1;
        assert.equal(requestIdentity.imdbId, identity.imdbId);
        assert.equal(region, "US");
        return fallbackEvidence;
      }
    }
  );

  assert.equal(result.physicalSources.length, 0);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.sourceName, "TMDB Watch");
  assert.equal(fallbackCalls, 1);
});

test("streaming fallback is not called when physical evidence exists", async () => {
  let fallbackCalls = 0;
  const physicalEvidence: SourceEvidence = {
    sourceName: "Best Blurays",
    url: "https://example.com/physical",
    fetchedAt: new Date().toISOString(),
    matchedBy: "imdb",
    confidence: 0.96,
    extractedClaims: [],
    parsed: {
      bestOverall: "Best Bluray Edition"
    }
  };

  const result = await collectSourcesWithStreamingFallback(
    identity,
    [buildAdapter("physical-source", physicalEvidence)],
    runtime,
    {
      async streamingFallbackFetcher(): Promise<SourceEvidence | null> {
        fallbackCalls += 1;
        return null;
      }
    }
  );

  assert.equal(result.physicalSources.length, 1);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0]?.sourceName, "Best Blurays");
  assert.equal(fallbackCalls, 0);
});

test("guide status remains partial when only streaming fallback evidence is present", () => {
  assert.equal(statusFromPhysicalSourceCount(0), "partial");
  assert.equal(statusFromPhysicalSourceCount(1), "ok");
});
