export type DiscFormat = "4K UHD" | "Blu-ray" | "DVD" | "Digital" | "Unknown";

export type Resolution = "2160p" | "1080p" | "576p" | "480p" | "Unknown";

export type HdrFormat = "HDR10" | "HDR10+" | "Dolby Vision" | "SDR";

export type WarningType =
  | "DNR"
  | "AI_UPSCALE"
  | "POOR_ENCODE"
  | "REVISIONIST_COLOR"
  | "WORSE_THAN_BD"
  | "BAD_AUDIO"
  | "MISSING_CUT"
  | "REGION_LOCKED"
  | "DEFECTIVE_PRESSING"
  | "OTHER";

export type WarningSeverity = "low" | "medium" | "high";

export type MatchMethod = "imdb" | "tmdb" | "title_year" | "fuzzy" | "manual_url";

export type ConfidenceLabel = "Low" | "Medium" | "High";

export type ClaimType =
  | "BEST_OVERALL"
  | "BEST_VIDEO"
  | "BEST_AUDIO"
  | "BEST_ENGLISH_FRIENDLY"
  | "BEST_EXTRAS"
  | "CUT_INFO"
  | "WARNING"
  | "SPECS"
  | "REVIEW_SCORE"
  | "SCREENSHOT_COMPARISON";

export type StreamingOfferType = "stream" | "rent" | "buy";
export type GuideContentType = "movie" | "series";

export interface StreamingProviderOption {
  provider: string;
  url: string;
}

export interface StreamingAvailability {
  region: string;
  stream: StreamingProviderOption[];
  rent: StreamingProviderOption[];
  buy: StreamingProviderOption[];
}

export interface Identity {
  imdbId: string;
  contentType: GuideContentType;
  tmdbId?: number;
  title: string;
  originalTitle?: string;
  year: number;
  alternateTitles: string[];
  runtimeMinutes?: number;
  directors: string[];
  poster?: string;
  background?: string;
  genres?: string[];
  releaseDate?: string;
}

export interface VideoInfo {
  resolution?: Resolution;
  hdr?: HdrFormat[];
  codec?: "HEVC" | "AVC" | "MPEG-2" | "Unknown";
  aspectRatio?: string;
  scanSource?: string;
  transferNotes?: string[];
  encodeNotes?: string[];
  knownIssues?: string[];
}

export interface AudioInfo {
  language: string;
  format: string;
  channels?: string;
  atmos?: boolean;
  dtsX?: boolean;
  lossless?: boolean;
  notes?: string[];
}

export interface CutInfo {
  name: string;
  runtimeMinutes?: number;
  description?: string;
  isPreferred?: boolean;
  notes?: string[];
}

export interface CommentaryTrack {
  description: string;
  participants?: string[];
}

export interface EditionScore {
  overall: number;
  video: number;
  audio: number;
  cuts: number;
  extras: number;
  englishFriendly: number;
  region: number;
  notes: string[];
}

export interface Edition {
  id: string;
  title: string;
  label?: string;
  country?: string;
  region?: string;
  format: DiscFormat;
  releaseYear?: number;
  releaseDate?: string;
  upc?: string;
  video?: VideoInfo;
  audio?: AudioInfo[];
  cuts?: CutInfo[];
  commentaryTracks?: CommentaryTrack[];
  extras?: string[];
  notes?: string[];
  badges?: string[];
  sourceUrls: string[];
  score?: EditionScore;
}

export interface EditionPick {
  editionId: string;
  editionTitle: string;
  reason?: string;
  sourceUrl?: string;
}

export interface GuideVerdict {
  bestOverall?: EditionPick;
  bestVideo?: EditionPick;
  bestAudio?: EditionPick;
  bestEnglishFriendly?: EditionPick;
  bestBudget?: EditionPick;
  bestExtras?: EditionPick;
  recommendedCut?: string;
  shortSummary: string;
}

export interface Warning {
  type: WarningType;
  severity: WarningSeverity;
  message: string;
  affectedEditions?: string[];
  evidenceUrls: string[];
}

export interface ExtractedClaim {
  claimType: ClaimType;
  text: string;
  normalizedValue?: string;
  editionHint?: string;
  confidence: number;
}

export interface PartialEdition {
  key?: string;
  title: string;
  label?: string;
  country?: string;
  region?: string;
  format?: DiscFormat;
  releaseYear?: number;
  releaseDate?: string;
  video?: VideoInfo;
  audio?: AudioInfo[];
  cuts?: CutInfo[];
  commentaryTracks?: CommentaryTrack[];
  extras?: string[];
  notes?: string[];
  badges?: string[];
  sourceUrls?: string[];
}

export interface ParsedSourceData {
  bestOverall?: string;
  bestVideo?: string;
  bestAudio?: string;
  bestEnglishFriendly?: string;
  bestExtras?: string;
  recommendedCut?: string;
  editions?: PartialEdition[];
  reviewScores?: Partial<Record<"video" | "audio" | "extras" | "overall", number>>;
  streamingAvailability?: StreamingAvailability;
  warnings?: Warning[];
  notes?: string[];
  rawSummary?: string;
}

export interface SourceEvidence {
  sourceName: string;
  url: string;
  fetchedAt: string;
  matchedBy: MatchMethod;
  confidence: number;
  extractedClaims: ExtractedClaim[];
  parsed?: ParsedSourceData;
}

export interface ConfidenceResult {
  score: number;
  label: ConfidenceLabel;
  reasons: string[];
}

export interface GuideDebugEvent {
  name: string;
  durationMs: number;
  status?: "ok" | "skipped" | "error" | "cache_hit" | "cache_miss";
  detail?: string;
}

export interface GuideDebugInfo {
  cache: "hit" | "miss" | "refresh" | "not_found";
  generatedAt: string;
  totalMs: number;
  events: GuideDebugEvent[];
}

export interface DiscGuide {
  imdbId: string;
  contentType?: GuideContentType;
  tmdbId?: number;
  title: string;
  year: number;
  resolvedAt: string;
  lastUpdated: string;
  verdict: GuideVerdict;
  editions: Edition[];
  warnings: Warning[];
  sources: SourceEvidence[];
  confidence: ConfidenceResult;
  conflictNotes?: string[];
  poster?: string;
  background?: string;
  directors?: string[];
  status: "ok" | "partial" | "not_found";
  debug?: GuideDebugInfo;
}
