import test from "node:test";
import assert from "node:assert/strict";

import { normalizeCinemetaMeta } from "../core/identityResolver.ts";

test("normalizeCinemetaMeta maps Cinemeta payload into Identity", () => {
  const identity = normalizeCinemetaMeta(
    {
      meta: {
        id: "tt0056552",
        imdb_id: "tt0056552",
        moviedb_id: 12345,
        name: "The Trial",
        releaseInfo: "1962",
        runtime: "118 min",
        director: ["Orson Welles"],
        poster: "https://example.com/poster.jpg",
        background: "https://example.com/bg.jpg",
        genres: ["Drama"]
      }
    },
    "tt0056552"
  );

  assert.ok(identity);
  assert.equal(identity?.contentType, "movie");
  assert.equal(identity?.title, "The Trial");
  assert.equal(identity?.year, 1962);
  assert.equal(identity?.runtimeMinutes, 118);
  assert.deepEqual(identity?.directors, ["Orson Welles"]);
});

test("normalizeCinemetaMeta handles series release ranges and tags as series", () => {
  const identity = normalizeCinemetaMeta(
    {
      meta: {
        id: "tt0903747",
        imdb_id: "tt0903747",
        moviedb_id: 1396,
        name: "Breaking Bad",
        releaseInfo: "2008-2013",
        runtime: "47 min",
        director: [],
        genres: ["Drama"]
      }
    },
    "tt0903747",
    "series"
  );

  assert.ok(identity);
  assert.equal(identity?.contentType, "series");
  assert.equal(identity?.title, "Breaking Bad");
  assert.equal(identity?.year, 2008);
  assert.equal(identity?.runtimeMinutes, 47);
});

test("normalizeCinemetaMeta prefers Cinemeta imdb id as canonical guide id", () => {
  const identity = normalizeCinemetaMeta(
    {
      meta: {
        id: "tmdb:1396",
        imdb_id: "tt0903747",
        moviedb_id: 1396,
        name: "Breaking Bad",
        releaseInfo: "2008-2013",
        runtime: "47 min",
        director: []
      }
    },
    "tmdb:1396",
    "series"
  );

  assert.ok(identity);
  assert.equal(identity?.imdbId, "tt0903747");
});
