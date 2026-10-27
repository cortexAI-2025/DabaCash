import Cookies from "js-cookie";

export type UserRole = "CUSTOMER" | "FRANCHISE_OWNER" | "ADMIN";

const ACCESS_COOKIE = "access_token";
const REFRESH_COOKIE = "refresh_token";
// Readable by the Next.js middleware to route by role. It only steers the UI:
// every API call is still authorised server-side from the signed token.
export const ROLE_COOKIE = "role";

/** Stores a session. Called after login, register and every refresh (the refresh token rotates). */
export function setAuthTokens(accessToken: string, refreshToken: string, role: UserRole) {
  Cookies.set(ACCESS_COOKIE, accessToken, { expires: 1 / 96, sameSite: "strict" }); // 15 min
  Cookies.set(REFRESH_COOKIE, refreshToken, { expires: 7, sameSite: "strict" });
  Cookies.set(ROLE_COOKIE, role, { expires: 7, sameSite: "strict" });
}

export function clearAuthTokens() {
  Cookies.remove(ACCESS_COOKIE);
  Cookies.remove(REFRESH_COOKIE);
  Cookies.remove(ROLE_COOKIE);
}

export function getRefreshToken() {
  return Cookies.get(REFRESH_COOKIE);
}

export function getAccessToken() {
  return Cookies.get(ACCESS_COOKIE);
}

export function isAuthenticated() {
  return !!Cookies.get(REFRESH_COOKIE);
}

export function getRoleRedirect(role: UserRole): string {
  const redirects: Record<UserRole, string> = {
    ADMIN: "/admin",
    FRANCHISE_OWNER: "/dashboard",
    CUSTOMER: "/marketplace",
  };
  return redirects[role];
}
