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

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string; refreshToken: string; role: string }>("/auth/login", { email, password }),
  register: (data: { email: string; password: string; firstName: string; lastName: string; phone?: string }) =>
    api.post("/auth/register", data),
  logout: (refreshToken: string) =>
    api.post("/auth/logout", { refreshToken }),
};

// Marketplace
export const marketplaceApi = {
  getListings: (params?: Record<string, unknown>) =>
    api.get("/marketplace/listings", { params }),
  getFeatured: () =>
    api.get("/marketplace/listings/featured"),
  getListing: (id: string) =>
    api.get(`/marketplace/listings/${id}`),
  getBrands: () =>
    api.get("/marketplace/brands"),
  getModels: (brand?: string) =>
    api.get("/marketplace/models", { params: { brand } }),
};

// Cities
export const citiesApi = {
  getAll: () => api.get("/cities"),
};

// Payments (Aslan hosted checkout)
export const paymentsApi = {
  startAslanCheckout: (orderId: string) =>
    api.post<{ checkoutUrl: string; expiresAt: string }>("/payments/aslan/checkout", { orderId }),
  getOrderStatus: (orderId: string) =>
    api.get<{ orderId: string; orderStatus: string; method: string; status: string; amount: number }>(
      `/payments/order/${orderId}`
    ),
};

// Pricing
export const pricingApi = {
  estimate: (brandSlug: string, modelSlug: string, condition: string) =>
    api.get("/pricing/estimate", { params: { brandSlug, modelSlug, condition } }),
};

// Buyback
export const buybackApi = {
  create: (data: unknown) => api.post("/buyback", data),
  getMy: () => api.get("/buyback/my"),
  getFranchise: () => api.get("/buyback/franchise"),
  getById: (id: string) => api.get(`/buyback/${id}`),
  review: (id: string, data: unknown) => api.patch(`/buyback/${id}/review`, data),
};

// Orders
export const ordersApi = {
  create: (data: unknown) => api.post("/orders", data),
  getMy: () => api.get("/orders/my"),
  getFranchise: () => api.get("/orders/franchise"),
  getById: (id: string) => api.get(`/orders/${id}`),
  updateStatus: (id: string, status: string) => api.patch(`/orders/${id}/status`, { status }),
};

// Products (franchise)
export const productsApi = {
  create: (data: unknown) => api.post("/products", data),
  getMy: () => api.get("/products/my"),
  update: (id: string, data: unknown) => api.patch(`/products/${id}`, data),
  remove: (id: string) => api.delete(`/products/${id}`),
};

// Inventory
export const inventoryApi = {
  get: () => api.get("/inventory"),
  getSummary: () => api.get("/inventory/summary"),
};

// Franchise
export const franchiseApi = {
  getAll: () => api.get("/franchises"),
  getBySlug: (slug: string) => api.get(`/franchises/${slug}`),
  getDashboard: () => api.get("/franchises/dashboard"),
  getRecentSales: () => api.get("/franchises/dashboard/recent-sales"),
};

// Admin
export const adminApi = {
  getStats: () => api.get("/admin/stats"),
  getFranchises: () => api.get("/admin/franchises"),
  updateFranchise: (id: string, data: unknown) => api.patch(`/admin/franchises/${id}`, data),
  getFlagged: (status: "open" | "resolved" | "all" = "open") =>
    api.get("/admin/fraud/flagged", { params: { status } }),
  resolveFraud: (id: string, data: { resolution: "CLEARED" | "CONFIRMED_FRAUD"; note?: string }) =>
    api.patch(`/admin/fraud/${id}/resolve`, data),
  getAnalytics: (days: number) => api.get("/admin/analytics", { params: { days } }),
  getOrders: () => api.get("/admin/orders"),
};

// Users
export const usersApi = {
  getMe: () => api.get("/users/me"),
  updateMe: (data: unknown) => api.patch("/users/me", data),
  getNotifications: () => api.get("/users/me/notifications"),
};
