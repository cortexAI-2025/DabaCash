"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Several stock changes often land together (an order touches every line): refetch once.
const DEBOUNCE_MS = 400;

const STOCK_QUERIES = [["listings"], ["featured-listings"], ["listing"], ["inventory"], ["inventory-summary"]];

/**
 * Keeps marketplace and inventory views live. The 30 s polling on the inventory page stays
 * as a fallback, so a dropped socket only costs freshness, never correctness.
 */
export function useStockSocket() {
  const qc = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = io(`${WS_URL}/inventory`, { transports: ["websocket"], reconnectionDelayMax: 15_000 });

    socket.on("stock:update", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const queryKey of STOCK_QUERIES) qc.invalidateQueries({ queryKey });
      }, DEBOUNCE_MS);
    });

    return () => {
      clearTimeout(timer);
      socket.disconnect();
    };
  }, [qc]);
}
