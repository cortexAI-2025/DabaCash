// Shared types across web + api

export type Role = "CUSTOMER" | "FRANCHISE_OWNER" | "ADMIN";
export type Condition = "A" | "B" | "C" | "D";
export type DeviceType = "PHONE" | "LAPTOP" | "TV" | "TABLET" | "ACCESSORY" | "OTHER";
export type OrderStatus = "PENDING" | "CONFIRMED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED" | "REFUNDED";
export type BuybackStatus = "PENDING" | "UNDER_REVIEW" | "ACCEPTED" | "REJECTED" | "COMPLETED" | "CANCELLED";
export type DeliveryMethod = "DROP_IN_STORE" | "PICKUP_FROM_HOME" | "COURIER";
export type PaymentMethod = "CASH" | "CARD" | "WALLET" | "CMI" | "STRIPE";
export type FranchiseStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";

export interface PriceEstimate {
  buybackPrice: number;
  buybackMin: number;
  buybackMax: number;
  resaleMin: number;
  resaleMax: number;
  expectedMargin: number;
  confidenceScore: number;
  modelName?: string;
  brandName?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiListResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}
