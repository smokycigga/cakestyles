export const DEFAULT_LOYALTY_SETTINGS = Object.freeze({
  enabled: true,
  earnPerRupee: 0.01,
  redemptionValue: 1,
  minRedeem: 100,
  tierThresholds: Object.freeze([
    Object.freeze({ name: "bronze", minPoints: 0 }),
    Object.freeze({ name: "silver", minPoints: 500 }),
    Object.freeze({ name: "gold", minPoints: 1500 }),
  ]),
});

const finiteNonNegative = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

export const normalizeLoyaltySettings = (settings = {}) => ({
  enabled: settings.enabled ?? DEFAULT_LOYALTY_SETTINGS.enabled,
  earnPerRupee: finiteNonNegative(settings.earnPerRupee, DEFAULT_LOYALTY_SETTINGS.earnPerRupee),
  redemptionValue: finiteNonNegative(settings.redemptionValue, DEFAULT_LOYALTY_SETTINGS.redemptionValue),
  minRedeem: Math.max(0, Math.ceil(finiteNonNegative(settings.minRedeem, DEFAULT_LOYALTY_SETTINGS.minRedeem))),
  tierThresholds: Array.isArray(settings.tierThresholds) && settings.tierThresholds.length
    ? settings.tierThresholds
        .filter((tier) => tier && String(tier.name || "").trim())
        .map((tier) => ({
          name: String(tier.name).trim().toLowerCase(),
          minPoints: Math.max(0, Math.floor(finiteNonNegative(tier.minPoints, 0))),
        }))
    : DEFAULT_LOYALTY_SETTINGS.tierThresholds.map((tier) => ({ ...tier })),
});

export const calculateEarnPoints = (rupees, earnPerRupee = DEFAULT_LOYALTY_SETTINGS.earnPerRupee) => {
  const amount = finiteNonNegative(rupees, 0);
  const rate = finiteNonNegative(earnPerRupee, 0);
  return Math.floor(amount * rate + Number.EPSILON);
};

export const calculateRedemptionValue = (
  points,
  redemptionValue = DEFAULT_LOYALTY_SETTINGS.redemptionValue
) => {
  const validPoints = Math.max(0, Math.floor(finiteNonNegative(points, 0)));
  const value = finiteNonNegative(redemptionValue, 0);
  return Math.round((validPoints * value + Number.EPSILON) * 100) / 100;
};

export const calculateTier = (totalEarned, tierThresholds = DEFAULT_LOYALTY_SETTINGS.tierThresholds) => {
  const earned = Math.max(0, finiteNonNegative(totalEarned, 0));
  const tiers = normalizeLoyaltySettings({ tierThresholds }).tierThresholds
    .sort((left, right) => left.minPoints - right.minPoints);

  return tiers.reduce(
    (current, tier) => (earned >= tier.minPoints ? tier.name : current),
    tiers[0]?.name || "bronze"
  );
};

export const shouldAwardForStatusTransition = ({
  previousStatus,
  nextStatus,
  loyaltyAwarded = false,
  enabled = true,
  customer,
  points,
}) => previousStatus !== "completed"
  && nextStatus === "completed"
  && !loyaltyAwarded
  && enabled
  && Boolean(customer)
  && points > 0;

export const validateRedemption = ({ points, balance, minRedeem, enabled = true }) => {
  if (!enabled) return "Loyalty rewards are disabled";
  if (!Number.isInteger(points) || points <= 0) return "Points must be a positive integer";
  if (points < minRedeem) return `A minimum of ${minRedeem} points is required`;
  if (points > balance) return "Insufficient loyalty points";
  return null;
};

