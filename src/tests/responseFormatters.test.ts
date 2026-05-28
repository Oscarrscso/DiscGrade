import test from "node:test";
import assert from "node:assert/strict";

import { formatGuideSummary, streamResponseForGuide } from "../addon/responseFormatters.ts";
import type { DiscGuide } from "../types/discGuide.ts";

test("guide summary includes key picks and the hosted guide link", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      bestVideo: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      bestAudio: {
        editionId: "criterion-bd",
        editionTitle: "Criterion Blu-ray"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [],
    warnings: [],
    sources: [],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const text = formatGuideSummary(guide, "https://discgrade.example");
  assert.match(text, /Best overall: Criterion 4K UHD/);
  assert.match(text, /Confidence: High/);
  assert.match(text, /https:\/\/discgrade\.example\/guide\/tt0056552/);
});

test("first stream card foregrounds the recommended edition without generated warnings", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [],
    warnings: [
      {
        type: "DNR",
        severity: "high",
        message: "Heavy digital noise reduction reported.",
        evidenceUrls: ["https://example.com/warning"]
      }
    ],
    sources: [],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.equal(response.streams[0]?.title, "Recommended Edition");
  assert.match(response.streams[0]?.description || "", /Criterion 4K UHD/);
  assert.doesNotMatch(response.streams[0]?.description || "", /Warning:/);
  assert.doesNotMatch(response.streams[0]?.description || "", /Confidence:/);
});

test("supplemental stream cards are sorted by most informative description first", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Short pick"
      },
      bestVideo: {
        editionId: "video",
        editionTitle: "Medium length explanation"
      },
      bestAudio: {
        editionId: "audio",
        editionTitle: "This audio note is much longer and should appear before the shorter pick cards."
      },
      shortSummary: "Short pick looks strongest overall."
    },
    editions: [],
    warnings: [],
    sources: [],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.equal(response.streams[1]?.title, "Best Audio");
});

test("evidence cards always sink to the bottom of the supplemental list", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Short pick"
      },
      bestAudio: {
        editionId: "audio",
        editionTitle: "Audio note"
      },
      shortSummary: "Short pick looks strongest overall."
    },
    editions: [],
    warnings: [],
    sources: [
      {
        sourceName: "Best Blurays",
        url: "https://example.com/evidence",
        fetchedAt: new Date().toISOString(),
        matchedBy: "imdb",
        confidence: 0.96,
        extractedClaims: []
      }
    ],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.equal(response.streams.at(-1)?.title, "Evidence: Best Blurays");
});

test("commentary cards are exposed when commentary data exists", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [
      {
        id: "criterion",
        title: "Criterion Blu-ray",
        format: "Blu-ray",
        commentaryTracks: [{ description: "Audio commentary by Joseph McBride" }],
        sourceUrls: ["https://example.com/criterion"]
      }
    ],
    warnings: [],
    sources: [],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.ok(response.streams.some((stream) => stream.title === "Commentary Tracks"));
});

test("warnings and best overall are not repeated as separate supplemental cards", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      bestVideo: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [],
    warnings: [
      {
        type: "DNR",
        severity: "high",
        message: "Heavy digital noise reduction reported.",
        evidenceUrls: ["https://example.com/warning"]
      }
    ],
    sources: [],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const titles = streamResponseForGuide(guide, "https://discgrade.example").streams.map((stream) => stream.title);
  assert.ok(!titles.includes("Best Overall"));
  assert.ok(!titles.includes("Warning: HIGH"));
});

