import type { ConfidenceResult, Edition, SourceEvidence } from "../types/discGuide.ts";
import { clamp, normalizeTitle } from "./html.ts";

function guideHasStreamingAvailability(source: SourceEvidence): boolean {
  const availability = source.parsed?.streamingAvailability;
  return Boolean(availability && (availability.stream.length || availability.rent.length || availability.buy.length));
}

function sourceBreadthScore(sourceCount: number): number {
  if (sourceCount >= 3) return 16;
  if (sourceCount === 2) return 10;
  if (sourceCount === 1) return 4;
  return 0;
}

function evidenceRichnessScore(evidence: SourceEvidence[], editions: Edition[]): number {
  let score = 0;
  const explicitPickCount = evidence.filter((item) => item.parsed?.bestOverall).length;
  const categoryPickCount = evidence.flatMap((item) => [
    item.parsed?.bestOverall,
    item.parsed?.bestVideo,
    item.parsed?.bestAudio,
    item.parsed?.bestEnglishFriendly,
    item.parsed?.bestExtras
  ]).filter(Boolean).length;
  const commentaryCount = editions.filter((edition) => (edition.commentaryTracks?.length || 0) > 0).length;

  if (editions.length >= 6) score += 10;
  else if (editions.length >= 2) score += 7;
  else if (editions.length === 1) score += 4;

  if (explicitPickCount >= 1) score += 5;
  if (categoryPickCount >= 3) score += 5;
  if (commentaryCount > 0) score += 3;

  return clamp(score, 0, 18);
}

export function scoreConfidence(
  evidence: SourceEvidence[],
  editions: Edition[],
  conflictNotes: string[]
): ConfidenceResult {
  if (evidence.length === 0) {
    return {
      score: 0,
      label: "Low",
      reasons: ["No source evidence was collected."]
    };
  }

  const streamingOnly = evidence.every((item) => guideHasStreamingAvailability(item));
  if (streamingOnly) {
    const bestMatch = Math.max(...evidence.map((item) => item.confidence), 0);
    const score = clamp(Math.round(25 + bestMatch * 45), 0, 65);
    return {
      score,
      label: score >= 50 ? "Medium" : "Low",
      reasons: ["Streaming availability was found.", "No physical edition data was found yet."]
    };
  }

  const reasons: string[] = [];
  const physicalEvidence = evidence.filter((item) => !guideHasStreamingAvailability(item));
  const bySource = new Set(physicalEvidence.map((item) => item.sourceName));
  const averageSourceMatch =
    physicalEvidence.reduce((total, item) => total + item.confidence, 0) / Math.max(physicalEvidence.length, 1);
  const exactMatches = evidence.filter((item) => item.matchedBy === "imdb" || item.matchedBy === "title_year").length;
  const identityScore = exactMatches > 0 ? 18 : 8;
  const sourceScore = Math.round(averageSourceMatch * 34);
  const breadthScore = sourceBreadthScore(bySource.size);
  const richnessScore = evidenceRichnessScore(physicalEvidence, editions);

  const explicitPicks = evidence
    .map((item) => item.parsed?.bestOverall)
    .filter(Boolean)
    .map((item) => normalizeTitle(item as string));
  const uniqueExplicitPicks = new Set(explicitPicks);
  const sourcesAgreeOnTopPick = explicitPicks.length >= 2 && uniqueExplicitPicks.size === 1;
  const sourcesDisagreeOnTopPick = uniqueExplicitPicks.size > 1;
  const agreementScore = sourcesAgreeOnTopPick ? 12 : sourcesDisagreeOnTopPick ? -12 : 0;

  let score = sourceScore + identityScore + breadthScore + richnessScore + agreementScore;

  if (exactMatches > 0) {
    reasons.push("Matched the movie identity directly.");
  } else {
    reasons.push("Only loose title matching was available.");
  }

  if (bySource.size >= 2) {
    reasons.push(`${bySource.size} independent physical-media sources contributed.`);
  } else if (bySource.size === 1) {
    reasons.push("Only one physical-media source contributed.");
  }

  if (editions.length >= 2) {
    reasons.push(`${editions.length} release entries were normalized.`);
  } else if (editions.length === 1) {
    reasons.push("Only one release entry was normalized.");
  }

  if (sourcesAgreeOnTopPick) {
    reasons.push("Sources agree on the top release.");
  }
  if (sourcesDisagreeOnTopPick) {
    reasons.push("Sources disagree on the top release.");
  }

  const fuzzyOnly = physicalEvidence.length > 0 && physicalEvidence.every((item) => item.matchedBy === "fuzzy");
  if (fuzzyOnly) {
    score -= 18;
  }

  if (conflictNotes.length > 0) {
    score -= 15;
    reasons.push("Some normalized findings conflict.");
  }

  score = clamp(score, 0, 100);

  return {
    score,
    label: score >= 78 ? "High" : score >= 50 ? "Medium" : "Low",
    reasons: [...new Set(reasons)]
  };
}
