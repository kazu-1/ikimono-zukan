"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { useRouter } from "next/navigation";
import { Observation, CATEGORIES, CATEGORY_CONFIG } from "@/types";
import EditModal from "./EditModal";
import VideoModal from "./VideoModal";

const ObservationCard = memo(function ObservationCard({
  item,
  onClick,
  onVideoClick,
}: {
  item: Observation;
  onClick: (item: Observation) => void;
  onVideoClick: (url: string) => void;
}) {
  const catCfg = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG["その他"];
  const firstImage = item.image_urls?.[0];
  return (
    <div
      onClick={() => onClick(item)}
      className="observation-card bg-white rounded-xl shadow-md overflow-hidden hover:shadow-lg transition cursor-pointer flex flex-col"
    >
      {firstImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={firstImage}
          alt={item.species_name || "生き物"}
          className="w-full h-48 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-48 bg-gray-100 flex items-center justify-center text-4xl">
          {catCfg.icon}
        </div>
      )}
      <div className="p-4 flex-grow">
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${catCfg.bg}`}>
            {item.category}
          </span>
          {item.is_identified ? (
            <span className="text-xs font-semibold px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
              同定済
            </span>
          ) : (
            <span className="text-xs font-semibold px-2 py-1 bg-gray-100 text-gray-500 rounded-full">
              未同定
            </span>
          )}
        </div>
        <h2 className="font-bold text-lg mb-1">
          {item.species_name || "名称不明"}
        </h2>
        <p className="text-gray-500 text-xs mb-2">
          📍 {item.location_name || "場所不明"}
        </p>
        <p className="text-gray-600 text-sm line-clamp-2">
          {item.notes || ""}
        </p>
        {item.youtube_url && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onVideoClick(item.youtube_url!); }}
            className="mt-3 w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 text-xs font-bold py-2 rounded-lg hover:bg-red-100 transition border border-red-200"
          >
            ▶ 動画を見る
          </button>
        )}
      </div>
    </div>
  );
});

interface Props {
  items: Observation[];
}

export default function ObservationList({ items }: Props) {
  const router = useRouter();
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [idFilter, setIdFilter] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [editingItem, setEditingItem] = useState<Observation | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const handleVideoClick = useCallback((url: string) => setVideoUrl(url), []);
  const [toast, setToast] = useState<{
    show: boolean;
    message: string;
  }>({ show: false, message: "" });

  const showToast = useCallback((message: string) => {
    setToast({ show: true, message });
    setTimeout(() => {
      setToast({ show: false, message: "" });
      setTimeout(() => router.refresh(), 500);
    }, 2500);
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const filtered = useMemo(() => {
    const text = searchText.toLowerCase();
    return items
      .filter((item) => {
        const matchText =
          !text ||
          (item.species_name || "").toLowerCase().includes(text) ||
          (item.created_by || "").toLowerCase().includes(text) ||
          (item.location_name || "").toLowerCase().includes(text) ||
          (item.notes || "").toLowerCase().includes(text);
        const matchCat = !categoryFilter || item.category === categoryFilter;
        const idStr = item.is_identified ? "同定済" : "未同定";
        const matchId = !idFilter || idStr === idFilter;
        return matchText && matchCat && matchId;
      })
      .sort((a, b) => {
        const diff =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return sortAsc ? diff : -diff;
      });
  }, [items, searchText, categoryFilter, idFilter, sortAsc]);

  return (
    <div className="pb-20">
      {/* Toast */}
      <div
        className={`fixed top-10 right-10 z-[100] transition-all duration-500 pointer-events-none ${
          toast.show
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-5"
        }`}
      >
        <div className="bg-teal-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-white/20">
          <span className="text-2xl">✅</span>
          <div className="flex flex-col">
            <span className="font-bold text-lg">{toast.message}</span>
            <span className="text-xs opacity-80">画面を更新しています...</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="mb-10 max-w-4xl mx-auto px-4">
        <div className="relative flex flex-col items-center pt-8 pb-4">
          <div className="absolute top-0 right-0 z-50">
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-[10px] sm:text-xs font-bold text-gray-400 hover:text-red-500 transition border border-gray-200 hover:border-red-200 px-3 py-1.5 rounded-full bg-white/90 backdrop-blur-sm shadow-sm"
            >
              👋 ログアウト
            </button>
          </div>
          <div className="text-center mt-6 w-full">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-teal-700 mb-3 drop-shadow-md tracking-tight leading-tight">
              石巻の生き物図鑑 ver.1
            </h1>
            <div className="inline-block px-4 py-1 bg-teal-50 rounded-full">
              <p className="text-teal-600 text-sm sm:text-base font-bold">
                発見した生き物を記録しよう！
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Action buttons */}
      <div className="flex flex-wrap justify-center gap-4 mb-8">
        <a
          href="/upload"
          className="flex items-center gap-2 bg-orange-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-orange-600 shadow-lg transition transform hover:-translate-y-1"
        >
          📸 投稿する
        </a>
        <a
          href="/map"
          className="flex items-center gap-2 bg-blue-500 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-600 shadow-lg transition transform hover:-translate-y-1"
        >
          📍 地図で見る
        </a>
      </div>

      {/* Filters */}
      <div className="max-w-5xl mx-auto px-6 mb-8">
        <div className="bg-white p-4 rounded-xl shadow-sm space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="種名、登録者、場所で検索..."
              className="flex-grow border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-teal-500 outline-none"
            />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2"
            >
              <option value="">すべての分類</option>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select
              value={idFilter}
              onChange={(e) => setIdFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-4 py-2"
            >
              <option value="">すべて（同定/未）</option>
              <option value="同定済">同定済</option>
              <option value="未同定">未同定</option>
            </select>
          </div>
          <div className="flex justify-end">
            <button
              onClick={() => setSortAsc((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-teal-600 transition-colors"
            >
              <span className="opacity-70">並び替え:</span>
              <span>{sortAsc ? "古い投稿順" : "最近の投稿順"}</span>
              <span
                className={`inline-block transition-transform duration-300 ${
                  sortAsc ? "rotate-180" : ""
                }`}
              >
                ↓
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Cards */}
      <main className="max-w-5xl mx-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((item) => (
            <ObservationCard
              key={item.id}
              item={item}
              onClick={setEditingItem}
              onVideoClick={handleVideoClick}
            />
          ))}
        </div>
      </main>

      {/* Edit Modal */}
      {editingItem && (
        <EditModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={(msg) => {
            setEditingItem(null);
            showToast(msg);
          }}
        />
      )}

      {/* Video Modal */}
      {videoUrl && (
        <VideoModal url={videoUrl} onClose={() => setVideoUrl(null)} />
      )}
    </div>
  );
}