test("duplicate pick cards are suppressed when they repeat the same edition text", () => {
  const guide: DiscGuide = {
    imdbId: "tt0088247",
    title: "The Terminator",
    year: 1984,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Theatrical Cut: Sony Blu-ray vs OOP Sony US Mastered in 4K Blu-ray (minimal difference) Director&#x27;s Cut: Sony Blu-ray"
      },
      bestVideo: {
        editionId: "video",
        editionTitle: "Theatrical Cut: Sony Blu-ray vs OOP Sony US Mastered in 4K Blu-ray (minimal difference) Director&#x27;s Cut: Sony Blu-ray"
      },
      bestEnglishFriendly: {
        editionId: "english",
        editionTitle: "Theatrical Cut: Sony Blu-ray vs OOP Sony US Mastered in 4K Blu-ray (minimal difference) Director&#x27;s Cut: Sony Blu-ray"
      },
      bestAudio: {
        editionId: "audio",
        editionTitle: "Lionsgate Films 4K UHD (United States)"
      },
      shortSummary: "Sony looks best overall."
    },
    editions: [],
    warnings: [],
    sources: [],
    confidence: {
      score: 80,
      label: "High",
      reasons: ["Multiple sources contributed."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  const titles = response.streams.map((stream) => stream.title);
  assert.ok(!titles.includes("Best Video"));
  assert.ok(!titles.includes("Best English-Friendly"));
  assert.ok(titles.includes("Best Audio"));
});

test("html entities are decoded in stream card descriptions", () => {
  const guide: DiscGuide = {
    imdbId: "tt0088247",
    title: "The Terminator",
    year: 1984,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Director&#x27;s Cut: Sony Blu-ray"
      },
      shortSummary: "Sony looks best overall."
    },
    editions: [],
    warnings: [],
    sources: [],
    confidence: {
      score: 80,
      label: "High",
      reasons: ["Multiple sources contributed."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.match(response.streams[0]?.description || "", /Director's Cut: Sony Blu-ray/);
  assert.doesNotMatch(response.streams[0]?.description || "", /&#x27;/);
});

test("all releases card is shown when multiple editions are available", () => {
  const guide: DiscGuide = {
    imdbId: "tt0088247",
    title: "The Terminator",
    year: 1984,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Sony Blu-ray"
      },
      shortSummary: "Sony looks best overall."
    },
    editions: [
      {
        id: "one",
        title: "Sony Blu-ray",
        format: "Blu-ray",
        label: "Sony",
        country: "United States",
        sourceUrls: ["https://example.com/one"]
      },
      {
        id: "two",
        title: "Lionsgate Films 4K UHD (United States)",
        format: "4K UHD",
        label: "Lionsgate Films",
        country: "United States",
        sourceUrls: ["https://example.com/two"]
      },
      {
        id: "three",
        title: "Kinowelt Home Entertainment Special Edition",
        format: "Blu-ray",
        label: "Kinowelt Home Entertainment",
        country: "Germany",
        sourceUrls: ["https://example.com/three"]
      }
    ],
    warnings: [],
    sources: [],
    confidence: {
      score: 80,
      label: "High",
      reasons: ["Multiple sources contributed."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  const allReleases = response.streams.find((stream) => stream.title === "All Releases");
  assert.ok(allReleases);
  assert.match(allReleases?.description || "", /4K UHD: Lionsgate Films - United States/);
  assert.match(allReleases?.description || "", /Blu-ray: Kinowelt Home Entertainment - Germany/);
  assert.match(allReleases?.description || "", /Blu-ray: Sony - United States/);
  assert.doesNotMatch(allReleases?.description || "", /; /);
});

test("all releases card groups regional raw titles into format-first lines and infers DVD from R1\/R2 entries", () => {
  const guide: DiscGuide = {
    imdbId: "tt0100802",
    title: "Total Recall",
    year: 1990,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Sony Blu-ray"
      },
      shortSummary: "Sony looks best overall."
    },
    editions: [
      {
        id: "mgm-us",
        title: "R1 America - MGM Home Entertainment",
        format: "Unknown",
        sourceUrls: ["https://example.com/mgm-us"]
      },
      {
        id: "mgm-fr",
        title: "R2 France - MGM Home Entertainment",
        format: "Unknown",
        sourceUrls: ["https://example.com/mgm-fr"]
      },
      {
        id: "mgm-uk",
        title: "R2 United Kingdom - MGM Home Entertainment",
        format: "Unknown",
        sourceUrls: ["https://example.com/mgm-uk"]
      },
      {
        id: "mgm-vintage",
        title: "R1 America - MGM Home Entertainment Vintage Classics",
        format: "Unknown",
        sourceUrls: ["https://example.com/mgm-vintage"]
      },
      {
        id: "lionsgate-4k",
        title: "Lionsgate Films 4K UHD (United States)",
        label: "Lionsgate Films",
        country: "United States",
        format: "4K UHD",
        sourceUrls: ["https://example.com/lionsgate-4k"]
      }
    ],
    warnings: [],
    sources: [],
    confidence: {
      score: 80,
      label: "High",
      reasons: ["Multiple sources contributed."]
    },
    status: "ok"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  const allReleases = response.streams.find((stream) => stream.title === "All Releases");
  assert.ok(allReleases);
  assert.match(allReleases?.description || "", /4K UHD: Lionsgate Films - United States/);
  assert.match(allReleases?.description || "", /DVD: MGM Home Entertainment - France/);
  assert.match(allReleases?.description || "", /DVD: MGM Home Entertainment - United Kingdom/);
  assert.match(allReleases?.description || "", /DVD: MGM Home Entertainment - United States/);
  assert.match(allReleases?.description || "", /DVD: MGM Home Entertainment \(Vintage Classics\) - United States/);
  assert.match((allReleases?.description || "").split("\n")[0] || "", /^4K UHD:/);
  assert.doesNotMatch(allReleases?.description || "", /\bR1\b|\bR2\b/);
});

test("loose fallback titles are hidden when structured release rows exist", () => {
  const guide: DiscGuide = {
    imdbId: "tt0050083",
    title: "12 Angry Men",
    year: 1957,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Kino Lorber 4K Blu-ray"
      },
      shortSummary: "Kino looks best overall."
    },
    editions: [
      {
        id: "loose-one",
        title: "2011 Criterion",
        format: "Unknown",
        sourceUrls: ["https://example.com/one"]
      },
      {
        id: "loose-two",
        title: "Kino Lorber or Capelight",
        format: "Unknown",
        sourceUrls: ["https://example.com/two"]
      },
      {
        id: "us-kino",
        title: "Kino Lorber 4K UHD (United States)",
        label: "Kino Lorber",
        country: "United States",
        format: "4K UHD",
        sourceUrls: ["https://example.com/three"]
      },
      {
        id: "uk-mgm",
        title: "R2 United Kingdom - MGM Home Entertainment",
        format: "Unknown",
        sourceUrls: ["https://example.com/four"]
      }
    ],
    warnings: [],
    sources: [],
    confidence: {
      score: 75,
      label: "High",
      reasons: ["Multiple sources contributed."]
    },
    status: "ok"
  };

  const allReleases = streamResponseForGuide(guide, "https://discgrade.example").streams.find((stream) => stream.title === "All Releases");
  assert.ok(allReleases);
  assert.match(allReleases?.description || "", /4K UHD: Kino Lorber - United States/);
  assert.match(allReleases?.description || "", /DVD: MGM Home Entertainment - United Kingdom/);
  assert.doesNotMatch(allReleases?.description || "", /2011 Criterion/);
  assert.doesNotMatch(allReleases?.description || "", /Kino Lorber or Capelight/);
});

test("commentary card hides R-code prefix in edition and commentary text", () => {
  const guide: DiscGuide = {
    imdbId: "tt0100802",
    title: "Total Recall",
    year: 1990,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Lionsgate 4K UHD"
      },
      shortSummary: "Lionsgate looks best overall."
    },
    editions: [
      {
        id: "r2-commentary",
        title: "R2 Germany - Kinowelt Home Entertainment Special Edition",
        format: "DVD",
        commentaryTracks: [
          {
            description:
              "R2 Germany - Kinowelt Home Entertainment Special Edition: Audio commentary with director Paul Verhoeven"
          }
        ],
        sourceUrls: ["https://example.com/commentary"]
      }
    ],
    warnings: [],
    sources: [],
    confidence: {
      score: 70,
      label: "Medium",
      reasons: ["One source contributed."]
    },
    status: "ok"
  };

  const commentaryCard = streamResponseForGuide(guide, "https://discgrade.example").streams.find(
    (stream) => stream.title === "Commentary Tracks"
  );
  assert.ok(commentaryCard);
  assert.match(commentaryCard?.description || "", /Kinowelt Home Entertainment \(Special Edition\) - Germany/);
  assert.doesNotMatch(commentaryCard?.description || "", /\bR2\b/);
});

