import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import { fetchTmdbWatchFallbackEvidence, parseTmdbWatchPage } from "../sources/tmdbWatch.ts";
import type { Identity } from "../types/discGuide.ts";
import type { SourceRuntime } from "../types/sources.ts";

const fixtures = path.join(process.cwd(), "src", "tests", "fixtures");

const identity: Identity = {
  imdbId: "tt0076759",
  tmdbId: 11,
  title: "Star Wars",
  year: 1977,
  alternateTitles: [],
  directors: ["George Lucas"]
};

test("TMDB watch parser extracts stream, rent, and buy providers and dedupes quality variants", async () => {
  const html = await fs.readFile(path.join(fixtures, "tmdb-watch-page.html"), "utf8");
  const evidence = parseTmdbWatchPage(
    html,
    identity,
    "https://www.themoviedb.org/movie/11/watch?locale=US",
    "US"
  );

  assert.ok(evidence);
  assert.equal(evidence?.sourceName, "TMDB Watch");
  assert.equal(evidence?.parsed?.streamingAvailability?.region, "US");
  assert.deepEqual(
    evidence?.parsed?.streamingAvailability?.stream.map((item) => item.provider),
    ["Disney Plus", "Apple TV Plus"]
  );
  assert.deepEqual(
    evidence?.parsed?.streamingAvailability?.rent.map((item) => item.provider),
    ["Google Play Movies"]
  );
  assert.deepEqual(
    evidence?.parsed?.streamingAvailability?.buy.map((item) => item.provider),
    ["Apple TV"]
  );
  assert.match(evidence?.url || "", /locale=US/);
  assert.match(evidence?.parsed?.rawSummary || "", /Stream, rent, or buy now/i);
});

test("TMDB watch parser returns null when no supported providers are listed", async () => {
  const html = await fs.readFile(path.join(fixtures, "tmdb-watch-no-providers.html"), "utf8");
  const evidence = parseTmdbWatchPage(
    html,
    identity,
    "https://www.themoviedb.org/movie/11/watch?locale=US",
    "US"
  );

  assert.equal(evidence, null);
});

test("TMDB watch fallback fetcher builds locale-aware URL", async () => {
  const html = await fs.readFile(path.join(fixtures, "tmdb-watch-page.html"), "utf8");
  const fetchedUrls: string[] = [];
  const runtime: SourceRuntime = {
    async fetchText(url: string): Promise<string> {
      fetchedUrls.push(url);
      return html;
    }
  };

  const evidence = await fetchTmdbWatchFallbackEvidence(identity, runtime, "IE");
  assert.ok(evidence);
  assert.match(fetchedUrls[0] || "", /\/movie\/11\/watch\?locale=IE$/);
  assert.equal(evidence?.parsed?.streamingAvailability?.region, "IE");
});
