import { useEffect, useState } from "react";
import { useFilters } from "../context/FilterContext";
import {
  addictions,
  countries,
  genders,
  platforms,
  purposes,
  type Addiction,
  type Country,
  type Gender,
  type Platform,
  type Purpose,
} from "../data/data";
import { useDashboardData } from "../lib/api";

const translateUiValue = (value: string) => {
  const labels: Record<string, string> = {
    Male: "Laki-laki",
    Female: "Perempuan",
    Other: "Lainnya",
    Entertainment: "Hiburan",
    Socializing: "Bersosialisasi",
    Education: "Pendidikan",
    News: "Berita",
    "Content Creation": "Pembuatan Konten",
    Low: "Rendah",
    Medium: "Sedang",
    High: "Tinggi",
  };
  return labels[value] || value;
};

export type IconName =
  | "pulse"
  | "grid"
  | "pie"
  | "link"
  | "layers"
  | "globe"
  | "heart"
  | "table"
  | "info"
  | "search"
  | "bell"
  | "chevron"
  | "users"
  | "clock"
  | "brain"
  | "alert"
  | "moon"
  | "sun"
  | "reset"
  | "eye"
  | "more"
  | "sparkle"
  | "arrow"
  | "filter"
  | "close"
  | "download"
  | "settings"
  | "trend";

const paths: Record<IconName, React.ReactNode> = {
  pulse: <path d="M3 12h4l2.3-6 4.2 12 2.2-6H21" />,
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="2" />
      <rect x="14" y="3" width="7" height="7" rx="2" />
      <rect x="3" y="14" width="7" height="7" rx="2" />
      <rect x="14" y="14" width="7" height="7" rx="2" />
    </>
  ),
  pie: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9v9z" />
      <path d="M12 3a9 9 0 0 1 9 9h-9z" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  layers: (
    <>
      <path d="m12 2 9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </>
  ),
  heart: (
    <>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
      <path d="M7 12h3l1-2.5 2 5 1-2.5h3" />
    </>
  ),
  table: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.9" />
      <circle cx="9" cy="7" r="4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4.5A3 3 0 0 0 4 6a3 3 0 0 0 .4 1.5A4 4 0 0 0 5 15a3 3 0 0 0 4.5 3.5M14.5 4.5A3 3 0 0 1 20 6a3 3 0 0 1-.4 1.5A4 4 0 0 1 19 15a3 3 0 0 1-4.5 3.5M12 3v18" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 2 20h20zM12 9v4M12 17h.01" />
    </>
  ),
  moon: <path d="M20.5 14.5A8 8 0 0 1 9.5 3.5 9 9 0 1 0 20.5 14.5Z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  reset: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  sparkle: <path d="m12 3 1.4 4.2L18 9l-4.6 1.8L12 15l-1.4-4.2L6 9l4.6-1.8z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  filter: <path d="M4 5h16M7 12h10M10 19h4" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a2 2 0 0 0 .4 2.2l.1.1-2.6 2.6-.1-.1a2 2 0 0 0-2.2-.4 2 2 0 0 0-1.2 1.8V21h-3.6v-.2A2 2 0 0 0 9 19a2 2 0 0 0-2.2.4l-.1.1-2.6-2.6.1-.1a2 2 0 0 0 .4-2.2A2 2 0 0 0 3 13.4H3V9.8h.2A2 2 0 0 0 5 8.6a2 2 0 0 0-.4-2.2l-.1-.1 2.6-2.6.1.1A2 2 0 0 0 9.4 4a2 2 0 0 0 1.2-1.8V2h3.6v.2A2 2 0 0 0 15.4 4a2 2 0 0 0 2.2-.4l.1-.1 2.6 2.6-.1.1a2 2 0 0 0-.4 2.2A2 2 0 0 0 21 9.6h.2v3.6H21a2 2 0 0 0-1.6 1.8Z" />
    </>
  ),
  trend: <path d="m3 17 6-6 4 4 8-9" />,
};

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function GlassCard({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div";
}) {
  return <Tag className={`glass-card ${className}`}>{children}</Tag>;
}

export function PageHeader({
  title,
  subtitle,
  badge,
}: {
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">
          <i /> ANALITIK GENZ PULSE
        </span>
        <div className="page-title-row">
          <h1>{title}</h1>
          {badge && <span>{badge}</span>}
        </div>
        <p>{subtitle}</p>
      </div>
      <div className="live-badge">
        <i /> Perhitungan langsung
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={`status-pill ${status.toLowerCase()}`}>
      <i />
      {translateUiValue(status)}
    </span>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <GlassCard className={`chart-card ${className}`}>
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </GlassCard>
  );
}

