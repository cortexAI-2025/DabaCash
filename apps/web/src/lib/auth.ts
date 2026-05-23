import Cookies from "js-cookie";

export type UserRole = "CUSTOMER" | "FRANCHISE_OWNER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
}

export function setAuthTokens(accessToken: string, refreshToken: string) {
  Cookies.set("access_token", accessToken, { expires: 1 / 96, sameSite: "strict" });
  Cookies.set("refresh_token", refreshToken, { expires: 7, sameSite: "strict" });
}

export function clearAuthTokens() {
  Cookies.remove("access_token");
  Cookies.remove("refresh_token");
}

export function getAccessToken() {
  return Cookies.get("access_token");
}

export function isAuthenticated() {
  return !!Cookies.get("access_token");
}

export function getRoleRedirect(role: UserRole): string {
  const redirects: Record<UserRole, string> = {
    ADMIN: "/admin",
    FRANCHISE_OWNER: "/dashboard",
    CUSTOMER: "/marketplace",
  };
  return redirects[role];
}
