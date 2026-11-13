export type Gender = "Male" | "Female" | "Other";
export type Country = "USA" | "India" | "Brazil" | "UK" | "Canada" | "Australia" | "Germany";
export type Platform = "Instagram" | "TikTok" | "YouTube" | "Twitter" | "Snapchat";
export type Purpose =
  | "Entertainment"
  | "Socializing"
  | "Education"
  | "News"
  | "Content Creation";
export type Addiction = "Low" | "Medium" | "High";

export interface RecordData {
  id: number;
  age: number;
  gender: Gender;
  country: Country;
  primary_platform: Platform;
  purpose: Purpose;
  num_platforms_used: number;
  daily_usage_hours: number;
  avg_session_minutes: number;
  night_usage: 0 | 1;
  screen_time_before_sleep: number;
  mental_health_score: number;
  addiction_level: Addiction;
}

export interface Filters {
  age: [number, number];
  gender: Gender[];
  country: Country[];
  platform: Platform[];
  purpose: Purpose[];
  addiction: Addiction[];
  night: "All" | "Yes" | "No";
  usage: [number, number];
  numPlatforms: [number, number];
}

export const genders: Gender[] = ["Male", "Female", "Other"];
export const countries: Country[] = [
  "USA",
  "India",
  "Brazil",
  "UK",
  "Canada",
  "Australia",
  "Germany",
];
export const platforms: Platform[] = ["Instagram", "TikTok", "YouTube", "Twitter", "Snapchat"];
export const purposes: Purpose[] = [
  "Entertainment",
  "Socializing",
  "Education",
  "News",
  "Content Creation",
];
export const addictions: Addiction[] = ["Low", "Medium", "High"];
export const defaultFilters: Filters = {
  age: [14, 26],
  gender: [],
  country: [],
  platform: [],
  purpose: [],
  addiction: [],
  night: "All",
  usage: [0, 8],
  numPlatforms: [1, 5],
};

export function filterRecords(records: RecordData[], f: Filters) {
  const ageRangeActive =
    f.age[0] !== defaultFilters.age[0] || f.age[1] !== defaultFilters.age[1];
  const usageRangeActive =
    f.usage[0] !== defaultFilters.usage[0] || f.usage[1] !== defaultFilters.usage[1];
  const platformRangeActive =
    f.numPlatforms[0] !== defaultFilters.numPlatforms[0] ||
    f.numPlatforms[1] !== defaultFilters.numPlatforms[1];
  return records.filter(
    (r) =>
      (!ageRangeActive || (r.age >= f.age[0] && r.age <= f.age[1])) &&
      (!usageRangeActive ||
        (r.daily_usage_hours >= f.usage[0] && r.daily_usage_hours <= f.usage[1])) &&
      (!platformRangeActive ||
        (r.num_platforms_used >= f.numPlatforms[0] &&
          r.num_platforms_used <= f.numPlatforms[1])) &&
      (!f.gender.length || f.gender.includes(r.gender)) &&
      (!f.country.length || f.country.includes(r.country)) &&
      (!f.platform.length || f.platform.includes(r.primary_platform)) &&
      (!f.purpose.length || f.purpose.includes(r.purpose)) &&
      (!f.addiction.length || f.addiction.includes(r.addiction_level)) &&
      (f.night === "All" || (f.night === "Yes" ? r.night_usage === 1 : r.night_usage === 0)),
  );
}

export function groupBy<T, K extends PropertyKey>(records: T[], getter: (record: T) => K) {
  return records.reduce(
    (groups, record) => {
      const key = getter(record);
      (groups[key] ||= []).push(record);
      return groups;
    },
    {} as Record<K, T[]>,
  );
}

export function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

export function percentage(part: number, total: number) {
  return total ? (part / total) * 100 : 0;
}

export function correlation(x: number[], y: number[]) {
  if (!x.length || x.length !== y.length) return 0;
  const ax = average(x);
  const ay = average(y);
  let numerator = 0;
  let dx = 0;
  let dy = 0;
  x.forEach((value, index) => {
    numerator += (value - ax) * (y[index] - ay);
    dx += (value - ax) ** 2;
    dy += (y[index] - ay) ** 2;
  });
  return dx && dy ? numerator / Math.sqrt(dx * dy) : 0;
}

export function histogramBins(values: number[], count = 8) {
  if (!values.length) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min || 1) / count;
  return Array.from({ length: count }, (_, index) => {
    const start = min + index * width;
    const end = index === count - 1 ? max + 0.001 : start + width;
    const value = values.filter((item) => item >= start && item < end).length;
    return { name: `${start.toFixed(1)}–${Math.min(end, max).toFixed(1)}`, value, start, end };
  });
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function stdDev(values: number[]) {
  if (!values.length) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

export function percentile(values: number[], target: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * target))];
}