test("all releases card sits directly above evidence cards", () => {
  const guide: DiscGuide = {
    imdbId: "tt0088247",
    title: "The Terminator",
    year: 1984,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "overall",
        editionTitle: "Sony Blu-ray"
      },
      bestAudio: {
        editionId: "audio",
        editionTitle: "Lionsgate Films 4K UHD (United States)"
      },
      shortSummary: "Sony looks best overall."
    },
    editions: [
      {
        id: "one",
        title: "Sony Blu-ray",
        format: "Blu-ray",
        sourceUrls: ["https://example.com/one"]
      },
      {
        id: "two",
        title: "Lionsgate Films 4K UHD (United States)",
        format: "4K UHD",
        sourceUrls: ["https://example.com/two"]
      }
    ],
    warnings: [],
    sources: [
      {
        sourceName: "Best Blurays",
        url: "https://example.com/evidence",
        fetchedAt: new Date().toISOString(),
        matchedBy: "imdb",
        confidence: 0.96,
        extractedClaims: []
      }
    ],
    confidence: {
      score: 80,
      label: "High",
      reasons: ["Multiple sources contributed."]
    },
    status: "ok"
  };

  const titles = streamResponseForGuide(guide, "https://discgrade.example").streams.map((stream) => stream.title);
  assert.equal(titles.at(-2), "All Releases");
  assert.equal(titles.at(-1), "Evidence: Best Blurays");
});

