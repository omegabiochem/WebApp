import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import FormsDropdown from "../forms/FormsDropdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import TemplatesDropdown from "../../pages/Templates/TemplatesDropdown";

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();

  const [loginBooksOpen, setLoginBooksOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isReportRoute =
    pathname.startsWith("/reports/") ||
    pathname.startsWith("/chemistry-reports/");

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const role = user?.role ?? "DEFAULT";

  type MenuItem = { label: string; path: string };

  const menuByRole: Record<string, MenuItem[]> = {
    ADMIN: [
      { label: "Home", path: "/adminDashboard" },
      { label: "Audit and Trail", path: "/audit" },
      { label: "Balancer", path: "/balancer" },
      { label: "Results", path: "/results" },
      { label: "User Management", path: "/manage-users" },
      { label : "Report Management", path:"/manage-reports"},
      { label: "Support", path: "/support" },
    ],
    CLIENT: [
      { label: "Home", path: "/clientDashboard" },
      { label: "Audit and Trail", path: "/clientAudit" },
      { label: "Templates", path: "/templatesDropdown" },
      { label: "Forms", path: "/formmenu" },
      { label: "Results", path: "/results" },
      { label: "Support", path: "/support" },
    ],
    SYSTEMADMIN: [
      { label: "Home", path: "/systemAdminDashboard" },
      { label: "Audit and Trail", path: "/audit" },
      { label: "Results", path: "/results" },
      { label: "User Management", path: "/manage-users" },
       { label : "Report Management", path:"/manage-reports"},
      { label: "Support Tickets", path: "/supportTickets" },
      { label: "More", path: "/more" },
    ],
    MICRO: [
      { label: "Home", path: "/microDashboard" },
      { label: "Results", path: "/results" },
      { label: "Login Book", path: "/microLoginBook" },
      { label: "Support", path: "/support" },
    ],
    CHEMISTRY: [
      { label: "Home", path: "/chemistryDashboard" },
      { label: "Results", path: "/results" },
      { label: "Login Book", path: "/chemistryLoginBook" },
      { label: "Support", path: "/support" },
    ],
    MC: [
      { label: "Home", path: "/mcDashboard" },
      { label: "Results", path: "/results" },
      { label: "Micro Login Book", path: "/microLoginBook" },
      { label: "Chemistry Login Book", path: "/chemistryLoginBook" },
      { label: "Support", path: "/support" },
    ],
    QA: [
      { label: "Home", path: "/qaDashboard" },
      { label: "Results", path: "/results" },
      { label: "Support", path: "/support" },
    ],
    FRONTDESK: [
      { label: "Home", path: "/frontdeskDashboard" },
      { label: "Results", path: "/results" },
      { label: "Support", path: "/support" },
    ],
    DEFAULT: [{ label: "Home", path: "/home" }],
  };

  const menu = menuByRole[role] ?? menuByRole.DEFAULT;

  const [unreadResults, setUnreadResults] = useState(0);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  const [, setNowTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setNowTick(Date.now());
    }, 60_000);

    return () => window.clearInterval(t);
  }, []);

  const FIVE_MIN_MS = 60 * 60 * 1000;

  function isSameLocalDay(value?: string) {
    if (!value) return false;

    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return false;

    const now = new Date();

    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  }

  const visibleNotifications = notifications.filter((n) => {
    // show only today's notifications
    if (!isSameLocalDay(n.createdAt)) return false;

    // unread notifications created today stay visible all day
    if (!n.readAt) return true;

    // read notifications only stay visible for 5 minutes
    const readAt = new Date(n.readAt).getTime();
    if (Number.isNaN(readAt)) return true;

    return Date.now() - readAt < FIVE_MIN_MS;
  });

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      try {
        const r = await api<{ count: number }>("/attachments/unread-count");
        setUnreadResults(r.count ?? 0);
      } catch {
        // ignore
      }
    };

    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [user]);

  useEffect(() => {
    // save current page search
    sessionStorage.setItem(`lastSearch:${pathname}`, search || "");
  }, [pathname, search]);

  const toRemembered = (path: string) => {
    const saved = sessionStorage.getItem(`lastSearch:${path}`) || "";
    return `${path}${saved}`;
  };

  useEffect(() => {
    setNotificationsOpen(false);
  }, [pathname, search]);

  const loadNotifications = useCallback(async () => {
    if (!user) return;

    try {
      // const [list, unread] = await Promise.all([
      //   api<any[]>("/notifications"),
      //   api<any>("/notifications/unread-count"),
      // ]);

      // console.log("notifications list:", list);
      // console.log("notifications unread:", unread);

      // setNotifications(Array.isArray(list) ? list : []);
      // setUnreadNotifications(
      //   typeof unread === "number"
      //     ? unread
      //     : typeof unread?.count === "number"
      //       ? unread.count
      //       : 0,
      // );
      const list = await api<any[]>("/notifications");

      console.log("notifications list:", list);

      setNotifications(Array.isArray(list) ? list : []);
    } catch (e) {
      console.warn("failed to load notifications", e);
      setNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
  }, [user, loadNotifications]);

  useEffect(() => {
    const onLiveNotification = () => {
      loadNotifications();
    };

    window.addEventListener(
      "omega:notification:new",
      onLiveNotification as EventListener,
    );

    return () => {
      window.removeEventListener(
        "omega:notification:new",
        onLiveNotification as EventListener,
      );
    };
  }, [loadNotifications]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const formatNotificationTime = (value?: string) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  };

  const handleOpenNotification = async (n: any) => {
    try {
      if (!n.readAt) {
        await api(`/notifications/${n.id}/read`, { method: "PATCH" });
        setNotifications((prev) =>
          prev.map((x) =>
            x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x,
          ),
        );
      }
    } catch {}

    setNotificationsOpen(false);

    // if (n.reportUrl) {
    //   navigate(n.reportUrl);
    // }
  };

  const handleReadAllNotifications = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      setNotifications((prev) =>
        prev.map((x) => ({
          ...x,
          readAt: x.readAt ?? new Date().toISOString(),
        })),
      );
    } catch {}
  };

  const visibleUnreadNotifications = visibleNotifications.filter(
    (n) => !n.readAt,
  ).length;

  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl p-4 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="flex items-center gap-3 group"
          aria-label="OMEGA BIOCHEM home"
        >
          <img
            src="/logo.svg"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).src = "/favicon-32x32.png";
            }}
            alt="OMEGA BIOCHEM"
            className="h-9 w-9 select-none"
            draggable={false}
          />
          <span
            className="font-bold text-xl tracking-wide group-hover:opacity-90 transition-opacity"
            style={{ color: "var(--brand)" }}
          >
            OMEGA BIOCHEM LIMS
          </span>
        </Link>

        <nav className="flex items-center gap-4 text-sm">
          {!user ? (
            <>
              <Link to={toRemembered("/home")} className="hover:underline">
                Home
              </Link>
              <Link
                to={toRemembered("/publicsupport")}
                className="hover:underline"
              >
                Support
              </Link>
              <Link
                to={toRemembered("/login")}
                className="px-3 py-1 rounded-md bg-[var(--brand)] text-white hover:opacity-90 transition"
              >
                Login
              </Link>
            </>
          ) : isReportRoute ? (
            <>
              {/* ✅ report-specific nav */}
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) navigate(-1);
                  else {
                    const home =
                      role === "CLIENT"
                        ? "/clientDashboard"
                        : role === "CHEMISTRY"
                          ? "/chemistryDashboard"
                          : role === "MC"
                            ? "/mcDashboard"
                            : role === "MICRO"
                              ? "/microDashboard"
                              : role === "QA"
                                ? "/qaDashboard"
                                : role === "FRONTDESK"
                                  ? "/frontdeskDashboard"
                                  : role === "ADMIN"
                                    ? "/adminDashboard"
                                    : role === "SYSTEMADMIN"
                                      ? "/systemAdminDashboard"
                                      : "/home";

                    navigate(toRemembered(home), { replace: true });
                  }
                }}
                className="px-3 py-1 rounded-md border hover:bg-gray-50"
              >
                ← Back
              </button>

              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1 rounded-md bg-gray-900 text-white hover:opacity-90 transition"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              {menu.map((item) =>
                item.label === "Forms" ? (
                  <FormsDropdown key="forms" align="right" />
                ) : item.label === "Templates" ? (
                  <TemplatesDropdown key="templates" align="right" />
                ) : item.label === "Login Books" ? (
                  <div key="loginbooks" className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setLoginBooksOpen((v) => !v);
                        setMoreOpen(false);
                      }}
                      className="hover:underline"
                    >
                      Login Books ▾
                    </button>

                    {loginBooksOpen && (
                      <div className="absolute right-0 mt-2 w-48 rounded-md border bg-white shadow-lg z-50">
                        <button
                          onClick={() => {
                            setLoginBooksOpen(false);
                            navigate("/microLoginBook");
                          }}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          Micro Login Book
                        </button>

                        <button
                          onClick={() => {
                            setLoginBooksOpen(false);
                            navigate("/chemistryLoginBook");
                          }}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          Chemistry Login Book
                        </button>
                      </div>
                    )}
                  </div>
                ) : item.label === "More" ? (
                  <div key="more" className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpen((v) => !v);
                        setLoginBooksOpen(false);
                      }}
                      className="hover:underline"
                    >
                      More ▾
                    </button>

                    {moreOpen && (
                      <div className="absolute right-0 mt-2 w-56 rounded-md border bg-white shadow-lg z-50">
                        <div className="px-4 py-2">
                          <TemplatesDropdown align="right" />
                        </div>

                        <div className="px-4 py-2">
                          <FormsDropdown align="right" />
                        </div>

                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            navigate("/microLoginBook");
                          }}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          Micro Login Book
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            navigate("/chemistryLoginBook");
                          }}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          Chemistry Login Book
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            navigate(toRemembered("/balancer"));
                          }}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                        >
                          Balancer
                        </button>
                      </div>
                    )}
                  </div>
                ) : item.label === "Results" ? (
                  <Link
                    key={item.path}
                    to={toRemembered(item.path)}
                    className="relative inline-flex items-center hover:underline"
                    onClick={async () => {
                      setUnreadResults(0); // immediate UI clear

                      try {
                        await api("/attachments/mark-results-read", {
                          method: "POST",
                        });
                      } catch {}

                      try {
                        const r = await api<{ count: number }>(
                          "/attachments/unread-count",
                        );
                        setUnreadResults(r.count ?? 0);
                      } catch {}
                    }}
                  >
                    <span className="relative">
                      {item.label}

                      {unreadResults > 0 && (
                        <sup className="absolute -top-2 -right-3 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold rounded-full bg-red-600 text-white shadow">
                          {unreadResults > 99 ? "99+" : unreadResults}
                        </sup>
                      )}
                    </span>
                  </Link>
                ) : (
                  <Link
                    key={item.path}
                    to={toRemembered(item.path)}
                    className="hover:underline"
                  >
                    {item.label}
                  </Link>
                ),
              )}
              {/* {(role === "ADMIN" || role === "SYSTEMADMIN") && (
                <Link to="/admin" className="hover:underline">
                  User Management
                </Link>
              )} */}

              <div className="relative" ref={notificationsRef}>
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((v) => !v);
                    setLoginBooksOpen(false);
                    setMoreOpen(false);
                  }}
                  className="relative inline-flex items-center px-2 py-1 hover:underline"
                  aria-label="Notifications"
                >
                  <span className="text-lg">🔔</span>

                  {visibleUnreadNotifications > 0 && (
                    <sup className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 text-[10px] font-bold rounded-full bg-red-600 text-white shadow">
                      {visibleUnreadNotifications > 99
                        ? "99+"
                        : visibleUnreadNotifications}
                    </sup>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-2 w-96 max-h-[420px] overflow-auto rounded-md border bg-white shadow-lg z-50">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                      <div className="font-semibold text-sm">Notifications</div>

                      <button
                        type="button"
                        onClick={handleReadAllNotifications}
                        className="text-xs text-[var(--brand)] hover:underline"
                      >
                        Mark all read
                      </button>
                    </div>

                    {visibleNotifications.length === 0 ? (
                      <div className="px-4 py-6 text-sm text-gray-500">
                        No notifications
                      </div>
                    ) : (
                      <div>
                        {visibleNotifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => handleOpenNotification(n)}
                            className={`block w-full text-left px-4 py-3 border-b hover:bg-gray-50 ${
                              !n.readAt ? "bg-blue-50" : "bg-white"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-sm text-gray-900">
                                  {n.title}
                                </div>

                                <div className="text-xs text-gray-600 mt-1">
                                  {n.body}
                                </div>

                                {n.formNumber && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {n.formNumber}
                                  </div>
                                )}
                              </div>

                              {!n.readAt && (
                                <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600 shrink-0" />
                              )}
                            </div>

                            <div className="text-[11px] text-gray-400 mt-2">
                              {formatNotificationTime(n.createdAt)}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="px-3 py-1 rounded-md bg-gray-900 text-white hover:opacity-90 transition"
              >
                Logout
              </button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
