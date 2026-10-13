import React, {
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  CalendarDays,
  Clock3,
  Users,
  LogOut,
  ArrowUpRight,
  Camera,
  Check,
  X,
  Plus,
  Building2,
  ShieldCheck,
  ChevronRight,
  Home,
  Settings,
  FileCheck2,
} from "lucide-react";
import "./style.css";
import { CameraChallenge } from "./CameraChallenge";
type User = {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
  designation?: string;
  phone?: string;
  face_enrolled?: boolean;
  face_reset_available?: boolean;
};
type Leave = {
  id: number;
  name: string;
  annual_limit: number;
  used?: number;
  reserved?: number;
  remaining?: number;
};
type Approval = {
  id: number;
  reviewer_id: number;
  name: string;
  status: string;
  comment?: string;
};
type Application = {
  id: number;
  user_id: number;
  kind: string;
  applicant: string;
  leave_name?: string;
  start_date: string;
  end_date: string | null;
  days: number;
  minutes?: number;
  reason: string;
  status: string;
  approvals: Approval[];
};
type Attendance = {
  id: number;
  user_id: number;
  name: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  mode: string;
};
type Team = {
  id: number;
  name: string;
  members: { id: number; name: string; team_role: string }[];
};
type Day = { id: number; date: string; name: string; is_working: boolean };
type Dashboard = {
  balances: Leave[];
  today: Attendance | null;
  pending_reviews: number;
  teams: { name: string; team_role: string }[];
};
type Page<T> = { data: T[]; current_page: number; last_page: number };
let token = sessionStorage.getItem("ams_token") || "";
const API = import.meta.env.VITE_API_URL || "/api";
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const requestToken = token;
  const form = body instanceof FormData;
  const res = await fetch(API + path, {
    method,
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!form && body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? (form ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401 && path !== "/login" && token === requestToken) {
      sessionStorage.removeItem("ams_token");
      window.dispatchEvent(new Event("ams-expired"));
    }
    if (data.face_enrollment_required) window.dispatchEvent(new Event("ams-enroll-required"));
    throw new Error(
      data.errors
        ? Object.values(data.errors).flat().join(" ")
        : data.message || "Request failed",
    );
  }
  return data;
}
const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
const date = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
const time = (s?: string | null) => {
  if (!s) return "—";
  let iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(iso)) iso += "Z";
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return "Time unavailable";
  return value.toLocaleString("en-GB", {
    timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
};
function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{label(value)}</span>;
}
function Field({ title, children }: { title: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{title}</span>
      {children}
    </label>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <FileCheck2 size={30} />
      <h3>All clear</h3>
      <p>{children}</p>
    </div>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [page, setPage] = useState(
      location.hash === "#requests" ? "requests" : "overview",
    ),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, refresh] = useState(0),
    [dash, setDash] = useState<Dashboard | null>(null),
    [requests, setRequests] = useState<Page<Application> | null>(null),
    [att, setAtt] = useState<Page<Attendance> | null>(null),
    [teams, setTeams] = useState<Team[]>([]),
    [people, setPeople] = useState<User[]>([]),
    [leaves, setLeaves] = useState<Leave[]>([]),
    [days, setDays] = useState<Day[]>([]),
    [modal, setModal] = useState<string | null>(null),
    [enrollmentUser, setEnrollmentUser] = useState<User | null>(null),
    [editing, setEditing] = useState<User | null>(null),
    [editingTeam, setEditingTeam] = useState<Team | null>(null),
    [reqPage, setReqPage] = useState(1),
    [attPage, setAttPage] = useState(1),
    [audit, setAudit] = useState<
      {
        id: number;
        name: string;
        action: string;
        subject: string;
        created_at: string;
      }[]
    >([]),
    [faceEnrolled, setFaceEnrolled] = useState(false);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      refresh((n) => n + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const expired = () => {
      token = "";
      setUser(null);
      setFaceEnrolled(false);
      setModal(null);
      setPeople([]);
      setRequests(null);
      setAtt(null);
      setDash(null);
      setTeams([]);
      setAudit([]);
      setPage(location.hash === "#requests" ? "requests" : "overview");
      setReady(true);
    };
    const requireEnrollment = () => { setFaceEnrolled(false); setModal(null); setEnrollmentUser(null); };
    window.addEventListener("ams-enroll-required", requireEnrollment);
    window.addEventListener("ams-expired", expired);
    if (token)
      api<{ user: User; face_enrolled: boolean }>("/me")
        .then((d) => {
          setUser(d.user);
          setFaceEnrolled(d.face_enrolled);
        })
        .catch((e) => setError(e.message))
        .finally(() => setReady(true));
    else setReady(true);
    return () => { window.removeEventListener("ams-expired", expired); window.removeEventListener("ams-enroll-required", requireEnrollment); };
  }, []);
  useEffect(() => {
    if (!user || !faceEnrolled) return;
    let alive = true;
    Promise.all([
      api<Dashboard>("/dashboard"),
      api<Page<Application>>(`/applications?page=${reqPage}`),
      api<Page<Attendance>>(`/attendance?page=${attPage}`),
      api<Team[]>("/teams"),
      api<Leave[]>("/leave-types"),
      api<Day[]>("/calendar"),
      api<{ user: User; face_enrolled: boolean }>("/me"),
    ])
      .then(([d, r, a, t, l, h, m]) => {
        if (alive) {
          setDash(d);
          setRequests(r);
          setAtt(a);
          setTeams(t);
          setLeaves(l);
          setDays(h);
          setFaceEnrolled(m.face_enrolled);
        }
      })
      .catch((e) => alive && setError(e.message));
    if (user.role === "owner")
      Promise.all([
        api<User[]>("/users"),
        api<
          Page<{
            id: number;
            name: string;
            action: string;
            subject: string;
            created_at: string;
          }>
        >("/audit"),
      ])
        .then(([p, a]) => {
          if (alive) {
            setPeople(p);
            setAudit(a.data);
          }
        })
        .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [user, faceEnrolled, revision, reqPage, attPage]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  async function submit(path: string, body: unknown, method = "POST") {
    await api(path, method, body);
    setModal(null);
    setEditing(null);
    setEditingTeam(null);
    setNotice("Saved successfully.");
  }
  function nav(p: string) {
    setPage(p);
    setError("");
  }
  if (!ready) return <div className="loading">Opening your workspace…</div>;
  if (!user)
    return (
      <div className="login">
        <section className="login-story">
          <div className="brand">
            <div className="logo">a</div> attendance<span>WORKSPACE</span>
          </div>
          <div>
            <span className="eyebrow">MORE CLARITY. EVERY WORKDAY.</span>
            <h1>
              Your people.
              <br />
              One connected
              <br />
              <em>workspace.</em>
            </h1>
            <p>
              Attendance, time off and teamwork.
              <br />A little less admin. A lot more focus.
            </p>
          </div>
          <span>BUILT FOR TEAMS THAT WORK TOGETHER</span>
        </section>
        <section className="login-form">
          <span className="eyebrow">WELCOME BACK</span>
          <h2>Make today count.</h2>
          <p>Sign in to your attendance workspace.</p>
          {error && (
            <div role="alert" className="alert error">
              {error}
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              run(async () => {
                const d = await api<{ token: string; user: User }>(
                  "/login",
                  "POST",
                  Object.fromEntries(f),
                );
                token = d.token;
                sessionStorage.setItem("ams_token", token);
                const me = await api<{ user: User; face_enrolled: boolean }>("/me");
                setFaceEnrolled(me.face_enrolled);
                setUser(me.user);
              });
            }}
          >
            <Field title="Work email">
              <input
                required
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@company.com"
              />
            </Field>
            <Field title="Password">
              <input
                required
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </Field>
            <button disabled={busy} className="primary wide">
              {busy ? "Signing in…" : "Sign in"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <small>Need access? Contact your workspace owner.</small>
        </section>
      </div>
    );
  if (!faceEnrolled) return (
    <div className="enrollment-required">
      <section className="modal enrollment-gate" role="dialog" aria-modal="true" aria-labelledby="enrollment-required-title">
        <span className="eyebrow">WELCOME, {user.name}</span>
        <h2 id="enrollment-required-title">Enroll your face to continue</h2>
        <p>Complete these 3 quick camera checks to unlock your workspace. You only need to enroll once.</p>
        <CameraChallenge purpose="enroll" request={api} onVerified={async (challenge_id) => {
          const result = await api<{ message: string }>("/face/enroll", "POST", { challenge_id });
          setFaceEnrolled(true); setNotice(result.message); refresh((n) => n + 1);
        }} />
        <button className="text-button gate-signout" onClick={() => run(async () => {
          await api("/logout", "POST"); token = ""; sessionStorage.removeItem("ams_token"); setUser(null); setFaceEnrolled(false); setError("");
        })}>Sign out</button>
      </section>
    </div>
  );
  const review =
    requests?.data.filter(
      (a) =>
        a.status === "pending" &&
        a.approvals.some(
          (x) => x.reviewer_id === user.id && x.status === "pending",
        ),
    ) || [];
  const navigation: [string, string, typeof Home][] = [
    ["overview", "Overview", LayoutDashboard],
    ["attendance", "Attendance", Clock3],
    ["requests", "Requests", CalendarDays],
    ["teams", "My teams", Users],
    ...(user.role === "owner"
      ? ([
          ["people", "People", Users],
          ["settings", "Workspace", Settings],
        ] as [string, string, typeof Home][])
      : []),
  ] as const;
  const requestCards = (items: Application[]) =>
    items.length ? (
      items.map((a) => (
        <article className="request-card" key={a.id}>
          <div className="request-top">
            <span className="icon-box">
              {a.kind === "home_office" ? (
                <Home size={20} />
              ) : a.kind === "leave" ? (
                <CalendarDays size={20} />
              ) : (
                <Clock3 size={20} />
              )}
            </span>
            <div>
              <strong>{a.leave_name || label(a.kind)}</strong>
              <small>
                {a.applicant} · #{a.id}
              </small>
            </div>
            <Badge value={a.status} />
          </div>
          <h4>
            {date(a.start_date)}{" "}
            {a.end_date && a.end_date !== a.start_date
              ? "– " + date(a.end_date)
              : !a.end_date
                ? "→ No end date"
                : ""}
          </h4>
          <p>{a.reason}</p>
          <div className="reviewers">
            {a.approvals.map((x) => (
              <span key={x.id} title={x.comment || ""}>
                {x.status === "approved" ? (
                  <Check size={13} />
                ) : x.status === "rejected" ? (
                  <X size={13} />
                ) : (
                  <Clock3 size={13} />
                )}{" "}
                {x.name} · {x.status}
                {x.comment ? " — " + x.comment : ""}
              </span>
            ))}
          </div>
          <div className="card-actions">
            {a.status === "pending" &&
              a.approvals.some(
                (x) => x.reviewer_id === user.id && x.status === "pending",
              ) && (
                <>
                  <button
                    disabled={busy}
                    className="primary small"
                    onClick={() =>
                      run(() =>
                        submit(`/applications/${a.id}/decision`, {
                          decision: "approved",
                        }),
                      )
                    }
                  >
                    Approve
                  </button>
                  <button
                    disabled={busy}
                    className="danger small"
                    onClick={() => {
                      const comment = prompt("Reason for rejection");
                      if (comment?.trim())
                        run(() =>
                          submit(`/applications/${a.id}/decision`, {
                            decision: "rejected",
                            comment,
                          }),
                        );
                    }}
                  >
                    Reject
                  </button>
                </>
              )}
            {(a.user_id === user.id || user.role === "owner") &&
              (a.status === "pending" ||
                (a.kind === "home_office" && a.status === "approved")) && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Cancel this request / revoke this home-office arrangement?",
                      )
                    )
                      run(() => submit(`/applications/${a.id}/cancel`, {}));
                  }}
                >
                  Cancel arrangement / request
                </button>
              )}
          </div>
        </article>
      ))
    ) : (
      <Empty>No requests to display.</Empty>
    );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="logo">a</div>
          <div>
            attendance<small>TEAM WORKSPACE</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navigation.map(([id, title, Icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => nav(id)}
            >
              <Icon size={19} />
              <span className="nav-text">{title}</span>
              {id === "requests" && !!dash?.pending_reviews && (
                <b>{dash.pending_reviews}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={24} />
          <strong>A clearer working day</strong>
          <p>Your attendance and requests, together in one place.</p>
        </div>
        <button className="account" onClick={() => setModal("password")}>
          <div className="avatar">
            {user.name
              .split(" ")
              .slice(0, 2)
              .map((n) => n[0])
              .join("")}
          </div>
          <span>
            <strong>{user.name}</strong>
            <small>{label(user.role)}</small>
          </span>
          <Settings size={16} />
        </button>
        <button
          className="signout"
          onClick={() =>
            run(async () => {
              await api("/logout", "POST");
              token = "";
              sessionStorage.removeItem("ams_token");
              setUser(null);
              setPeople([]);
              setRequests(null);
              setAtt(null);
              setDash(null);
              setTeams([]);
              setAudit([]);
              setPage(location.hash === "#requests" ? "requests" : "overview");
            })
          }
        >
          <LogOut size={16} /> <span>Sign out</span>
        </button>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Workspace <ChevronRight size={14} /> {label(page)}
          </span>
          <span className="live-dot">Asia / Dhaka</span>
        </header>
        <div className="content">
          {error && (
            <div className="alert error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="alert success">
              {notice}
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: "Asia/Dhaka",
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })
                  .format(new Date())
                  .toUpperCase()}
              </span>
              <h1>
                {page === "overview"
                  ? `Good to see you, ${user.name.split(" ")[0]}.`
                  : {
                      requests: "Your time, well managed.",
                      attendance: "Every workday, accounted for.",
                      teams: "Better, together.",
                      people: "Meet your people.",
                      settings: "Your workspace, your way.",
                    }[page]}
              </h1>
              <p>
                {page === "overview"
                  ? "Here’s what’s happening in your workspace today."
                  : "Stay connected to the details that matter."}
              </p>
            </div>
            <button className="primary" onClick={() => setModal("leave")}>
              <Plus size={17} /> New request
            </button>
          </div>
          {page === "overview" && (
            <>
              <section className="overview-grid">
                <div className="clock-card">
                  <div className="clock-head">
                    <span className="eyebrow">TODAY’S ATTENDANCE</span>
                    <Badge
                      value={
                        dash?.today?.check_out
                          ? "completed"
                          : dash?.today
                            ? "checked_in"
                            : "not_started"
                      }
                    />
                  </div>
                  <h2>
                    {dash?.today?.check_out
                      ? "You’re all done."
                      : dash?.today
                        ? "You’re on the clock."
                        : "Ready when you are."}
                  </h2>
                  <p>
                    {dash?.today
                      ? "Make room for your best work."
                      : "Complete the live camera checks to start your day."}
                  </p>
                  <div className="clock-times">
                    <div>
                      <small>CHECK IN · ASIA/DHAKA</small>
                      <strong>{time(dash?.today?.check_in)}</strong>
                    </div>
                    <div>
                      <small>CHECK OUT · ASIA/DHAKA</small>
                      <strong>{time(dash?.today?.check_out)}</strong>
                    </div>
                    <div>
                      <small>WORKPLACE</small>
                      <strong className="mode">
                        {dash?.today ? label(dash.today.mode) : "—"}
                      </strong>
                    </div>
                  </div>
                  <button
                    disabled={faceEnrolled && !!dash?.today?.check_out}
                    onClick={() => setModal(!faceEnrolled ? "enroll" : dash?.today ? "out" : "in")}
                  >
                    <Camera size={18} />
                    {!faceEnrolled ? "Enroll my face" : dash?.today?.check_out
                      ? "Workday complete"
                      : dash?.today
                        ? "Capture & check out"
                        : "Capture & check in"}
                    <ArrowUpRight size={18} />
                  </button>
                  {!faceEnrolled && (
                    <small className="enroll-note">
                      Complete your guided self-enrollment before giving attendance.
                    </small>
                  )}
                </div>
                <div className="card quick">
                  <span className="eyebrow">MAKE SPACE FOR LIFE</span>
                  <h2>Plan your time.</h2>
                  {[
                    [
                      "leave",
                      "Apply for leave",
                      "A little time to recharge",
                      CalendarDays,
                    ],
                    [
                      "home_office",
                      "Work from home",
                      "A day, a month, or ongoing",
                      Home,
                    ],
                    [
                      "overtime",
                      "Record overtime",
                      "Keep your extra effort visible",
                      Clock3,
                    ],
                  ].map(([id, title, desc, Icon]) => {
                    const I = Icon as typeof Home;
                    return (
                      <button
                        key={id as string}
                        onClick={() => setModal(id as string)}
                      >
                        <span className="icon-box">
                          <I size={20} />
                        </span>
                        <span>
                          <strong>{title as string}</strong>
                          <small>{desc as string}</small>
                        </span>
                        <ChevronRight size={18} />
                      </button>
                    );
                  })}
                </div>
              </section>
              <div className="section-heading">
                <h2>Your leave balance</h2>
                <span>
                  {new Date().getFullYear()} entitlement · pending days reserved
                </span>
              </div>
              <section className="balances">
                {dash?.balances.map((l, i) => (
                  <div className={"card balance color" + (i % 3)} key={l.id}>
                    <div>
                      <span>{l.name}</span>
                      <CalendarDays size={18} />
                    </div>
                    <h2>
                      {l.remaining}
                      <small>days available</small>
                    </h2>
                    <div className="progress">
                      <i
                        style={{
                          width: `${Math.max(0, ((l.remaining || 0) / Math.max(l.annual_limit, 1)) * 100)}%`,
                        }}
                      />
                    </div>
                    <footer>
                      {l.used} used{" "}
                      <span>
                        {l.reserved} pending · {l.annual_limit} total
                      </span>
                    </footer>
                  </div>
                ))}
              </section>
              <section className="bottom-grid">
                <div>
                  <div className="section-heading">
                    <h2>Recent requests</h2>
                    <button
                      className="text-button"
                      onClick={() => nav("requests")}
                    >
                      View all <ArrowUpRight size={14} />
                    </button>
                  </div>
                  {requestCards(
                    requests?.data
                      .filter((a) => a.user_id === user.id)
                      .slice(0, 3) || [],
                  )}
                </div>
                <div>
                  <div className="section-heading">
                    <h2>Coming up</h2>
                    <CalendarDays size={18} />
                  </div>
                  <div className="card calendar">
                    {days
                      .filter(
                        (d) =>
                          d.date >=
                          new Date().toLocaleDateString("en-CA", {
                            timeZone: "Asia/Dhaka",
                          }),
                      )
                      .slice(0, 5)
                      .map((d) => (
                        <div key={d.id}>
                          <b>
                            {d.date.slice(8)}
                            <small>
                              {new Date(
                                d.date + "T00:00:00",
                              ).toLocaleDateString("en", { month: "short" })}
                            </small>
                          </b>
                          <span>
                            <strong>{d.name}</strong>
                            <small>
                              {d.is_working ? "Working day" : "Holiday"}
                            </small>
                          </span>
                        </div>
                      ))}
                    {!days.length && (
                      <p>
                        No calendar overrides yet. Your default weekend is
                        Friday–Saturday.
                      </p>
                    )}
                  </div>
                  <div className="team-callout">
                    <Users size={23} />
                    <h3>Your team connections</h3>
                    <p>
                      {dash?.teams.map((t) => t.name).join(" · ") ||
                        "No teams assigned yet."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => nav("teams")}
                    >
                      Explore teams <ArrowUpRight size={15} />
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}
          {page === "requests" && (
            <>
              <div className="info-banner">
                <ShieldCheck size={20} />
                <span>
                  Every assigned reviewer must approve. Requests never approve
                  automatically.
                </span>
              </div>
              {review.length > 0 && (
                <>
                  <h2 className="section-title">Waiting for your review</h2>
                  <div className="request-grid">{requestCards(review)}</div>
                </>
              )}
              <h2 className="section-title">Request history</h2>
              <div className="request-grid">
                {requestCards(requests?.data || [])}
              </div>
              <Pager value={requests} onChange={setReqPage} />
            </>
          )}
          {page === "attendance" && (
            <>
              <div className="toolbar">
                <p>Live-camera verified records · all times Asia/Dhaka</p>
                <div>
                  {!faceEnrolled && <button className="primary" onClick={() => setModal("enroll")}>Enroll my face</button>}
                  <button
                    onClick={() => setModal("in")}
                    disabled={!faceEnrolled || !!dash?.today}
                  >
                    Check in
                  </button>
                  <button
                    onClick={() => setModal("out")}
                    disabled={!faceEnrolled || !dash?.today || !!dash?.today.check_out}
                  >
                    Check out
                  </button>
                </div>
              </div>
              <div className="card table-wrap" role="region" aria-label="Scrollable records table" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Workplace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {att?.data.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <strong>{a.name}</strong>
                        </td>
                        <td>{date(a.work_date)}</td>
                        <td>{time(a.check_in)}</td>
                        <td>{time(a.check_out)}</td>
                        <td>
                          <Badge value={a.mode} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!att?.data.length && (
                  <Empty>No attendance recorded yet.</Empty>
                )}
              </div>
              <Pager value={att} onChange={setAttPage} />
            </>
          )}
          {page === "teams" && (
            <>
              <div className="section-heading">
                <h2>{teams.length} team connections</h2>
                {user.role === "owner" && (
                  <button onClick={() => setModal("team")}>
                    <Plus size={16} /> Create team
                  </button>
                )}
              </div>
              <div className="request-grid">
                {teams.map((t) => (
                  <div className="card team-card" key={t.id}>
                    <span className="icon-box">
                      <Building2 size={24} />
                    </span>
                    <h2>{t.name}</h2>
                    <p>{t.members.length} people · connected across roles</p>
                    {t.members.map((m) => (
                      <div className="member" key={m.id}>
                        <div className="avatar">{m.name[0]}</div>
                        <strong>{m.name}</strong>
                        <small>{label(m.team_role)}</small>
                      </div>
                    ))}
                    {user.role === "owner" && (
                      <button
                        className="wide"
                        onClick={() => {
                          setEditingTeam(t);
                          setModal("members");
                        }}
                      >
                        Manage members
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!teams.length && (
                <Empty>Your team assignments will appear here.</Empty>
              )}
            </>
          )}
          {page === "people" && user.role === "owner" && (
            <>
              <div className="section-heading">
                <h2>{people.length} people in your workspace</h2>
                <button
                  className="primary"
                  onClick={() => {
                    setEditing(null);
                    setModal("person");
                  }}
                >
                  <Plus size={16} /> Add person
                </button>
              </div>
              <div className="card table-wrap" role="region" aria-label="Scrollable records table" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th>Role</th>
                      <th>Face profile</th>
                      <th>Account</th>
                      <th>Manage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                          <small>{p.email}</small>
                        </td>
                        <td>{label(p.role)}</td>
                        <td>{p.face_enrolled ? "Enrolled" : "Not enrolled"}</td>
                        <td>
                          <Badge value={p.active ? "active" : "inactive"} />
                        </td>
                        <td>
                          <div className="table-actions">
                            <button
                              onClick={() => {
                                setEditing(p);
                                setModal("person");
                              }}
                            >
                              Edit
                            </button>
                            {!p.face_enrolled && <button onClick={() => { setEnrollmentUser(p); setModal("enroll"); }}>Enroll face</button>}
                            {p.face_reset_available && (
                              <button
                                onClick={() => {
                                  if (confirm("Reset this face profile? The user or an owner must enroll it again."))
                                    run(() =>
                                      submit(
                                        `/users/${p.id}/face`,
                                        undefined,
                                        "DELETE",
                                      ),
                                    );
                                }}
                              >
                                Reset face
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {page === "settings" && user.role === "owner" && (
            <>
              <div className="request-grid">
                <div className="card setting">
                  <h2>Leave policy</h2>
                  <p>
                    Annual limits apply to every employee. Pending requests
                    reserve days.
                  </p>
                  {leaves.map((l) => (
                    <div className="policy-row" key={l.id}>
                      <strong>{l.name}</strong>
                      <span>{l.annual_limit} days / year</span>
                    </div>
                  ))}
                  <button onClick={() => setModal("policy")}>
                    <Plus size={16} /> Add leave type
                  </button>
                </div>
                <div className="card setting">
                  <h2>Working calendar</h2>
                  <p>
                    Friday and Saturday are weekends. Add holidays or
                    replacement working days.
                  </p>
                  {days.map((d) => (
                    <div className="policy-row" key={d.id}>
                      <span>
                        {date(d.date)} · {d.name}
                        <small>
                          {d.is_working ? "Working day" : "Holiday"}
                        </small>
                      </span>
                      <button
                        aria-label="Delete calendar day"
                        onClick={() =>
                          run(() =>
                            submit(`/calendar/${d.id}`, undefined, "DELETE"),
                          )
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => setModal("calendar")}>
                    <Plus size={16} /> Add calendar override
                  </button>
                </div>
              </div>
              <h2 className="section-title">Audit trail</h2>
              <div className="card table-wrap" role="region" aria-label="Scrollable records table" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Subject</th>
                      <th>Time (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td>{a.action}</td>
                        <td>#{a.subject}</td>
                        <td>{a.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <footer className="page-footer">
            attendance<span>Built around your working day.</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div className="modal-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={label(modal)}
          >
            <div className="modal-heading">
              <div>
                <span className="eyebrow">YOUR WORKSPACE</span>
                <h2>
                  {(
                    {
                      in: "Start your day",
                      out: "Wrap up your day",
                      enroll: enrollmentUser ? `Enroll face: ${enrollmentUser.name}` : "Enroll my face",
                      person: editing ? "Edit person" : "Add a person",
                      members: "Team membership",
                    } as Record<string, string>
                  )[modal] || label(modal)}
                </h2>
              </div>
              <button
                onClick={() => {
                  setModal(null);
                  setEnrollmentUser(null);
                  setError("");
                }}
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            {["in", "out", "enroll"].includes(modal) ? (
              <CameraChallenge
                purpose={modal as "enroll" | "in" | "out"}
                request={api}
                target={modal === "enroll" ? enrollmentUser || undefined : undefined}
                onVerified={async (challenge_id) => {
                  const result = await api<{ message: string; user_id?: number; attendance?: Attendance }>(modal === "enroll" ? "/face/enroll" : "/attendance", "POST", { challenge_id, ...(modal === "enroll" ? {} : { action: modal }) });
                  if (modal === "enroll" && result.user_id === user.id) setFaceEnrolled(true);
                  if (result.attendance) setDash((old) => old ? { ...old, today: result.attendance! } : old);
                  setNotice(result.message + (result.attendance ? ` · ${time(modal === "out" ? result.attendance.check_out : result.attendance.check_in)} (Asia/Dhaka)` : ""));
                  setModal(null);
                  setEnrollmentUser(null);
                  refresh((n) => n + 1);
                }}
              />
            ) : ["leave", "home_office", "overtime"].includes(modal) ? (
              <RequestForm
                kind={modal}
                leaves={leaves}
                busy={busy}
                onSubmit={(d) => run(() => submit("/applications", d))}
              />
            ) : modal === "person" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  run(() =>
                    submit(
                      editing ? `/users/${editing.id}` : "/users",
                      { ...f, active: f.active === "true" },
                      editing ? "PUT" : "POST",
                    ),
                  );
                }}
              >
                <Field title="Full name">
                  <input name="name" defaultValue={editing?.name} required />
                </Field>
                <Field title="Email">
                  <input
                    name="email"
                    type="email"
                    defaultValue={editing?.email}
                    required
                  />
                </Field>
                <div className="two">
                  <Field title="Account role">
                    <select
                      name="role"
                      defaultValue={editing?.role || "employee"}
                    >
                      {["owner", "manager", "pm", "team_lead", "employee"].map(
                        (x) => (
                          <option key={x}>{x}</option>
                        ),
                      )}
                    </select>
                  </Field>
                  <Field title="Status">
                    <select
                      name="active"
                      defaultValue={String(editing?.active ?? true)}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </Field>
                </div>
                <Field
                  title={
                    editing
                      ? "New password (optional)"
                      : "Initial password (12+ characters)"
                  }
                >
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    required={!editing}
                    autoComplete="new-password"
                  />
                </Field>
                <Field title="Designation">
                  <input
                    name="designation"
                    defaultValue={editing?.designation || ""}
                  />
                </Field>
                <Field title="Phone">
                  <input name="phone" defaultValue={editing?.phone || ""} />
                </Field>
                <button disabled={busy} className="primary wide">
                  Save person
                </button>
              </form>
            ) : modal === "members" && editingTeam ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const members = people
                    .filter((p) => f.get(`u${p.id}`))
                    .map((p) => ({
                      user_id: p.id,
                      team_role: f.get(`r${p.id}`),
                    }));
                  run(() =>
                    submit(
                      `/teams/${editingTeam.id}/members`,
                      { members },
                      "PUT",
                    ),
                  );
                }}
              >
                <p>
                  Team roles control review responsibility. A person can belong
                  to multiple teams.
                </p>
                {people.map((p) => (
                  <div className="member-edit" key={p.id}>
                    <label>
                      <input
                        type="checkbox"
                        name={`u${p.id}`}
                        defaultChecked={editingTeam.members.some(
                          (m) => m.id === p.id,
                        )}
                      />
                      {p.name}
                    </label>
                    <select
                      name={`r${p.id}`}
                      defaultValue={
                        editingTeam.members.find((m) => m.id === p.id)
                          ?.team_role || "employee"
                      }
                    >
                      {["employee", "team_lead", "manager", "pm"].map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                ))}
                <button disabled={busy} className="primary wide">
                  Save assignments
                </button>
              </form>
            ) : modal === "password" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const d = Object.fromEntries(new FormData(e.currentTarget));
                  run(async () => {
                    await api("/password", "PUT", d);
                    token = "";
                    sessionStorage.removeItem("ams_token");
                    setUser(null);
                    setPeople([]);
                    setRequests(null);
                    setAtt(null);
                    setDash(null);
                    setTeams([]);
                    setAudit([]);
                    setPage(
                      location.hash === "#requests" ? "requests" : "overview",
                    );
                    setModal(null);
                  });
                }}
              >
                <Field title="Current password">
                  <input
                    name="current_password"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </Field>
                <Field title="New password">
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    required
                    autoComplete="new-password"
                  />
                </Field>
                <Field title="Confirm password">
                  <input
                    name="password_confirmation"
                    type="password"
                    required
                    autoComplete="new-password"
                  />
                </Field>
                <button className="primary wide" disabled={busy}>
                  Change password & sign out
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = Object.fromEntries(new FormData(e.currentTarget));
                  run(() =>
                    submit(
                      modal === "team"
                        ? "/teams"
                        : modal === "policy"
                          ? "/leave-types"
                          : "/calendar",
                      modal === "calendar"
                        ? { ...f, is_working: f.is_working === "true" }
                        : f,
                    ),
                  );
                }}
              >
                <Field title="Name">
                  <input name="name" required />
                </Field>
                {modal === "policy" && (
                  <Field title="Annual day limit">
                    <input
                      name="annual_limit"
                      type="number"
                      min="0"
                      max="366"
                      required
                    />
                  </Field>
                )}
                {modal === "calendar" && (
                  <>
                    <Field title="Date">
                      <input name="date" type="date" required />
                    </Field>
                    <Field title="Day type">
                      <select name="is_working">
                        <option value="false">Holiday / non-working</option>
                        <option value="true">Replacement working day</option>
                      </select>
                    </Field>
                  </>
                )}
                <button className="primary wide" disabled={busy}>
                  Save
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function Pager({
  value,
  onChange,
}: {
  value: { current_page: number; last_page: number } | null;
  onChange: (n: number) => void;
}) {
  return value && value.last_page > 1 ? (
    <div className="pager">
      <button
        disabled={value.current_page <= 1}
        onClick={() => onChange(value.current_page - 1)}
      >
        Previous
      </button>
      <span>
        Page {value.current_page} / {value.last_page}
      </span>
      <button
        disabled={value.current_page >= value.last_page}
        onClick={() => onChange(value.current_page + 1)}
      >
        Next
      </button>
    </div>
  ) : null;
}
function RequestForm({
  kind,
  leaves,
  busy,
  onSubmit,
}: {
  kind: string;
  leaves: Leave[];
  busy: boolean;
  onSubmit: (d: unknown) => void;
}) {
  const [duration, setDuration] = useState("day"),
    [start, setStart] = useState("");
  function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget));
    if (kind === "home_office") {
      if (duration === "ongoing") d.end_date = "";
      if (duration === "day") d.end_date = d.start_date;
      if (duration === "month") {
        const date = new Date(d.start_date + "T00:00:00");
        const day = date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + 1);
        const last = new Date(
          date.getFullYear(),
          date.getMonth() + 1,
          0,
        ).getDate();
        date.setDate(Math.min(day, last));
        date.setDate(date.getDate() - 1);
        d.end_date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      }
    }
    if (kind === "overtime") d.end_date = d.start_date;
    onSubmit({ ...d, kind, end_date: d.end_date || null });
  }
  return (
    <form onSubmit={send}>
      <div className="info-banner">
        All assigned team leads and managers/PMs receive a review notification.
      </div>
      {kind === "leave" && (
        <Field title="Leave type">
          <select required name="leave_type_id">
            <option value="">Choose leave type</option>
            {leaves.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {l.annual_limit} days/year
              </option>
            ))}
          </select>
        </Field>
      )}
      {kind === "home_office" && (
        <Field title="Arrangement">
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            <option value="day">One day</option>
            <option value="month">One month</option>
            <option value="range">Custom dates</option>
            <option value="ongoing">Lifetime / no end date</option>
          </select>
        </Field>
      )}
      <div className="two">
        <Field title="Start date">
          <input
            name="start_date"
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        {(kind === "leave" ||
          (kind === "home_office" && duration === "range")) && (
          <Field title="End date">
            <input name="end_date" type="date" min={start} required />
          </Field>
        )}
        {kind === "overtime" && (
          <Field title="Total overtime minutes">
            <input
              name="minutes"
              type="number"
              min="1"
              max="1440"
              required
              placeholder="e.g. 120"
            />
          </Field>
        )}
      </div>
      <Field title="Reason">
        <textarea
          name="reason"
          minLength={5}
          maxLength={4000}
          required
          rows={4}
          placeholder="Tell your reviewers a little more…"
        />
      </Field>
      {kind === "leave" && (
        <div className="two">
          <Field title="Emergency contact">
            <input name="contact" />
          </Field>
          <Field title="Covering for you">
            <input name="covering" />
          </Field>
        </div>
      )}
      <p className="muted">
        {kind === "leave"
          ? "Weekends and holidays are excluded. Pending days are reserved from your balance."
          : kind === "home_office"
            ? "Home office still requires actual photo check-in and check-out. An ongoing arrangement can be revoked."
            : "Enter one day per overtime request. Approval records the requested duration; it does not change attendance times."}
      </p>
      <button className="primary wide" disabled={busy}>
        {busy ? "Submitting…" : "Submit for approval"}
        <ArrowUpRight size={17} />
      </button>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
