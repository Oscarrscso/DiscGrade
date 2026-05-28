import { baseUrlFromRequest, metaResponseForGuide, placeholderMeta } from "./responseFormatters.ts";
import { parseMetaTarget } from "./requestTarget.ts";
import type { SourceAdapter, SourceRuntime } from "../types/sources.ts";
import { getOrCreateGuide } from "../core/guideBuilder.ts";
import type { MetaResponse } from "../types/stremio.ts";

export async function handleMeta(
  type: string,
  id: string,
  adapters: SourceAdapter[],
  runtime: SourceRuntime,
  host?: string,
  proto?: string
): Promise<MetaResponse> {
  const baseUrl = baseUrlFromRequest(host, proto);
  const target = parseMetaTarget(type, id);
  if (!target) {
    return { meta: null };
  }

  const guide = await getOrCreateGuide(target.imdbId, adapters, runtime, {
    typeHint: target.contentType
  });
  if (guide.status === "not_found") {
    return placeholderMeta(target.imdbId, baseUrl, target.contentType);
  }

  return metaResponseForGuide(guide, baseUrl);
}
