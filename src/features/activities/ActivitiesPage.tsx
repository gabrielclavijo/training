import { Icon, type IconName } from "../../components/ui/Icon";
import { useMemo, useState } from "react";
import { Calendar, type CalItem } from "../../components/ui/Calendar";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { LoadBadge } from "../../components/ui/Badges";
import { EmptyState } from "../../components/ui/EmptyState";
import { Alert, Page, Spinner } from "../../components/ui/Page";
import type { Sport } from "../../core/activity/types";
import { formatDateTime } from "../../core/dates";
import {
  formatDistance,
  formatDuration,
  formatElevation,
  formatNumber,
} from "../../core/units";
import type { ActivityWithLoad } from "../../data/analysis";
import { useFitness } from "../../data/hooks";
import { SPORTS } from "./sports";

const PAGE = 30;

export function ActivitiesPage() {
  const { t } = useTranslation();
  const { loaded, isLoading, error, today } = useFitness();
  const [sport, setSport] = useState<Sport | "all">("all");
  const [limit, setLimit] = useState(PAGE);
  const [mode, setMode] = useState<"cal" | "list">(() => {
    try {
      return localStorage.getItem("entreno.activitiesView") === "list"
        ? "list"
        : "cal";
    } catch {
      return "cal";
    }
  });
  const byDay = useMemo(() => {
    const m = new Map<string, ActivityWithLoad[]>();
    for (const l of loaded ?? [])
      if (sport === "all" || l.activity.sport === sport)
        m.set(l.day, [...(m.get(l.day) ?? []), l]);
    return m;
  }, [loaded, sport]);

  const actions = (
    <Link className="btn btn-secondary" to="/actividades/nueva">
      {t("activities.addManual")}
    </Link>
  );
  if (isLoading)
    return (
      <Page title={t("activities.title")}>
        <Spinner full />
      </Page>
    );
  if (error)
    return (
      <Page title={t("activities.title")}>
        <Alert kind="error">{t("errors.generic")}</Alert>
      </Page>
    );
  if (!loaded || loaded.length === 0) {
    return (
      <Page title={t("activities.title")} actions={actions}>
        <EmptyState
          icon="activity"
          title={t("empty.activities.title")}
          body={t("empty.activities.body")}
          actionLabel={t("empty.activities.action")}
          actionTo="/subir"
        />
      </Page>
    );
  }
  const filtered = loaded.filter(
    (l) => sport === "all" || l.activity.sport === sport,
  );
  return (
    <Page title={t("activities.title")} actions={actions}>
      <div className="field" style={{ maxWidth: 280 }}>
        <label htmlFor="sport-filter">{t("activities.filterSport")}</label>
        <select
          id="sport-filter"
          value={sport}
          onChange={(e) => {
            setSport(e.target.value as Sport | "all");
            setLimit(PAGE);
          }}
        >
          <option value="all">{t("activities.all")}</option>
          {SPORTS.map((s) => (
            <option key={s} value={s}>
              {t(`sports.${s}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="row-between acts-bar">
        <p className="muted" aria-live="polite">
          {t("activities.count", { count: filtered.length })}
        </p>
        <div
          className="seg seg-inline"
          role="group"
          aria-label={t("activities.viewLabel")}
        >
          {(["cal", "list"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`seg-btn${mode === m ? " is-on" : ""}`}
              aria-pressed={mode === m}
              onClick={() => {
                setMode(m);
                try {
                  localStorage.setItem("entreno.activitiesView", m);
                } catch {
                  /* sin almacenamiento */
                }
              }}
            >
              <Icon name={m === "cal" ? "calendar" : "menu"} />{" "}
              {t(`activities.view.${m}`)}
            </button>
          ))}
          <span
            className={`seg-thumb${mode === "list" ? " seg-thumb-month" : ""}`}
            aria-hidden="true"
          />
        </div>
      </div>
      {mode === "cal" ? (
        <section className="card" aria-label={t("activities.calendar")}>
          <Calendar
            label={t("activities.calendar")}
            today={today}
            getDay={(d) => {
              const list = byDay.get(d) ?? [];
              const load = list.reduce((a, l) => a + (l.load.load ?? 0), 0);
              const secs = list.reduce(
                (a, l) => a + (l.activity.movingS || l.activity.elapsedS || 0),
                0,
              );
              return {
                items: list.map((l) => ({
                  id: l.activity.id,
                  icon: SPORT_ICON[l.activity.sport] ?? "activity",
                  tone: SPORT_TONE[l.activity.sport] ?? "mint",
                  title: l.activity.title ?? t(`sports.${l.activity.sport}`),
                  meta: summaryLine(l),
                  value:
                    l.load.load !== null
                      ? t("activities.pts", {
                          value: formatNumber(l.load.load),
                        })
                      : undefined,
                  to: `/actividades/${l.activity.id}`,
                })),
                total: list.length
                  ? `${(secs > 0 ? formatDuration(secs) : '0 h')} · ${t("activities.pts", { value: formatNumber(load) })}`
                  : undefined,
                empty: { text: t("activities.noneThatDay"), icon: "bed" },
              };
            }}
            summary={({ from, to }) => {
              const list = [...byDay.entries()]
                .filter(([d]) => d >= from && d <= to)
                .flatMap(([, x]) => x);
              const secs = list.reduce(
                (a, l) => a + (l.activity.movingS || l.activity.elapsedS || 0),
                0,
              );
              return (
                <>
                  <strong className="num">{list.length}</strong>{" "}
                  {t("activities.calCount", { count: list.length })} ·{" "}
                  <strong className="num">{(secs > 0 ? formatDuration(secs) : '0 h')}</strong>
                </>
              );
            }}
          />
        </section>
      ) : (
        <>
          <ul className="activity-list">
            {filtered.slice(0, limit).map((l) => (
              <ActivityRow key={l.activity.id} item={l} />
            ))}
          </ul>
          {filtered.length > limit && (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setLimit(limit + PAGE)}
            >
              {t("activities.showMore")}
            </button>
          )}
        </>
      )}
    </Page>
  );
}

const SPORT_ICON: Record<string, IconName> = {
  cycling: "bike",
  running: "run",
  swimming: "swim",
  strength: "dumbbell",
  other: "activity",
};
const SPORT_TONE: Record<string, CalItem["tone"]> = {
  cycling: "mint",
  running: "coral",
  swimming: "sky",
  strength: "amber",
  other: "soft",
};

function summaryLine(item: ActivityWithLoad) {
  const a = item.activity;
  return [
    formatDuration(a.movingS || a.elapsedS),
    a.distanceM ? formatDistance(a.distanceM) : null,
    a.elevationGainM ? `↑ ${formatElevation(a.elevationGainM)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ActivityRow({ item }: { item: ActivityWithLoad }) {
  const { t } = useTranslation();
  const a = item.activity;
  const sub = a.subSport ? ` · ${t(`subSports.${a.subSport}`)}` : "";
  const parts = [
    formatDuration(a.movingS || a.elapsedS),
    a.distanceM ? formatDistance(a.distanceM) : null,
    a.elevationGainM ? `↑ ${formatElevation(a.elevationGainM)}` : null,
  ].filter(Boolean);
  return (
    <li className="activity-item">
      <Link to={`/actividades/${a.id}`} className="activity-link">
        <span
          className={`icon-tile activity-tile${a.sport === "running" ? " icon-tile-coral" : a.sport === "swimming" ? " icon-tile-sky" : a.sport === "strength" ? " icon-tile-soft" : ""}`}
          aria-hidden="true"
        >
          <Icon name={SPORT_ICON[a.sport] ?? "activity"} />
        </span>
        <span className="activity-sport">
          {t(`sports.${a.sport}`)}
          {sub}
        </span>
        <strong className="activity-title">
          {a.title ?? t(`sports.${a.sport}`)}
        </strong>
        <span className="muted">
          {formatDateTime(a.startTime, { timeZone: a.timezone ?? undefined })}
        </span>
        <span>{parts.join(" · ")}</span>
        <span className="row" style={{ gap: "var(--space-2)" }}>
          {item.load.load !== null ? (
            <strong>
              {t("load.points", { value: formatNumber(item.load.load) })}
            </strong>
          ) : (
            <span className="muted">{t("load.noLoad")}</span>
          )}
          <LoadBadge
            method={item.load.method}
            confidence={item.load.confidence}
          />
          {a.sources.length > 1 && (
            <span className="badge badge-info">{t("activities.merged")}</span>
          )}
        </span>
      </Link>
    </li>
  );
}
