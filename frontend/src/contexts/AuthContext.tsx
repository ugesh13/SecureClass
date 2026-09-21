import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "../lib/api";

type User = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  student_ref?: string | null;
  institution_id?: string | null;
};

type Ctx = {
  user: User | null;
  login: (email: string, password: string) => Promise<User>;
  register: (data: any) => Promise<User>;
  logout: () => void;
  loading: boolean;
};

const AuthCtx = createContext<Ctx>({} as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const raw = localStorage.getItem("sc_user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem("sc_user") && !localStorage.getItem("sc_token");
  });

  useEffect(() => {
    const raw = localStorage.getItem("sc_user");
    const token = localStorage.getItem("sc_token");

    if (token) {
      if (raw && !user) {
        try {
          setUser(JSON.parse(raw));
        } catch {
          // ignore
        }
      }

      // Background token validation — do NOT wipe credentials on network errors
      api.get("/users/me")
        .then(({ data }) => {
          const freshUser: User = {
            id: data.id,
            email: data.email,
            full_name: data.full_name,
            role: data.role,
            student_ref: data.student_ref,
            institution_id: data.institution_id,
          };
          localStorage.setItem("sc_user", JSON.stringify(freshUser));
          setUser(freshUser);
        })
        .catch((err) => {
          // ONLY clear session if server explicitly rejected authentication with 401
          if (err.response?.status === 401) {
            localStorage.removeItem("sc_token");
            localStorage.removeItem("sc_user");
            setUser(null);
          }
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
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
