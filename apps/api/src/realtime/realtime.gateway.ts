import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { Server } from "socket.io";

export interface StockUpdate {
  listingId: string;
  franchiseId: string;
  /** Units a customer can still buy: on-hand minus reserved. */
  available: number;
}

/**
 * Public, read-only feed: it carries the same stock numbers the marketplace already shows,
 * so clients need no authentication to listen.
 */
@WebSocketGateway({ cors: true, namespace: "/inventory" })
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  emitStock(update: StockUpdate) {
    this.server?.emit("stock:update", update);
  }
}
