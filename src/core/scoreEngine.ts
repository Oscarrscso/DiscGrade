import type {
  DiscGuide,
  Edition,
  EditionPick,
  EditionScore,
  GuideVerdict,
  SourceEvidence
} from "../types/discGuide.ts";
import { clamp, normalizeTitle } from "./html.ts";

function includes(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function editionText(edition: Edition): string {
  return [
    edition.title,
    edition.label,
    edition.country,
    edition.region,
    ...(edition.notes || []),
    ...(edition.extras || []),
    ...(edition.badges || []),
    ...(edition.video?.transferNotes || []),
    ...(edition.video?.encodeNotes || []),
    ...(edition.video?.knownIssues || []),
    ...(edition.audio || []).flatMap((audio) => [audio.language, audio.format, audio.channels || "", ...(audio.notes || [])]),
    ...(edition.cuts || []).flatMap((cut) => [cut.name, cut.description || "", ...(cut.notes || [])])
    ,
    ...(edition.commentaryTracks || []).flatMap((track) => [track.description, ...(track.participants || [])])
  ]
    .filter(Boolean)
    .join("\n");
}

function computeScore(edition: Edition): EditionScore {
  const text = editionText(edition);

  let video = edition.format === "4K UHD" ? 28 : edition.format === "Blu-ray" ? 18 : 8;
  let audio = 10;
  let cuts = 8;
  let extras = Math.min(10, ((edition.extras?.length || 0) * 1.2) + ((edition.commentaryTracks?.length || 0) * 2.5));
  let englishFriendly = 0;
  let region = 0;
  const notes: string[] = [];

  if (edition.video?.resolution === "2160p") video += 6;
  if (edition.video?.resolution === "1080p") video += 3;
  if (edition.video?.hdr?.includes("Dolby Vision")) {
    video += 10;
    notes.push("Dolby Vision");
  }
  if (edition.video?.hdr?.includes("HDR10+")) {
    video += 6;
    notes.push("HDR10+");
  }
  if (edition.video?.scanSource && /4k|ocn|original camera negative|restoration/i.test(edition.video.scanSource)) {
    video += 8;
    notes.push("strong scan source");
  }

  if (includes(text, /new 4K restoration|native 4K scan|original camera negative|\bOCN\b/i)) {
    video += 8;
  }
  if (includes(text, /excellent encode|strong encode|grain intact|4K restoration/i)) {
    video += 5;
  }
  if (includes(text, /\bDNR\b|noise reduction|waxy|scrubbed grain/i)) {
    video -= 14;
    notes.push("possible DNR");
  }
  if (includes(text, /AI upscale|AI upscal/i)) {
    video -= 16;
    notes.push("possible AI upscale");
  }
  if (includes(text, /poor encode|bad encode|compression artifacts|macroblocking|banding/i)) {
    video -= 12;
    notes.push("possible encode issues");
  }
  if (includes(text, /worse than blu-?ray|inferior to the bd/i)) {
    video -= 14;
    notes.push("newer disc may be worse than Blu-ray");
  }

  if (includes(text, /Atmos/i)) audio += 8;
  if (includes(text, /DTS:X/i)) audio += 7;
  if (includes(text, /LPCM|DTS-HD MA|Dolby TrueHD/i)) audio += 6;
  if (includes(text, /original mono|original stereo/i)) audio += 5;
  if (includes(text, /lossy only|missing original audio|forced dub|sync issues|downmix/i)) {
    audio -= 10;
    notes.push("audio compromise");
  }

  if (includes(text, /no cuts|uncut|uncensored|includes theatrical cut|includes director'?s cut/i)) {
    cuts += 8;
  }
  if (includes(text, /missing cut|censored|tv version only/i)) {
    cuts -= 12;
    notes.push("cut/version compromise");
  }

  const englishAudio = (edition.audio || []).some((audio) => /english/i.test(audio.language));
  const englishSubs = includes(text, /English/i);
  if (englishAudio) englishFriendly += 7;
  if (englishSubs) englishFriendly += 5;
  if (edition.country && /United Kingdom|Ireland|France|Germany|Europe/i.test(edition.country)) region += 6;
  if (edition.region && /Region Free|ABC|\bB\b/i.test(edition.region)) region += 8;
  if (edition.region && /Region A/i.test(edition.region) && !/4K/i.test(edition.format)) region -= 8;
  if (edition.region && /locked/i.test(edition.region)) region -= 4;

  const overall = clamp(
    Math.round(video * 0.4 + audio * 0.25 + cuts * 0.15 + extras * 0.1 + englishFriendly * 0.05 + region * 0.05),
    0,
    100
  );

  return {
    overall,
    video: clamp(Math.round(video), 0, 100),
    audio: clamp(Math.round(audio), 0, 100),
    cuts: clamp(Math.round(cuts), 0, 100),
    extras: clamp(Math.round(extras), 0, 100),
    englishFriendly: clamp(Math.round(englishFriendly), 0, 100),
    region: clamp(Math.round(region), 0, 100),
    notes
  };
}

function matchesPick(edition: Edition, pickText?: string): boolean {
  if (!pickText) return false;
  const editionNorm = normalizeTitle(`${edition.title} ${edition.label || ""}`);
  const pickNorm = normalizeTitle(pickText);

  return editionNorm.includes(pickNorm) || pickNorm.includes(editionNorm);
}

function makePick(edition: Edition | undefined, reason?: string, sourceUrl?: string): EditionPick | undefined {
  if (!edition) return undefined;
  return {
    editionId: edition.id,
    editionTitle: edition.title,
    reason,
    sourceUrl
  };
}

function selectByExplicitPick(
  editions: Edition[],
  evidence: SourceEvidence[],
  key: "bestOverall" | "bestVideo" | "bestAudio" | "bestEnglishFriendly" | "bestExtras",
  fallbackScore: keyof EditionScore
): EditionPick | undefined {
  for (const source of evidence) {
    const pickText = source.parsed?.[key];
    if (!pickText) continue;
    const matchingEdition = editions.find((edition) => matchesPick(edition, pickText));
    if (matchingEdition) {
      return makePick(matchingEdition, `${source.sourceName} recommended this release.`, source.url);
    }
  }

  const fallback = [...editions].sort((left, right) => (right.score?.[fallbackScore] || 0) - (left.score?.[fallbackScore] || 0))[0];
  return makePick(fallback);
}

function shortSummary(verdict: GuideVerdict): string {
  if (verdict.bestOverall) {
    return `${verdict.bestOverall.editionTitle} looks like the safest overall recommendation.`;
  }
  return "No strong consensus was found, but the guide still highlights the best available evidence.";
}

export function scoreEditions(editions: Edition[]): Edition[] {
  return editions.map((edition) => ({
    ...edition,
    score: computeScore(edition)
  }));
}

export function rankEditions(editions: Edition[], evidence: SourceEvidence[], warningsCount: number): GuideVerdict {
  const bestOverall = selectByExplicitPick(editions, evidence, "bestOverall", "overall");
  const bestVideo = selectByExplicitPick(editions, evidence, "bestVideo", "video");
  const bestAudio = selectByExplicitPick(editions, evidence, "bestAudio", "audio");
  const bestEnglishFriendly = selectByExplicitPick(editions, evidence, "bestEnglishFriendly", "englishFriendly");
  const bestExtras = selectByExplicitPick(editions, evidence, "bestExtras", "extras");

  const preferredCut =
    editions
      .flatMap((edition) => edition.cuts || [])
      .find((cut) => cut.isPreferred)?.name ||
    editions
      .flatMap((edition) => edition.cuts || [])
      .find((cut) => /theatrical|director|uncut/i.test(cut.name))?.name;

  const verdict: GuideVerdict = {
    bestOverall,
    bestVideo,
    bestAudio,
    bestEnglishFriendly,
    bestExtras,
    recommendedCut: preferredCut,
    shortSummary: ""
  };

  verdict.shortSummary = shortSummary(verdict);
  return verdict;
}

export function summarizeConflictNotes(editions: Edition[], evidence: SourceEvidence[]): string[] {
  const explicitPicks = evidence
    .map((item) => item.parsed?.bestOverall)
    .filter(Boolean) as string[];

  const normalized = [...new Set(explicitPicks.map((pick) => normalizeTitle(pick)))];
  const notes: string[] = [];

  if (normalized.length > 1) {
    notes.push("Sources disagree on the best overall edition, so the ranking blends explicit picks with parsed specs.");
  }

  const topEdition = [...editions].sort((left, right) => (right.score?.overall || 0) - (left.score?.overall || 0))[0];
  const explicitTop = explicitPicks[0];

  if (topEdition && explicitTop && !matchesPick(topEdition, explicitTop)) {
    notes.push("The highest-scoring normalized edition differs from at least one explicit source recommendation.");
  }

  return notes;
}
