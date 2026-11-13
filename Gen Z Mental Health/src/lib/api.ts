import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { RecordData } from "../data/data";

export type DashboardStatus = "loading" | "live" | "reconnecting" | "error";

export interface SummaryDocument<T = unknown> {
  data: T;
  updated_at: string;
}

export type DashboardSummaries = Record<string, SummaryDocument>;

const requiredSummaryTypes = [
  "overview",
  "distribution_age",
  "distribution_gender",
  "distribution_purpose",
  "distribution_addiction_level",
  "distribution_daily_usage_hours",
  "distribution_mental_health_score",
  "platform_summary",
  "platform_addiction_summary",
  "platform_purpose_summary",
  "country_summary",
  "addiction_summary",
  "addiction_score_summary",
  "usage_mental_health_summary",
  "night_usage_summary",
  "purpose_summary",
  "numeric_stats_summary",
  "correlation_summary",
];

interface DashboardDataValue {
  summaries: DashboardSummaries;
  samples: RecordData[];
  status: DashboardStatus;
  lastUpdated: string | null;
  error: string | null;
  retry: () => Promise<void>;
}

const DashboardDataContext = createContext<DashboardDataValue | null>(null);

async function requestJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      message = `Request failed (${response.status} ${response.statusText}).`;
    }
    throw new Error(message);
  }
  return (await response.json()) as T;
}

export async function fetchSummary(type: string): Promise<SummaryDocument> {
  return requestJson<SummaryDocument>(`/api/summary/${encodeURIComponent(type)}`);
}

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [summaries, setSummaries] = useState<DashboardSummaries>({});
  const [samples, setSamples] = useState<RecordData[]>([]);
  const [status, setStatus] = useState<DashboardStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    streamRef.current?.close();
    streamRef.current = null;
    setStatus("loading");
    setError(null);

    try {
      const [nextSummaries, nextSamples] = await Promise.all([
        requestJson<DashboardSummaries>("/api/summary"),
        requestJson<RecordData[]>("/api/samples"),
      ]);
      if (!Object.keys(nextSummaries).length) {
        throw new Error("MongoDB has no dashboard summaries yet. Run build_summary.py first.");
      }
      const missingSummaries = requiredSummaryTypes.filter((type) => !nextSummaries[type]);
      if (missingSummaries.length) {
        throw new Error(`Missing dashboard summaries: ${missingSummaries.join(", ")}.`);
      }
      if (!nextSamples.length) {
        throw new Error("MongoDB has no dashboard samples yet. Run build_summary.py first.");
      }
      setSummaries(nextSummaries);
      setSamples(nextSamples);
      setStatus("reconnecting");

      const stream = new EventSource("/api/stream");
      streamRef.current = stream;
      stream.onopen = () => {
        setError(null);
        setStatus("live");
      };
      stream.onerror = () => setStatus("reconnecting");
      stream.addEventListener("summary-updated", (event) => {
        let update: { summary_type?: string };
        try {
          update = JSON.parse((event as MessageEvent<string>).data) as {
            summary_type?: string;
          };
        } catch (streamError) {
          setError(
            streamError instanceof Error
              ? `Invalid summary update event: ${streamError.message}`
              : "Invalid summary update event.",
          );
          return;
        }
        if (!update.summary_type) {
          setError("Summary update event is missing summary_type.");
          return;
        }
        const summaryType = update.summary_type;
        void fetchSummary(summaryType)
          .then((summary) => {
            setSummaries((current) => ({ ...current, [summaryType]: summary }));
            setError(null);
          })
          .catch((updateError: unknown) => {
            setStatus("reconnecting");
            setError(
              updateError instanceof Error ? updateError.message : "Could not refresh summary.",
            );
          });
      });
    } catch (loadError) {
      setStatus("error");
      setError(loadError instanceof Error ? loadError.message : "Could not load dashboard data.");
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      streamRef.current?.close();
      streamRef.current = null;
    };
  }, [load]);

  const lastUpdated = useMemo(() => {
    const dates = Object.values(summaries)
      .map((summary) => summary.updated_at)
      .filter((value) => !Number.isNaN(Date.parse(value)));
    return dates.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  }, [summaries]);

  const value = useMemo(
    () => ({ summaries, samples, status, lastUpdated, error, retry: load }),
    [summaries, samples, status, lastUpdated, error, load],
  );

  return createElement(DashboardDataContext.Provider, { value }, children);
}

export function useDashboardData() {
  const value = useContext(DashboardDataContext);
  if (!value) {
    throw new Error("useDashboardData must be used within DashboardDataProvider");
  }
  return value;
}
