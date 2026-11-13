import {
  average,
  percentile,
  stdDev as calculateStdDev,
  type Addiction,
  type Country,
  type Gender,
  type Platform,
  type Purpose,
  type RecordData,
} from "../data/data";

export interface SimulatorProfile {
  age: number;
  gender: Gender;
  country: Country;
  platform: Platform;
  purpose: Purpose;
  dailyUsage: number;
  platformsUsed: number;
  sessionMinutes: number;
  nightUsage: 0 | 1;
  beforeSleep: number;
}

export interface SimulationResult {
  rangeLow: number;
  rangeHigh: number;
  median: number;
  likelyLevel: Addiction;
  split: { low: number; medium: number; high: number };
  confidence: "High" | "Medium" | "Low";
  neighborCount: number;
  avgDistance: number;
  stdDev: number;
}

const numericRanges = {
  age: [14, 26],
  dailyUsage: [0.5, 8],
  platformsUsed: [1, 5],
  sessionMinutes: [5, 45],
  beforeSleep: [0, 75],
} as const;

const weights = {
  dailyUsage: 0.18,
  beforeSleep: 0.14,
  platformsUsed: 0.12,
  nightUsage: 0.1,
  sessionMinutes: 0.08,
  age: 0.06,
  platform: 0.12,
  purpose: 0.1,
  country: 0.06,
  gender: 0.04,
} as const;

export const simulatorWeights = weights;

function normalize(value: number, [min, max]: readonly [number, number]) {
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

function squaredDifference(a: number, b: number) {
  return (a - b) ** 2;
}

/**
 * Prototype-only weighted nearest-neighbor estimator.
 * Kept pure and separate so a validated trained model can replace it later
 * without changing any presentation components.
 */
export function runSimulation(profile: SimulatorProfile, records: RecordData[]): SimulationResult {
  if (!records.length) throw new Error("No records are available for matching.");

  const profileNumeric = {
    age: normalize(profile.age, numericRanges.age),
    dailyUsage: normalize(profile.dailyUsage, numericRanges.dailyUsage),
    platformsUsed: normalize(profile.platformsUsed, numericRanges.platformsUsed),
    sessionMinutes: normalize(profile.sessionMinutes, numericRanges.sessionMinutes),
    beforeSleep: normalize(profile.beforeSleep, numericRanges.beforeSleep),
  };

  const ranked = records
    .map((record) => {
      const distance = Math.sqrt(
        weights.dailyUsage *
          squaredDifference(
            profileNumeric.dailyUsage,
            normalize(record.daily_usage_hours, numericRanges.dailyUsage),
          ) +
          weights.beforeSleep *
            squaredDifference(
              profileNumeric.beforeSleep,
              normalize(record.screen_time_before_sleep, numericRanges.beforeSleep),
            ) +
          weights.platformsUsed *
            squaredDifference(
              profileNumeric.platformsUsed,
              normalize(record.num_platforms_used, numericRanges.platformsUsed),
            ) +
          weights.nightUsage * squaredDifference(profile.nightUsage, record.night_usage) +
          weights.sessionMinutes *
            squaredDifference(
              profileNumeric.sessionMinutes,
              normalize(record.avg_session_minutes, numericRanges.sessionMinutes),
            ) +
          weights.age *
            squaredDifference(profileNumeric.age, normalize(record.age, numericRanges.age)) +
          (record.primary_platform !== profile.platform ? weights.platform : 0) +
          (record.purpose !== profile.purpose ? weights.purpose : 0) +
          (record.country !== profile.country ? weights.country : 0) +
          (record.gender !== profile.gender ? weights.gender : 0),
      );
      return { record, distance };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.min(100, records.length));

  const scores = ranked.map(({ record }) => record.mental_health_score);
  const counts = ranked.reduce(
    (result, { record }) => {
      result[record.addiction_level.toLowerCase() as keyof typeof result] += 1;
      return result;
    },
    { low: 0, medium: 0, high: 0 },
  );
  const likelyLevel = (Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0][0][0]
    .toUpperCase() +
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0]
      .slice(1)) as Addiction;
  const avgDistance = average(ranked.map(({ distance }) => distance));
  const stdDev = calculateStdDev(scores);
  let confidence: SimulationResult["confidence"] =
    avgDistance < 0.2 && stdDev < 0.9
      ? "High"
      : avgDistance < 0.35 || stdDev < 1.3
        ? "Medium"
        : "Low";
  if (ranked.length < 30) confidence = "Low";

  return {
    rangeLow: percentile(scores, 0.25),
    rangeHigh: percentile(scores, 0.75),
    median: percentile(scores, 0.5),
    likelyLevel,
    split: counts,
    confidence,
    neighborCount: ranked.length,
    avgDistance,
    stdDev,
  };
}
