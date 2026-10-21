import axios from "axios";

// Single API client: relative /api works in dev (Vite proxy) and on Vercel.
const api = axios.create({ baseURL: "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("cs_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && window.location.pathname.startsWith("/admin")) {
      localStorage.removeItem("cs_token");
      localStorage.removeItem("cs_user");
      if (!window.location.pathname.startsWith("/admin/login")) {
        window.location.href = "/admin/login";
      }
    }
    return Promise.reject(err);
  }
);

export const errMsg = (err) => err?.response?.data?.message || err?.message || "Something went wrong";

/**
 * Download a file through the authenticated client.
 * window.open() cannot attach the Authorization header, which is why the CSV
 * export buttons opened a fresh tab showing {"message":"Not authenticated"}.
 */
export const downloadFile = async (path, filename) => {
  const response = await api.get(path, { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default api;
