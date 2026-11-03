"use client";

import { useEffect, useState } from "react";
import { getRefreshToken, ROLE_COOKIE, type UserRole } from "@/lib/auth";
import Cookies from "js-cookie";

/** Cookie-based session hint for the UI. Starts "unknown" so server and first client render match. */
export function useSession(): { ready: boolean; loggedIn: boolean; role: UserRole | null } {
  const [state, setState] = useState<{ ready: boolean; loggedIn: boolean; role: UserRole | null }>({ ready: false, loggedIn: false, role: null });
  useEffect(() => {
    const read = () => setState({ ready: true, loggedIn: !!getRefreshToken(), role: (Cookies.get(ROLE_COOKIE) as UserRole | undefined) ?? null });
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  return state;
}
