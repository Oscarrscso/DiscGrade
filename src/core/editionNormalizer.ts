import type {
  AudioInfo,
  CommentaryTrack,
  CutInfo,
  DiscFormat,
  Edition,
  Identity,
  PartialEdition,
  SourceEvidence,
  VideoInfo
} from "../types/discGuide.ts";
import { extractBadges } from "./textSignals.ts";
import { normalizeTitle, unique } from "./html.ts";

function normalizeFormat(value?: string): DiscFormat {
  const input = value?.toLowerCase() || "";
  if (input.includes("4k")) return "4K UHD";
  if (input.includes("blu")) return "Blu-ray";
  if (input.includes("dvd")) return "DVD";
  if (input.includes("digital")) return "Digital";
  return "Unknown";
}

function editionKey(partial: PartialEdition): string {
  const region = partial.region || "";
  const country = partial.country || "";
  return normalizeTitle(
    `${partial.key || partial.title} ${partial.label || ""} ${partial.format || ""} ${country} ${region}`
  );
}

function mergeVideo(current?: VideoInfo, incoming?: VideoInfo): VideoInfo | undefined {
  if (!current) return incoming;
  if (!incoming) return current;

  return {
    resolution: current.resolution || incoming.resolution,
    hdr: unique([...(current.hdr || []), ...(incoming.hdr || [])]),
    codec: current.codec || incoming.codec,
    aspectRatio: current.aspectRatio || incoming.aspectRatio,
    scanSource: current.scanSource || incoming.scanSource,
    transferNotes: unique([...(current.transferNotes || []), ...(incoming.transferNotes || [])]),
    encodeNotes: unique([...(current.encodeNotes || []), ...(incoming.encodeNotes || [])]),
    knownIssues: unique([...(current.knownIssues || []), ...(incoming.knownIssues || [])])
  };
}

function mergeAudio(current: AudioInfo[] = [], incoming: AudioInfo[] = []): AudioInfo[] {
  const byKey = new Map<string, AudioInfo>();

  for (const item of [...current, ...incoming]) {
    const key = normalizeTitle(`${item.language} ${item.format} ${item.channels || ""}`);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, notes: [...(item.notes || [])] });
      continue;
    }

    byKey.set(key, {
      ...existing,
      channels: existing.channels || item.channels,
      atmos: existing.atmos || item.atmos,
      dtsX: existing.dtsX || item.dtsX,
      lossless: existing.lossless || item.lossless,
      notes: unique([...(existing.notes || []), ...(item.notes || [])])
    });
  }

  return [...byKey.values()];
}

function mergeCuts(current: CutInfo[] = [], incoming: CutInfo[] = []): CutInfo[] {
  const byKey = new Map<string, CutInfo>();
  for (const item of [...current, ...incoming]) {
    const key = normalizeTitle(item.name);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, notes: [...(item.notes || [])] });
      continue;
    }
    byKey.set(key, {
      ...existing,
      runtimeMinutes: existing.runtimeMinutes || item.runtimeMinutes,
      description: existing.description || item.description,
      isPreferred: existing.isPreferred || item.isPreferred,
      notes: unique([...(existing.notes || []), ...(item.notes || [])])
    });
  }
  return [...byKey.values()];
}

function mergeCommentaryTracks(current: CommentaryTrack[] = [], incoming: CommentaryTrack[] = []): CommentaryTrack[] {
  const byKey = new Map<string, CommentaryTrack>();
  for (const item of [...current, ...incoming]) {
    const key = normalizeTitle(item.description);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...item, participants: [...(item.participants || [])] });
      continue;
    }
    byKey.set(key, {
      ...existing,
      participants: unique([...(existing.participants || []), ...(item.participants || [])])
    });
  }
  return [...byKey.values()];
}

function pickFromText(value: string): PartialEdition {
  return {
    title: value,
    label: value.split(/\s+(4K|Blu-ray|DVD)/i)[0]?.trim() || value,
    format: normalizeFormat(value),
    notes: [value]
  };
}

export function normalizeEditions(identity: Identity, evidence: SourceEvidence[]): Edition[] {
  const editions = new Map<string, Edition>();
  const hasStreamingFallback = evidence.some((source) => {
    const availability = source.parsed?.streamingAvailability;
    return Boolean(availability && (availability.stream.length || availability.rent.length || availability.buy.length));
  });

  function upsert(partial: PartialEdition, sourceUrl: string): void {
    const key = editionKey(partial);
    const current = editions.get(key);

    if (!current) {
      const notes = partial.notes || [];
      const badges = unique([...(partial.badges || []), ...extractBadges(notes)]);
      editions.set(key, {
        id: key,
        title: partial.title,
        label: partial.label,
        country: partial.country,
        region: partial.region,
        format: partial.format || "Unknown",
        releaseYear: partial.releaseYear,
        releaseDate: partial.releaseDate,
        video: partial.video,
        audio: partial.audio,
        cuts: partial.cuts,
        commentaryTracks: partial.commentaryTracks,
        extras: partial.extras,
        notes,
        badges,
        sourceUrls: unique([...(partial.sourceUrls || []), sourceUrl])
      });
      return;
    }

    current.label = current.label || partial.label;
    current.country = current.country || partial.country;
    current.region = current.region || partial.region;
    current.format = current.format !== "Unknown" ? current.format : partial.format || "Unknown";
    current.releaseYear = current.releaseYear || partial.releaseYear;
    current.releaseDate = current.releaseDate || partial.releaseDate;
    current.video = mergeVideo(current.video, partial.video);
    current.audio = mergeAudio(current.audio, partial.audio);
    current.cuts = mergeCuts(current.cuts, partial.cuts);
    current.commentaryTracks = mergeCommentaryTracks(current.commentaryTracks, partial.commentaryTracks);
    current.extras = unique([...(current.extras || []), ...(partial.extras || [])]);
    current.notes = unique([...(current.notes || []), ...(partial.notes || [])]);
    current.badges = unique([...(current.badges || []), ...(partial.badges || []), ...extractBadges(partial.notes || [])]);
    current.sourceUrls = unique([...current.sourceUrls, ...(partial.sourceUrls || []), sourceUrl]);
  }

  for (const source of evidence) {
    for (const partial of source.parsed?.editions || []) {
      upsert(partial, source.url);
    }

    for (const text of [
      source.parsed?.bestOverall,
      source.parsed?.bestVideo,
      source.parsed?.bestAudio,
      source.parsed?.bestEnglishFriendly,
      source.parsed?.bestExtras
    ].filter(Boolean) as string[]) {
      upsert(pickFromText(text), source.url);
    }
  }

  if (editions.size === 0 && !hasStreamingFallback) {
    editions.set(identity.imdbId, {
      id: identity.imdbId,
      title: identity.title,
      format: "Unknown",
      notes: ["No specific edition data could be normalized from the current sources."],
      sourceUrls: evidence.map((item) => item.url)
    });
  }

  return [...editions.values()];
}
