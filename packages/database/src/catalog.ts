export type CatalogDeviceType = "PHONE" | "LAPTOP" | "TV" | "TABLET" | "ACCESSORY" | "OTHER";

export interface CatalogModel {
  brand: string;
  name: string;
  deviceType: CatalogDeviceType;
  releaseYear: number;
  /**
   * INDICATIVE price in MAD, used ONLY by the demo seed so the estimator has something to show.
   * The reference seed never writes it: real baselines are set by an admin (Admin → Catalogue)
   * until which a model cannot be estimated.
   */
  demoPrice: number;
}

export const CATALOG: CatalogModel[] = [
  { brand: "Apple", name: "iPhone 15", deviceType: "PHONE", releaseYear: 2023, demoPrice: 11000 },
  { brand: "Apple", name: "iPhone 14", deviceType: "PHONE", releaseYear: 2022, demoPrice: 9500 },
  { brand: "Apple", name: "iPhone 13", deviceType: "PHONE", releaseYear: 2021, demoPrice: 7800 },
  { brand: "Samsung", name: "Galaxy S23", deviceType: "PHONE", releaseYear: 2023, demoPrice: 8200 },
  { brand: "Samsung", name: "Galaxy A54", deviceType: "PHONE", releaseYear: 2023, demoPrice: 3000 },
  { brand: "Xiaomi", name: "Redmi Note 12", deviceType: "PHONE", releaseYear: 2023, demoPrice: 2200 },
  { brand: "Huawei", name: "P40 Lite", deviceType: "PHONE", releaseYear: 2020, demoPrice: 1800 },
  { brand: "Dell", name: "XPS 13", deviceType: "LAPTOP", releaseYear: 2022, demoPrice: 15000 },
  { brand: "Apple", name: "MacBook Air M1", deviceType: "LAPTOP", releaseYear: 2020, demoPrice: 11000 },
  { brand: "Apple", name: "iPad Air 2022", deviceType: "TABLET", releaseYear: 2022, demoPrice: 6500 },
  { brand: "Sony", name: "Bravia 55 4K", deviceType: "TV", releaseYear: 2022, demoPrice: 6000 },
];

export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
