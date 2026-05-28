import { fetchJson } from "./http.ts";
import { config } from "./config.ts";
import { parseRuntimeMinutes } from "./html.ts";
import type { GuideContentType, Identity } from "../types/discGuide.ts";

type CinemetaMeta = {
  meta?: {
    id: string;
    imdb_id?: string;
    moviedb_id?: number;
    name: string;
    releaseInfo?: string;
    runtime?: string;
    director?: string[];
    poster?: string;
    background?: string;
    genres?: string[];
    released?: string;
  };
};

function canonicalGuideId(meta: NonNullable<CinemetaMeta["meta"]>, requestedId: string): string {
  if (/^tt\d+$/.test(meta.imdb_id || "")) return meta.imdb_id as string;
  if (/^tt\d+$/.test(meta.id || "")) return meta.id;
  return requestedId;
}

function parseReleaseYear(meta: NonNullable<CinemetaMeta["meta"]>): number | null {
  const fromReleaseInfo = meta.releaseInfo?.match(/\d{4}/)?.[0];
  const fromReleased = meta.released?.match(/\d{4}/)?.[0];
  const year = Number(fromReleaseInfo || fromReleased);
  return Number.isFinite(year) ? year : null;
}

export function normalizeCinemetaMeta(
  payload: CinemetaMeta,
  imdbId: string,
  contentType: GuideContentType = "movie"
): Identity | null {
  const meta = payload.meta;
  if (!meta?.name) return null;

  const year = parseReleaseYear(meta);
  if (!year) return null;

  return {
    imdbId: canonicalGuideId(meta, imdbId),
    contentType,
    tmdbId: meta.moviedb_id,
    title: meta.name,
    year,
    alternateTitles: [],
    runtimeMinutes: parseRuntimeMinutes(meta.runtime),
    directors: meta.director || [],
    poster: meta.poster,
    background: meta.background,
    genres: meta.genres || [],
    releaseDate: meta.released
  };
}

async function resolveIdentityForType(imdbId: string, contentType: GuideContentType): Promise<Identity | null> {
  for (const base of config.cinemetaBases) {
    try {
      const payload = await fetchJson<CinemetaMeta>(`${base}/meta/${contentType}/${imdbId}.json`);
      const identity = normalizeCinemetaMeta(payload, imdbId, contentType);
      if (identity) return identity;
    } catch {
      continue;
    }
  }

  return null;
}

export async function resolveIdentity(
  imdbId: string,
  options: { typeHint?: GuideContentType } = {}
): Promise<Identity | null> {
  const order: GuideContentType[] = options.typeHint
    ? [options.typeHint, ...(options.typeHint === "movie" ? ["series"] : ["movie"])]
    : ["movie", "series"];

  for (const contentType of order) {
    const identity = await resolveIdentityForType(imdbId, contentType);
    if (identity) return identity;
  }

  return null;
}
