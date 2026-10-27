import { NextResponse, type NextRequest } from "next/server";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  FRANCHISE_OWNER: "/dashboard",
  CUSTOMER: "/marketplace",
};

// Area -> the only role allowed in it.
const AREA_ROLE: Array<{ prefix: string; role: string }> = [
  { prefix: "/admin", role: "ADMIN" },
  { prefix: "/dashboard", role: "FRANCHISE_OWNER" },
];

/**
 * UI-level guard only. The API enforces RBAC on every request, so a forged cookie
 * can at worst show an empty shell. Gating on the refresh token (7 days) instead of
 * the 15-minute access token lets the client refresh silently.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const area = AREA_ROLE.find((a) => pathname === a.prefix || pathname.startsWith(`${a.prefix}/`));
  if (!area) return NextResponse.next();

  const hasSession = req.cookies.has("refresh_token");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const role = req.cookies.get("role")?.value ?? "";
  if (role !== area.role) {
    const url = req.nextUrl.clone();
    url.pathname = ROLE_HOME[role] ?? "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/dashboard/:path*"],
};
