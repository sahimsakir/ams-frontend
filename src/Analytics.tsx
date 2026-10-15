import { useEffect, useState } from "react";

type Day = {
  date: string;
  working_day: boolean;
  provisional: boolean;
  total_employees: number;
  new_joiners: number;
  present: number;
  absent: number;
  on_leave: number;
  home_office: number;
  missing_exits: number;
  working_minutes: number;
};
type Month = {
  month: string;
  through: string;
  total_employees: number;
  new_joiners: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  home_office_days: number;
  missing_exits: number;
  working_minutes: number;
  trend: Day[];
};
export type AnalyticsData = {
  scope: "all" | "team" | "self";
  daily: Day | null;
  monthly: Month | null;
};
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const number = (value: number) => new Intl.NumberFormat().format(value || 0);
export function Analytics({
  daily,
  monthly,
  request,
  accessKey,
}: {
  accessKey: string;
  daily: boolean;
  monthly: boolean;
  request: (path: string) => Promise<AnalyticsData>;
}) {
  const [period, setPeriod] = useState(daily ? "daily" : "monthly"),
    [date, setDate] = useState(localToday),
    [month, setMonth] = useState(() => localToday().slice(0, 7)),
    [data, setData] = useState<AnalyticsData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (period === "daily" && !daily) setPeriod("monthly");
    if (period === "monthly" && !monthly) setPeriod("daily");
  }, [daily, monthly, period]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    request(`/analytics?date=${date}&month=${month}`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date, month, retry, daily, monthly, accessKey]);
  const d = data?.daily,
    m = data?.monthly;
  const metrics =
    period === "daily" && d
      ? [
          [
            "Total employees",
            d.total_employees,
            "Active accounts as of selected day",
            "neutral",
          ],
          [
            "New joiners",
            d.new_joiners,
            "Accounts created on this day",
            "blue",
          ],
          ["Present", d.present, "Checked in · office and home", "green"],
          ["On leave", d.on_leave, "Approved leave · working day", "purple"],
          [
            "Home office",
            d.home_office,
            "Recorded remote or approved arrangement",
            "blue",
          ],
          [
            d.provisional ? "No check-in yet" : "Absent",
            d.absent,
            d.provisional
              ? "Provisional until the day ends"
              : "Working day without attendance or leave",
            "amber",
          ],
        ]
      : period === "monthly" && m
        ? [
            [
              "Total employees",
              m.total_employees,
              `Active accounts through ${m.through}`,
              "neutral",
            ],
            [
              "New joiners",
              m.new_joiners,
              "Accounts created this month",
              "blue",
            ],
            [
              "Present days",
              m.present_days,
              "Employee-days with attendance",
              "green",
            ],
            [
              "Leave days",
              m.leave_days,
              "Approved working-day employee-days",
              "purple",
            ],
            [
              "Home office days",
              m.home_office_days,
              "Remote employee-days · overlaps attendance",
              "blue",
            ],
            [
              "Absent days",
              m.absent_days,
              "Completed working days only",
              "amber",
            ],
          ]
        : [];
  return (
    <section className="analytics-workspace" aria-label="Workforce analytics">
      <div className="analytics-controls card">
        <div className="segmented" aria-label="Analytics period">
          {daily && (
            <button
              aria-pressed={period === "daily"}
              onClick={() => setPeriod("daily")}
            >
              Daily
            </button>
          )}
          {monthly && (
            <button
              aria-pressed={period === "monthly"}
              onClick={() => setPeriod("monthly")}
            >
              Monthly
            </button>
          )}
        </div>
        <label>
          {period === "daily" ? "Report date" : "Report month"}
          <input
            aria-label={period === "daily" ? "Report date" : "Report month"}
            type={period === "daily" ? "date" : "month"}
            value={period === "daily" ? date : month}
            max={period === "daily" ? localToday() : localToday().slice(0, 7)}
            onChange={(e) => {
              if (e.target.value)
                (period === "daily" ? setDate : setMonth)(e.target.value);
            }}
          />
        </label>
        <span className="scope-chip">
          {data?.scope === "all"
            ? "All employees"
            : data?.scope === "team"
              ? "Your assigned teams"
              : data?.scope === "self"
                ? "Your account"
                : "Loading scope…"}
        </span>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      )}
      {loading ? (
        <div className="analytics-skeleton" role="status">
          Loading workforce report…
        </div>
      ) : (
        !error && (
          <>
            <div className="analytics-metrics">
              {metrics.map(([title, value, hint, color]) => (
                <article className={`metric-card metric-${color}`} key={title}>
                  <span>{title}</span>
                  <strong>{number(Number(value))}</strong>
                  <p>{hint}</p>
                </article>
              ))}
            </div>
            {period === "daily" && d && (
              <div className="analytics-context card">
                <h2>
                  {d.working_day
                    ? "Daily workforce snapshot"
                    : "Non-working day"}
                </h2>
                <p>
                  {d.provisional
                    ? "Today is still in progress. No check-in yet does not mean a finalized absence."
                    : "Counts reflect the selected day."}{" "}
                  Home office is an arrangement/workplace count and can overlap
                  Present or No check-in. Leave takes priority when there is no
                  attendance.
                </p>
                <div className="mini-stats">
                  <span>
                    <strong>{d.missing_exits}</strong> missing exits
                  </span>
                  <span>
                    <strong>{(d.working_minutes / 60).toFixed(1)}h</strong>{" "}
                    completed shift hours
                  </span>
                </div>
              </div>
            )}
            {period === "monthly" && m && (
              <>
                <div className="card trend-panel">
                  <div className="section-heading">
                    <div>
                      <h2>Attendance through the month</h2>
                      <p>
                        Through {m.through} · each bar represents employee
                        counts for a day
                      </p>
                    </div>
                    <span className="trend-legend">
                      <i className="present-dot" /> Present{" "}
                      <i className="leave-dot" /> Leave{" "}
                      <i className="absent-dot" /> Absent
                    </span>
                  </div>
                  <div
                    className="trend-chart"
                    role="img"
                    aria-label="Daily present, leave and absence counts; exact values in the table below"
                  >
                    {m.trend.map((day) => {
                      const max = Math.max(
                        1,
                        ...m.trend.map((t) => t.total_employees),
                      );
                      return (
                        <div
                          className="trend-day"
                          key={day.date}
                          title={`${day.date}: ${day.present} present, ${day.on_leave} leave, ${day.provisional ? "provisional " : ""}${day.absent} absent`}
                        >
                          <div className="trend-stack">
                            <span
                              className="trend-absent"
                              style={{ height: `${(day.absent / max) * 100}%` }}
                            />
                            <span
                              className="trend-leave"
                              style={{
                                height: `${(day.on_leave / max) * 100}%`,
                              }}
                            />
                            <span
                              className="trend-present"
                              style={{
                                height: `${(day.present / max) * 100}%`,
                              }}
                            />
                          </div>
                          <small>{day.date.slice(-2)}</small>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <details className="card analytics-daily-table">
                  <summary>View daily breakdown</summary>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Date",
                            "Employees",
                            "Present",
                            "Leave",
                            "Home office",
                            "Absent / no check-in",
                          ].map((h) => (
                            <th key={h}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {m.trend.map((day) => (
                          <tr key={day.date}>
                            <td>
                              {day.date}
                              {day.provisional ? " · In progress" : ""}
                            </td>
                            <td>{day.total_employees}</td>
                            <td>{day.present}</td>
                            <td>{day.on_leave}</td>
                            <td>{day.home_office}</td>
                            <td>{day.absent}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
                <div className="mini-stats card">
                  <span>
                    <strong>{m.missing_exits}</strong> missing exits
                  </span>
                  <span>
                    <strong>{(m.working_minutes / 60).toFixed(1)}h</strong>{" "}
                    completed shift hours
                  </span>
                </div>
              </>
            )}
            {!metrics.length && (
              <div className="empty">
                No report is available for this selection.
              </div>
            )}
            <p className="analytics-note">
              Asia/Dhaka time. Reports use current active accounts and current
              team memberships; they are not historical headcount snapshots. New
              joiners means account creation date. Monthly day counts are
              employee-days, not unique people.
            </p>
          </>
        )
      )}
    </section>
  );
}
