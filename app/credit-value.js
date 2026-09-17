export const CREDIT_UNIT = 10_000;

export function migrateLegacyCreditSettings(value) {
  const next = { ...value };
  const currentValue = next.creditValuePer10000;
  const legacyValue = next.creditValuePer1000;
  const hasValidCurrentValue = typeof currentValue === "number" && Number.isFinite(currentValue) && currentValue >= 0;
  const hasValidLegacyValue = typeof legacyValue === "number" && Number.isFinite(legacyValue) && legacyValue >= 0;

  if (!hasValidCurrentValue && hasValidLegacyValue) {
    next.creditValuePer10000 = Math.round(legacyValue * 10 * 1e12) / 1e12;
  }
  return next;
}

export function canonicalizeTimestamp(value) {
  if (typeof value !== "string") return value;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : value;
}

/**
 * Calculates the optional credit value for the overall purchase plan.
 * Product-level efficiency calculations intentionally do not use this helper.
 *
 * @param {{
 *   totalCashUsed: number;
 *   baseRecoveryEok: number;
 *   earnRate: number;
 *   valuePer10000: number;
 *   includeCreditValue: boolean;
 * }} input
 */
export function calculateCreditSummary(input) {
  const totalCashUsed = nonNegative(input.totalCashUsed);
  const baseRecoveryEok = nonNegative(input.baseRecoveryEok);
  const earnRate = nonNegative(input.earnRate);
  const valuePer10000 = nonNegative(input.valuePer10000);
  const earnedCredit = totalCashUsed * earnRate;
  const creditValueEok = (earnedCredit / CREDIT_UNIT) * valuePer10000;
  const appliedCreditValueEok = input.includeCreditValue ? creditValueEok : 0;

  return {
    earnedCredit,
    creditValueEok,
    appliedCreditValueEok,
    finalRecoveryEok: baseRecoveryEok + appliedCreditValueEok,
  };
}

function nonNegative(value) {
  return Number.isFinite(value) ? Math.max(value, 0) : 0;
}