test("evidence cards are deduped by source name", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [],
    warnings: [],
    sources: [
      {
        sourceName: "Blu-ray.com",
        url: "https://example.com/one",
        fetchedAt: new Date().toISOString(),
        matchedBy: "imdb",
        confidence: 0.81,
        extractedClaims: []
      },
      {
        sourceName: "Blu-ray.com",
        url: "https://example.com/two",
        fetchedAt: new Date().toISOString(),
        matchedBy: "imdb",
        confidence: 0.91,
        extractedClaims: []
      }
    ],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Best Blurays match found."]
    },
    status: "ok"
  };

  const evidenceTitles = streamResponseForGuide(guide, "https://discgrade.example").streams
    .filter((stream) => stream.title.startsWith("Evidence:"))
    .map((stream) => stream.title);
  assert.deepEqual(evidenceTitles, ["Evidence: Blu-ray.com"]);
});

test("streaming-only guides use streaming-first card and provider detail cards", () => {
  const guide: DiscGuide = {
    imdbId: "tt0076759",
    tmdbId: 11,
    title: "Star Wars",
    year: 1977,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      shortSummary: "No physical evidence found."
    },
    editions: [],
    warnings: [],
    sources: [
      {
        sourceName: "TMDB Watch",
        url: "https://www.themoviedb.org/movie/11/watch?locale=US",
        fetchedAt: new Date().toISOString(),
        matchedBy: "tmdb",
        confidence: 0.62,
        extractedClaims: [],
        parsed: {
          streamingAvailability: {
            region: "US",
            stream: [{ provider: "Disney Plus", url: "https://www.themoviedb.org/provider/disney-plus" }],
            rent: [{ provider: "Apple TV", url: "https://www.themoviedb.org/provider/apple-tv-rent" }],
            buy: [{ provider: "Apple TV", url: "https://www.themoviedb.org/provider/apple-tv-buy" }]
          }
        }
      }
    ],
    confidence: {
      score: 38,
      label: "Low",
      reasons: ["Streaming availability data found."]
    },
    status: "partial"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.equal(response.streams[0]?.title, "Streaming Availability");
  assert.match(response.streams[0]?.description || "", /Physical-media edition picks are currently unavailable\./);
  assert.doesNotMatch(response.streams[0]?.description || "", /Region:/);
  assert.doesNotMatch(response.streams[0]?.description || "", /Confidence:/);

  const titles = response.streams.map((stream) => stream.title);
  assert.ok(titles.includes("Stream (Subscription)"));
  assert.ok(titles.includes("Rent"));
  assert.ok(titles.includes("Buy"));

  const streamCard = response.streams.find((stream) => stream.title === "Stream (Subscription)");
  assert.equal(streamCard?.externalUrl, "https://www.themoviedb.org/provider/disney-plus");
});

