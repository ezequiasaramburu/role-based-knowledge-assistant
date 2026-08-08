import { useEffect, useState } from "react";
import { Login } from "./components/Login";
import { fetchMe, type AuthUser } from "./lib/api";

const TOKEN_STORAGE_KEY = "rbka_token";

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
        <button type="button" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <main className="app-main">
        <p>Chat UI coming next.</p>
      </main>
    </div>
  );
}

export default App;