export function DataTable({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`table-scroll ${className}`}>
      <table className="data-table">{children}</table>
    </div>
  );
}

function MultiGroup<T extends string>({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: readonly T[];
  selected: readonly T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <fieldset className="filter-group">
      <legend>{label}</legend>
      <div className="chip-wrap">
        {values.map((value) => (
          <button
            type="button"
            key={value}
            aria-pressed={selected.includes(value)}
            className={selected.includes(value) ? "active" : ""}
            onClick={() =>
              onChange(
                selected.includes(value)
                  ? selected.filter((item) => item !== value)
                  : [...selected, value],
              )
            }
          >
            {translateUiValue(value)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function FilterPanel() {
  const { filters, setFilters, reset, filtered, activeCount } = useFilters();
  const { samples, summaries } = useDashboardData();
  const overview = summaries.overview?.data as { total_respondents?: number } | undefined;
  const [open, setOpen] = useState(false);
  const active = [
    ...filters.gender,
    ...filters.country,
    ...filters.platform,
    ...filters.purpose,
    ...filters.addiction,
    ...(filters.night !== "All" ? [`Malam: ${filters.night === "Yes" ? "Ya" : "Tidak"}`] : []),
  ];
  return (
    <GlassCard className={`filter-panel ${open ? "open" : ""}`}>
      <div className="filter-summary">
        <button className="filter-open" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span>
            <Icon name="filter" size={16} /> Filter
            {activeCount > 0 && <b>{activeCount}</b>}
          </span>
          <small>{open ? "Sembunyikan pengaturan" : "Tampilkan pengaturan"}</small>
        </button>
        <span className="result-count">
          {activeCount > 0 ? (
            <>
              Menampilkan <strong>{filtered.length}</strong> dari{" "}
              {samples.length.toLocaleString("id-ID")} sampel
            </>
          ) : (
            <>
              Menampilkan {samples.length.toLocaleString("id-ID")} sampel dari{" "}
              {(overview?.total_respondents ?? 0).toLocaleString("id-ID")} responden
            </>
          )}
        </span>
        <button className="text-button" onClick={reset}>
          <Icon name="reset" size={13} /> Atur ulang
        </button>
      </div>
      {open && (
        <div className="filter-body">
          <MultiGroup<Gender>
            label="Gender"
            values={genders}
            selected={filters.gender}
            onChange={(gender) => setFilters((state) => ({ ...state, gender }))}
          />
          <MultiGroup<Country>
            label="Negara"
            values={countries}
            selected={filters.country}
            onChange={(country) => setFilters((state) => ({ ...state, country }))}
          />
          <MultiGroup<Platform>
            label="Platform utama"
            values={platforms}
            selected={filters.platform}
            onChange={(platform) => setFilters((state) => ({ ...state, platform }))}
          />
          <MultiGroup<Purpose>
            label="Tujuan"
            values={purposes}
            selected={filters.purpose}
            onChange={(purpose) => setFilters((state) => ({ ...state, purpose }))}
          />
          <MultiGroup<Addiction>
            label="Tingkat kebiasaan"
            values={addictions}
            selected={filters.addiction}
            onChange={(addiction) => setFilters((state) => ({ ...state, addiction }))}
          />
          <fieldset className="filter-group">
            <legend>Penggunaan malam</legend>
            <div className="chip-wrap">
              {(["All", "Yes", "No"] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  className={filters.night === value ? "active" : ""}
                  onClick={() => setFilters((state) => ({ ...state, night: value }))}
                >
                  {value === "All" ? "Semua" : value === "Yes" ? "Ya" : "Tidak"}
                </button>
              ))}
            </div>
          </fieldset>
          <RangeFilter
            label="Rentang usia"
            min={13}
            max={27}
            values={filters.age}
            onChange={(age) => setFilters((state) => ({ ...state, age }))}
          />
          <RangeFilter
            label="Penggunaan harian"
            min={0}
            max={10}
            step={0.5}
            suffix=" jam"
            values={filters.usage}
            onChange={(usage) => setFilters((state) => ({ ...state, usage }))}
          />
          <RangeFilter
            label="Platform digunakan"
            min={1}
            max={5}
            values={filters.numPlatforms}
            onChange={(numPlatforms) => setFilters((state) => ({ ...state, numPlatforms }))}
          />
        </div>
      )}
      {!!active.length && (
        <div className="active-chips">
          <span>Aktif:</span>
          {active.slice(0, 8).map((item) => (
            <button key={item} onClick={reset} title="Atur ulang filter">
              {translateUiValue(item)} <Icon name="close" size={10} />
            </button>
          ))}
          {active.length > 8 && <small>+{active.length - 8} lainnya</small>}
        </div>
      )}
    </GlassCard>
  );
}

function RangeFilter({
  label,
  min,
  max,
  step = 1,
  suffix = "",
  values,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  values: [number, number];
  onChange: (value: [number, number]) => void;
}) {
  return (
    <fieldset className="filter-group range-filter">
      <legend>{label}</legend>
      <label>
        <span>
          Minimum <b>{values[0] + suffix}</b>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={values[0]}
          onChange={(event) => onChange([Math.min(+event.target.value, values[1]), values[1]])}
        />
      </label>
      <label>
        <span>
          Maksimum <b>{values[1] + suffix}</b>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={values[1]}
          onChange={(event) => onChange([values[0], Math.max(+event.target.value, values[0])])}
        />
      </label>
    </fieldset>
  );
}

export function Skeleton() {
  return (
    <div className="skeleton-grid" role="status" aria-label="Memuat data">
      <div className="skeleton wide" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton tall" />
      <div className="skeleton tall" />
    </div>
  );
}

export function useSimulatedLoading(dependency: unknown) {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(timer);
  }, [dependency]);
  return loading;
}

export function EmptyState() {
  const { reset } = useFilters();
  return (
    <GlassCard className="state-card">
      <div className="empty-visual">
        <Icon name="search" size={27} />
        <span />
      </div>
      <h2>Tidak ada responden yang sesuai</h2>
      <p>Perluas pilihan filter atau atur ulang untuk melihat seluruh sampel yang tersedia.</p>
      <button className="primary-button" onClick={reset}>
        Atur ulang filter
      </button>
    </GlassCard>
  );
}

export function ErrorState({
  retry,
  message = "Data dashboard tidak dapat dimuat. Coba lagi untuk memulihkan tampilan.",
}: {
  retry: () => void;
  message?: string;
}) {
  return (
    <GlassCard className="state-card">
      <div className="error-visual">
        <Icon name="alert" size={27} />
      </div>
      <h2>Terjadi kesalahan</h2>
      <p>{message}</p>
      <button className="primary-button" onClick={retry}>
        Coba lagi
      </button>
    </GlassCard>
  );
}

export function DataPage({
  title,
  subtitle,
  children,
  filters = true,
  badge,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  filters?: boolean;
  badge?: string;
}) {
  const { filtered, filters: state, errorMode, setErrorMode, activeCount } = useFilters();
  const { status, error, retry, samples } = useDashboardData();
  const loading = useSimulatedLoading(JSON.stringify(state));
  const pageBadge =
    activeCount > 0 ? `Berdasarkan sampel ${samples.length} record` : badge;
  return (
    <div className="page-transition">
      <PageHeader title={title} subtitle={subtitle} badge={pageBadge} />
      {filters && <FilterPanel />}
      {errorMode ? (
        <ErrorState
          retry={() => {
            setErrorMode(false);
          }}
        />
      ) : status === "error" ? (
        <ErrorState retry={() => void retry()} message={error ?? undefined} />
      ) : status === "loading" || loading ? (
        <Skeleton />
      ) : filters && !filtered.length ? (
        <EmptyState />
      ) : (
        children
      )}
    </div>
  );
}

export function Drawer({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <>
      <button className="drawer-backdrop" onClick={onClose} aria-label="Tutup panel" />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <div>
            <span>GENZ PULSE</span>
            <h2>{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Tutup">
            <Icon name="close" />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

export const chartColors = {
  indigo: "#F06A4F",
  violet: "#F2A33A",
  teal: "#36B8B2",
  amber: "#D6AD59",
  coral: "#AA9580",
  slate: "#8B8783",
};

export const tooltipStyle = {
  contentStyle: {
    background: "rgba(255, 255, 255, .96)",
    border: "1px solid rgba(74, 69, 66, .12)",
    borderRadius: 10,
    boxShadow: "0 10px 30px rgba(66, 58, 54, .16)",
    fontSize: 11,
    color: "#3E3A38",
  },
  labelStyle: { color: "#756F6B", marginBottom: 4 },
  itemStyle: { color: "#3E3A38" },
};
