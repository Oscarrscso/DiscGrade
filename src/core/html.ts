import type { Identity, MatchMethod } from "../types/discGuide.ts";

const entityMap: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: "\"",
  nbsp: " ",
  hellip: "...",
  ndash: "-",
  mdash: "-",
  rsquo: "'",
  lsquo: "'",
  ldquo: "\"",
  rdquo: "\"",
  eacute: "e",
  egrave: "e",
  euml: "e",
  agrave: "a",
  aacute: "a",
  uuml: "u",
  ouml: "o"
};

export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (_, entity) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return entityMap[entity] ?? "";
  });
}

export function stripTags(input: string): string {
  return normalizeWhitespace(
    decodeHtmlEntities(
      input
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function toAbsoluteUrl(url: string, base: string): string {
  return new URL(url, base).toString();
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function parseRuntimeMinutes(input?: string): number | undefined {
  if (!input) return undefined;
  const match = input.match(/(\d+)\s*min/i);
  return match ? Number(match[1]) : undefined;
}

export function extractYear(input?: string): number | undefined {
  if (!input) return undefined;
  const match = input.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : undefined;
}

export function normalizeTitle(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(4k|uhd|blu-ray|bluray|dvd|criterion collection|60th anniversary restoration|50th anniversary edition|digibook|digipack)\b/g, " ")
    .replace(/\b(the|a|an)\b/g, " ")
    .replace(/aka/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function comparableTitle(input: string): string {
  return normalizeTitle(input).replace(/\b(19|20)\d{2}\b/g, " ").replace(/\s+/g, " ").trim();
}

function titleVariantsFromCandidate(title: string): string[] {
  const decoded = decodeHtmlEntities(title);
  const variants = [decoded];

  const akaSplit = decoded.split(/\bAKA\b/i).map((part) => part.trim()).filter(Boolean);
  variants.push(...akaSplit);

  const articleFlip = decoded.match(/^(.+?)\s+\((The|A|An)\)$/i);
  if (articleFlip) {
    variants.push(`${articleFlip[2]} ${articleFlip[1]}`);
  }

  const articleBeforeSubtitle = decoded.match(/^(.+?)\s+\((The|A|An)\)(:.*)$/i);
  if (articleBeforeSubtitle) {
    variants.push(`${articleBeforeSubtitle[2]} ${articleBeforeSubtitle[1]}${articleBeforeSubtitle[3]}`);
  }

  const strippedDescriptors = decoded.replace(/\((?!19|20)\d{2}[^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  variants.push(strippedDescriptors);

  return unique(variants.filter(Boolean));
}

export function matchIdentityTitle(
  identity: Identity,
  candidateTitle: string,
  candidateYear?: number
): { confidence: number; matchedBy: MatchMethod } {
  const titles = unique([
    identity.title,
    identity.originalTitle || "",
    ...identity.alternateTitles
  ].filter(Boolean));
  const candidateVariants = titleVariantsFromCandidate(candidateTitle);

  const normalizedCandidates = candidateVariants.map(comparableTitle);
  const normalizedTargets = titles.map(comparableTitle);

  const yearDelta =
    candidateYear === undefined ? 0 : Math.abs((identity.year ?? candidateYear) - candidateYear);

  for (const candidate of normalizedCandidates) {
    if (normalizedTargets.includes(candidate)) {
      return {
        confidence: yearDelta <= 1 ? 0.98 : 0.85,
        matchedBy: yearDelta <= 1 ? "title_year" : "fuzzy"
      };
    }
  }

  let bestOverlap = 0;
  for (const candidate of normalizedCandidates) {
    const candidateTokens = candidate.split(" ").filter(Boolean);
    const candidateSet = new Set(candidateTokens);

    for (const target of normalizedTargets) {
      const targetTokens = target.split(" ").filter(Boolean);
      const targetSet = new Set(targetTokens);
      const shared = targetTokens.filter((token) => candidateSet.has(token)).length;
      const union = new Set([...candidateSet, ...targetSet]).size || 1;
      const overlap = shared / union;
      bestOverlap = Math.max(bestOverlap, overlap);
    }
  }

  if (bestOverlap >= 0.75 && yearDelta <= 1) {
    return { confidence: 0.72, matchedBy: "fuzzy" };
  }

  return { confidence: 0.2, matchedBy: "fuzzy" };
}

export function extractJsonLdObjects(html: string): unknown[] {
  const matches = [...html.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
  const results: unknown[] = [];

  for (const match of matches) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    try {
      results.push(JSON.parse(raw));
    } catch {
      continue;
    }
  }

  return results;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function titleCase(input: string): string {
  return input.replace(/\w\S*/g, (word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase());
}
