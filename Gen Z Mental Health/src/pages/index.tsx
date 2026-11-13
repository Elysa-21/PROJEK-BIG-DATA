import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { siInstagram, siSnapchat, siTiktok, siX, siYoutube } from "simple-icons";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFilters } from "../context/FilterContext";
import {
  addictions,
  average,
  correlation,
  countries,
  groupBy,
  histogramBins,
  median,
  percentile,
  percentage,
  platforms,
  purposes,
  stdDev,
  type Addiction,
  type Country,
  type Gender,
  type Platform,
  type Purpose,
  type RecordData,
} from "../data/data";
import { useDashboardData, type DashboardSummaries } from "../lib/api";
import {
  runSimulation,
  simulatorWeights,
  type SimulationResult,
  type SimulatorProfile,
} from "../lib/simulator";
import {
  chartColors,
  ChartCard,
  DataTable,
  DataPage,
  Drawer,
  ErrorState,
  GlassCard,
  Icon,
  StatusPill,
  tooltipStyle,
} from "../components/ui";

const palette = [
  chartColors.indigo,
  chartColors.teal,
  chartColors.amber,
  chartColors.coral,
  chartColors.violet,
];
const addictionColors: Record<Addiction, string> = {
  Low: chartColors.teal,
  Medium: chartColors.amber,
  High: chartColors.coral,
};
const platformColors: Record<Platform, string> = {
  Instagram: "#d946a8",
  TikTok: "#34364b",
  YouTube: "#e5484d",
  Twitter: "#11131a",
  Snapchat: "#e9a91a",
};

const labelId = (value: string) => {
  const labels: Record<string, string> = {
    Low: "Rendah",
    Medium: "Sedang",
    High: "Tinggi",
    Male: "Laki-laki",
    Female: "Perempuan",
    Other: "Lainnya",
    Entertainment: "Hiburan",
    Socializing: "Bersosialisasi",
    Education: "Pendidikan",
    "Content Creation": "Pembuatan Konten",
    News: "Berita",
    Yes: "Ya",
    No: "Tidak",
  };
  return labels[value] || value;
};

function countData(records: RecordData[], key: keyof RecordData, order?: readonly string[]) {
  const groups = groupBy(records, (record) => String(record[key]));
  return (order || Object.keys(groups)).map((name) => ({ name, value: groups[name]?.length || 0 }));
}

interface CategorySummary {
  category: string | number;
  total: number;
  percentage?: number;
}

interface NumericSummary {
  metric: string;
  total: number;
  minimum: number;
  maximum: number;
  average: number;
  median: number;
  standard_deviation: number;
}

interface CorrelationSummary {
  x_key: keyof RecordData;
  y_key: keyof RecordData;
  correlation: number;
  slope: number;
  intercept: number;
  x_average: number;
  y_average: number;
  x_minimum: number;
  x_maximum: number;
}

