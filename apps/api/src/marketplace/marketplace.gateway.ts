import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";

@WebSocketGateway({ cors: true, namespace: "/inventory" })
export class MarketplaceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  // Called by inventory service when stock changes
  broadcastStockUpdate(payload: { listingId: string; quantity: number; franchiseId: string }) {
    this.server.emit("stock:update", payload);
  }

  @SubscribeMessage("subscribe:franchise")
  handleFranchiseSubscription(client: Socket, franchiseId: string) {
    client.join(`franchise:${franchiseId}`);
  }
}
