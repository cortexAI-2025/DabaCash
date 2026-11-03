import axios from "axios";
import { clearAuthTokens, getAccessToken, getRefreshToken, setAuthTokens, type UserRole } from "./auth";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: { "Content-Type": "application/json" },
});

// Single in-flight refresh: parallel 401s share one rotation instead of racing on the refresh token.
let refreshing: Promise<string> | null = null;

function refreshSession(): Promise<string> {
  if (!refreshing) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return Promise.reject(new Error("no refresh token"));
    refreshing = axios
      .post<{ accessToken: string; refreshToken: string; role: UserRole }>(
        `${API_URL}/api/v1/auth/refresh`,
        { refreshToken }
      )
      .then(({ data }) => {
        // The server rotates the refresh token on every call: the old one is now invalid.
        setAuthTokens(data.accessToken, data.refreshToken, data.role);
        return data.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status !== 401 || original._retry) return Promise.reject(err);
    original._retry = true;
    if (!getRefreshToken()) return Promise.reject(err); // anonymous visitor: nothing to refresh, nothing to redirect
    try {
      const accessToken = await refreshSession();
      original.headers.Authorization = `Bearer ${accessToken}`;
      return api(original);
    } catch {
      clearAuthTokens();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
      return Promise.reject(err);
    }
  }
);

export interface Page<T> {
  items: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number; hasNext: boolean };
}
type Params = Record<string, string | number | boolean | undefined>;
const clean = (p?: Params) => (p ? Object.fromEntries(Object.entries(p).filter(([, v]) => v !== "" && v !== undefined)) : undefined);
const idem = (key?: string) => (key ? { headers: { "Idempotency-Key": key } } : undefined);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string; refreshToken: string; role: UserRole; user: SessionUser }>("/auth/login", { email, password }),
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
    api.post<{ accessToken: string; refreshToken: string; role: UserRole; user: SessionUser }>("/auth/register", data),
  logout: (refreshToken: string) => api.post("/auth/logout", { refreshToken }),
  logoutAll: () => api.post("/auth/logout-all"),
};
export interface SessionUser { id: string; email: string; firstName: string; lastName: string; role: UserRole }

// Marketplace (public)
export const marketplaceApi = {
  getListings: (params?: Params) => api.get("/marketplace/listings", { params: clean(params) }),
  getFeatured: () => api.get("/marketplace/listings/featured"),
  getListing: (id: string) => api.get(`/marketplace/listings/${id}`),
  getBrands: () => api.get("/marketplace/brands"),
  getModels: (brand?: string) => api.get("/marketplace/models", { params: clean({ brand }) }),
  getStats: () => api.get<{ franchises: number; cities: number; listings: number; devicesSold: number }>("/marketplace/stats"),
};

export const citiesApi = { getAll: () => api.get("/cities") };

export const pricingApi = {
  estimate: (brandSlug: string, modelSlug: string, condition: string) =>
    api.get("/pricing/estimate", { params: { brandSlug, modelSlug, condition } }),
};

// Buyback
export const buybackApi = {
  create: (data: unknown, key?: string) => api.post("/buyback", data, idem(key)),
  getMy: (params?: Params) => api.get<Page<any>>("/buyback/my", { params: clean(params) }),
  getFranchise: (params?: Params) => api.get<Page<any>>("/buyback/franchise", { params: clean(params) }),
  getById: (id: string) => api.get(`/buyback/${id}`),
  review: (id: string, data: unknown) => api.patch(`/buyback/${id}/review`, data),
  complete: (id: string) => api.post(`/buyback/${id}/complete`),
  cancel: (id: string) => api.post(`/buyback/${id}/cancel`),
};

// Orders
export const ordersApi = {
  create: (data: unknown, key?: string) => api.post("/orders", data, idem(key)),
  getMy: (params?: Params) => api.get<Page<any>>("/orders/my", { params: clean(params) }),
  getFranchise: (params?: Params) => api.get<Page<any>>("/orders/franchise", { params: clean(params) }),
  getById: (id: string) => api.get(`/orders/${id}`),
  cancel: (id: string) => api.post(`/orders/${id}/cancel`),
  updateStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
};

