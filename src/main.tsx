import React, {
  useEffect,
  useRef,
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
  slot_start?: string | null; slot_end?: string | null; slot_team_id?: number | null;
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
  has_document?: boolean;
  document_name?: string;
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
  status?: string; leave_name?: string; slot_start?: string; slot_end?: string; working_minutes?: number | null; actual_minutes?: number | null;
  id: number;
  user_id: number;
  name: string;
  work_date: string;
  check_in: string;
  check_out: string | null;
  mode: string;
};
type Team = {
  slot_start?: string | null; slot_end?: string | null;
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
type AttendancePage = Page<Attendance> & {summary?: Record<string,number>};
const dhakaToday = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const minutesLabel = (value: number) => `${Math.floor(value/60)}h ${value%60}m`;
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
async function downloadDocument(id: number, name: string) {
 const response=await fetch(`${API}/applications/${id}/document`,{headers:{Authorization:`Bearer ${token}`}});
 if(!response.ok) throw new Error("Could not download document.");
 const url=URL.createObjectURL(await response.blob()); const a=document.createElement("a"); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
}
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
    [att, setAtt] = useState<AttendancePage | null>(null),
    [reportStart,setReportStart] = useState(() => dhakaToday().slice(0,7)+"-01"),
    [reportEnd,setReportEnd] = useState(dhakaToday),
    [reportUser,setReportUser] = useState(""),
    [slotTarget,setSlotTarget] = useState<{kind:"users"|"teams";id:number;name:string;slot_start?:string|null;slot_end?:string|null;slot_team_id?:number|null}|null>(null),
    [teams, setTeams] = useState<Team[]>([]),
    [people, setPeople] = useState<User[]>([]),
    [leaves, setLeaves] = useState<Leave[]>([]),
    [days, setDays] = useState<Day[]>([]),
    [modal, setModal] = useState<string | null>(null),
    [enrollmentUser, setEnrollmentUser] = useState<User | null>(null),
    [editing, setEditing] = useState<User | null>(null),
    [editingLeave, setEditingLeave] = useState<Leave | null>(null),
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
      api<AttendancePage>(`/attendance?page=${attPage}&start_date=${reportStart}&end_date=${reportEnd}${user.role === "owner" && reportUser ? `&user_id=${reportUser}` : ""}`),
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
  }, [user, faceEnrolled, revision, reqPage, attPage, reportStart, reportEnd, reportUser]);
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
          {a.minutes && <p>{a.minutes} overtime minutes</p>}
          {a.has_document && <button onClick={() => run(() => downloadDocument(a.id,a.document_name || "document"))}>Download supporting document</button>}
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
              <div className="report-filters card">
                <Field title="Start date"><input type="date" value={reportStart} max={reportEnd} onChange={e=>{if(e.target.value){setReportStart(e.target.value);setAttPage(1);}}} /></Field>
                <Field title="End date"><input type="date" value={reportEnd} min={reportStart} onChange={e=>{if(e.target.value){setReportEnd(e.target.value);setAttPage(1);}}} /></Field>
                {user.role==="owner" && <Field title="Employee"><select aria-label="Employee" value={reportUser} onChange={e=>{setReportUser(e.target.value);setAttPage(1);}}><option value="">Everyone</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></Field>}
                <button onClick={()=>{setReportStart(dhakaToday().slice(0,7)+"-01");setReportEnd(dhakaToday());setAttPage(1);}}>Current month</button>
              </div>
              {att?.summary && <div className="attendance-stats">{[
                ["Late days",`${att.summary.late_days} / ${att.summary.working_days}`,`${att.summary.late_percent}% late rate`],
                ["Leave days",`${att.summary.leave_days} / ${att.summary.working_days}`,`${att.summary.leave_percent}% leave rate`],
                ["Home office",`${att.summary.home_office_days} / ${att.summary.working_days}`,`${att.summary.home_office_percent}% home office`],
                ["Avg working hours",minutesLabel(att.summary.avg_working_minutes),"Check-in to checkout · completed days"],
                ["Actual avg hours",minutesLabel(att.summary.actual_avg_minutes),"Inside assigned slot · completed days"],
                ["Early arrival avg",minutesLabel(att.summary.early_arrival_avg_minutes),`${att.summary.early_arrival_days} early days · all check-ins average`],
                ["Late departure avg",minutesLabel(att.summary.late_departure_avg_minutes),`${att.summary.late_departure_days} late departures · completed days average`],
                ["Missing exit",String(att.summary.missing_exits),"No checkout by local midnight"],
              ].map(([title,value,hint])=><div className="card attendance-stat" key={title}><h3>{title}</h3><strong>{value}</strong><p>{hint}</p></div>)}</div>}
              <p className="muted">Slots default to 09:00–18:00. Missing exits and current open shifts are excluded from hour averages. Rates use working days through today; owner totals count employee-days.</p>
              <div className="card table-wrap" role="region" aria-label="Scrollable records table" tabIndex={0}>
                <table>
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Date</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Workplace / leave</th><th>Status</th><th>Work slot</th><th>Hours / inside slot</th>
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
                        <td>{a.status==="missing_exit" ? "Missing exit" : time(a.check_out)}</td>
                        <td>
                          <Badge value={a.mode} />{a.leave_name && <small>{a.leave_name}</small>}
                        </td><td>{label(a.status || "")}</td><td>{a.slot_start}–{a.slot_end}</td><td>{a.working_minutes==null?"—":minutesLabel(a.working_minutes)} / {a.actual_minutes==null?"—":minutesLabel(a.actual_minutes)}</td>
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
<p>Work slot: {t.slot_start?.slice(0,5)||"09:00"}–{t.slot_end?.slice(0,5)||"18:00"}</p>
                    {user.role==="owner" && <button onClick={()=>{setSlotTarget({kind:"teams",...t});setModal("slot");}}>Edit work slot</button>}
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
                <button onClick={() => setModal("import")}>Import CSV</button>
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
<button onClick={()=>{setSlotTarget({kind:"users",...p});setModal("slot");}}>Work slot</button>
                            {p.id !== user.id && <button onClick={() => { if (confirm(`Delete ${p.name}? Historical records will be retained.`)) run(() => submit(`/users/${p.id}`, undefined, "DELETE")); }}>Delete</button>}
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
                      <button onClick={() => { setEditingLeave(l); setModal("policy"); }}>Edit</button>
                      <button onClick={() => { if(confirm(`Delete ${l.name}? Past requests will remain.`)) run(() => submit(`/leave-types/${l.id}`,undefined,"DELETE")); }}>Delete</button>
                    </div>
                  ))}
                  <button onClick={() => { setEditingLeave(null); setModal("policy"); }}>
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
            className={`modal ${["leave","overtime"].includes(modal) ? "application-modal" : ""}`}
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
                user={user}
                days={days}
                onCancel={() => setModal(null)}
                leaves={leaves}
                busy={busy}
                onSubmit={(d) => run(() => submit("/applications", d))}
              />
            ) : modal === "slot" && slotTarget ? (
              <form onSubmit={e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));run(()=>submit(`/work-slots/${slotTarget.kind}/${slotTarget.id}`,{slot_start:f.slot_start||null,slot_end:f.slot_end||null,slot_team_id:f.slot_team_id||null},"PUT"));}}>
                <h3>{slotTarget.name}</h3><p>Asia/Dhaka, same-day slots. Blank times inherit the team slot or default 09:00–18:00. Changes apply to future check-ins.</p>
                <div className="two"><Field title="Slot start"><input type="time" name="slot_start" defaultValue={slotTarget.slot_start?.slice(0,5)||""} /></Field><Field title="Slot end"><input type="time" name="slot_end" defaultValue={slotTarget.slot_end?.slice(0,5)||""} /></Field></div>
                {slotTarget.kind==="users" && <Field title="Team slot to inherit"><select name="slot_team_id" defaultValue={slotTarget.slot_team_id||""}><option value="">First configured team (lowest ID), then default</option>{teams.filter(t=>t.members.some(m=>m.id===slotTarget.id)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>}
                <button className="primary wide" disabled={busy}>Save work slot</button>
              </form>
            ) : modal === "import" ? (
              <form onSubmit={(e) => { e.preventDefault(); const f=new FormData(e.currentTarget); run(() => submit("/users/import",f)); }}>
                <p>Import up to 500 new users. Existing emails are rejected; all rows must be valid before any users are created.</p>
                <p>Required headers: name,email,password. Optional: role,active,designation,phone. Passwords must have at least 12 characters. Active accepts true/false or 1/0.</p>
                <a href="data:text/csv;charset=utf-8,name%2Cemail%2Cpassword%2Crole%2Cactive%2Cdesignation%2Cphone%0AExample%20User%2Cemployee%40example.com%2CReplace-this-password%2Cemployee%2Ctrue%2CDeveloper%2C" download="users-template.csv">Download CSV template</a>
                <Field title="CSV file"><input name="file" type="file" accept=".csv,text/csv" required /></Field>
                <button className="primary wide" disabled={busy}>Import users</button>
              </form>
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
                          ? (editingLeave ? `/leave-types/${editingLeave.id}` : "/leave-types")
                          : "/calendar",
                      modal === "calendar"
                        ? { ...f, is_working: f.is_working === "true" }
                        : f,
                      modal === "policy" && editingLeave ? "PUT" : "POST",
                    ),
                  );
                }}
              >
                <Field title="Name">
                  <input name="name" defaultValue={modal === "policy" ? editingLeave?.name : ""} required />
                </Field>
                {modal === "policy" && (
                  <Field title="Annual day limit">
                    <input
                      name="annual_limit"
                      defaultValue={editingLeave?.annual_limit}
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
function DocumentUpload({required}: {required: boolean}) {
 const input=useRef<HTMLInputElement>(null);
 const [file,setFile]=useState<File|null>(null), [error,setError]=useState(""), [dragging,setDragging]=useState(false);
 function select(files: FileList|null) {
  const next=files?.[0];
  if(!next) return;
  const message=files!.length>1 ? "Please upload one document." : !["image/jpeg","image/png","application/pdf"].includes(next.type) ? "Choose a JPG, PNG or PDF file." : next.size>15*1024*1024 ? "Maximum file size is 15 MB." : "";
  setError(message);
  if(message) { if(input.current) { const transfer=new DataTransfer(); if(file) transfer.items.add(file); input.current.files=transfer.files; } return; }
  const transfer=new DataTransfer(); transfer.items.add(next); if(input.current) input.current.files=transfer.files;
  setFile(next);
 }
 return <div className="upload-control">
  <label className={`upload-dropzone ${dragging?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);select(e.dataTransfer.files);}}>
   <input ref={input} className="upload-native" name="document" type="file" required={required} aria-label={required?"Approval document (required)":"Upload document (optional)"} accept="image/jpeg,image/png,application/pdf" onChange={e=>select(e.target.files)} />
   <span className="upload-icon" aria-hidden="true">↑</span>
   <strong>{dragging?"Drop your document here":"Click to upload or drag and drop"}</strong>
   <span>JPG, PNG or PDF · up to 15 MB</span>
   <small>{required?"Approval document required":"Supporting document optional"}</small>
  </label>
  {error && <p className="upload-error" role="alert">{error}</p>}
  {file && <div className="upload-selected"><div><strong>{file.name}</strong><small>{(file.size/1024/1024).toFixed(2)} MB · Ready to upload</small></div><button type="button" aria-label="Remove document" onClick={()=>{setFile(null);setError("");if(input.current)input.current.value="";}}>Remove</button></div>}
 </div>;
}
function RequestForm({kind, leaves, busy, onSubmit, user, days, onCancel}: {
 kind: string; leaves: Leave[]; busy: boolean; onSubmit: (d: unknown) => void;
 user: User; days: Day[]; onCancel: () => void;
}) {
 const [duration,setDuration]=useState("day"), [start,setStart]=useState(""), [end,setEnd]=useState(""), [selected,setSelected]=useState("");
 const count = (() => { if(!start || !end || end < start) return 0; let n=0; const d=new Date(start+"T00:00:00Z"), last=new Date(end+"T00:00:00Z"); for(let i=0;d<=last && i<367;i++,d.setUTCDate(d.getUTCDate()+1)) { const key=d.toISOString().slice(0,10), override=days.find(v=>v.date===key); if(kind!=="leave" || (override ? override.is_working : ![5,6].includes(d.getUTCDay()))) n++; } return n; })();
 function send(e: FormEvent<HTMLFormElement>) {
  e.preventDefault(); const f=new FormData(e.currentTarget); f.set("kind",kind);
  if(kind==="home_office") {
   if(duration==="ongoing") f.set("end_date","");
   if(duration==="day") f.set("end_date",start);
   if(duration==="month") { const d=new Date(start+"T00:00:00Z"), day=d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth()+1); const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate(); d.setUTCDate(Math.min(day,last)); d.setUTCDate(d.getUTCDate()-1); f.set("end_date",d.toISOString().slice(0,10)); }
  }
  const file=f.get("document"); if(file instanceof File && !file.size) f.delete("document"); onSubmit(f);
 }
 return <div className="application-layout"><form className="application-form" onSubmit={send}>
  {kind==="leave" && <section className="form-section"><h3><b>1</b> Type of leave</h3><div className="leave-options">{leaves.map(l=><label className={`leave-option ${selected===String(l.id)?"selected":""}`} key={l.id}><input type="radio" name="leave_type_id" value={l.id} required checked={selected===String(l.id)} onChange={e=>setSelected(e.target.value)} /><span><strong>{l.name}</strong><small>{l.annual_limit} days per year</small></span></label>)}</div>{!leaves.length && <p>No leave types are available. Ask the owner to add one.</p>}</section>}
  <section className="form-section"><h3><b>{kind==="leave"?2:1}</b> Dates</h3><p>Pick the first and last day of your request.</p>
   {kind==="home_office" && <Field title="Arrangement"><select value={duration} onChange={e=>setDuration(e.target.value)}><option value="day">One day</option><option value="month">One month</option><option value="range">Custom dates</option><option value="ongoing">Lifetime / no end date</option></select></Field>}
   <div className="two"><Field title="First day"><input name="start_date" type="date" required value={start} onChange={e=>setStart(e.target.value)} /></Field>{(kind!=="home_office" || duration==="range") && <Field title="Last day"><input name="end_date" type="date" required min={start} value={end} onChange={e=>setEnd(e.target.value)} /></Field>}</div>
   {kind!=="home_office" && <div className="info-banner">{start&&end ? `${count} ${kind==="leave"?"working":"calendar"} day(s) selected` : "Days appear here once both dates are set."}</div>}
  </section>
  <section className="form-section"><h3><b>{kind==="leave"?3:2}</b> {kind==="overtime"?"Overtime details":"Details"}</h3>
   {kind==="overtime" && <Field title="Total overtime minutes across the selected dates"><input name="minutes" type="number" min="1" max="1440" placeholder="e.g. 120" required /></Field>}
   <Field title="Reason"><textarea name="reason" minLength={5} maxLength={4000} required rows={4} placeholder="Explain your request" /></Field>
   {kind==="leave" && <div className="two"><Field title="Emergency contact number"><input name="contact" maxLength={100} placeholder="Reachable while you are away" /></Field><Field title="Covering for you"><input name="covering" maxLength={100} placeholder="Who handles your work meanwhile" /></Field></div>}
  </section>
  {kind!=="home_office" && <section className="form-section"><h3><b>{kind==="leave"?4:3}</b> {kind==="overtime"?"Approval document":"Supporting document"}</h3><p>{kind==="overtime"?"Attach a screenshot or document of prior approval.":"Attach supporting evidence, if needed."}</p><DocumentUpload required={kind==="overtime"} /></section>}
  <div className="form-footer"><span>Check the details, then submit.</span><button type="button" onClick={onCancel}>Cancel</button><button className="primary" disabled={busy || (kind==="leave"&&!leaves.length)}>{busy?"Submitting…":`Submit ${label(kind)} request`}</button></div>
 </form><aside className="application-aside"><div className="card"><small>Applying as</small><h3>{user.name}</h3><p>{user.designation}</p><p>{user.email}</p></div><div className="card"><h3>What happens next</h3><div className="info-banner">Sent for approval</div><p>Your assigned team leads and managers/PMs receive an email and review your request.</p><p>Track the status under Requests. Leave balances include pending reservations; weekends and holidays are excluded.</p></div></aside></div>;
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
