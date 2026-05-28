import test from "node:test";
import assert from "node:assert/strict";

import { scoreConfidence } from "../core/confidenceEngine.ts";
import type { Edition, SourceEvidence } from "../types/discGuide.ts";

function source(sourceName: string, confidence: number, bestOverall?: string): SourceEvidence {
  return {
    sourceName,
    url: `https://example.com/${sourceName}`,
    fetchedAt: new Date().toISOString(),
    matchedBy: "title_year",
    confidence,
    extractedClaims: [],
    parsed: bestOverall
      ? {
          bestOverall
        }
      : undefined
  };
}

const editions: Edition[] = [
  {
    id: "criterion-4k",
    title: "Criterion 4K UHD",
    format: "4K UHD",
    sourceUrls: ["https://example.com/criterion"]
  },
  {
    id: "criterion-bd",
    title: "Criterion Blu-ray",
    format: "Blu-ray",
    sourceUrls: ["https://example.com/criterion-bd"]
  }
];

test("confidence is high when exact physical sources agree and normalize release data", () => {
  const confidence = scoreConfidence(
    [
      source("Best Blurays", 0.96, "Criterion 4K UHD"),
      source("Blu-ray.com", 0.92, "Criterion 4K UHD")
    ],
    editions,
    []
  );

  assert.equal(confidence.label, "High");
  assert.ok(confidence.score >= 78);
  assert.ok(confidence.reasons.some((reason) => /independent physical-media sources/.test(reason)));
});

test("confidence drops when physical sources disagree", () => {
  const confidence = scoreConfidence(
    [
      source("Best Blurays", 0.96, "Criterion 4K UHD"),
      source("Blu-ray.com", 0.92, "Arrow Blu-ray")
    ],
    editions,
    ["Sources disagree on the best overall edition."]
  );

  assert.notEqual(confidence.label, "High");
  assert.ok(confidence.score < 78);
  assert.ok(confidence.reasons.includes("Sources disagree on the top release."));
});

test("streaming-only confidence is capped because physical edition data is absent", () => {
  const confidence = scoreConfidence(
    [
      {
        sourceName: "TMDB Watch",
        url: "https://example.com/watch",
        fetchedAt: new Date().toISOString(),
        matchedBy: "tmdb",
        confidence: 0.62,
        extractedClaims: [],
        parsed: {
          streamingAvailability: {
            region: "US",
            stream: [{ provider: "Netflix", url: "https://example.com/netflix" }],
            rent: [],
            buy: []
          }
        }
      }
    ],
    [],
    []
  );

  assert.equal(confidence.label, "Medium");
  assert.ok(confidence.score <= 65);
  assert.ok(confidence.reasons.includes("No physical edition data was found yet."));
});
