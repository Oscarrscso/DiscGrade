export interface ManifestResource {
  name: "meta" | "stream";
  types: string[];
  idPrefixes?: string[];
}

export interface AddonManifest {
  id: string;
  version: string;
  name: string;
  description: string;
  resources: ManifestResource[];
  types: string[];
  catalogs: unknown[];
  behaviorHints?: Record<string, unknown>;
}

export interface MetaLink {
  name: string;
  category: string;
  url: string;
}

export interface StremioMeta {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  background?: string;
  description: string;
  runtime?: string;
  releaseInfo?: string;
  links?: MetaLink[];
  behaviorHints?: Record<string, unknown>;
}

export interface StreamItem {
  name: string;
  title: string;
  description?: string;
  externalUrl: string;
  behaviorHints?: Record<string, unknown>;
}

export interface MetaResponse {
  meta: StremioMeta | null;
}

export interface StreamResponse {
  streams: StreamItem[];
}
