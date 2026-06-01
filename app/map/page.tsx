import { createClient } from "@/lib/supabase/server";
import { Observation } from "@/types";
import Link from "next/link";
import MapPageClient from "@/components/MapPageClient";

export const revalidate = 0;

export default async function MapPage() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("observations")
    .select("*")
    .not("latitude", "is", null);

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-teal-600 text-white shadow-md p-4 flex justify-between items-center shrink-0 h-16">
        <Link
          href="/"
          className="text-xl font-bold hover:opacity-80 transition"
        >
          石巻の生き物図鑑
        </Link>
        <div className="space-x-4">
          <Link
            href="/"
            className="text-sm bg-teal-700 px-3 py-2 rounded-lg hover:bg-teal-800 transition"
          >
            リスト表示
          </Link>
          <Link
            href="/upload"
            className="text-sm bg-orange-500 px-3 py-2 rounded-lg hover:bg-orange-600 transition"
          >
            投稿する
          </Link>
        </div>
      </header>
      <MapPageClient items={(items as Observation[]) || []} />
    </div>
  );
}
