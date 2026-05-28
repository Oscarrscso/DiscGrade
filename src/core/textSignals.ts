import type { Warning, WarningSeverity, WarningType } from "../types/discGuide.ts";

type Signal = {
  patterns: RegExp[];
  type: WarningType;
  severity: WarningSeverity;
  message: string;
};

const warningSignals: Signal[] = [
  {
    patterns: [/\bDNR\b/i, /noise reduction/i, /waxy/i, /scrubbed grain/i],
    type: "DNR",
    severity: "high",
    message: "Evidence suggests heavy digital noise reduction or scrubbed grain."
  },
  {
    patterns: [/AI upscale/i, /AI upscal/i],
    type: "AI_UPSCALE",
    severity: "high",
    message: "Evidence suggests AI upscaling rather than a strong native master."
  },
  {
    patterns: [/poor encode/i, /bad encode/i, /compression artifacts/i, /macroblocking/i, /banding/i],
    type: "POOR_ENCODE",
    severity: "high",
    message: "Evidence suggests compression or encode problems."
  },
  {
    patterns: [/revisionist color/i, /green tint/i, /teal push/i, /wrong aspect ratio/i],
    type: "REVISIONIST_COLOR",
    severity: "medium",
    message: "Evidence suggests color timing or framing concerns."
  },
  {
    patterns: [/worse than blu-?ray/i, /inferior to the bd/i],
    type: "WORSE_THAN_BD",
    severity: "high",
    message: "A newer edition may be worse than an older Blu-ray."
  },
  {
    patterns: [/missing original audio/i, /lossy only/i, /sync issues/i, /downmix/i, /forced dub/i],
    type: "BAD_AUDIO",
    severity: "medium",
    message: "Audio options look compromised compared with better editions."
  },
  {
    patterns: [/missing cut/i, /censored/i, /tv version only/i],
    type: "MISSING_CUT",
    severity: "high",
    message: "An important cut or version may be missing."
  },
  {
    patterns: [/region [abc] \(locked\)/i, /region [abc] locked/i, /locked\)/i],
    type: "REGION_LOCKED",
    severity: "medium",
    message: "This edition appears to be region locked."
  },
  {
    patterns: [/defective disc/i, /replacement program/i, /replacement programme/i],
    type: "DEFECTIVE_PRESSING",
    severity: "high",
    message: "Reports suggest a defective pressing or replacement-disc issue."
  }
];

const badgeSignals: Array<{ pattern: RegExp; badge: string }> = [
  { pattern: /Dolby Vision/i, badge: "Dolby Vision" },
  { pattern: /HDR10\+/i, badge: "HDR10+" },
  { pattern: /\bHDR10\b/i, badge: "HDR10" },
  { pattern: /Atmos/i, badge: "Atmos" },
  { pattern: /DTS:X/i, badge: "DTS:X" },
  { pattern: /LPCM/i, badge: "LPCM" },
  { pattern: /DTS-HD MA/i, badge: "DTS-HD MA" },
  { pattern: /Dolby TrueHD/i, badge: "Dolby TrueHD" },
  { pattern: /original mono/i, badge: "Original Mono" },
  { pattern: /original stereo/i, badge: "Original Stereo" },
  { pattern: /new 4K restoration/i, badge: "4K Restoration" },
  { pattern: /native 4K scan/i, badge: "Native 4K Scan" },
  { pattern: /original camera negative|\bOCN\b/i, badge: "OCN Scan" }
];

export function extractWarnings(texts: string[], evidenceUrl: string, affectedEdition?: string): Warning[] {
  const joined = texts.join("\n");
  return warningSignals
    .filter((signal) => signal.patterns.some((pattern) => pattern.test(joined)))
    .map((signal) => ({
      type: signal.type,
      severity: signal.severity,
      message: signal.message,
      affectedEditions: affectedEdition ? [affectedEdition] : undefined,
      evidenceUrls: [evidenceUrl]
    }));
}

export function extractBadges(texts: string[]): string[] {
  const joined = texts.join("\n");
  return badgeSignals
    .filter((signal) => signal.pattern.test(joined))
    .map((signal) => signal.badge);
}
