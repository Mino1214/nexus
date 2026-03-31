import { useEffect, useState } from "react";
import { BET_RULES, calcOdds, getOutcomePrices, getOutcomes, type PolyMarket } from "@polywatch/shared";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { formatPoints, displayQuestion } from "../../lib/format";
import { useBet } from "../../hooks/useBet";
import { useSettingStore } from "../../store/settingStore";
import { useUserStore } from "../../store/userStore";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import OddsDisplay from "./OddsDisplay";

interface BetModalProps {
  market: PolyMarket | null;
  open: boolean;
  onClose: () => void;
}

export default function BetModal({ market, open, onClose }: BetModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const language = useSettingStore((state) => state.language);
  const user = useUserStore((state) => state.user);
  const authenticated = useUserStore((state) => state.authenticated);
  const pointsBalance = user?.points ?? 0;
  const outcomes = market ? getOutcomes(market) : [];
  const prices = market ? getOutcomePrices(market) : [];
  const [selectedOutcome, setSelectedOutcome] = useState("");
  const [points, setPoints] = useState<number>(BET_RULES.min_bet);
  const betMutation = useBet();

  useEffect(() => {
    if (!market) {
      return;
    }

    setSelectedOutcome(outcomes[0] ?? "");
    setPoints(BET_RULES.min_bet);
  }, [market?.id]);

  if (!market) {
    return null;
  }

  const selectedIndex = Math.max(0, outcomes.findIndex((outcome) => outcome === selectedOutcome));
  const price = prices[selectedIndex] ?? 0;
  const odds = calcOdds(price);
  const potentialWin = Math.floor(points * odds);
  const netProfit = potentialWin - points;

  async function handleBet() {
    if (!market) {
      return;
    }

    if (!authenticated) {
      onClose();
      navigate("/mypage");
      return;
    }

    await betMutation.mutateAsync({
      market_id: market.id,
      outcome: selectedOutcome,
      points,
    });
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={t("bet.title")}>
      <div className="space-y-5">
        <div className="rounded-[22px] bg-[rgba(255,255,255,0.03)] p-4">
          <div className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">{t("market.marketLabel")}</div>
          <div className="mt-2 text-lg font-semibold leading-7 text-[var(--color-text)]">{displayQuestion(market)}</div>
        </div>

        <div className="flex flex-wrap gap-2">
          {outcomes.map((outcome) => (
            <Button
              key={outcome}
              variant={selectedOutcome === outcome ? "primary" : "secondary"}
              onClick={() => setSelectedOutcome(outcome)}
            >
              {outcome}
            </Button>
          ))}
        </div>

        <label className="block">
          <span className="mb-2 block text-sm text-[var(--color-muted)]">{t("bet.enterPoints")}</span>
          <input
            type="number"
            min={BET_RULES.min_bet}
            max={BET_RULES.max_bet}
            value={points}
            onChange={(event) => setPoints(Math.max(BET_RULES.min_bet, Math.min(BET_RULES.max_bet, Number(event.target.value || BET_RULES.min_bet))))}
            className="w-full rounded-2xl border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition focus:border-[rgba(86,212,199,0.36)]"
          />
        </label>

        <div className="rounded-[22px] border border-[var(--color-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3 text-sm text-[var(--color-muted)]">
          {t("bet.currentPoints")}: <span className="font-mono text-[var(--color-text)]">{formatPoints(pointsBalance, language)}</span>
        </div>

        <OddsDisplay odds={odds} potentialWin={potentialWin} netProfit={netProfit} />

        {!authenticated ? (
          <div className="rounded-[22px] border border-dashed border-[rgba(255,201,120,0.3)] bg-[rgba(255,201,120,0.08)] px-4 py-3 text-sm leading-6 text-[rgba(255,232,198,0.92)]">
            {t("bet.loginRequired")}
          </div>
        ) : null}

        {betMutation.error ? (
          <div className="rounded-[22px] border border-[rgba(255,82,82,0.3)] bg-[rgba(255,82,82,0.08)] px-4 py-3 text-sm text-rose-200">
            {(betMutation.error as Error).message}
          </div>
        ) : null}

        <Button fullWidth disabled={betMutation.isPending || (authenticated && points > pointsBalance)} onClick={handleBet}>
          {betMutation.isPending ? t("common.loading") : authenticated ? t("bet.confirm") : t("bet.goToLogin")}
        </Button>
      </div>
    </Modal>
  );
}