export const paymentsApi = {
  startAslanCheckout: (orderId: string) =>
    api.post<{ checkoutUrl: string; expiresAt: string }>("/payments/aslan/checkout", { orderId }),
  getOrderStatus: (orderId: string) =>
    api.get<{ orderId: string; orderStatus: string; method: string; status: string; amount: number }>(`/payments/order/${orderId}`),
};

// Franchise: listings, inventory, dashboard
export const productsApi = {
  create: (data: unknown) => api.post("/products", data),
  getMy: (params?: Params) => api.get<Page<any>>("/products/my", { params: clean(params) }),
  update: (id: string, data: unknown) => api.patch(`/products/${id}`, data),
  remove: (id: string) => api.delete(`/products/${id}`),
};
export const inventoryApi = {
  get: (params?: Params) => api.get<Page<any>>("/inventory", { params: clean(params) }),
  getSummary: () => api.get("/inventory/summary"),
};
export const franchiseApi = {
  getAll: () => api.get("/franchises"),
  getBySlug: (slug: string) => api.get(`/franchises/${slug}`),
  getDashboard: () => api.get("/franchises/dashboard"),
  getRecentSales: () => api.get("/franchises/dashboard/recent-sales"),
  getAnalytics: (days: number) => api.get("/franchises/dashboard/analytics", { params: { days } }),
};

// Admin
export const adminApi = {
  getStats: () => api.get("/admin/stats"),
  getAnalytics: (days: number) => api.get("/admin/analytics", { params: { days } }),
  // users & roles
  getUsers: (params?: Params) => api.get<Page<any>>("/admin/users", { params: clean(params) }),
  updateUser: (id: string, data: { role?: UserRole; isActive?: boolean }) => api.patch(`/admin/users/${id}`, data),
  unlockUser: (id: string) => api.post(`/admin/users/${id}/unlock`),
  // franchises
  getFranchises: (params?: Params) => api.get<Page<any>>("/admin/franchises", { params: clean(params) }),
  createFranchise: (data: unknown) => api.post("/admin/franchises", data),
  updateFranchise: (id: string, data: unknown) => api.patch(`/admin/franchises/${id}`, data),
  // orders & transactions
  getOrders: (params?: Params) => api.get<Page<any>>("/admin/orders", { params: clean(params) }),
  getPayments: (params?: Params) => api.get<Page<any> & { completedAmount: number }>("/admin/payments", { params: clean(params) }),
  // fraud & IMEI
  getFlagged: (params?: Params) => api.get<Page<any>>("/admin/fraud/flagged", { params: clean(params) }),
  resolveFraud: (id: string, data: { resolution: "CLEARED" | "CONFIRMED_FRAUD"; note?: string; blockImei?: boolean }) =>
    api.patch(`/admin/fraud/${id}/resolve`, data),
  reopenFraud: (id: string, note: string) => api.post(`/admin/fraud/${id}/reopen`, { note }),
  lookupImei: (imei: string) => api.get(`/admin/imei/${imei}`),
  getBlocklist: (params?: Params) => api.get<Page<any>>("/admin/imei/blocklist", { params: clean(params) }),
  blockImei: (imei: string, reason: string) => api.post("/admin/imei/blocklist", { imei, reason }),
  unblockImei: (imei: string) => api.delete(`/admin/imei/blocklist/${imei}`),
  // catalogue
  getModels: (params?: Params) => api.get<Page<any>>("/admin/catalog/models", { params: clean(params) }),
  createModel: (data: unknown) => api.post("/admin/catalog/models", data),
  updateModel: (id: string, data: unknown) => api.patch(`/admin/catalog/models/${id}`, data),
  // audit
  getAudit: (params?: Params) => api.get<Page<any>>("/admin/audit", { params: clean(params) }),
};

// Users (self-service)
export const usersApi = {
  getMe: () => api.get("/users/me"),
  updateMe: (data: unknown) => api.patch("/users/me", data),
  changePassword: (currentPassword: string, newPassword: string) => api.patch("/users/me/password", { currentPassword, newPassword }),
  exportData: () => api.get("/users/me/export"),
  deleteMe: (password: string) => api.delete("/users/me", { data: { password } }),
  getNotifications: (params?: Params) => api.get<Page<any> & { unread: number }>("/users/me/notifications", { params: clean(params) }),
  markRead: (id: string) => api.patch(`/users/me/notifications/${id}/read`),
  markAllRead: () => api.post("/users/me/notifications/read-all"),
};
