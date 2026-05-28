import { baseUrlFromRequest, streamResponseForGuide } from "./responseFormatters.ts";
import { parseStreamTarget } from "./requestTarget.ts";
import type { SourceAdapter, SourceRuntime } from "../types/sources.ts";
import { getOrCreateGuide } from "../core/guideBuilder.ts";
import type { StreamResponse } from "../types/stremio.ts";

export async function handleStream(
  type: string,
  id: string,
  adapters: SourceAdapter[],
  runtime: SourceRuntime,
  host?: string,
  proto?: string
): Promise<StreamResponse> {
  const target = parseStreamTarget(type, id);
  if (!target) {
    return { streams: [] };
  }

  const guide = await getOrCreateGuide(target.imdbId, adapters, runtime, {
    typeHint: target.contentType
  });
  return streamResponseForGuide(guide, baseUrlFromRequest(host, proto));
}
