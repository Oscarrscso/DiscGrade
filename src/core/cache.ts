import fs from "node:fs/promises";
import path from "node:path";

import { config } from "./config.ts";
import type { DiscGuide } from "../types/discGuide.ts";

function cachePath(imdbId: string): string {
  return path.join(config.guideCacheDir, `${imdbId}.json`);
}

export async function ensureCacheDirs(): Promise<void> {
  await fs.mkdir(config.guideCacheDir, { recursive: true });
}

export async function loadGuide(imdbId: string): Promise<DiscGuide | null> {
  try {
    const file = await fs.readFile(cachePath(imdbId), "utf8");
    return JSON.parse(file) as DiscGuide;
  } catch {
    return null;
  }
}

export async function loadFreshGuide(imdbId: string): Promise<DiscGuide | null> {
  const guide = await loadGuide(imdbId);
  if (!guide) return null;

  const updatedAt = new Date(guide.lastUpdated).getTime();
  const ttlMs = config.cacheTtlDays * 24 * 60 * 60 * 1000;
  if (Date.now() - updatedAt > ttlMs) return null;

  return guide;
}

export async function saveGuide(guide: DiscGuide): Promise<void> {
  await ensureCacheDirs();
  await fs.writeFile(cachePath(guide.imdbId), JSON.stringify(guide, null, 2), "utf8");
}
