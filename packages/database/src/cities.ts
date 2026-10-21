export interface MoroccoCity {
  slug: string;
  name: string;
  nameAr: string;
  region: string;
  latitude: number;
  longitude: number;
}

/** The 10 launch cities, ordered by market priority. */
export const MOROCCO_CITIES: MoroccoCity[] = [
  { slug: "casablanca", name: "Casablanca", nameAr: "الدار البيضاء", region: "Casablanca-Settat", latitude: 33.5731, longitude: -7.5898 },
  { slug: "rabat", name: "Rabat", nameAr: "الرباط", region: "Rabat-Salé-Kénitra", latitude: 34.0209, longitude: -6.8416 },
  { slug: "marrakech", name: "Marrakech", nameAr: "مراكش", region: "Marrakech-Safi", latitude: 31.6295, longitude: -7.9811 },
  { slug: "fes", name: "Fès", nameAr: "فاس", region: "Fès-Meknès", latitude: 34.0331, longitude: -5.0003 },
  { slug: "tanger", name: "Tanger", nameAr: "طنجة", region: "Tanger-Tétouan-Al Hoceïma", latitude: 35.7595, longitude: -5.834 },
  { slug: "agadir", name: "Agadir", nameAr: "أكادير", region: "Souss-Massa", latitude: 30.4278, longitude: -9.5981 },
  { slug: "meknes", name: "Meknès", nameAr: "مكناس", region: "Fès-Meknès", latitude: 33.8935, longitude: -5.5473 },
  { slug: "oujda", name: "Oujda", nameAr: "وجدة", region: "L'Oriental", latitude: 34.6867, longitude: -1.9114 },
  { slug: "kenitra", name: "Kénitra", nameAr: "القنيطرة", region: "Rabat-Salé-Kénitra", latitude: 34.261, longitude: -6.5802 },
  { slug: "tetouan", name: "Tétouan", nameAr: "تطوان", region: "Tanger-Tétouan-Al Hoceïma", latitude: 35.5785, longitude: -5.3684 },
];
