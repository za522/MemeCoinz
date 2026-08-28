import taxonomy from "./taxonomy.json";

export const COHORT_METADATA_FEATURE_SET_VERSION = "cohort-metadata-narrative-v1";

export type NarrativeTheme = keyof typeof taxonomy.themes | "other";

export interface MetadataNarrativeInput {
  name: string | null;
  symbol: string | null;
  descriptionLength: number;
  hasX: boolean;
  hasWebsite: boolean;
  hasTelegram: boolean;
}

export interface MetadataNarrativeClassification {
  normalizedName: string;
  normalizedSymbol: string;
  narrativeTheme: NarrativeTheme;
  narrativeTokens: string[];
  themeConfidence0To100: number;
  metadataCompleteness0To100: number;
  socialLinkCount: number;
}

export function normalizeNarrativeText(value: string | null): string {
  return (value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function classifyMetadataNarrative(
  input: MetadataNarrativeInput,
): MetadataNarrativeClassification {
  const normalizedName = normalizeNarrativeText(input.name);
  const normalizedSymbol = normalizeNarrativeText(input.symbol).replaceAll(" ", "");
  const searchable = ` ${normalizedName} ${normalizedSymbol} `;
  const compactName = normalizedName.replaceAll(" ", "");
  const scored = Object.entries(taxonomy.themes).map(([theme, keywords]) => {
    const matches = keywords.filter((keyword) => {
      const normalized = normalizeNarrativeText(keyword);
      return searchable.includes(` ${normalized} `) ||
        normalizedSymbol.includes(normalized) ||
        (normalized.length >= 3 && compactName.includes(normalized));
    });
    return { theme: theme as NarrativeTheme, matches };
  }).sort((left, right) => right.matches.length - left.matches.length || left.theme.localeCompare(right.theme));
  const winner = scored[0];
  const matched = winner && winner.matches.length > 0 ? winner : null;
  const totalMatches = scored.reduce((total, row) => total + row.matches.length, 0);
  const socialLinkCount = Number(input.hasX) + Number(input.hasWebsite) + Number(input.hasTelegram);
  const completeness =
    (normalizedName ? 20 : 0) +
    (normalizedSymbol ? 15 : 0) +
    Math.min(35, Math.max(0, input.descriptionLength) / 160 * 35) +
    socialLinkCount * 10;
  return {
    normalizedName,
    normalizedSymbol,
    narrativeTheme: matched?.theme ?? "other",
    narrativeTokens: matched?.matches ?? [],
    themeConfidence0To100: matched ? Math.round((matched.matches.length / Math.max(1, totalMatches)) * 10000) / 100 : 0,
    metadataCompleteness0To100: Math.round(Math.min(100, completeness) * 100) / 100,
    socialLinkCount,
  };
}
