import test from "node:test";
import assert from "node:assert/strict";

import { parseMetaTarget, parseStreamTarget } from "../addon/requestTarget.ts";

test("parseMetaTarget supports movie and series tt ids", () => {
  assert.deepEqual(parseMetaTarget("movie", "tt0133093"), {
    imdbId: "tt0133093",
    contentType: "movie"
  });
  assert.deepEqual(parseMetaTarget("series", "tt0903747"), {
    imdbId: "tt0903747",
    contentType: "series"
  });
});

test("parseMetaTarget accepts non-imdb ids for broader metadata compatibility", () => {
  assert.deepEqual(parseMetaTarget("movie", "tmdb:603"), {
    imdbId: "tmdb:603",
    contentType: "movie"
  });
  assert.deepEqual(parseMetaTarget("series", "tvdb:81189"), {
    imdbId: "tvdb:81189",
    contentType: "series"
  });
});

test("parseStreamTarget accepts series episode ids and maps to base imdb id", () => {
  assert.deepEqual(parseStreamTarget("series", "tt0903747:2:7"), {
    imdbId: "tt0903747",
    contentType: "series"
  });
  assert.deepEqual(parseStreamTarget("series", "tt0903747%3A2%3A7"), {
    imdbId: "tt0903747",
    contentType: "series"
  });
  assert.deepEqual(parseStreamTarget("series", "tt0903747"), {
    imdbId: "tt0903747",
    contentType: "series"
  });
  assert.deepEqual(parseStreamTarget("series", "tmdb:1396:1:1"), {
    imdbId: "tmdb:1396",
    contentType: "series"
  });
  assert.deepEqual(parseStreamTarget("series", "tt0903747:1"), {
    imdbId: "tt0903747",
    contentType: "series"
  });
});

test("parseStreamTarget keeps movie IDs permissive but non-empty", () => {
  assert.deepEqual(parseStreamTarget("movie", "tt0133093"), {
    imdbId: "tt0133093",
    contentType: "movie"
  });
  assert.deepEqual(parseStreamTarget("movie", "tmdb:603"), {
    imdbId: "tmdb:603",
    contentType: "movie"
  });
  assert.equal(parseStreamTarget("movie", "   "), null);
});
