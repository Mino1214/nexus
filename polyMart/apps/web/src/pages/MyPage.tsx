import { useState } from "react";
import { useTranslation } from "react-i18next";
import BetHistory from "../components/betting/BetHistory";
import Button from "../components/ui/Button";
import { useDailyLogin, useLogin, useLogout, useSessionSync, useSignup } from "../hooks/useAuth";
import { useMyBets } from "../hooks/useMyBets";
import { formatPoints } from "../lib/format";
import { useSettingStore } from "../store/settingStore";
import { useUserStore } from "../store/userStore";

export default function MyPage() {
  const { t } = useTranslation();
  const language = useSettingStore((state) => state.language);
  const authenticated = useUserStore((state) => state.authenticated);
  const user = useUserStore((state) => state.user);
  const stats = useUserStore((state) => state.stats);
  const sessionQuery = useSessionSync();
  const signup = useSignup();
  const login = useLogin();
  const logout = useLogout();
  const dailyLogin = useDailyLogin();
  const betsQuery = useMyBets("all", 1, 20);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [signupForm, setSignupForm] = useState({ username: "", email: "", password: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  const today = new Date().toISOString().slice(0, 10);
  const alreadyCheckedIn = user?.lastLogin?.slice(0, 10) === today;

  if (!authenticated) {
    return (
      <section className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="glass-panel rounded-[30px] p-6 sm:p-7">
          <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("mypage.authEyebrow")}</div>
          <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{t("mypage.authTitle")}</h2>
          <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">
            {t("mypage.authBody")}
          </p>
          <div className="mt-6 flex gap-2">
            <Button variant={mode === "login" ? "primary" : "secondary"} onClick={() => setMode("login")}>
              {t("common.login")}
            </Button>
            <Button variant={mode === "signup" ? "primary" : "secondary"} onClick={() => setMode("signup")}>
              {t("mypage.signup")}
            </Button>
          </div>
        </div>

        <div className="glass-panel rounded-[30px] p-6 sm:p-7">
          {mode === "signup" ? (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                signup.mutate({
                  ...signupForm,
                  lang: language,
                });
              }}
            >
              <h3 className="font-display text-2xl font-bold text-[var(--color-text)]">{t("mypage.createAccount")}</h3>
              <input
                value={signupForm.username}
                onChange={(event) => setSignupForm((current) => ({ ...current, username: event.target.value }))}
                placeholder={t("mypage.username")}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
              />
              <input
                value={signupForm.email}
                onChange={(event) => setSignupForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={t("mypage.email")}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
              />
              <input
                type="password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={t("mypage.password")}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
              />
              {signup.error ? <p className="text-sm text-rose-200">{(signup.error as Error).message}</p> : null}
              <Button fullWidth disabled={signup.isPending}>
                {signup.isPending ? t("mypage.creating") : t("mypage.signup")}
              </Button>
            </form>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                login.mutate(loginForm);
              }}
            >
              <h3 className="font-display text-2xl font-bold text-[var(--color-text)]">{t("mypage.welcomeBack")}</h3>
              <input
                value={loginForm.email}
                onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                placeholder={t("mypage.email")}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
              />
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                placeholder={t("mypage.password")}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
              />
              {login.error ? <p className="text-sm text-rose-200">{(login.error as Error).message}</p> : null}
              <Button fullWidth disabled={login.isPending}>
                {login.isPending ? t("mypage.loggingIn") : t("common.login")}
              </Button>
            </form>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <section className="glass-panel rounded-[30px] p-6 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("mypage.accountEyebrow")}</div>
            <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{t("mypage.title")}</h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">
              {t("mypage.accountBody")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={dailyLogin.isPending || alreadyCheckedIn} onClick={() => dailyLogin.mutate()}>
              {alreadyCheckedIn ? t("mypage.checkedIn") : dailyLogin.isPending ? t("mypage.processing") : t("mypage.dailyLogin")}
            </Button>
            <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
              {t("common.logout")}
            </Button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label={t("mypage.user")} value={user?.username ?? "—"} />
          <MetricCard label={t("mypage.points")} value={formatPoints(user?.points ?? 0, language)} accent />
          <MetricCard label={t("mypage.totalBets")} value={String(stats?.totalBets ?? 0)} />
          <MetricCard label={t("mypage.winRate")} value={`${stats?.winRate ?? 0}%`} />
          <MetricCard label={t("mypage.totalProfit")} value={formatPoints(stats?.totalProfit ?? 0, language)} />
        </div>

        {sessionQuery.isError ? <p className="mt-4 text-sm text-rose-200">{(sessionQuery.error as Error).message}</p> : null}
        {dailyLogin.data ? <p className="mt-4 text-sm text-emerald-200">{t("mypage.dailyAward", { amount: formatPoints(dailyLogin.data.awarded, language) })}</p> : null}
      </section>

      <BetHistory items={betsQuery.data?.items ?? []} loading={betsQuery.isLoading} />
    </div>
  );
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${accent ? "text-[var(--color-accent-2)]" : "text-[var(--color-text)]"}`}>{value}</div>
    </div>
  );
}
