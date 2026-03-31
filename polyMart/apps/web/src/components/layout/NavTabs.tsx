import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cx } from "../../lib/format";
import { useUserStore } from "../../store/userStore";

export default function NavTabs() {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  const tabs = [
    { to: "/", labelKey: "nav.markets", end: true },
    { to: "/leaderboard", labelKey: "nav.leaderboard" },
    { to: "/mypage", labelKey: "nav.mypage" },
    ...(user?.isAdmin ? [{ to: "/admin", labelKey: "nav.admin" }] : []),
  ];

  return (
    <nav className="relative z-10 mx-auto flex w-full max-w-7xl gap-2 px-4 pt-4 sm:px-6 lg:px-8">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cx(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              isActive
                ? "bg-[rgba(86,212,199,0.14)] text-[var(--color-accent)]"
                : "text-[var(--color-muted)] hover:bg-[rgba(255,255,255,0.03)] hover:text-[var(--color-text)]",
            )
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}
