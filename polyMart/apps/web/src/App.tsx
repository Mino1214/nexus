import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { Routes, Route } from "react-router-dom";
import Header from "./components/layout/Header";
import NavTabs from "./components/layout/NavTabs";
import TickerBar from "./components/layout/TickerBar";

const HomePage = lazy(() => import("./pages/Home"));
const MarketDetailPage = lazy(() => import("./pages/MarketDetail"));
const LeaderboardPage = lazy(() => import("./pages/Leaderboard"));
const MyPage = lazy(() => import("./pages/MyPage"));
const AdminPage = lazy(() => import("./pages/Admin"));

export default function App() {
  const { t } = useTranslation();

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[8%] top-16 h-56 w-56 rounded-full bg-[rgba(86,212,199,0.15)] blur-3xl" />
        <div className="absolute right-[10%] top-28 h-48 w-48 rounded-full bg-[rgba(255,201,120,0.14)] blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-[rgba(67,114,207,0.14)] blur-3xl" />
      </div>

      <TickerBar />
      <Header />
      <NavTabs />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <Suspense fallback={<div className="glass-panel rounded-[28px] p-6 text-sm text-[var(--color-muted)]">{t("common.loading")}</div>}>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/markets/:id" element={<MarketDetailPage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/admin" element={<AdminPage />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
