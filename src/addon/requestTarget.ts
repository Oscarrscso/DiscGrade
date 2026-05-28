import type { GuideContentType } from "../types/discGuide.ts";

export interface GuideRequestTarget {
  imdbId: string;
  contentType: GuideContentType;
}

export function parseMetaTarget(type: string, id: string): GuideRequestTarget | null {
  if (type !== "movie" && type !== "series") return null;
  const normalizedId = id.trim();
  if (!normalizedId) return null;

  return {
    imdbId: normalizedId,
    contentType: type
  };
}

export function parseStreamTarget(type: string, id: string): GuideRequestTarget | null {
  let decodedId = id;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    decodedId = id;
  }

  if (type === "movie") {
    const normalizedId = decodedId.trim();
    if (!normalizedId) return null;
    return {
      imdbId: normalizedId,
      contentType: "movie"
    };
  }

  if (type === "series") {
    const normalizedId = decodedId.trim();
    if (!normalizedId) return null;
    const episodeMatch = normalizedId.match(/^(.*):(\d+):(\d+)$/);
    const incompleteEpisodeMatch = normalizedId.match(/^(tt\d+):(\d+)$/);
    const seriesId = episodeMatch?.[1]?.trim() || incompleteEpisodeMatch?.[1] || normalizedId;

    if (!seriesId) return null;
    return {
      imdbId: seriesId,
      contentType: "series"
    };
  }

  return null;
}
