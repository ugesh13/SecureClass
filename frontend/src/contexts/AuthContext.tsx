import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";

type User = { id: string; email: string; full_name: string; role: string };

type Ctx = {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: any) => Promise<User>;
  logout: () => void;
  loading: boolean;
};

const AuthCtx = createContext<Ctx>({} as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem("sc_user");
    const token = localStorage.getItem("sc_token");

    if (raw && token) {
      try {
        // Immediately restore from localStorage for fast UI
        const cached = JSON.parse(raw);
        setUser(cached);
      } catch {
        localStorage.removeItem("sc_user");
        localStorage.removeItem("sc_token");
      }

      // Validate the token with the server in background
      // If invalid, clear the session silently
      api.get("/users/me")
        .then(({ data }) => {
          // Update cached user with fresh server data
          const freshUser: User = {
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role,
          };
          localStorage.setItem("sc_user", JSON.stringify(freshUser));
          setUser(freshUser);
        })
        .catch(() => {
          // Token expired or invalid — clear session
          localStorage.removeItem("sc_token");
          localStorage.removeItem("sc_user");
          setUser(null);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      // No stored auth — clean up any partial state
      if (!raw || !token) {
        localStorage.removeItem("sc_user");
        localStorage.removeItem("sc_token");
      }
      setLoading(false);
    }
  }, []);

  const persist = (token: string, u: User) => {
    localStorage.setItem("sc_token", token);
    localStorage.setItem("sc_user", JSON.stringify(u));
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    persist(data.access_token, data.user);
    return data.user;
  };

  const register = async (payload: any) => {
    const { data } = await api.post("/auth/register", payload);
    persist(data.access_token, data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("sc_token");
    localStorage.removeItem("sc_user");
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, login, register, logout, loading }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
