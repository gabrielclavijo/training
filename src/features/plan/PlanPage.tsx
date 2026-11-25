import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "../../components/ui/EmptyState";
import { Alert, Page, Spinner } from "../../components/ui/Page";
import { addDays, formatDate, weekStart } from "../../core/dates";
import { formatNumber } from "../../core/units";
import { usePlanChanges } from "./usePlanChanges";
import { Icon, type IconName, TitleIcon } from "../../components/ui/Icon";
import { LegalNotice, SESSION_ICON, ZonesNotice } from "./SessionView";
import { TodayCard } from "./TodayCard";
import { Calendar, type CalItem } from "../../components/ui/Calendar";
import { usePlan } from "./usePlan";
import { Progress } from "../../components/ui/Status";
import { PausesSection } from "../season/SeasonPage";

const fmt = (d: string) => formatDate(`${d}T12:00:00Z`);

export function PlanPage() {
  const { t } = useTranslation();
  const { derived, isLoading, error } = usePlan();

  if (isLoading)
    return (
      <Page title={t("plan.title")}>
        <Spinner full />
      </Page>
    );
  if (error || !derived)
    return (
      <Page title={t("plan.title")}>
        <Alert kind="error">{t("errors.generic")}</Alert>
      </Page>
    );
  const { plan, today, matches, zones, ctx } = derived;

  const hasGoals = ctx.goals.some((g) => g.status === "active");
  const firstWeek = plan.weeks[0]?.weekStart ?? weekStart(today);
  const lastWeek = plan.weeks.at(-1)?.weekStart ?? weekStart(today);

  return (
    <Page
      title={t("plan.title")}
      actions={
        <Link className="btn btn-secondary" to="/plan/disponibilidad">
          {t("plan.availability.title")}
        </Link>
      }
    >
      <LegalNotice />
      <ZonesNotice zones={zones} />
      {!hasGoals && (
        <EmptyState
          icon="goal"
          title={t("plan.noPlan")}
          body={t("plan.noPlanBody")}
          actionLabel={t("plan.createGoal")}
          actionTo="/metas/nueva"
        />
      )}

      <TodayCard />

      <section className="card plan-cal" aria-label={t("plan.calendar")}>
        <Calendar
          label={t("plan.calendar")}
          today={today}
          defaultView="week"
          min={firstWeek}
          max={addDays(lastWeek, 6)}
          getDay={(d) => {
            const wk = plan.weeks.find((w) => w.weekStart === weekStart(d));
            const list = plan.sessions.filter(
              (x) => x.date === d && x.kind !== "rest",
            );
            const items: CalItem[] = list.map((x) => {
              const st = matches.get(x.id)?.status;
              return {
                id: x.id,
                icon:
                  x.kind === "event"
                    ? "flag"
                    : (SESSION_ICON[x.sport] ?? "activity"),
                tone:
                  x.kind === "event"
                    ? "coral"
                    : x.kind === "long"
                      ? "amber"
                      : x.kind === "recovery"
                        ? "sky"
                        : "mint",
                title: `${t(`plan.kind.${x.kind}`)} · ${t(`sports.${x.sport}`)}`,
                meta: `${t("plan.minutes", { count: x.durationMin })} · ${t("plan.load", { value: Math.round(x.plannedLoad) })}`,
                to: `/plan/sesion/${x.id}`,
                badge: st
                  ? {
                      text: t(`plan.status.${st}`),
                      tone:
                        st === "done" || st === "partial"
                          ? "good"
                          : st === "missed" || st === "harder"
                            ? "warn"
                            : "info",
                    }
                  : undefined,
              };
            });
            const sts = list.map((x) => matches.get(x.id)?.status);
            const pause = wk?.phase === "pause";
            return {
              items,
              mark: list.some((x) => x.kind === "event")
                ? "event"
                : sts.some(
                      (x) => x === "done" || x === "partial" || x === "harder",
                    )
                  ? "done"
                  : sts.includes("missed")
                    ? "missed"
                    : pause
                      ? "pause"
                      : undefined,
              total: list.length
                ? t("plan.calTotal", {
                    value: formatNumber(
                      list.reduce((a, x) => a + x.plannedLoad, 0),
                    ),
                  })
                : undefined,
              empty: pause
                ? { text: t("plan.calPause"), icon: "pause" }
                : { text: t("plan.kind.rest"), icon: "bed" },
            };
          }}
          summary={({ view, from, to }) => {
            const planned = plan.sessions
              .filter((x) => x.date >= from && x.date <= to)
              .reduce((a, x) => a + x.plannedLoad, 0);
            const done = ctx.loaded
              .filter((l) => l.day >= from && l.day <= to && l.day <= today)
              .reduce((a, l) => a + (l.load.load ?? 0), 0);
            return (
              <>
                {t(view === "week" ? "plan.calWeekLoad" : "plan.calMonthLoad")}{" "}
                <strong className="num">
                  {from <= today ? `${formatNumber(done)} / ` : ""}
                  {formatNumber(planned)}
                </strong>
              </>
            );
          }}
          above={({ view, from }) => {
            if (view !== "week") return null;
            const wk = plan.weeks.find((w) => w.weekStart === from);
            if (!wk) return null;
            const done = ctx.loaded
              .filter((l) => l.day >= from && l.day <= addDays(from, 6))
              .reduce((a, l) => a + (l.load.load ?? 0), 0);
            const pct =
              wk.targetLoad > 0 && from <= today
                ? Math.round((done / wk.targetLoad) * 100)
                : null;
            return (
              <div className="plan-week-info">
                <span className={`phase-pill phase-pill-${wk.phase}`}>
                  <Icon name={PHASE_ICON[wk.phase] ?? "activity"} />{" "}
                  {t(`plan.phase.${wk.phase}`)}
                </span>
                {pct !== null && (
                  <div className="plan-week-progress">
                    <p className="week-pct">
                      <strong className="num">{pct} %</strong>{" "}
                      <span className="muted">{t("fitness.heroWeek")}</span>
                    </p>
                    <Progress
                      pct={pct}
                      level="good"
                      label={`${pct} % ${t("fitness.heroWeek")}`}
                    />
                  </div>
                )}
                {wk.notes.map((n) => (
                  <p key={n} className="callout">
                    {t(`plan.notes.${n}`)}
                  </p>
                ))}
              </div>
            );
          }}
        />
      </section>

      <UpcomingWeeks />
      <PausesSection />
      <ChangesList />
    </Page>
  );
}

