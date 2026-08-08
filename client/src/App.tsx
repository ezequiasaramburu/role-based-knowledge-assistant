import { useEffect, useState } from "react";
import { Login } from "./components/Login";
import { Chat } from "./components/Chat";
import { AuditLog } from "./components/AuditLog";
import { fetchMe, type AuthUser } from "./lib/api";

const TOKEN_STORAGE_KEY = "rbka_token";

type View = "chat" | "audit-log";

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [view, setView] = useState<View>("chat");

  useEffect(() => {
    if (!token) {
      setCheckingSession(false);
      return;
    }
    fetchMe(token)
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        setToken(null);
      })
      .finally(() => setCheckingSession(false));
  }, [token]);

  function handleLogin(newToken: string, newUser: AuthUser) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }

  if (checkingSession) {
    return null;
  }

  if (!token || !user) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <strong>{user.displayName}</strong>
          <span className="roles-badge">{user.roles.length ? user.roles.join(", ") : "no roles"}</span>
        </div>
        <nav className="app-nav">
          <button
            type="button"
            className={view === "chat" ? "app-nav-active" : ""}
            onClick={() => setView("chat")}
          >
            Chat
          </button>
          <button
            type="button"
            className={view === "audit-log" ? "app-nav-active" : ""}
            onClick={() => setView("audit-log")}
          >
            Audit log
          </button>
        </nav>
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <main className="app-main">
        {view === "chat" ? <Chat token={token} /> : <AuditLog token={token} />}
      </main>
    </div>
  );
}

export default App;
