import axios from "axios";

export const api = axios.create({ baseURL: "/api" });

// Guard against multiple 401 redirect loops during reload
let isRedirecting = false;

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("sc_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const reqUrl = err.config?.url || "";
      // Don't nuke session for auth endpoints themselves
      const isAuthReq = reqUrl.includes("/auth/login") || reqUrl.includes("/auth/register");
      // Don't nuke session for the token validation call
      const isValidation = reqUrl.includes("/users/me");

      if (!isAuthReq && !isValidation && !isRedirecting) {
        const hadToken = !!localStorage.getItem("sc_token");
        if (hadToken && !location.pathname.startsWith("/login")) {
          isRedirecting = true;
          localStorage.removeItem("sc_token");
          localStorage.removeItem("sc_user");
          location.href = "/login";
          // Reset flag after a delay for safety
          setTimeout(() => { isRedirecting = false; }, 3000);
        }
      }
    }
    return Promise.reject(err);
  }
);

export const wsBase = () => {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/ws`;
};

export function getApiErrorMessage(err: any, fallback: string): string {
  if (!err) return fallback;
  if (!err.response) {
    if (err.message === "Network Error" || err.code === "ERR_NETWORK" || err.code === "ECONNREFUSED") {
      return "Cannot connect to backend server (http://localhost:8000). Please ensure the backend is running.";
    }
    return err.message || fallback;
  }
  const status = err.response.status;
  if (status === 502 || status === 503 || status === 504) {
    return "Cannot reach backend server. Please make sure the backend is running on port 8000.";
  }
  const data = err.response.data;
  if (!data) return fallback;
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    return data.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
  }
  if (typeof data.message === "string") return data.message;
  return fallback;
}
