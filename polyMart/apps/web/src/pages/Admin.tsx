import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { LanguageCode, StoredTranslation } from "@polywatch/shared";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Button from "../components/ui/Button";
import { useAdminTranslations, useSaveTranslation } from "../hooks/useTranslations";
import { useExternalAdminExchange } from "../hooks/useAuth";
import { languageToLocale } from "../lib/format";
import { useSettingStore } from "../store/settingStore";
import { useUserStore } from "../store/userStore";

const editableLanguages: LanguageCode[] = ["ko", "ja", "zh"];

interface TranslationFormState {
  marketId: string;
  question: string;
  description: string;
}

function toFormState(item?: StoredTranslation | null): TranslationFormState {
  return {
    marketId: item?.marketId ?? "",
    question: item?.question ?? "",
    description: item?.description ?? "",
  };
}

export default function AdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pandoraAdminUrl = import.meta.env.VITE_PANDORA_ADMIN_URL?.trim() || "";
  const appLanguage = useSettingStore((state) => state.language);
  const authenticated = useUserStore((state) => state.authenticated);
  const user = useUserStore((state) => state.user);
  const canAccessAdmin = authenticated && Boolean(user?.isAdmin);
  const externalExchange = useExternalAdminExchange();
  const attemptedSsoTokenRef = useRef<string | null>(null);
  const [ssoError, setSsoError] = useState<string | null>(null);
  const [editorLanguage, setEditorLanguage] = useState<LanguageCode>(appLanguage === "en" ? "ko" : appLanguage);
  const [selected, setSelected] = useState<StoredTranslation | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [form, setForm] = useState<TranslationFormState>(toFormState());
  const translationsQuery = useAdminTranslations(editorLanguage, 1, 20, canAccessAdmin);
  const saveTranslation = useSaveTranslation();
  const items = translationsQuery.data?.items ?? [];

  useEffect(() => {
    if (editorLanguage === "en") {
      setEditorLanguage("ko");
    }
  }, [editorLanguage]);

  useEffect(() => {
    const ssoToken = searchParams.get("ssoToken");
    if (!ssoToken || attemptedSsoTokenRef.current === ssoToken) {
      return;
    }

    attemptedSsoTokenRef.current = ssoToken;
    setSsoError(null);
    externalExchange.mutate(
      { token: ssoToken },
      {
        onSuccess: () => {
          navigate("/admin", { replace: true });
        },
        onError: (error) => {
          setSsoError(error instanceof Error ? error.message : "Pandora SSO login failed.");
          navigate("/admin", { replace: true });
        },
      },
    );
  }, [externalExchange, navigate, searchParams]);

  useEffect(() => {
    if (!items.length) {
      if (!saveTranslation.isPending) {
        setSelected(null);
        if (!isCreatingNew) {
          setForm((current) => (current.marketId || current.question || current.description ? current : toFormState()));
        }
      }
      return;
    }

    if (isCreatingNew) {
      return;
    }

    const matched = selected ? items.find((item) => item.marketId === selected.marketId && item.lang === selected.lang) : null;
    const nextSelected = matched ?? items[0];
    setSelected(nextSelected);
    setForm((current) => (
      current.marketId && current.marketId !== nextSelected.marketId
        ? current
        : toFormState(nextSelected)
    ));
  }, [isCreatingNew, items, saveTranslation.isPending, selected]);

  function handlePick(item: StoredTranslation) {
    setIsCreatingNew(false);
    setSelected(item);
    setForm(toFormState(item));
  }

  function handleReset() {
    setIsCreatingNew(true);
    setSelected(null);
    setForm(toFormState());
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await saveTranslation.mutateAsync({
      marketId: form.marketId.trim(),
      lang: editorLanguage,
      question: form.question.trim(),
      description: form.description.trim(),
    });
    setIsCreatingNew(false);
    setSelected(result);
    setForm(toFormState(result));
  }

  if (externalExchange.isPending) {
    return (
      <section className="glass-panel rounded-[30px] p-6 sm:p-7">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin / Pandora SSO</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">PolyWatch 관리자 세션 연결 중</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">
          Pandora에서 전달된 관리자 토큰을 확인하고 있습니다. 잠시만 기다리세요.
        </p>
      </section>
    );
  }

  if (ssoError) {
    return (
      <section className="glass-panel rounded-[30px] p-6 sm:p-7">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin / Pandora SSO</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">SSO 연결 실패</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-rose-200">{ssoError}</p>
        <div className="mt-6">
          <Link to="/mypage">
            <Button variant="secondary">{t("admin.goLogin")}</Button>
          </Link>
        </div>
      </section>
    );
  }

  if (!authenticated) {
    return (
      <section className="glass-panel rounded-[30px] p-6 sm:p-7">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin / Protected</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{t("admin.loginRequiredTitle")}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">{t("admin.loginRequiredBody")}</p>
        <div className="mt-6">
          <Link to="/mypage">
            <Button>{t("admin.goLogin")}</Button>
          </Link>
        </div>
      </section>
    );
  }

  if (!user?.isAdmin) {
    return (
      <section className="glass-panel rounded-[30px] p-6 sm:p-7">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin / Protected</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{t("admin.adminOnlyTitle")}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[var(--color-muted)]">{t("admin.adminOnlyBody")}</p>
        <div className="mt-6">
          <Link to="/">
            <Button variant="secondary">{t("admin.goMarkets")}</Button>
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="glass-panel rounded-[30px] p-6 sm:p-7">
        <div className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">{t("admin.launcherEyebrow")}</div>
        <h2 className="mt-2 font-display text-3xl font-bold text-[var(--color-text)]">{t("admin.title")}</h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-[var(--color-muted)]">{t("admin.placeholder")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {user?.authSource === "pandora" ? (
            <div className="inline-flex rounded-full border border-[rgba(86,212,199,0.24)] bg-[rgba(86,212,199,0.08)] px-4 py-2 text-xs uppercase tracking-[0.18em] text-[var(--color-accent)]">
              Pandora SSO · {user.adminRole?.toUpperCase() ?? "ADMIN"}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ServiceCard
            eyebrow={t("admin.services.pandora.eyebrow")}
            title={t("admin.services.pandora.title")}
            body={t("admin.services.pandora.body")}
            badge={t("admin.services.pandora.badge")}
            action={pandoraAdminUrl ? (
              <a href={pandoraAdminUrl} target="_blank" rel="noreferrer">
                <Button variant="secondary">{t("admin.openPandora")}</Button>
              </a>
            ) : (
              <Button variant="secondary" disabled>
                {t("admin.services.unavailable")}
              </Button>
            )}
          />
          <ServiceCard
            eyebrow={t("admin.services.polywatch.eyebrow")}
            title={t("admin.services.polywatch.title")}
            body={t("admin.services.polywatch.body")}
            badge={t("admin.services.polywatch.badge")}
            action={<Button disabled>{t("admin.services.polywatch.current")}</Button>}
            accent
          />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Metric label={t("admin.metrics.cache")} value={t("admin.metrics.cacheValue")} />
          <Metric label={t("admin.metrics.editor")} value={t("admin.metrics.editorValue")} accent />
          <Metric label={t("admin.metrics.target")} value={editorLanguage.toUpperCase()} />
        </div>
      </div>

      <div className="glass-panel rounded-[30px] p-5">
        <div className="flex flex-wrap gap-2">
          {editableLanguages.map((language) => (
            <Button
              key={language}
              variant={editorLanguage === language ? "primary" : "secondary"}
              onClick={() => {
                setEditorLanguage(language);
                setIsCreatingNew(false);
                setSelected(null);
                setForm(toFormState());
              }}
            >
              {language.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
        <div className="glass-panel rounded-[30px] p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl font-bold text-[var(--color-text)]">{t("admin.listTitle")}</h3>
            <span className="rounded-full bg-[rgba(255,255,255,0.04)] px-3 py-1 text-xs text-[var(--color-muted)]">
              {translationsQuery.data?.total ?? 0}
            </span>
          </div>

          {translationsQuery.isLoading ? (
            <div className="rounded-[22px] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
              {t("common.loading")}
            </div>
          ) : translationsQuery.isError ? (
            <div className="rounded-[22px] border border-[rgba(255,82,82,0.3)] bg-[rgba(255,82,82,0.08)] p-4 text-sm text-rose-200">
              {(translationsQuery.error as Error).message}
            </div>
          ) : !items.length ? (
            <div className="rounded-[22px] border border-dashed border-[var(--color-border)] p-4 text-sm text-[var(--color-muted)]">
              {t("admin.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <button
                  key={`${item.marketId}-${item.lang}`}
                  type="button"
                  onClick={() => handlePick(item)}
                  className={`w-full rounded-[22px] border p-4 text-left transition ${
                    selected?.marketId === item.marketId
                      ? "border-[rgba(86,212,199,0.35)] bg-[rgba(86,212,199,0.08)]"
                      : "border-[var(--color-border)] bg-[rgba(255,255,255,0.03)]"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
                    {item.marketId} · {item.source}
                  </div>
                  <div className="mt-2 line-clamp-2 text-sm font-medium text-[var(--color-text)]">{item.question}</div>
                  <div className="mt-2 text-xs text-[var(--color-muted)]">
                    {new Intl.DateTimeFormat(languageToLocale(appLanguage), {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(item.translatedAt))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <form className="glass-panel space-y-4 rounded-[30px] p-6" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between gap-4">
            <h3 className="font-display text-xl font-bold text-[var(--color-text)]">{t("admin.editorTitle")}</h3>
            <Button type="button" variant="secondary" onClick={handleReset}>
              {t("admin.reset")}
            </Button>
          </div>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("admin.marketId")}</span>
            <input
              value={form.marketId}
              onChange={(event) => setForm((current) => ({ ...current, marketId: event.target.value }))}
              placeholder="677397"
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("admin.question")}</span>
            <textarea
              value={form.question}
              onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("admin.description")}</span>
            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              rows={8}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none"
            />
          </label>

          {saveTranslation.error ? (
            <div className="rounded-[22px] border border-[rgba(255,82,82,0.3)] bg-[rgba(255,82,82,0.08)] px-4 py-3 text-sm text-rose-200">
              {(saveTranslation.error as Error).message}
            </div>
          ) : null}

          {saveTranslation.isSuccess ? (
            <div className="rounded-[22px] border border-[rgba(86,212,199,0.3)] bg-[rgba(86,212,199,0.08)] px-4 py-3 text-sm text-emerald-100">
              {t("admin.saved")}
            </div>
          ) : null}

          <Button
            fullWidth
            disabled={saveTranslation.isPending || !form.marketId.trim() || !form.question.trim()}
          >
            {saveTranslation.isPending ? t("common.loading") : t("admin.save")}
          </Button>
        </form>
      </div>
    </section>
  );
}

function ServiceCard({
  eyebrow,
  title,
  body,
  badge,
  action,
  accent = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  badge: string;
  action: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-[26px] border p-5 ${
        accent
          ? "border-[rgba(86,212,199,0.28)] bg-[rgba(86,212,199,0.08)]"
          : "border-[var(--color-border)] bg-[rgba(255,255,255,0.03)]"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-[var(--color-muted)]">{eyebrow}</div>
          <h3 className="mt-2 font-display text-2xl font-bold text-[var(--color-text)]">{title}</h3>
        </div>
        <div className="rounded-full border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
          {badge}
        </div>
      </div>
      <p className="mt-4 text-sm leading-7 text-[var(--color-muted)]">{body}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
      <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${accent ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>{value}</div>
    </div>
  );
}
