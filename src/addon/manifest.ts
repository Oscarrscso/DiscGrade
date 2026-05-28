import { config } from "../core/config.ts";
import type { AddonManifest } from "../types/stremio.ts";

export function getManifest(): AddonManifest {
  return {
    id: config.manifestId,
    version: config.version,
    name: "DiscGrade",
    description:
      "Physical media edition and quality guide for movies and TV series: best 4K, Blu-ray, cuts, audio, HDR, Dolby Vision, and Atmos.",
    resources: [
      {
        name: "meta",
        types: ["movie", "series"]
      },
      {
        name: "stream",
        types: ["movie", "series"]
      }
    ],
    types: ["movie", "series"],
    catalogs: []
  };
}
