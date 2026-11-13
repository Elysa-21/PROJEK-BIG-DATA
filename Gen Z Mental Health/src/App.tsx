import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { FilterProvider } from "./context/FilterContext";
import { ErrorState, GlassCard, Icon, Skeleton, type IconName } from "./components/ui";
import { DashboardDataProvider, useDashboardData } from "./lib/api";
import {
  AboutPage,
  CorrelationPage,
  CountriesPage,
  DistributionPage,
  ExplorerPage,
  OverviewPage,
  PlatformsPage,
  SimulatorPage,
} from "./pages";

const navigation: { path: string; label: string; icon: IconName }[] = [
  { path: "/overview", label: "Ringkasan", icon: "grid" },
  { path: "/distribution", label: "Distribusi", icon: "pie" },
  { path: "/correlation", label: "Korelasi", icon: "link" },
  { path: "/platforms", label: "Platform", icon: "layers" },
  { path: "/countries", label: "Negara", icon: "globe" },
  { path: "/simulator", label: "Simulator Kesehatan Mental", icon: "heart" },
  { path: "/explorer", label: "Penjelajah Data", icon: "table" },
  { path: "/about", label: "Tentang Dataset", icon: "info" },
];

function Sidebar() {
  const { samples } = useDashboardData();
  return (
    <aside className="sidebar glass-card">
      <Link to="/overview" className="brand">
        <span>
          <Icon name="pulse" size={22} />
        </span>
        <strong>GenZ Pulse</strong>
      </Link>
      <nav aria-label="Navigasi utama">
        {navigation.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <Link to="/about" className="dataset-card">
        <span className="dataset-icon">
          <Icon name="table" size={18} />
        </span>
        <span>
          <small>DATASET LOKAL</small>
          <strong>Penggunaan Media Sosial Gen-Z</strong>
          <em>{samples.length.toLocaleString("id-ID")} record sampel</em>
        </span>
        <Icon name="chevron" size={14} />
      </Link>
    </aside>
  );
}

type Theme = "light" | "dark";

function Topbar({ theme, toggleTheme }: { theme: Theme; toggleTheme: () => void }) {
  const { status, lastUpdated } = useDashboardData();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatars = ["🐰", "🦁", "🐱", "🐻", "🐼", "🦊", "🐨", "🐯"];
  const [avatar, setAvatar] = useState(
    () => window.localStorage.getItem("genz-pulse-avatar") || "🐼",
  );
  const chooseAvatar = (value: string) => {
    setAvatar(value);
    setAvatarOpen(false);
    window.localStorage.setItem("genz-pulse-avatar", value);
  };
  return (
    <header className="topbar glass-card">
      <form
        className="global-search"
        onSubmit={(event) => {
          event.preventDefault();
          if (search.trim()) navigate(`/explorer?search=${encodeURIComponent(search.trim())}`);
        }}
      >
        <Icon name="search" size={17} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari negara, platform, atau responden..."
          aria-label="Pencarian global"
        />
      </form>
      <div className="top-actions">
        <div className={`api-state ${status}`} role="status">
            <span>
              {status === "live"
                ? "LIVE"
                : status === "reconnecting"
                  ? "Reconnecting"
                  : status === "error"
                    ? "ERROR"
                    : "Loading"}
            </span>
          <small>
            Terakhir update:{" "}
            {lastUpdated
              ? new Date(lastUpdated).toLocaleString("id-ID")
              : status === "error"
                ? "tidak tersedia"
                : "memuat"}
          </small>
        </div>
        <button
          className="theme-toggle"
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
          aria-pressed={theme === "dark"}
          title={theme === "dark" ? "Gunakan tema terang" : "Gunakan tema gelap"}
        >
          <span className="theme-toggle-track">
            <Icon name="sun" size={13} />
            <Icon name="moon" size={13} />
            <i className={theme} />
          </span>
          <small>{theme === "dark" ? "Gelap" : "Terang"}</small>
        </button>
        <div className="avatar-picker">
          <button
            className="avatar-trigger"
            onClick={() => setAvatarOpen(!avatarOpen)}
            aria-expanded={avatarOpen}
            aria-label="Pilih avatar"
          >
            <span className="avatar">{avatar}</span>
            <span>
              <strong>Avatar Saya</strong>
              <small>Pilih karakter</small>
            </span>
            <Icon name="chevron" size={14} />
          </button>
          {avatarOpen && (
            <div className="avatar-menu glass-card">
              <strong>Pilih avatar favorit</strong>
              <p>Pilihan akan disimpan di perangkat ini.</p>
              <div>
                {avatars.map((item) => (
                  <button
                    key={item}
                    className={avatar === item ? "active" : ""}
                    onClick={() => chooseAvatar(item)}
                    aria-label={`Pilih avatar ${item}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function NotFound() {
  return (
    <div className="page-transition not-found">
      <GlassCard className="state-card">
        <div className="not-found-code">404</div>
        <h1>Halaman tidak ditemukan</h1>
        <p>Alamat dashboard yang Anda buka tidak tersedia atau sudah dipindahkan.</p>
        <Link className="primary-button" to="/overview">
          Kembali ke Ringkasan
        </Link>
      </GlassCard>
    </div>
  );
}

function AppRoutes() {
  const location = useLocation();
  const { samples, status, error, retry } = useDashboardData();
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = window.localStorage.getItem("genz-pulse-theme");
    if (saved === "light" || saved === "dark") return saved;
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("genz-pulse-theme", theme);
  }, [theme]);

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <Sidebar />
      <main>
        <Topbar
          theme={theme}
          toggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
        />
        <div className="route-content" key={location.pathname}>
          {status === "loading" ? (
            <Skeleton />
          ) : status === "error" ? (
            <ErrorState retry={() => void retry()} message={error ?? undefined} />
          ) : (
            <Routes location={location}>
              <Route path="/" element={<Navigate to="/overview" replace />} />
              <Route path="/overview" element={<OverviewPage />} />
              <Route path="/distribution" element={<DistributionPage />} />
              <Route path="/correlation" element={<CorrelationPage />} />
              <Route path="/platforms" element={<PlatformsPage />} />
              <Route path="/countries" element={<CountriesPage />} />
              <Route path="/simulator" element={<SimulatorPage />} />
              <Route path="/explorer" element={<ExplorerPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          )}
        </div>
        <footer>
          <span>GenZ Pulse · Dashboard Riset Media Sosial dan Kesehatan Mental</span>
          <span>MongoDB · {samples.length.toLocaleString("id-ID")} record sampel</span>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1900);
    return () => window.clearTimeout(timer);
  }, []);

  if (showSplash) {
    return (
      <div className="splash-screen" role="status" aria-label="Memuat GenZ Pulse">
        <span className="splash-shape shape-one" />
        <span className="splash-shape shape-two" />
        <span className="splash-shape shape-three" />
        <div className="splash-content">
          <div className="splash-brand">
            <Icon name="pulse" size={34} />
          </div>
          <span className="splash-kicker">ANALITIK GENERASI Z</span>
          <h1>GenZ Pulse</h1>
          <p>Memahami kebiasaan media sosial dan kesejahteraan mental Generasi Z.</p>
          <div className="splash-loader">
            <i />
          </div>
          <small>Menyiapkan dashboard...</small>
        </div>
      </div>
    );
  }

  return (
    <DashboardDataProvider>
      <BrowserRouter>
        <FilterProvider>
          <AppRoutes />
        </FilterProvider>
      </BrowserRouter>
    </DashboardDataProvider>
  );
}
