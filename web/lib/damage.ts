export interface DamageObservations {
  roofVisible: boolean;
  roofMaterial: string;
  missingShingles: boolean;
  exposedDecking: boolean;
  structuralDeformation: boolean;
  debrisPresent: boolean;
  waterDamageVisible: boolean;
  confidence: number;
  notes: string;
}

export function computeDamageScore(o: DamageObservations): number {
  if (!o.roofVisible) return 0;

  let score = 0;
  if (o.missingShingles) score += 30;
  if (o.exposedDecking) score += 30;
  if (o.structuralDeformation) score += 40;
  if (o.debrisPresent) score += 10;
  if (o.waterDamageVisible) score += 15;

  score = Math.min(score, 100);

  if (o.confidence < 0.5) score = Math.round(score * 0.7);

  return score;
}

// Severity-based fraction of the coverage limit, minus the deductible.
// Returns mUSDC base units (6 decimals). Never negative.
export function computePayout(
  score: number,
  coverageLimitUsd: number,
  deductibleUsd: number = 0
): bigint {
  let fraction = 0;
  if (score >= 80) fraction = 1.0;
  else if (score >= 60) fraction = 0.6;
  else if (score >= 40) fraction = 0.3;
  else fraction = 0;

  let usd = coverageLimitUsd * fraction;

  // apply deductible only if there's a payout
  if (usd > 0) {
    usd = Math.max(0, usd - deductibleUsd);
  }

  return BigInt(Math.round(usd * 1_000_000));
}
