import Link from "next/link";
import Image from "next/image";
import { MapPin, Shield } from "lucide-react";
import { cn, formatPrice, CONDITION_LABELS } from "@/lib/utils";

interface ProductCardProps {
  listing: {
    id: string;
    title: string;
    listingPrice: number;
    originalPrice?: number;
    condition: string;
    images: string[];
    warrantyMonths: number;
    deviceModel: { name: string; brand: { name: string } };
    franchise: { name: string; city: string };
  };
}

export function ProductCard({ listing }: ProductCardProps) {
  const cond = CONDITION_LABELS[listing.condition];
  const discount = listing.originalPrice
    ? Math.round((1 - listing.listingPrice / listing.originalPrice) * 100)
    : null;

  return (
    <Link href={`/marketplace/${listing.id}`} className="group block">
      <div className="card-hover overflow-hidden p-0">
        {/* Image */}
        <div className="relative aspect-square bg-dark-800 overflow-hidden rounded-t-2xl">
          {listing.images?.[0] ? (
            <Image
              src={listing.images[0]}
              alt={listing.title}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-6xl">📱</div>
          )}
          {discount && (
            <div className="absolute top-3 right-3 badge-gold text-xs">-{discount}%</div>
          )}
          <div className={cn("absolute top-3 left-3 badge text-xs", "bg-dark-900/80 backdrop-blur", cond.color)}>
            {cond.label}
          </div>
        </div>

        {/* Info */}
        <div className="p-4">
          <p className="text-xs text-dark-400 mb-1">{listing.deviceModel.brand.name}</p>
          <h3 className="font-semibold text-dark-100 text-sm leading-tight line-clamp-2 mb-3">
            {listing.title}
          </h3>

          <div className="flex items-end justify-between">
            <div>
              <div className="text-lg font-black text-dark-50">
                {formatPrice(listing.listingPrice)}
              </div>
              {listing.originalPrice && (
                <div className="text-xs text-dark-500 line-through">
                  {formatPrice(listing.originalPrice)}
                </div>
              )}
            </div>
            {listing.warrantyMonths > 0 && (
              <div className="flex items-center gap-1 text-xs text-emerald-400">
                <Shield className="h-3 w-3" />
                {listing.warrantyMonths}m
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center gap-1 text-xs text-dark-400">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{listing.franchise.city}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
