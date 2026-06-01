export interface Observation {
  id: string;
  created_at: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
  species_name?: string;
  category: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  observed_on?: string;
  notes?: string;
  is_identified: boolean;
  image_urls?: string[];
  user_id?: string;
}

export const CATEGORIES = [
  "さかな",
  "貝類",
  "甲殻類",
  "海藻",
  "鳥",
  "植物",
  "キノコ",
  "虫",
  "爬虫類・両生類",
  "その他",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_CONFIG: Record<
  string,
  { color: string; icon: string; bg: string }
> = {
  さかな: { color: "#3B82F6", icon: "🐟", bg: "bg-blue-100 text-blue-700" },
  貝類: { color: "#EC4899", icon: "🐚", bg: "bg-pink-100 text-pink-700" },
  甲殻類: { color: "#EF4444", icon: "🦀", bg: "bg-red-100 text-red-700" },
  海藻: { color: "#065F46", icon: "🪸", bg: "bg-emerald-100 text-emerald-800" },
  鳥: { color: "#06B6D4", icon: "🐦", bg: "bg-cyan-100 text-cyan-700" },
  植物: { color: "#10B981", icon: "🌿", bg: "bg-green-100 text-green-700" },
  キノコ: { color: "#92400E", icon: "🍄", bg: "bg-amber-100 text-amber-800" },
  虫: { color: "#F59E0B", icon: "🦋", bg: "bg-yellow-100 text-yellow-800" },
  "爬虫類・両生類": {
    color: "#84CC16",
    icon: "🐸",
    bg: "bg-lime-100 text-lime-700",
  },
  その他: { color: "#6B7280", icon: "📍", bg: "bg-gray-100 text-gray-600" },
};