const PHASE_ICON: Record<string, IconName> = {
  base: "trend",
  build: "bolt",
  recovery_week: "leaf",
  taper: "gauge",
  event: "flag",
  recovery: "leaf",
  return: "refresh",
  pause: "pause",
  maintenance: "activity",
};
const REASON_ICON: Record<string, IconName> = {
  initial: "sparkles",
  goals_changed: "flag",
  pause: "pause",
  availability: "clock",
  overreached: "alert",
  missed_sessions: "calendar",
  harder_than_planned: "bolt",
  weekly: "refresh",
  adaptation: "refresh",
};

function UpcomingWeeks() {
  const { t } = useTranslation();
  const { derived } = usePlan();
  if (!derived) return null;
  const goals = new Map(derived.ctx.goals.map((g) => [g.id, g.name]));
  const future = derived.plan.weeks.filter(
    (w) => w.weekStart > weekStart(derived.today),
  );
  if (!future.length) return null;
  const maxLoad = Math.max(1, ...future.map((w) => w.targetLoad));
  return (
    <section className="card" aria-labelledby="up-h">
      <h2 id="up-h" className="card-title-icon">
        <TitleIcon name="calendar" tone="sky" />
        {t("plan.nextWeeks")}
      </h2>
      <ul className="week-cards">
        {future.map((w, i) => (
          <li
            key={w.weekStart}
            className={`week-card phase-${w.phase}`}
            style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
          >
            <span className="week-card-date">
              {fmt(w.weekStart).slice(0, 5)}
            </span>
            <span className={`phase-pill phase-pill-${w.phase}`}>
              <Icon name={PHASE_ICON[w.phase] ?? "activity"} />{" "}
              {t(`plan.phase.${w.phase}`)}
            </span>
            {w.goalId && goals.get(w.goalId) && (
              <span className="week-card-goal">{goals.get(w.goalId)}</span>
            )}
            <span className="week-card-load">
              <span className="macro-track" aria-hidden="true">
                <span
                  className="phase-fill"
                  style={{ width: `${(w.targetLoad / maxLoad) * 100}%` }}
                />
              </span>
              <span className="num">
                {t("fitness.load")} {formatNumber(w.targetLoad)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChangesList() {
  const { t } = useTranslation();
  const changes = usePlanChanges();
  return (
    <section className="card" aria-labelledby="ch-h">
      <h2 id="ch-h" className="card-title-icon">
        <TitleIcon name="refresh" tone="soft" />
        {t("plan.changesTitle")}
      </h2>
      {changes.data?.length === 0 && (
        <p className="muted">{t("plan.noChanges")}</p>
      )}
      <ol className="change-line">
        {(changes.data ?? []).slice(0, 10).map((c, i) => (
          <li key={c.id} style={{ animationDelay: `${i * 50}ms` }}>
            <span
              className={`change-dot reason-${c.reason}`}
              aria-hidden="true"
            >
              <Icon name={REASON_ICON[c.reason] ?? "refresh"} />
            </span>
            <div>
              <span className="chip change-date">
                {formatDate(c.createdAt)}
              </span>
              <p>
                {t(`plan.changes.${c.reason}`, {
                  ...c.params,
                  defaultValue: t("plan.changes.weekly"),
                })}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
