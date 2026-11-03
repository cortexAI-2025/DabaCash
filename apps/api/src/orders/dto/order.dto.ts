import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString,
  Length, Matches, Max, MaxLength, Min, ValidateNested,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { DeliveryMethod, OrderStatus, PaymentMethod, PaymentStatus } from "@dabacash/database";
import { PaginationQueryDto } from "../../common/pagination";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class OrderItemDto {
  @ApiProperty()
  @IsString()
  @Length(1, 50)
  listingId: string;

  @ApiProperty({ minimum: 1, maximum: 10 })
  @IsInt()
  @Min(1)
  @Max(10)
  quantity: number;
}

export class DeliveryAddressDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(5, 200)
  address: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  city: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(2, 80)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^[0-9]{4,6}$/, { message: "Code postal invalide" })
  zip?: string;
}

// Only methods that are really implemented: online payment through Aslan, or cash in store.
export const ORDER_PAYMENT_METHODS = [PaymentMethod.ASLAN, PaymentMethod.CASH] as const;
export const ORDER_DELIVERY_METHODS = [DeliveryMethod.DROP_IN_STORE, DeliveryMethod.COURIER] as const;

export class CreateOrderDto {
  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @ApiProperty({ enum: ORDER_DELIVERY_METHODS })
  @IsIn(ORDER_DELIVERY_METHODS)
  deliveryMethod: DeliveryMethod;

  @ApiPropertyOptional({ type: DeliveryAddressDto, description: "Required for COURIER" })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  deliveryAddress?: DeliveryAddressDto;

  @ApiProperty({ enum: ORDER_PAYMENT_METHODS })
  @IsIn(ORDER_PAYMENT_METHODS)
  paymentMethod: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}

export class OrderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: OrderStatus })
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}

export class AdminOrderQueryDto extends OrderListQueryDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ description: "Customer email or order id suffix" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  to?: string;
}
