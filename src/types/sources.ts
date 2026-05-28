import type { Identity, MatchMethod, SourceEvidence } from "./discGuide.ts";

export interface SourceSearchResult {
  url: string;
  title: string;
  year?: number;
  country?: string;
  matchedBy: MatchMethod;
  confidence: number;
}

export interface SourceRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  onTiming?: (timing: SourceRequestTiming) => void;
}

export interface SourceRequestTiming {
  queueWaitMs: number;
  networkMs: number;
  totalMs: number;
}

export interface SourceRuntime {
  fetchText: (url: string, init?: SourceRequestInit) => Promise<string>;
}

export interface SourceAdapter {
  name: string;
  priority: number;
  maxResults?: number;
  canHandle(identity: Identity): boolean;
  search(identity: Identity, runtime: SourceRuntime): Promise<SourceSearchResult[]>;
  parse(page: string, identity: Identity, result: SourceSearchResult): Promise<SourceEvidence | null>;
}