test("debug build trace appears as the final stream card when debug data exists", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [
      {
        id: "criterion-4k",
        title: "Criterion 4K UHD",
        format: "4K UHD",
        sourceUrls: ["https://example.com/criterion"]
      }
    ],
    warnings: [],
    sources: [
      {
        sourceName: "Best Blurays",
        url: "https://example.com/bestblurays",
        fetchedAt: new Date().toISOString(),
        matchedBy: "title_year",
        confidence: 0.96,
        extractedClaims: []
      }
    ],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Matched the movie identity directly."]
    },
    status: "ok",
    debug: {
      cache: "refresh",
      generatedAt: new Date().toISOString(),
      totalMs: 1234,
      events: [
        {
          name: "identity:resolve",
          durationMs: 42,
          status: "ok",
          detail: "The Trial (1962)"
        },
        {
          name: "source:Best Blurays:search",
          durationMs: 150,
          status: "ok",
          detail: "1 result(s)"
        }
      ]
    }
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.equal(response.streams.at(-1)?.title, "Debug: Build Trace");
  assert.match(response.streams.at(-1)?.description || "", /Built in 1\.2s\. Cache: refresh\./);
  assert.match(response.streams.at(-1)?.description || "", /Best Blurays: checks curated best-edition recommendations\./);
  assert.match(
    response.streams.at(-1)?.description || "",
    /found 1 search result\(s\), 1 useful page\(s\); scraped data: none; timing totals: queue 0ms, network 0ms, parse 0ms; added 1 matched source page/
  );
  assert.match(response.streams.at(-1)?.description || "", /Pipeline timings: Identity: 42ms/);
  assert.doesNotMatch(response.streams.at(-1)?.description || "", /source:Best Blurays:search/);
});

test("debug source took value uses source timing event instead of summing step events", () => {
  const guide: DiscGuide = {
    imdbId: "tt0056552",
    title: "The Trial",
    year: 1962,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      bestOverall: {
        editionId: "criterion-4k",
        editionTitle: "Criterion 4K UHD"
      },
      shortSummary: "Criterion 4K UHD looks strongest overall."
    },
    editions: [
      {
        id: "criterion-4k",
        title: "Criterion 4K UHD",
        format: "4K UHD",
        sourceUrls: ["https://example.com/criterion"]
      }
    ],
    warnings: [],
    sources: [
      {
        sourceName: "Blu-ray.com",
        url: "https://example.com/bluray",
        fetchedAt: new Date().toISOString(),
        matchedBy: "title_year",
        confidence: 0.96,
        extractedClaims: []
      }
    ],
    confidence: {
      score: 82,
      label: "High",
      reasons: ["Matched the movie identity directly."]
    },
    status: "ok",
    debug: {
      cache: "refresh",
      generatedAt: new Date().toISOString(),
      totalMs: 600,
      events: [
        {
          name: "source:Blu-ray.com:search",
          durationMs: 200,
          status: "ok",
          detail: "2 result(s)"
        },
        {
          name: "source:Blu-ray.com:fetch",
          durationMs: 220,
          status: "ok",
          detail: "https://example.com/bluray | queue 20ms, network 200ms"
        },
        {
          name: "source:Blu-ray.com:parse",
          durationMs: 30,
          status: "ok",
          detail: "Blu-ray.com"
        },
        {
          name: "source:Blu-ray.com:timing",
          durationMs: 290,
          status: "ok",
          detail: "queue 20ms, network 200ms, parse 30ms"
        }
      ]
    }
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.match(response.streams.at(-1)?.description || "", /Blu-ray\.com: .* Took 290ms total;/);
  assert.doesNotMatch(response.streams.at(-1)?.description || "", /Took 740ms total/);
});

test("not_found guides still expose a DiscGrade stream card so the source tab is visible", () => {
  const guide: DiscGuide = {
    imdbId: "tmdb:1396",
    contentType: "series",
    title: "tmdb:1396",
    year: Number.NaN,
    resolvedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    verdict: {
      shortSummary: "Could not resolve."
    },
    editions: [],
    warnings: [],
    sources: [],
    confidence: {
      score: 0,
      label: "Low",
      reasons: ["Identity resolution failed."]
    },
    status: "not_found"
  };

  const response = streamResponseForGuide(guide, "https://discgrade.example");
  assert.equal(response.streams.length, 1);
  assert.equal(response.streams[0]?.name, "DiscGrade");
  assert.match(response.streams[0]?.title || "", /unavailable/i);
});