function summaryRows<T>(summaries: DashboardSummaries, type: string): T[] {
  const data = summaries[type]?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

function summaryValue<T>(summaries: DashboardSummaries, type: string): T {
  return summaries[type]?.data as T;
}

function groupedHistogram(rows: CategorySummary[], binCount: number) {
  if (!rows.length) return [];
  const values = rows.map((row) => Number(row.category));
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const width = (maximum - minimum || 1) / binCount;
  return Array.from({ length: binCount }, (_, index) => {
    const start = minimum + index * width;
    const end = index === binCount - 1 ? maximum + 0.001 : start + width;
    const value = rows.reduce((total, row) => {
      const current = Number(row.category);
      return total + (current >= start && current < end ? row.total : 0);
    }, 0);
    return {
      name: `${start.toFixed(1)}–${Math.min(end, maximum).toFixed(1)}`,
      value,
      start,
      end,
    };
  });
}

function summaryHistogram(rows: CategorySummary[]) {
  return rows.map((row) => ({
    name: String(row.category),
    value: row.total,
    start: Number((row as CategorySummary & { bin_start?: number }).bin_start),
    end: Number((row as CategorySummary & { bin_end?: number }).bin_end),
  }));
}

function orderedSummaryCounts(
  rows: CategorySummary[],
  order: readonly string[],
): { name: string; value: number }[] {
  const counts = new Map(rows.map((row) => [String(row.category), row.total]));
  return order.map((name) => ({ name, value: counts.get(name) ?? 0 }));
}

function metric(records: RecordData[], key: keyof RecordData) {
  return records.map((record) => Number(record[key]));
}

function platformStats(records: RecordData[]) {
  return platforms.map((name) => {
    const rows = records.filter((record) => record.primary_platform === name);
    return {
      name,
      count: rows.length,
      usage: average(metric(rows, "daily_usage_hours")),
      mental: average(metric(rows, "mental_health_score")),
      high: percentage(rows.filter((row) => row.addiction_level === "High").length, rows.length),
    };
  });
}

function countryStats(records: RecordData[]) {
  return countries.map((name) => {
    const rows = records.filter((record) => record.country === name);
    return {
      name,
      count: rows.length,
      usage: average(metric(rows, "daily_usage_hours")),
      mental: average(metric(rows, "mental_health_score")),
      high: percentage(rows.filter((row) => row.addiction_level === "High").length, rows.length),
      night: percentage(rows.filter((row) => row.night_usage).length, rows.length),
    };
  });
}

function PlatformMark({ platform, size = 30 }: { platform: Platform; size?: number }) {
  const logos = {
    Instagram: siInstagram,
    TikTok: siTiktok,
    YouTube: siYoutube,
    Twitter: siX,
    Snapchat: siSnapchat,
  };
  const logo = logos[platform];
  return (
    <span
      className={`platform-mark platform-${platform.toLowerCase()}`}
      style={{ background: platformColors[platform], width: size, height: size }}
      title={platform === "Twitter" ? "X / Twitter" : platform}
      aria-label={`${platform} logo`}
    >
      <svg viewBox="0 0 24 24" role="img" aria-hidden="true">
        <path d={logo.path} />
      </svg>
    </span>
  );
}

function KpiCard({
  icon,
  label,
  value,
  note,
  color,
}: {
  icon: "users" | "clock" | "brain" | "alert";
  label: string;
  value: string;
  note: string;
  color: string;
}) {
  return (
    <GlassCard className="kpi">
      <div className="kpi-symbol" style={{ color, background: `${color}18` }}>
        <Icon name={icon} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <small>{note}</small>
    </GlassCard>
  );
}

function TablePreview({ rows }: { rows: RecordData[] }) {
  return (
    <ChartCard
      title="Penjelajah Responden"
      subtitle="Pratinjau langsung profil pertama yang sesuai."
      className="overview-table"
    >
      <DataTable>
        <thead>
          <tr>
            <th>Responden</th>
            <th>Platform</th>
            <th>Penggunaan</th>
            <th>Kesehatan mental</th>
            <th>Kebiasaan</th>
            <th>Malam</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 7).map((row) => (
            <tr key={row.id}>
              <td>
                <strong>#{String(row.id).padStart(3, "0")}</strong>
                <small>
                  {row.age} · {labelId(row.gender)} · {row.country}
                </small>
              </td>
              <td>
                <div className="platform-cell">
                  <PlatformMark platform={row.primary_platform} size={27} />
                  {row.primary_platform}
                </div>
              </td>
              <td>{row.daily_usage_hours.toFixed(2)} jam</td>
              <td>
                <div className="score-bar">
                  <span>{row.mental_health_score.toFixed(2)}</span>
                  <i>
                    <b style={{ width: `${row.mental_health_score * 10}%` }} />
                  </i>
                </div>
              </td>
              <td>
                <StatusPill status={row.addiction_level} />
              </td>
              <td>{row.night_usage ? "Ya" : "Tidak"}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </ChartCard>
  );
}

export function OverviewPage() {
  const { filtered, setFilters, reset, activeCount } = useFilters();
  const { summaries } = useDashboardData();
  const navigate = useNavigate();
  const unfiltered = activeCount === 0;
  const overview = summaryValue<{
    total_respondents: number;
    average_daily_usage_hours: number;
    average_mental_health_score: number;
  }>(summaries, "overview");
  const avgUsage = unfiltered
    ? overview.average_daily_usage_hours
    : average(metric(filtered, "daily_usage_hours"));
  const avgMental = unfiltered
    ? overview.average_mental_health_score
    : average(metric(filtered, "mental_health_score"));
  const highCount = unfiltered
    ? (summaryRows<{ addiction_level: Addiction; total_respondents: number }>(
        summaries,
        "addiction_summary",
      ).find((row) => row.addiction_level === "High")?.total_respondents ?? 0)
    : filtered.filter((row) => row.addiction_level === "High").length;
  const respondentCount = unfiltered ? overview.total_respondents : filtered.length;
  const high = percentage(highCount, respondentCount);
  const addiction = unfiltered
    ? summaryRows<CategorySummary>(summaries, "distribution_addiction_level").map((row) => ({
        name: String(row.category),
        value: row.total,
      }))
    : countData(filtered, "addiction_level", addictions);
  const top = unfiltered
    ? summaryRows<{
        platform: Platform;
        total_users: number;
        average_daily_usage_hours: number;
        average_mental_health_score: number;
        high_addiction_percentage: number;
      }>(summaries, "platform_summary")
        .map((row) => ({
          name: row.platform,
          count: row.total_users,
          usage: row.average_daily_usage_hours,
          mental: row.average_mental_health_score,
          high: row.high_addiction_percentage,
        }))
        .sort((left, right) => right.count - left.count)
    : platformStats(filtered).sort((left, right) => right.count - left.count);
  const bins = unfiltered
    ? summaryRows<{
        usage_hours_group: number;
        average_mental_health_score: number;
      }>(summaries, "usage_mental_health_summary").map((row) => ({
        usage: `${row.usage_hours_group} jam`,
        score: row.average_mental_health_score,
      }))
    : histogramBins(metric(filtered, "daily_usage_hours"), 8).map((bin) => {
        const rows = filtered.filter(
          (row) => row.daily_usage_hours >= bin.start && row.daily_usage_hours < bin.end,
        );
        return { usage: bin.name, score: average(metric(rows, "mental_health_score")) };
      });
  const nightRows = filtered.filter((row) => row.night_usage);
  const education = filtered.filter((row) => row.purpose === "Education");
  const nightSummary = summaryRows<{
    night_usage: 0 | 1;
    average_mental_health_score: number;
  }>(summaries, "night_usage_summary");
  const nightMentalDifference = unfiltered
    ? Math.max(
        0,
        (nightSummary.find((row) => row.night_usage === 0)?.average_mental_health_score ?? 0) -
          (nightSummary.find((row) => row.night_usage === 1)?.average_mental_health_score ?? 0),
      )
    : Math.max(
        0,
        average(
          metric(
            filtered.filter((row) => !row.night_usage),
            "mental_health_score",
          ),
        ) - average(metric(nightRows, "mental_health_score")),
      );
  const educationMentalAverage = unfiltered
    ? (summaryRows<{ purpose: Purpose; average_mental_health_score: number }>(
        summaries,
        "purpose_summary",
      ).find((row) => row.purpose === "Education")?.average_mental_health_score ?? 0)
    : average(metric(education, "mental_health_score"));
  const overallCorrelation = unfiltered
    ? (summaryRows<CorrelationSummary>(summaries, "correlation_summary").find(
        (row) => row.x_key === "daily_usage_hours" && row.y_key === "mental_health_score",
      )?.correlation ?? 0)
    : correlation(
        metric(filtered, "daily_usage_hours"),
        metric(filtered, "mental_health_score"),
      );
  return (
    <DataPage
      title="Ringkasan"
      subtitle="Gambaran lengkap perilaku media sosial dan kesejahteraan Generasi Z."
    >
      <GlassCard className="overview-hero">
        <div>
          <span className="eyebrow">
            <i /> ANALITIK KESEJAHTERAAN SOSIAL
          </span>
          <h2>GenZ Pulse</h2>
          <p>
            Jelajahi cara Generasi Z menggunakan media sosial dan kaitannya dengan kesehatan mental
            dalam satu dashboard.
          </p>
        </div>
        <div className="hero-illustration">
          <span>✦</span>
          <div className="glass-laptop">
            <i />
            <svg viewBox="0 0 100 40">
              <path d="M2 35c17-2 19-22 35-13s19 13 30-4S87 8 98 4" />
            </svg>
          </div>
          <div className="float-stat">
            <Icon name="heart" size={17} /> Kesejahteraan
          </div>
        </div>
      </GlassCard>
      <div className="kpi-row">
        <KpiCard
          icon="users"
          label="Responden"
          value={respondentCount.toLocaleString("id-ID")}
          note={unfiltered ? "seluruh responden" : "sampel tersaring"}
          color={chartColors.teal}
        />
        <KpiCard
          icon="clock"
          label="Rata-rata Penggunaan"
          value={`${avgUsage.toFixed(2)} jam`}
          note="per responden"
          color={chartColors.indigo}
        />
        <KpiCard
          icon="brain"
          label="Skor Kesehatan Mental"
          value={`${avgMental.toFixed(2)} / 10`}
          note="laporan mandiri"
          color={chartColors.violet}
        />
        <KpiCard
          icon="alert"
          label="Pola Risiko Tinggi"
          value={`${high.toFixed(1)}%`}
          note="dari kelompok saat ini"
          color={chartColors.coral}
        />
      </div>
      <div className="overview-columns">
        <div className="overview-main-column">
          <TablePreview rows={filtered} />
          <ChartCard
            title="Penggunaan vs Kesehatan Mental"
            subtitle="Rata-rata skor kesehatan mental berdasarkan durasi penggunaan."
          >
            <div className="chart-height">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={bins} margin={{ left: -18, right: 12, top: 16 }}>
                  <defs>
                    <linearGradient id="overviewArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor={chartColors.indigo} stopOpacity={0.35} />
                      <stop offset="1" stopColor={chartColors.indigo} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#8c91aa22" />
                  <XAxis dataKey="usage" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[3, 9]} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(value) => [Number(value).toFixed(2), "Skor"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke={chartColors.indigo}
                    strokeWidth={3}
                    fill="url(#overviewArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
          <GlassCard className="simulator-banner compact">
            <div className="banner-icon">
              <Icon name="heart" size={21} />
            </div>
            <div>
              <h2>Simulator Kesehatan Mental</h2>
              <p>Bandingkan profil penggunaan Anda dengan orang serupa dalam sampel.</p>
            </div>
            <button className="primary-button" onClick={() => navigate("/simulator")}>
              Coba Simulator <Icon name="arrow" size={14} />
            </button>
          </GlassCard>
        </div>
        <div className="overview-side">
          <ChartCard title="Filter Cepat" subtitle="Pilih kelompok hanya dengan satu klik.">
            <div className="quick-buttons">
              <button onClick={() => setFilters((state) => ({ ...state, night: "Yes" }))}>
                <Icon name="moon" size={16} /> Pengguna Malam
              </button>
              <button onClick={() => setFilters((state) => ({ ...state, addiction: ["High"] }))}>
                <Icon name="alert" size={16} /> Pola Risiko Tinggi
              </button>
              <button onClick={() => setFilters((state) => ({ ...state, purpose: ["Education"] }))}>
                <Icon name="brain" size={16} /> Tujuan Pendidikan
              </button>
              <button onClick={reset}>
                <Icon name="reset" size={16} /> Atur Ulang
              </button>
            </div>
          </ChartCard>
          <ChartCard title="Ringkasan Kebiasaan" subtitle="Kelompok yang sedang ditampilkan.">
            <div className="donut-layout">
              <ResponsiveContainer width={145} height={145}>
                <PieChart>
                  <Pie
                    data={addiction}
                    dataKey="value"
                    innerRadius={43}
                    outerRadius={64}
                    paddingAngle={2}
                  >
                    {addiction.map((item) => (
                      <Cell key={item.name} fill={addictionColors[item.name as Addiction]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="simple-legend">
                {addiction.map((item) => (
                  <div key={item.name}>
                    <i style={{ background: addictionColors[item.name as Addiction] }} />
                    <span>{labelId(item.name)}</span>
                    <b>{percentage(item.value, respondentCount).toFixed(1)}%</b>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
          <ChartCard
            title="Platform Teratas"
            subtitle="Diurutkan berdasarkan responden yang sesuai."
          >
            <div className="top-platform-list">
              {top.slice(0, 4).map((item, index) => (
                <div key={item.name}>
                  <span>0{index + 1}</span>
                  <PlatformMark platform={item.name} size={27} />
                  <div>
                    <strong>{item.name}</strong>
                    <small>{item.count} responden</small>
                  </div>
                  <b>{item.mental.toFixed(1)}</b>
                </div>
              ))}
            </div>
          </ChartCard>
          <ChartCard title="Insight Otomatis" subtitle="Dihitung dari kelompok saat ini.">
            <div className="insight-list">
              <div>
                <Icon name="moon" />
                <p>
                  Pengguna malam memiliki skor{" "}
                  <strong>
                    {nightMentalDifference.toFixed(2)}{" "}
                    lebih rendah
                  </strong>{" "}
                  secara rata-rata.
                </p>
              </div>
              <div>
                <Icon name="layers" />
                <p>
                  <strong>{top[0]?.name}</strong> adalah platform yang paling banyak digunakan.
                </p>
              </div>
              <div>
                <Icon name="brain" />
                <p>
                  Pengguna untuk tujuan pendidikan memiliki rata-rata{" "}
                  <strong>{educationMentalAverage.toFixed(2)}</strong>{" "}
                  untuk kesehatan mental.
                </p>
              </div>
              <div>
                <Icon name="trend" />
                <p>
                  Korelasi penggunaan dan kesehatan mental adalah{" "}
                  <strong>
                    {overallCorrelation.toFixed(2)}
                  </strong>
                  .
                </p>
              </div>
            </div>
          </ChartCard>
        </div>
      </div>
    </DataPage>
  );
}

function ModeToggle({
  mode,
  setMode,
}: {
  mode: "Count" | "Percentage";
  setMode: (mode: "Count" | "Percentage") => void;
}) {
  return (
    <div className="mini-toggle">
      {(["Count", "Percentage"] as const).map((item) => (
        <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>
          {item === "Count" ? "Jumlah" : "Persentase"}
        </button>
      ))}
    </div>
  );
}

function DistributionChart({
  title,
  help,
  data,
  type = "bar",
  total,
}: {
  title: string;
  help: string;
  data: { name: string; value: number }[];
  type?: "bar" | "donut";
  total: number;
}) {
  const [mode, setMode] = useState<"Count" | "Percentage">("Count");
  const display = data.map((item) => ({
    ...item,
    name: labelId(item.name),
    shown: mode === "Count" ? item.value : percentage(item.value, total),
  }));
  return (
    <ChartCard
      title={title}
      action={
        <div className="chart-actions">
          <span className="help" title={help}>
            ?
          </span>
          <ModeToggle mode={mode} setMode={setMode} />
        </div>
      }
    >
      <div className="small-chart">
        <ResponsiveContainer width="100%" height="100%">
          {type === "donut" ? (
            <PieChart>
              <Pie
                data={display}
                dataKey="shown"
                nameKey="name"
                innerRadius={48}
                outerRadius={76}
                paddingAngle={2}
              >
                {display.map((item, index) => (
                  <Cell key={item.name} fill={palette[index % palette.length]} />
                ))}
              </Pie>
              <Tooltip
                {...tooltipStyle}
                formatter={(value) => [
                  `${Number(value).toFixed(mode === "Count" ? 0 : 1)}${mode === "Percentage" ? "%" : ""}`,
                  mode === "Count" ? "Jumlah" : "Persentase",
                ]}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 9 }} />
            </PieChart>
          ) : (
            <BarChart data={display} margin={{ top: 15, left: -24, right: 7, bottom: 5 }}>
              <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#8c91aa22" />
              <XAxis dataKey="name" tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="shown" radius={[5, 5, 0, 0]} fill={chartColors.indigo}>
                {display.map((item, index) => (
                  <Cell key={item.name} fill={palette[index % palette.length]} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function DistributionPage() {
  const { filtered, activeCount } = useFilters();
  const { summaries } = useDashboardData();
  const unfiltered = activeCount === 0;
  const total = unfiltered
    ? summaryValue<{ total_respondents: number }>(summaries, "overview").total_respondents
    : filtered.length;
  const numericStats = summaryRows<NumericSummary>(summaries, "numeric_stats_summary");
  const ageDistribution = summaryRows<CategorySummary>(summaries, "distribution_age");
  const purposeDistribution = summaryRows<CategorySummary>(summaries, "distribution_purpose");
  const addictionDistribution = summaryRows<CategorySummary>(
    summaries,
    "distribution_addiction_level",
  );
  const genderDistribution = summaryRows<CategorySummary>(summaries, "distribution_gender");
  const dailyUsageDistribution = summaryRows<CategorySummary>(
    summaries,
    "distribution_daily_usage_hours",
  );
  const mentalScoreDistribution = summaryRows<CategorySummary>(
    summaries,
    "distribution_mental_health_score",
  );
  const numeric = [
    ["Usia", "age"],
    ["Penggunaan harian (jam)", "daily_usage_hours"],
    ["Durasi sesi", "avg_session_minutes"],
    ["Platform digunakan", "num_platforms_used"],
    ["Waktu layar sebelum tidur", "screen_time_before_sleep"],
    ["Skor kesehatan mental", "mental_health_score"],
  ] as const;
  return (
    <DataPage
      title="Distribusi Data"
      subtitle="Pahami bentuk, sebaran, dan komposisi kelompok data saat ini."
    >
      <div className="chart-grid">
        <DistributionChart
          title="Usia"
          help="Jumlah responden pada setiap rentang usia."
          data={
            unfiltered
              ? groupedHistogram(ageDistribution, 7)
              : histogramBins(metric(filtered, "age"), 7)
          }
          total={total}
        />
        <DistributionChart
          title="Durasi Penggunaan Harian"
          help="Distribusi waktu penggunaan media sosial per hari."
          data={
            unfiltered
              ? summaryHistogram(dailyUsageDistribution)
              : histogramBins(metric(filtered, "daily_usage_hours"), 8)
          }
          total={total}
        />
        <DistributionChart
          title="Gender"
          help="Komposisi gender berdasarkan laporan responden."
          data={
            unfiltered
              ? orderedSummaryCounts(genderDistribution, ["Male", "Female", "Other"])
              : countData(filtered, "gender", ["Male", "Female", "Other"])
          }
          type="donut"
          total={total}
        />
        <DistributionChart
          title="Tujuan Utama"
          help="Alasan utama responden menggunakan media sosial."
          data={
            unfiltered
              ? orderedSummaryCounts(purposeDistribution, purposes)
              : countData(filtered, "purpose", purposes)
          }
          total={total}
        />
        <DistributionChart
          title="Tingkat Kebiasaan"
          help="Distribusi kategori kebiasaan berdasarkan pola penggunaan."
          data={
            unfiltered
              ? orderedSummaryCounts(addictionDistribution, addictions)
              : countData(filtered, "addiction_level", addictions)
          }
          type="donut"
          total={total}
        />
        <DistributionChart
          title="Skor Kesehatan Mental"
          help="Distribusi skor kesejahteraan berdasarkan laporan mandiri."
          data={
            unfiltered
              ? summaryHistogram(mentalScoreDistribution)
              : histogramBins(metric(filtered, "mental_health_score"), 8)
          }
          total={total}
        />
      </div>
      <ChartCard
        title="Ringkasan Numerik"
        subtitle="Statistik deskriptif untuk data yang ditampilkan."
      >
        <div className="table-scroll">
          <table className="data-table summary-table">
            <thead>
              <tr>
                <th>Metrik</th>
                <th>Rata-rata</th>
                <th>Median</th>
                <th>Minimum</th>
                <th>Maksimum</th>
                <th>Deviasi standar</th>
              </tr>
            </thead>
            <tbody>
              {numeric.map(([label, key]) => {
                const values = unfiltered ? [] : metric(filtered, key);
                const summary = numericStats.find((row) => row.metric === key);
                const stats = unfiltered
                  ? {
                      average: summary?.average ?? 0,
                      median: summary?.median ?? 0,
                      minimum: summary?.minimum ?? 0,
                      maximum: summary?.maximum ?? 0,
                      standard_deviation: summary?.standard_deviation ?? 0,
                    }
                  : {
                      average: average(values),
                      median: median(values),
                      minimum: Math.min(...values),
                      maximum: Math.max(...values),
                      standard_deviation: stdDev(values),
                    };
                return (
                  <tr key={key}>
                    <td>
                      <strong>{label}</strong>
                    </td>
                    <td>{stats.average.toFixed(2)}</td>
                    <td>{stats.median.toFixed(2)}</td>
                    <td>{stats.minimum.toFixed(2)}</td>
                    <td>{stats.maximum.toFixed(2)}</td>
                    <td>{stats.standard_deviation.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </DataPage>
  );
}

const correlationMetrics = [
  ["Penggunaan harian", "daily_usage_hours"],
  ["Durasi sesi", "avg_session_minutes"],
  ["Sebelum tidur", "screen_time_before_sleep"],
  ["Jumlah platform", "num_platforms_used"],
  ["Usia", "age"],
  ["Kesehatan mental", "mental_health_score"],
] as const;

export function CorrelationPage() {
  const { filtered, activeCount } = useFilters();
  const { summaries } = useDashboardData();
  const unfiltered = activeCount === 0;
  const correlations = summaryRows<CorrelationSummary>(summaries, "correlation_summary");
  const [xKey, setXKey] = useState<(typeof correlationMetrics)[number][1]>("daily_usage_hours");
  const scatter = filtered.map((row) => ({
    x: row[xKey],
    y: row.mental_health_score,
    level: row.addiction_level,
    id: row.id,
    platform: row.primary_platform,
  }));
  const exactCorrelation = correlations.find(
    (row) => row.x_key === xKey && row.y_key === "mental_health_score",
  );
  const xValues = metric(filtered, xKey);
  const yValues = metric(filtered, "mental_health_score");
  const r = unfiltered
    ? (exactCorrelation?.correlation ?? 0)
    : correlation(xValues, yValues);
  const xAverage = unfiltered ? (exactCorrelation?.x_average ?? 0) : average(xValues);
  const yAverage = unfiltered ? (exactCorrelation?.y_average ?? 0) : average(yValues);
  const slopeNumerator = filtered.reduce(
    (sum, row) => sum + (Number(row[xKey]) - xAverage) * (row.mental_health_score - yAverage),
    0,
  );
  const slopeDenominator = filtered.reduce(
    (sum, row) => sum + (Number(row[xKey]) - xAverage) ** 2,
    0,
  );
  const slope = unfiltered
    ? (exactCorrelation?.slope ?? 0)
    : slopeDenominator
      ? slopeNumerator / slopeDenominator
      : 0;
  const rangeMinimum = unfiltered
    ? (exactCorrelation?.x_minimum ?? 0)
    : xValues.length
      ? Math.min(...xValues)
      : 0;
  const rangeMaximum = unfiltered
    ? (exactCorrelation?.x_maximum ?? 0)
    : xValues.length
      ? Math.max(...xValues)
      : 0;
  const scoreSummary = summaryRows<{
    addiction_level: Addiction;
    average_mental_health_score: number;
    score_q1: number;
    score_q3: number;
  }>(summaries, "addiction_score_summary");
  const box = unfiltered
    ? scoreSummary.map((row) => ({
        name: row.addiction_level,
        score: row.average_mental_health_score,
        low: row.score_q1,
        high: row.score_q3,
      }))
    : addictions.map((name) => {
        const values = metric(
          filtered.filter((row) => row.addiction_level === name),
          "mental_health_score",
        );
        return {
          name,
          score: average(values),
          low: percentile(values, 0.25),
          high: percentile(values, 0.75),
        };
      });
  const day = filtered.filter((row) => !row.night_usage);
  const night = filtered.filter((row) => row.night_usage);
  const compare = unfiltered
    ? summaryRows<{
        night_usage: 0 | 1;
        average_mental_health_score: number;
        high_addiction_percentage: number;
      }>(summaries, "night_usage_summary").map((row) => ({
        name: row.night_usage ? "Pengguna malam" : "Pengguna siang",
        mental: row.average_mental_health_score,
        high: row.high_addiction_percentage,
      }))
    : [
        {
          name: "Pengguna siang",
          mental: average(metric(day, "mental_health_score")),
          high: percentage(day.filter((r) => r.addiction_level === "High").length, day.length),
        },
        {
          name: "Pengguna malam",
          mental: average(metric(night, "mental_health_score")),
          high: percentage(night.filter((r) => r.addiction_level === "High").length, night.length),
        },
      ];
  return (
    <DataPage
      title="Korelasi dan Hubungan"
      subtitle="Jelajahi hubungan antara perilaku, intensitas penggunaan, dan kesejahteraan."
    >
      <div className="correlation-grid">
        <ChartCard
          title="Penjelajah Hubungan"
          subtitle={`Korelasi Pearson: ${r.toFixed(3)}`}
          action={
            <select value={xKey} onChange={(e) => setXKey(e.target.value as typeof xKey)}>
              {correlationMetrics.slice(0, 5).map(([label, key]) => (
                <option value={key} key={key}>
                  Sumbu X: {label}
                </option>
              ))}
            </select>
          }
        >
          <div className="large-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 15, right: 20, bottom: 15, left: -10 }}>
                <CartesianGrid strokeDasharray="4 5" stroke="#8c91aa22" />
                <XAxis type="number" dataKey="x" name={xKey} tick={{ fontSize: 9 }} />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Kesehatan mental"
                  domain={[1, 10]}
                  tick={{ fontSize: 9 }}
                />
                <Tooltip {...tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
                {addictions.map((level) => (
                  <Scatter
                    key={level}
                    name={labelId(level)}
                    data={scatter.filter((row) => row.level === level)}
                    fill={addictionColors[level]}
                    opacity={0.72}
                  />
                ))}
                <ReferenceLine
                  segment={[
                    {
                      x: rangeMinimum,
                      y: yAverage + slope * (rangeMinimum - xAverage),
                    },
                    {
                      x: rangeMaximum,
                      y: yAverage + slope * (rangeMaximum - xAverage),
                    },
                  ]}
                  stroke={chartColors.indigo}
                  strokeWidth={2}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 9 }} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Peta Panas Korelasi"
          subtitle="Arahkan kursor ke sel untuk melihat nilai Pearson."
        >
          <div className="heatmap">
            <div />
            {correlationMetrics.map(([label]) => (
              <b key={label}>{label.split(" ")[0]}</b>
            ))}
            {correlationMetrics.map(([rowLabel, rowKey]) => (
              <div className="heat-row" key={rowKey}>
                <b>{rowLabel}</b>
                {correlationMetrics.map(([colLabel, colKey]) => {
                  const value = unfiltered
                    ? (correlations.find(
                        (row) => row.x_key === rowKey && row.y_key === colKey,
                      )?.correlation ?? 0)
                    : correlation(metric(filtered, rowKey), metric(filtered, colKey));
                  return (
                    <span
                      key={colKey}
                      title={`${rowLabel} × ${colLabel}: ${value.toFixed(3)}`}
                      style={{
                        background:
                          value >= 0
                            ? `rgba(34,168,132,${Math.abs(value) * 0.72 + 0.08})`
                            : `rgba(229,72,77,${Math.abs(value) * 0.72 + 0.08})`,
                      }}
                    >
                      {value.toFixed(2)}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="heat-legend">
            <span>−1 negatif</span>
            <i />
            <span>+1 positif</span>
          </div>
        </ChartCard>
      </div>
      <div className="two-grid">
        <ChartCard
          title="Kesehatan Mental berdasarkan Tingkat Kebiasaan"
          subtitle="Rata-rata dengan rentang antarkuartil."
        >
          <div className="medium-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={box} margin={{ left: -15, top: 15 }}>
                <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#8c91aa22" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis domain={[1, 10]} tick={{ fontSize: 9 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="score" fill={chartColors.indigo} radius={[7, 7, 0, 0]} />
                <Line dataKey="high" stroke={chartColors.teal} strokeWidth={2} />
                <Line dataKey="low" stroke={chartColors.coral} strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Pengguna Malam dan Siang"
          subtitle="Skor kesehatan mental dan proporsi pola risiko tinggi."
        >
          <div className="medium-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compare} margin={{ left: -12, top: 15 }}>
                <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#8c91aa22" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                <YAxis tick={{ fontSize: 9 }} />
                <Tooltip {...tooltipStyle} />
                <Bar
                  dataKey="mental"
                  name="Skor mental"
                  fill={chartColors.indigo}
                  radius={[5, 5, 0, 0]}
                />
                <Bar
                  dataKey="high"
                  name="Risiko tinggi %"
                  fill={chartColors.coral}
                  radius={[5, 5, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      <GlassCard className="note-card">
        <Icon name="info" />
        <div>
          <strong>Korelasi tidak selalu berarti hubungan sebab-akibat.</strong>
          <p>Pola ini menggambarkan hubungan dalam data observasi dan bukan bukti klinis.</p>
        </div>
      </GlassCard>
    </DataPage>
  );
}

export function PlatformsPage() {
  const { filtered, filters, setFilters, activeCount } = useFilters();
  const { summaries } = useDashboardData();
  const unfiltered = activeCount === 0;
  const [sort, setSort] = useState<"count" | "usage" | "mental" | "high">("count");
  const stats = unfiltered
    ? summaryRows<{
        platform: Platform;
        total_users: number;
        average_daily_usage_hours: number;
        average_mental_health_score: number;
        high_addiction_percentage: number;
      }>(summaries, "platform_summary").map((row) => ({
        name: row.platform,
        count: row.total_users,
        usage: row.average_daily_usage_hours,
        mental: row.average_mental_health_score,
        high: row.high_addiction_percentage,
      }))
    : platformStats(filtered);
  const addictionByPlatform = summaryRows<{
    platform: Platform;
    addiction_level: Addiction;
    percentage: number;
  }>(summaries, "platform_addiction_summary");
  const purposeByPlatform = summaryRows<{
    platform: Platform;
    purpose: Purpose;
    total_respondents: number;
  }>(summaries, "platform_purpose_summary");
  const stacked = platforms.map((name) => {
    if (unfiltered) {
      return {
        name,
        ...Object.fromEntries(
          addictions.map((level) => [
            level,
            addictionByPlatform.find(
              (row) => row.platform === name && row.addiction_level === level,
            )?.percentage ?? 0,
          ]),
        ),
      };
    }
    const rows = filtered.filter((record) => record.primary_platform === name);
    return {
      name,
      ...Object.fromEntries(
        addictions.map((level) => [
          level,
          percentage(rows.filter((record) => record.addiction_level === level).length, rows.length),
        ]),
      ),
    };
  });
  const purposeData = platforms.map((name) => {
    if (unfiltered) {
      return {
        name,
        ...Object.fromEntries(
          purposes.map((purpose) => [
            purpose,
            purposeByPlatform.find((row) => row.platform === name && row.purpose === purpose)
              ?.total_respondents ?? 0,
          ]),
        ),
      };
    }
    const rows = filtered.filter((record) => record.primary_platform === name);
    return {
      name,
      ...Object.fromEntries(
        purposes.map((purpose) => [purpose, rows.filter((row) => row.purpose === purpose).length]),
      ),
    };
  });
  return (
    <DataPage
      title="Analisis Platform"
      subtitle="Bandingkan penggunaan, kesejahteraan, tujuan, dan pola kebiasaan tiap platform."
    >
      <div className="platform-cards">
        {stats.map((item) => (
          <button
            key={item.name}
            className={`platform-card glass-card ${filters.platform.includes(item.name) ? "active" : ""}`}
            onClick={() =>
              setFilters((state) => ({
                ...state,
                platform: state.platform.includes(item.name) ? [] : [item.name],
              }))
            }
          >
            <PlatformMark platform={item.name} />
            <div>
              <h3>{item.name}</h3>
              <span>{item.count} respondents</span>
            </div>
            <dl>
              <div>
                <dt>Penggunaan harian</dt>
                <dd>{item.usage.toFixed(2)}h</dd>
              </div>
              <div>
                <dt>Skor mental</dt>
                <dd>{item.mental.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Risiko tinggi</dt>
                <dd>{item.high.toFixed(1)}%</dd>
              </div>
            </dl>
          </button>
        ))}
      </div>
      <div className="two-grid">
        <ChartCard
          title="Proporsi Kebiasaan per Platform"
          subtitle="Komposisi kategori pada setiap platform."
        >
          <div className="medium-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stacked} layout="vertical" margin={{ left: 10, top: 10 }}>
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis dataKey="name" type="category" width={65} tick={{ fontSize: 9 }} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 9 }} />
                {addictions.map((level) => (
                  <Bar
                    stackId="a"
                    dataKey={level}
                    name={labelId(level)}
                    key={level}
                    fill={addictionColors[level]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard
          title="Rata-rata Skor Kesehatan Mental"
          subtitle="Perbandingan berdasarkan platform utama."
        >
          <div className="medium-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats} margin={{ left: -20, top: 15 }}>
                <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#8c91aa22" />
                <XAxis dataKey="name" tick={{ fontSize: 8 }} />
                <YAxis domain={[3, 9]} tick={{ fontSize: 8 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="mental" radius={[6, 6, 0, 0]}>
                  {stats.map((item, index) => (
                    <Cell key={item.name} fill={palette[index % palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      <ChartCard
        title="Rincian Tujuan per Platform"
        subtitle="Jumlah responden berdasarkan tujuan penggunaan utama."
      >
        <div className="medium-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={purposeData} margin={{ left: -10, top: 10 }}>
              <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="#8c91aa22" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 9 }} />
              {purposes.map((purpose, index) => (
                <Bar
                  dataKey={purpose}
                  name={labelId(purpose)}
                  key={purpose}
                  fill={palette[index]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
      <ChartCard title="Peringkat Platform" subtitle="Klik judul kolom untuk mengurutkan ulang.">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                {(
                  [
                    ["count", "Responden"],
                    ["usage", "Penggunaan harian"],
                    ["mental", "Kesehatan mental"],
                    ["high", "Risiko tinggi"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key}>
                    <button onClick={() => setSort(key)}>
                      {label} {sort === key ? "↓" : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...stats]
                .sort((a, b) => b[sort] - a[sort])
                .map((item) => (
                  <tr key={item.name}>
                    <td>
                      <div className="platform-cell">
                        <PlatformMark platform={item.name} size={27} />
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td>{item.count}</td>
                    <td>{item.usage.toFixed(2)} jam</td>
                    <td>{item.mental.toFixed(2)}</td>
                    <td>{item.high.toFixed(1)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </DataPage>
  );
}

const flags: Record<Country, string> = {
  USA: "🇺🇸",
  India: "🇮🇳",
  Brazil: "🇧🇷",
  UK: "🇬🇧",
  Canada: "🇨🇦",
  Australia: "🇦🇺",
  Germany: "🇩🇪",
};

export function CountriesPage() {
  const { filtered, activeCount } = useFilters();
  const { summaries } = useDashboardData();
  const unfiltered = activeCount === 0;
  const [selectedMetric, setSelectedMetric] = useState<"count" | "usage" | "mental" | "high">(
    "count",
  );
  const [a, setA] = useState<Country>("USA");
  const [b, setB] = useState<Country>("India");
  const [sort, setSort] = useState<"count" | "usage" | "mental" | "high">("count");
  const stats = unfiltered
    ? summaryRows<{
        country: Country;
        total_respondents: number;
        average_daily_usage_hours: number;
        average_mental_health_score: number;
        high_addiction_percentage: number;
        night_usage_percentage: number;
      }>(summaries, "country_summary").map((row) => ({
        name: row.country,
        count: row.total_respondents,
        usage: row.average_daily_usage_hours,
        mental: row.average_mental_health_score,
        high: row.high_addiction_percentage,
        night: row.night_usage_percentage,
      }))
    : countryStats(filtered);
  const selectedA = stats.find((item) => item.name === a) ?? stats[0];
  const selectedB = stats.find((item) => item.name === b) ?? stats[1];
  const labels = {
    count: "Responden",
    usage: "Rata-rata penggunaan",
    mental: "Rata-rata kesehatan mental",
    high: "Risiko tinggi %",
  };
  return (
    <DataPage
      title="Perbandingan Negara"
      subtitle="Bandingkan pola perilaku dan kesejahteraan di tujuh negara."
    >
      <ChartCard
        title="Gambaran Negara"
        subtitle={`Diurutkan berdasarkan ${labels[selectedMetric].toLowerCase()}.`}
        action={
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as typeof selectedMetric)}
          >
            {Object.entries(labels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
        }
      >
        <div className="country-layout">
          <div className="large-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...stats].sort((x, y) => y[selectedMetric] - x[selectedMetric])}
                layout="vertical"
                margin={{ left: 20, right: 25, top: 5 }}
              >
                <CartesianGrid strokeDasharray="4 5" horizontal={false} stroke="#8c91aa22" />
                <XAxis type="number" tick={{ fontSize: 9 }} />
                <YAxis dataKey="name" type="category" width={65} tick={{ fontSize: 9 }} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey={selectedMetric} fill={chartColors.indigo} radius={[0, 7, 7, 0]}>
                  {stats.map((item, index) => (
                    <Cell key={item.name} fill={palette[index % palette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="country-card-grid">
            {stats.map((item) => (
              <div key={item.name}>
                <span>{flags[item.name]}</span>
                <strong>{item.name}</strong>
                <small>{item.count} responden</small>
              </div>
            ))}
          </div>
        </div>
      </ChartCard>
      <ChartCard
        title="Tabel Perbandingan Negara"
        subtitle="Seluruh nilai dihitung ulang berdasarkan filter."
      >
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Negara</th>
                {(
                  [
                    ["count", "Responden"],
                    ["usage", "Penggunaan harian"],
                    ["mental", "Kesehatan mental"],
                    ["high", "Risiko tinggi"],
                  ] as const
                ).map(([key, label]) => (
                  <th key={key}>
                    <button onClick={() => setSort(key)}>
                      {label} {sort === key ? "↓" : ""}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...stats]
                .sort((x, y) => y[sort] - x[sort])
                .map((item) => (
                  <tr key={item.name}>
                    <td>
                      <strong>
                        {flags[item.name]} {item.name}
                      </strong>
                    </td>
                    <td>{item.count}</td>
                    <td>{item.usage.toFixed(2)} jam</td>
                    <td>{item.mental.toFixed(2)}</td>
                    <td>{item.high.toFixed(1)}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <ChartCard
        title="Bandingkan Dua Negara"
        subtitle="Lihat perbedaan kedua negara secara berdampingan."
        action={
          <div className="compare-selects">
            <select value={a} onChange={(e) => setA(e.target.value as Country)}>
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
            <span>dan</span>
            <select value={b} onChange={(e) => setB(e.target.value as Country)}>
              {countries.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="country-compare">
          {[selectedA, selectedB].map((item, index) => (
            <GlassCard className="country-kpis" key={item.name}>
              <h3>
                {flags[item.name]} {item.name}
              </h3>
              <div>
                <span>
                  Responden<strong>{item.count}</strong>
                </span>
                <span>
                  Penggunaan harian<strong>{item.usage.toFixed(2)} jam</strong>
                  <em
                    className={
                      item.usage <= (index ? selectedA.usage : selectedB.usage) ? "good" : "bad"
                    }
                  >
                    {(item.usage - (index ? selectedA.usage : selectedB.usage)).toFixed(2)}
                  </em>
                </span>
                <span>
                  Kesehatan mental<strong>{item.mental.toFixed(2)}</strong>
                  <em
                    className={
                      item.mental >= (index ? selectedA.mental : selectedB.mental) ? "good" : "bad"
                    }
                  >
                    {(item.mental - (index ? selectedA.mental : selectedB.mental)).toFixed(2)}
                  </em>
                </span>
                <span>
                  Risiko tinggi<strong>{item.high.toFixed(1)}%</strong>
                </span>
              </div>
            </GlassCard>
          ))}
        </div>
      </ChartCard>
    </DataPage>
  );
}

const defaultProfile: SimulatorProfile = {
  age: 20,
  gender: "Female",
  country: "India",
  platform: "TikTok",
  purpose: "Entertainment",
  dailyUsage: 4,
  platformsUsed: 2,
  sessionMinutes: 25,
  nightUsage: 1,
  beforeSleep: 30,
};

const simulatorFlags: Record<Country, string> = {
  USA: "🇺🇸",
  India: "🇮🇳",
  Brazil: "🇧🇷",
  UK: "🇬🇧",
  Canada: "🇨🇦",
  Australia: "🇦🇺",
  Germany: "🇩🇪",
};

const presets: { label: string; profile: SimulatorProfile }[] = [
  {
    label: "Pelajar (Pendidikan)",
    profile: { ...defaultProfile, age: 18, purpose: "Education", dailyUsage: 3, nightUsage: 0 },
  },
  {
    label: "Aktif di malam hari",
    profile: {
      ...defaultProfile,
      dailyUsage: 7,
      platformsUsed: 5,
      sessionMinutes: 38,
      nightUsage: 1,
      beforeSleep: 65,
    },
  },
  {
    label: "Pengguna seimbang",
    profile: {
      ...defaultProfile,
      platform: "YouTube",
      purpose: "Education",
      dailyUsage: 2,
      platformsUsed: 2,
      sessionMinutes: 14,
      nightUsage: 0,
      beforeSleep: 10,
    },
  },
];

type WhatIfKey = "night" | "oneHour" | "twoHours" | "sleep" | "platform" | "education";

const whatIfOptions: {
  key: WhatIfKey;
  label: string;
  apply: (profile: SimulatorProfile) => SimulatorProfile;
}[] = [
  {
    key: "night",
    label: "Matikan penggunaan malam",
    apply: (profile) => ({ ...profile, nightUsage: 0 }),
  },
  {
    key: "oneHour",
    label: "Kurangi penggunaan 1 jam",
    apply: (profile) => ({ ...profile, dailyUsage: Math.max(0.5, profile.dailyUsage - 1) }),
  },
  {
    key: "twoHours",
    label: "Kurangi penggunaan 2 jam",
    apply: (profile) => ({ ...profile, dailyUsage: Math.max(0.5, profile.dailyUsage - 2) }),
  },
  {
    key: "sleep",
    label: "Tanpa layar sebelum tidur",
    apply: (profile) => ({ ...profile, beforeSleep: 0 }),
  },
  {
    key: "platform",
    label: "Gunakan hanya 1 platform",
    apply: (profile) => ({ ...profile, platformsUsed: 1 }),
  },
  {
    key: "education",
    label: "Ubah tujuan ke Pendidikan",
    apply: (profile) => ({ ...profile, purpose: "Education" }),
  },
];

function HelpLabel({ label, help, value }: { label: string; help: string; value?: string }) {
  return (
    <span className="sim-field-label">
      <span>
        {label}
        <button type="button" title={help} aria-label={`${label}: ${help}`}>
          ?
        </button>
      </span>
      {value && <b>{value}</b>}
    </span>
  );
}

function SliderField({
  label,
  help,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="sim-slider">
      <HelpLabel label={label} help={help} value={`${value}${suffix}`} />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(+event.target.value)}
      />
      <span className="range-ends">
        <small>{min}</small>
        <small>{max}</small>
      </span>
    </label>
  );
}

function ChipGroup<T extends string>({
  label,
  help,
  values,
  value,
  onChange,
  platforms: platformStyle = false,
}: {
  label: string;
  help: string;
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
  platforms?: boolean;
}) {
  return (
    <fieldset className="sim-chip-group">
      <legend>
        <HelpLabel label={label} help={help} value={value} />
      </legend>
      <div>
        {values.map((item) => (
          <button
            type="button"
            key={item}
            className={value === item ? "active" : ""}
            aria-pressed={value === item}
            onClick={() => onChange(item)}
          >
            {platformStyle && <PlatformMark platform={item as Platform} size={20} />}
            {item}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ScoreRangeBar({ result }: { result: SimulationResult }) {
  return (
    <div className="score-range-block">
      <strong>
        {result.rangeLow.toFixed(1)} – {result.rangeHigh.toFixed(1)}
      </strong>
      <p>Rentang skor kesehatan mental orang serupa (skala 0–10, lebih tinggi lebih baik)</p>
      <div
        className="score-gradient"
        aria-label={`Score range ${result.rangeLow.toFixed(1)} to ${result.rangeHigh.toFixed(1)}, median ${result.median.toFixed(1)}`}
      >
        <i
          className="range-highlight"
          style={{
            left: `${result.rangeLow * 10}%`,
            width: `${(result.rangeHigh - result.rangeLow) * 10}%`,
          }}
        />
        <i className="median-dot" style={{ left: `${result.median * 10}%` }} />
      </div>
      <div className="score-scale">
        <span>0 · rendah</span>
        <span>5 · tengah</span>
        <span>10 · tinggi</span>
      </div>
    </div>
  );
}

function DotGrid({ result }: { result: SimulationResult }) {
  const dots = [
    ...Array(result.split.low).fill("Low"),
    ...Array(result.split.medium).fill("Medium"),
    ...Array(result.split.high).fill("High"),
  ] as Addiction[];
  return (
    <div className="sim-dot-block">
      <div className="sim-subhead">
        <strong>Dari {result.neighborCount} orang serupa</strong>
        <span>Setiap titik mewakili satu profil</span>
      </div>
      <div
        className="sim-dot-grid"
        aria-label={`${result.split.low} Low, ${result.split.medium} Medium, ${result.split.high} High`}
      >
        {dots.map((level, index) => (
          <i
            key={`${level}-${index}`}
            className={level.toLowerCase()}
            style={{ animationDelay: `${index * 8}ms` }}
            title={level}
          />
        ))}
      </div>
      <div className="dot-legend">
        {(["Low", "Medium", "High"] as const).map((level) => (
          <span key={level}>
            <i className={level.toLowerCase()} />
            <b>{result.split[level.toLowerCase() as keyof typeof result.split]}</b> {labelId(level)}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConfidenceMeter({ result }: { result: SimulationResult }) {
  const copy = {
    Low: "Profil serupa cukup beragam, jadi gunakan hasil ini sebagai perkiraan umum.",
    Medium: "Orang dengan profil serupa cukup beragam dalam sampel ini.",
    High: "Profil terdekat menunjukkan pola yang relatif konsisten dalam sampel ini.",
  };
  return (
    <div className="sim-confidence">
      <div className="confidence-segments">
        {(["Low", "Medium", "High"] as const).map((level) => (
          <span
            key={level}
            className={result.confidence === level ? `active ${level.toLowerCase()}` : ""}
          >
            {labelId(level)}
          </span>
        ))}
      </div>
      <p>
        <strong>{labelId(result.confidence)}</strong> – {copy[result.confidence]}
      </p>
    </div>
  );
}

function SimulatorEmptyState() {
  return (
    <div className="sim-empty">
      <div>
        <Icon name="sparkle" size={25} />
        <i />
        <i />
      </div>
      <h3>Isi profil Anda dan jalankan simulasi</h3>
      <p>Perkiraan akan tampil di sini berdasarkan pola dalam sampel aktual.</p>
    </div>
  );
}

function SimulatorSkeleton() {
  return (
    <div className="sim-result-skeleton" role="status" aria-label="Menghitung ulang perkiraan">
      <div />
      <div />
      <div />
      <div />
    </div>
  );
}

function ResultContent({
  result,
  profile,
}: {
  result: SimulationResult;
  profile: SimulatorProfile;
}) {
  const match = Math.max(0, Math.min(100, (1 - result.avgDistance) * 100));
  const pattern =
    result.likelyLevel === "High"
      ? "Kelompok terdekat menunjukkan pola berisiko lebih tinggi dalam sampel ini."
      : result.likelyLevel === "Medium"
        ? "Kelompok terdekat paling sering menunjukkan pola kebiasaan sedang."
        : "Kelompok terdekat paling sering menunjukkan pola kebiasaan berisiko lebih rendah.";
  const behavior =
    profile.nightUsage && profile.beforeSleep >= 30
      ? " Penggunaan larut malam dan waktu layar yang panjang sebelum tidur lebih sering muncul pada skor lebih rendah dalam sampel ini."
      : "";
  return (
    <>
      {result.neighborCount < 30 && (
        <div className="few-notice">
          <Icon name="alert" size={15} /> Profil serupa yang ditemukan sedikit. Gunakan perkiraan
          ini dengan hati-hati.
        </div>
      )}
      <ScoreRangeBar result={result} />
      <div className={`habit-level ${result.likelyLevel.toLowerCase()}`}>
        <Icon
          name={
            result.likelyLevel === "Low"
              ? "heart"
              : result.likelyLevel === "Medium"
                ? "info"
                : "alert"
          }
          size={16}
        />
        <div>
          <strong>Tingkat kebiasaan yang paling mungkin: {labelId(result.likelyLevel)}</strong>
          <span>Berdasarkan label orang dengan profil serupa dalam sampel</span>
        </div>
      </div>
      <DotGrid result={result} />
      <ConfidenceMeter result={result} />
      <div className="sim-stat-row">
        <span>
          Profil cocok<strong>{result.neighborCount}</strong>
        </span>
        <span>
          Rata-rata kecocokan<strong>{match.toFixed(0)}%</strong>
        </span>
        <span>
          Skor median<strong>{result.median.toFixed(1)}</strong>
        </span>
      </div>
      <div className="friendly-copy">
        <Icon name="sparkle" size={16} />
        <p>
          Orang dengan kebiasaan serupa umumnya memiliki skor antara {result.rangeLow.toFixed(1)}{" "}
          dan {result.rangeHigh.toFixed(1)}. {pattern}
          {behavior}
          <span>
            Jika Anda merasa kewalahan, berbicara dengan orang tepercaya atau tenaga profesional
            dapat membantu.
          </span>
        </p>
      </div>
    </>
  );
}

function ComparisonCard({
  label,
  before,
  after,
}: {
  label: string;
  before: SimulationResult;
  after: SimulationResult;
}) {
  const delta = after.median - before.median;
  return (
    <div className="comparison-card">
      <div className="comparison-title">
        <span>{label}</span>
        <b className={delta >= 0 ? "good" : "bad"}>
          <Icon name="trend" size={13} /> {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)}
        </b>
      </div>
      <div className="before-after">
        {[
          ["Sebelum", before],
          ["Sesudah", after],
        ].map(([name, value]) => {
          const typed = value as SimulationResult;
          return (
            <div key={name as string}>
              <small>{name as string}</small>
              <strong>{typed.median.toFixed(1)}</strong>
              <span>
                Rentang {typed.rangeLow.toFixed(1)}–{typed.rangeHigh.toFixed(1)}
              </span>
              <StatusPill status={typed.likelyLevel} />
              <em>{percentage(typed.split.high, typed.neighborCount).toFixed(0)}% Tinggi</em>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SimulatorPage() {
  const { filtered } = useFilters();
  const { summaries, samples } = useDashboardData();
  const [profile, setProfile] = useState<SimulatorProfile>(defaultProfile);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [touched, setTouched] = useState(false);
  const [activeWhatIfs, setActiveWhatIfs] = useState<WhatIfKey[]>([]);
  const runId = useRef(0);
  const suppressAutoRun = useRef(false);

  const execute = (nextProfile = profile) => {
    const id = ++runId.current;
    setLoading(true);
    setError(false);
    window.setTimeout(() => {
      if (id !== runId.current) return;
      try {
        setResult(runSimulation(nextProfile, filtered));
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }, 500);
  };

  useEffect(() => {
    if (!touched) return;
    if (suppressAutoRun.current) {
      suppressAutoRun.current = false;
      return;
    }
    const timer = window.setTimeout(() => execute(profile), 400);
    return () => window.clearTimeout(timer);
  }, [profile, touched, filtered]);

  const update = (next: SimulatorProfile) => {
    setProfile(next);
    setTouched(true);
  };
  const resetProfile = () => {
    runId.current += 1;
    setProfile(defaultProfile);
    setResult(null);
    setTouched(false);
    setLoading(false);
    setError(false);
    setActiveWhatIfs([]);
  };
  const comparisons = activeWhatIfs.map((key) => {
    const option = whatIfOptions.find((item) => item.key === key)!;
    return { option, result: runSimulation(option.apply(profile), filtered) };
  });
  const ranking = result
    ? whatIfOptions
        .map((option) => {
          const after = runSimulation(option.apply(profile), filtered);
          return { label: option.label, delta: after.median - result.median };
        })
        .sort((a, b) => b.delta - a.delta)
    : [];
  const methodSummary =
    "Pencocokan tetangga terdekat berbobot (K = 100) pada dataset. Fitur numerik dinormalisasi min-maks, lalu digabungkan dengan penalti perbedaan kategori. Hasil bersifat deskriptif dan bukan diagnosis medis.";

  return (
    <DataPage
      title="Simulator Kesehatan Mental"
      subtitle="Masukkan profil penggunaan untuk melihat skor orang dengan kebiasaan serupa dalam sampel."
      badge="Sampel data aktual"
      filters={false}
    >
      <div className="simulator-grid polished">
        <GlassCard className="sim-input polished">
          <div className="card-head">
            <div>
              <h2>Profil Anda</h2>
              <p>Pilih opsi yang paling mendekati kebiasaan Anda.</p>
            </div>
          </div>
          <div className="preset-row">
            <span>Preset cepat</span>
            <div>
              {presets.map((preset) => (
                <button type="button" key={preset.label} onClick={() => update(preset.profile)}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <form
            className="sim-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (!touched) suppressAutoRun.current = true;
              setTouched(true);
              execute();
            }}
          >
            <SliderField
              label="Usia"
              help="Usia dicocokkan dari 13 hingga 27 tahun."
              min={13}
              max={27}
              value={profile.age}
              onChange={(age) => update({ ...profile, age })}
            />
            <ChipGroup<Gender>
              label="Gender"
              help="Digunakan sebagai faktor pencocokan ringan."
              values={["Male", "Female", "Other"]}
              value={profile.gender}
              onChange={(gender) => update({ ...profile, gender })}
            />
            <label className="sim-select">
              <HelpLabel
                label="Negara"
                help="Digunakan sebagai faktor pencocokan ringan."
                value={`${simulatorFlags[profile.country]} ${profile.country}`}
              />
              <select
                value={profile.country}
                onChange={(event) => update({ ...profile, country: event.target.value as Country })}
              >
                {countries.map((country) => (
                  <option key={country} value={country}>
                    {simulatorFlags[country]} {country}
                  </option>
                ))}
              </select>
            </label>
            <ChipGroup<Platform>
              label="Platform utama"
              help="Platform yang paling sering Anda gunakan."
              values={platforms}
              value={profile.platform}
              onChange={(platform) => update({ ...profile, platform })}
              platforms
            />
            <ChipGroup<Purpose>
              label="Tujuan utama"
              help="Alasan utama Anda menggunakan media sosial."
              values={purposes}
              value={profile.purpose}
              onChange={(purpose) => update({ ...profile, purpose })}
            />
            <SliderField
              label="Penggunaan harian"
              help="Total penggunaan media sosial dalam sehari."
              min={0.5}
              max={10}
              step={0.1}
              suffix=" jam"
              value={profile.dailyUsage}
              onChange={(dailyUsage) => update({ ...profile, dailyUsage })}
            />
            <div className="sim-stepper">
              <HelpLabel
                label="Jumlah platform digunakan"
                help="Jumlah platform yang rutin Anda gunakan."
                value={String(profile.platformsUsed)}
              />
              <div>
                <button
                  type="button"
                  aria-label="Kurangi satu platform"
                  onClick={() =>
                    update({ ...profile, platformsUsed: Math.max(1, profile.platformsUsed - 1) })
                  }
                >
                  −
                </button>
                <strong>{profile.platformsUsed}</strong>
                <button
                  type="button"
                  aria-label="Tambah satu platform"
                  onClick={() =>
                    update({ ...profile, platformsUsed: Math.min(5, profile.platformsUsed + 1) })
                  }
                >
                  +
                </button>
              </div>
            </div>
            <SliderField
              label="Rata-rata durasi sesi"
              help="Durasi rata-rata setiap sesi penggunaan."
              min={5}
              max={80.3}
              step={0.1}
              suffix=" min"
              value={profile.sessionMinutes}
              onChange={(sessionMinutes) => update({ ...profile, sessionMinutes })}
            />
            <label className="sim-switch">
              <span>
                <HelpLabel label="Penggunaan malam" help="Menggunakan media sosial larut malam." />
                <small>Saya menggunakan media sosial larut malam</small>
              </span>
              <input
                type="checkbox"
                checked={!!profile.nightUsage}
                onChange={(event) =>
                  update({ ...profile, nightUsage: event.target.checked ? 1 : 0 })
                }
              />
              <i />
            </label>
            <SliderField
              label="Waktu layar sebelum tidur"
              help="Menit penggunaan sesaat sebelum tidur."
              min={0}
              max={138}
              suffix=" min"
              value={profile.beforeSleep}
              onChange={(beforeSleep) => update({ ...profile, beforeSleep })}
            />
            <div className="sim-actions">
              <button className="primary-button" type="submit">
                <Icon name="sparkle" size={15} /> Jalankan Simulasi
              </button>
              <button className="ghost-button" type="button" onClick={resetProfile}>
                <Icon name="reset" size={14} /> Atur Ulang Profil
              </button>
            </div>
          </form>
        </GlassCard>

        <GlassCard className={`sim-result polished ${loading ? "recalculating" : ""}`}>
          <div className="card-head">
            <div>
              <h2>Hasil Perkiraan</h2>
              <p>Pola dari profil terdekat dalam sampel ini.</p>
            </div>
            <button className="ghost-button" onClick={() => setDrawer(true)}>
              <Icon name="settings" size={14} /> Detail Ilmiah
            </button>
          </div>
          {loading ? (
            <SimulatorSkeleton />
          ) : error ? (
            <ErrorState retry={() => execute()} />
          ) : result ? (
            <ResultContent result={result} profile={profile} />
          ) : (
            <SimulatorEmptyState />
          )}
        </GlassCard>
      </div>

      <GlassCard className="what-if-panel">
        <div className="card-head">
          <div>
            <h2>Bagaimana Jika?</h2>
            <p>Lihat pengaruh perubahan kecil terhadap perkiraan.</p>
          </div>
        </div>
        <div className="what-if-toggles">
          {whatIfOptions.map((option) => (
            <button
              type="button"
              key={option.key}
              className={activeWhatIfs.includes(option.key) ? "active" : ""}
              aria-pressed={activeWhatIfs.includes(option.key)}
              disabled={!result}
              onClick={() =>
                setActiveWhatIfs((current) =>
                  current.includes(option.key)
                    ? current.filter((key) => key !== option.key)
                    : [...current, option.key],
                )
              }
            >
              <span>{activeWhatIfs.includes(option.key) ? "Aktif" : "+"}</span> {option.label}
            </button>
          ))}
        </div>
        {!result ? (
          <div className="what-if-empty">Jalankan simulasi untuk menjelajahi perubahan.</div>
        ) : (
          <>
            {!!comparisons.length && (
              <div className="comparison-grid">
                {comparisons.map(({ option, result: after }) => (
                  <ComparisonCard
                    key={option.key}
                    label={option.label}
                    before={result}
                    after={after}
                  />
                ))}
              </div>
            )}
            <div className="impact-section">
              <div className="sim-subhead">
                <strong>Peringkat dampak</strong>
                <span>Perubahan skor median, terbesar lebih dahulu</span>
              </div>
              <div className="impact-chart">
                {ranking.map((item) => {
                  const max = Math.max(...ranking.map((entry) => Math.abs(entry.delta)), 0.01);
                  return (
                    <div key={item.label}>
                      <span>{item.label}</span>
                      <i>
                        <b
                          className={item.delta >= 0 ? "positive" : "negative"}
                          style={{ width: `${Math.max(5, (Math.abs(item.delta) / max) * 100)}%` }}
                        />
                      </i>
                      <strong className={item.delta >= 0 ? "good" : "bad"}>
                        {item.delta >= 0 ? "+" : ""}
                        {item.delta.toFixed(2)}
                      </strong>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
        <div className="sample-note">
          <Icon name="info" size={13} /> Perbedaan mencerminkan pola dalam sampel, bukan dampak yang
          pasti bagi setiap individu.
        </div>
      </GlassCard>

      <div className="sim-disclaimer">
        <Icon name="heart" size={15} />
        <span>
          Perbandingan statistik ini bukan diagnosis medis. Kesejahteraan Anda
          tidak dapat diringkas menjadi satu skor.
        </span>
      </div>

      <Drawer open={drawer} title="Detail Ilmiah" onClose={() => setDrawer(false)}>
        <span className="prototype-badge">Data sampel aktual</span>
        <h3>Ringkasan metode</h3>
        <p>{methodSummary}</p>
        <h3>Bobot fitur</h3>
        <div className="weight-table">
          {Object.entries(simulatorWeights).map(([name, weight]) => (
            <div key={name}>
              <span>
                {
                  {
                    dailyUsage: "Penggunaan harian",
                    beforeSleep: "Waktu sebelum tidur",
                    platformsUsed: "Jumlah platform",
                    nightUsage: "Penggunaan malam",
                    sessionMinutes: "Durasi sesi",
                    age: "Usia",
                    platform: "Platform",
                    purpose: "Tujuan",
                    country: "Negara",
                    gender: "Gender",
                  }[name]
                }
              </span>
              <b>{weight.toFixed(2)}</b>
            </div>
          ))}
        </div>
        <h3>Fakta dataset</h3>
        <dl className="method-list">
          <div>
            <dt>Total data</dt>
            <dd>
              {summaryValue<{ total_respondents: number }>(summaries, "overview")
                .total_respondents.toLocaleString("id-ID")}
            </dd>
          </div>
          <div>
            <dt>Ukuran sampel</dt>
            <dd>{samples.length.toLocaleString("id-ID")}</dd>
          </div>
          <div>
            <dt>Data tersaring digunakan</dt>
            <dd>{filtered.length}</dd>
          </div>
          <div>
            <dt>Tetangga terdekat</dt>
            <dd>Hingga 100</dd>
          </div>
          <div>
            <dt>Tanggal dibuat</dt>
            <dd>Oktober 2025</dd>
          </div>
        </dl>
        <h3>Definisi metrik</h3>
        <ul className="method-points">
          <li>Rentang skor adalah persentil ke-25 hingga ke-75.</li>
          <li>Keyakinan memakai jarak rata-rata, sebaran skor, dan ukuran sampel.</li>
          <li>Persentase kecocokan adalah (1 − jarak rata-rata) × 100.</li>
        </ul>
        <h3>Keterbatasan</h3>
        <ul className="method-points">
          <li>Korelasi bukan hubungan sebab-akibat.</li>
          <li>Perkiraan kNN dihitung dari sampel acak, bukan seluruh baris mentah.</li>
          <li>Beberapa nilai mungkin terpotong pada batas minimum.</li>
          <li>Metode ini belum divalidasi secara klinis.</li>
        </ul>
        <button
          className="primary-button copy-method"
          onClick={() => navigator.clipboard.writeText(methodSummary)}
        >
          <Icon name="table" size={14} /> Salin ringkasan metode
        </button>
      </Drawer>
    </DataPage>
  );
}

const explorerColumns = [
  ["id", "ID"],
  ["age", "Usia"],
  ["gender", "Gender"],
  ["country", "Negara"],
  ["primary_platform", "Platform"],
  ["purpose", "Tujuan"],
  ["num_platforms_used", "Jumlah Platform"],
  ["daily_usage_hours", "Jam Harian"],
  ["avg_session_minutes", "Durasi Sesi"],
  ["night_usage", "Penggunaan Malam"],
  ["screen_time_before_sleep", "Sebelum Tidur"],
  ["mental_health_score", "Skor Mental"],
  ["addiction_level", "Tingkat Kebiasaan"],
] as const;

export function ExplorerPage() {
  const { filtered } = useFilters();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sort, setSort] = useState<keyof RecordData>("id");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [visible, setVisible] = useState<(keyof RecordData)[]>(explorerColumns.map(([key]) => key));
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [selected, setSelected] = useState<RecordData | null>(null);
  const shown = [...filtered]
    .filter((row) => Object.values(row).join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const x = a[sort],
        y = b[sort];
      return (
        (typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y))) * (ascending ? 1 : -1)
      );
    });
  const pages = Math.max(1, Math.ceil(shown.length / perPage));
  const rows = shown.slice((page - 1) * perPage, page * perPage);
  const exportCsv = () => {
    const header = explorerColumns.map(([, label]) => label).join(",");
    const body = filtered
      .map((row) => explorerColumns.map(([key]) => row[key]).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([`${header}\n${body}`], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "genz-pulse-filtered.csv";
    link.click();
    URL.revokeObjectURL(url);
  };
  const setSortKey = (key: keyof RecordData) => {
    if (sort === key) setAscending(!ascending);
    else {
      setSort(key);
      setAscending(true);
    }
  };
  return (
    <DataPage
      title="Penjelajah Data"
      subtitle="Cari, urutkan, periksa, dan ekspor setiap responden yang sesuai."
    >
      <GlassCard className="explorer-card">
        <div className="explorer-tools">
          <label className="search-box">
            <Icon name="search" size={15} />
            <input
              placeholder="Cari seluruh kolom..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <div className="column-menu">
            <button onClick={() => setColumnsOpen(!columnsOpen)}>
              <Icon name="settings" size={15} /> Kolom
            </button>
            {columnsOpen && (
              <div>
                {explorerColumns.map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={visible.includes(key)}
                      onChange={() =>
                        setVisible((state) =>
                          state.includes(key)
                            ? state.filter((item) => item !== key)
                            : [...state, key],
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="primary-button" onClick={exportCsv}>
            <Icon name="download" size={15} /> Ekspor CSV
          </button>
        </div>
        <div className="table-scroll explorer-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {explorerColumns
                  .filter(([key]) => visible.includes(key))
                  .map(([key, label]) => (
                    <th key={key}>
                      <button onClick={() => setSortKey(key)}>
                        {label}
                        {sort === key && (ascending ? " ↑" : " ↓")}
                      </button>
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} onClick={() => setSelected(row)}>
                  {explorerColumns
                    .filter(([key]) => visible.includes(key))
                    .map(([key]) => (
                      <td key={key}>
                        {key === "primary_platform" ? (
                          <div className="platform-cell">
                            <PlatformMark platform={row[key]} size={25} />
                            {row[key]}
                          </div>
                        ) : key === "addiction_level" ? (
                          <StatusPill status={row[key]} />
                        ) : key === "night_usage" ? (
                          row[key] ? (
                            "Ya"
                          ) : (
                            "Tidak"
                          )
                        ) : (
                          row[key]
                        )}
                      </td>
                    ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <span>
            Menampilkan {Math.min((page - 1) * perPage + 1, shown.length)}–
            {Math.min(page * perPage, shown.length)} dari {shown.length}
          </span>
          <div>
            <label>
              Baris
              <select
                value={perPage}
                onChange={(e) => {
                  setPerPage(+e.target.value);
                  setPage(1);
                }}
              >
                <option>10</option>
                <option>20</option>
                <option>50</option>
              </select>
            </label>
            <button disabled={page === 1} onClick={() => setPage(page - 1)}>
              Sebelumnya
            </button>
            <b>
              {page} / {pages}
            </b>
            <button disabled={page === pages} onClick={() => setPage(page + 1)}>
              Berikutnya
            </button>
          </div>
        </div>
      </GlassCard>
      <Drawer
        open={!!selected}
        title={`Responden #${selected?.id}`}
        onClose={() => setSelected(null)}
      >
        {selected && (
          <>
            <div className="profile-hero">
              <PlatformMark platform={selected.primary_platform} size={44} />
              <div>
                <h3>
                  {selected.age} · {labelId(selected.gender)}
                </h3>
                <p>
                  {selected.country} · {selected.primary_platform}
                </p>
              </div>
              <StatusPill status={selected.addiction_level} />
            </div>
            <dl className="detail-list">
              {explorerColumns.slice(5).map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {key === "night_usage"
                      ? selected[key]
                        ? "Ya"
                        : "Tidak"
                      : typeof selected[key] === "string"
                        ? labelId(selected[key])
                        : selected[key]}
                  </dd>
                </div>
              ))}
            </dl>
            <h3>Dibandingkan dengan rata-rata kelompok</h3>
            <div className="comparison-bars">
              {[
                ["Penggunaan harian", "daily_usage_hours"],
                ["Skor mental", "mental_health_score"],
                ["Durasi sesi", "avg_session_minutes"],
              ].map(([label, key]) => {
                const typed = key as keyof RecordData;
                const avg = average(metric(filtered, typed));
                const value = Number(selected[typed]);
                return (
                  <div key={key}>
                    <span>
                      {label}
                      <b>
                        {value.toFixed(1)} vs {avg.toFixed(1)}
                      </b>
                    </span>
                    <i>
                      <b style={{ width: `${Math.min(100, (value / (avg * 1.7)) * 100)}%` }} />
                    </i>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </Drawer>
    </DataPage>
  );
}

const dictionary = [
  ["id", "Bilangan bulat", "Pengenal unik yang dibuat untuk sampel API", "184"],
  ["age", "Bilangan bulat", "Usia dari 13 hingga 27 tahun", "19"],
  ["gender", "Kategori", "Gender berdasarkan laporan mandiri", "Perempuan"],
  ["country", "Kategori", "Negara responden", "Australia"],
  ["primary_platform", "Kategori", "Platform media sosial utama", "Instagram"],
  ["purpose", "Kategori", "Tujuan utama penggunaan", "Content Creation"],
  ["num_platforms_used", "Bilangan bulat", "Jumlah platform aktif", "3"],
  ["daily_usage_hours", "Desimal", "Rata-rata penggunaan harian", "4.25"],
  ["avg_session_minutes", "Desimal", "Rata-rata durasi sesi", "21.4"],
  ["night_usage", "Biner", "Menggunakan media sosial pada malam hari", "1"],
  ["screen_time_before_sleep", "Desimal", "Menit penggunaan sebelum tidur", "38.2"],
  ["mental_health_score", "Desimal", "Skor laporan mandiri dari 1 hingga 10", "6.82"],
  ["addiction_level", "Kategori", "Label kebiasaan berbasis aturan", "Sedang"],
];

export function AboutPage() {
  const { errorMode, setErrorMode } = useFilters();
  const { summaries, samples } = useDashboardData();
  const totalRecords = summaryValue<{ total_respondents: number }>(
    summaries,
    "overview",
  ).total_respondents;
  return (
    <DataPage
      title="Tentang Dataset"
      subtitle="Konteks sumber, kamus data, metodologi, dan keterbatasan penting."
      filters={false}
    >
      <div className="about-grid">
        <GlassCard className="dataset-identity">
          <div className="dataset-big-icon">
            <Icon name="table" size={27} />
          </div>
          <div>
            <span className="prototype-badge">
              {totalRecords.toLocaleString("id-ID")} record aktual ·{" "}
              {samples.length.toLocaleString("id-ID")} record sampel
            </span>
            <h2>Dataset Penggunaan Media Sosial Gen-Z</h2>
            <p>
              Sumber: tabel MySQL <code>data_genz.genz_social_media_usage_1m</code>; ringkasan dan
              sampel disajikan dari MongoDB.
            </p>
          </div>
          <dl>
            <div>
              <dt>Data</dt>
              <dd>{totalRecords.toLocaleString("id-ID")}</dd>
            </div>
            <div>
              <dt>Kolom</dt>
              <dd>13</dd>
            </div>
            <div>
              <dt>Lingkungan</dt>
              <dd>MySQL + MongoDB</dd>
            </div>
          </dl>
        </GlassCard>
        <GlassCard className="quality-card">
          <Icon name="info" />
          <div>
            <h2>Catatan Kualitas Data</h2>
            <p>
              Beberapa nilai mungkin terpotong pada batas minimum, termasuk durasi sesi = 5 dan
              waktu layar sebelum tidur = 0. Presisi desimal berbeda pada tiap kolom.
            </p>
          </div>
        </GlassCard>
        <GlassCard className="quality-card warning">
          <Icon name="alert" />
          <div>
            <h2>Keterbatasan</h2>
            <p>
              Data ini bersifat observasional; hasil eksploratif, bukan bukti sebab-akibat atau
              diagnosis klinis.
            </p>
          </div>
        </GlassCard>
      </div>
      <ChartCard title="Kamus Kolom" subtitle="Nama kolom, tipe data, definisi, dan contoh.">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Deskripsi</th>
                <th>Contoh</th>
              </tr>
            </thead>
            <tbody>
              {dictionary.map(([name, type, description, example]) => (
                <tr key={name}>
                  <td>
                    <code>{name}</code>
                  </td>
                  <td>{type}</td>
                  <td>{description}</td>
                  <td>{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
      <div className="two-grid">
        <ChartCard title="Ringkasan Metodologi" subtitle="Cara kerja dashboard hybrid.">
          <div className="method-steps">
            <div>
              <b>01</b>
              <span>
                <strong>Agregasi penuh</strong>Summary dihitung dari seluruh baris MySQL.
              </span>
            </div>
            <div>
              <b>02</b>
              <span>
                <strong>Sampel acak</strong>Baris responden digunakan untuk filter dan simulator.
              </span>
            </div>
            <div>
              <b>03</b>
              <span>
                <strong>Perhitungan hybrid</strong>Grafik memakai summary atau sampel sesuai filter.
              </span>
            </div>
          </div>
        </ChartCard>
        <ChartCard title="Diagnostik Prototipe" subtitle="Kontrol khusus pengembangan.">
          <div className="dev-toggle">
            <div>
              <strong>Simulasikan kesalahan aplikasi</strong>
              <p>Kontrol diagnostik untuk menguji tampilan kesalahan.</p>
            </div>
            <button
              className={errorMode ? "active" : ""}
              onClick={() => setErrorMode(!errorMode)}
              aria-pressed={errorMode}
            >
              <i />
            </button>
          </div>
        </ChartCard>
      </div>
    </DataPage>
  );
}
