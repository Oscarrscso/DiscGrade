import test from "node:test";
import assert from "node:assert/strict";

import { scoreEditions, rankEditions } from "../core/scoreEngine.ts";
import type { Edition, SourceEvidence } from "../types/discGuide.ts";

test("score engine prefers a strong 4K restoration over a weak DVD", () => {
  const editions: Edition[] = [
    {
      id: "criterion-4k",
      title: "Criterion 4K UHD",
      format: "4K UHD",
      notes: ["new 4K restoration", "Dolby Vision", "original mono"],
      sourceUrls: []
    },
    {
      id: "old-dvd",
      title: "Old DVD",
      format: "DVD",
      notes: ["lossy only", "waxy", "poor encode"],
      sourceUrls: []
    }
  ];

  const scored = scoreEditions(editions);
  assert.ok((scored[0].score?.overall || 0) > (scored[1].score?.overall || 0));

  const verdict = rankEditions(scored, [] as SourceEvidence[], 1);
  assert.equal(verdict.bestOverall?.editionTitle, "Criterion 4K UHD");
});
