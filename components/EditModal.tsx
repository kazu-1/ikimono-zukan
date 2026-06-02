"use client";

import { useState, useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { Observation, CATEGORIES, CATEGORY_CONFIG } from "@/types";
import VideoUploader from "./VideoUploader";
import ImageLightbox from "./ImageLightbox";

const MapLeaflet = dynamic(() => import("./MapLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-56 rounded-lg border bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
      地図を読み込み中...
    </div>
  ),
});

interface Props {
  item: Observation;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export default function EditModal({ item, onClose, onSaved }: Props) {
  const [speciesName, setSpeciesName] = useState(item.species_name || "");
  const [isIdentified, setIsIdentified] = useState(item.is_identified || false);
  const [observedOn, setObservedOn] = useState(item.observed_on || "");
  const [category, setCategory] = useState(item.category || "その他");
  const [locationName, setLocationName] = useState(item.location_name || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [youtubeUrl, setYoutubeUrl] = useState(item.youtube_url || "");
  const [videoUploading, setVideoUploading] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>(item.image_urls || []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [newFilePreviews, setNewFilePreviews] = useState<string[]>([]);
  const [manualLat, setManualLat] = useState<number | null>(
    item.latitude ?? null
  );
  const [manualLon, setManualLon] = useState<number | null>(
    item.longitude ?? null
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showLimitMsg, setShowLimitMsg] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "---";
    return dateStr.substring(0, 10).replace(/-/g, "/");
  };

  const removeExistingImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    setNewFiles((prev) => prev.filter((_, i) => i !== index));
    setNewFilePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (imageUrls.length + newFiles.length + files.length > 5) {
      setShowLimitMsg(true);
      setTimeout(() => setShowLimitMsg(false), 3000);
      return;
    }
    setNewFiles((prev) => [...prev, ...files]);
    files.forEach((f) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setNewFilePreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(f);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleMapUpdate = (lat: number, lon: number, address: string) => {
    setManualLat(lat);
    setManualLon(lon);
    setLocationName(address);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData();
    formData.append("species_name", speciesName);
    formData.append("is_identified", isIdentified.toString());
    formData.append("observed_on", observedOn);
    formData.append("category", category);
    formData.append("location_name", locationName);
    formData.append("notes", notes);
    if (manualLat !== null) formData.append("manual_lat", manualLat.toString());
    if (manualLon !== null) formData.append("manual_lon", manualLon.toString());
    formData.append("existing_urls", JSON.stringify(imageUrls));
    formData.append("youtube_url", youtubeUrl);
    newFiles.forEach((f) => formData.append("new_files", f));

    try {
      const res = await fetch(`/api/do-update/${item.id}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "エラーが発生しました");
      onSaved("保存しました ✅");
    } catch (err: unknown) {
      alert("エラー: " + (err instanceof Error ? err.message : "不明なエラー"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("この投稿を削除しますか？")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/do-delete/${item.id}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSaved("削除しました 🗑️");
    } catch (err: unknown) {
      alert("削除エラー: " + (err instanceof Error ? err.message : "不明なエラー"));
    } finally {
      setDeleting(false);
    }
  };

  // Close on backdrop click
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const totalImages = imageUrls.length + newFiles.length;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="sticky top-0 bg-white z-20 px-6 py-4 -mx-6 -mt-6 mb-6 border-b border-gray-100 flex justify-between items-center rounded-t-2xl">
            <h3 className="text-xl font-extrabold text-teal-800 tracking-tight">
              投稿を編集
            </h3>
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition text-2xl"
            >
              ✕
            </button>
          </div>

          {/* Photo gallery */}
          <div className="mb-6">
            <label className="flex justify-between px-1 text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
              <span>フォトギャラリー</span>
              <span className="text-teal-600 font-extrabold px-2 bg-teal-50 rounded-full">
                {totalImages}枚
              </span>
            </label>
            <div
              id="m_image_container"
              className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory rounded-2xl bg-gray-50/50 p-2 h-64 border-2 border-transparent"
            >
              {/* Add button */}
              <label className="snap-center shrink-0 w-48 h-full border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white hover:border-teal-400 hover:text-teal-600 transition">
                <svg
                  className="w-8 h-8 text-gray-300 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                <span className="text-[10px] font-bold text-gray-400">
                  写真を追加
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleNewFiles}
                />
              </label>
              {/* Existing images */}
              {imageUrls.map((url, i) => (
                <div key={url} className="relative snap-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    onClick={() => setLightboxSrc(url)}
                    className="h-full w-48 object-cover rounded-xl border-2 border-white shadow cursor-pointer hover:opacity-90 transition"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeExistingImage(i); }}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center shadow hover:bg-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
              {/* New file previews */}
              {newFilePreviews.map((src, i) => (
                <div key={i} className="relative snap-center shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    onClick={() => setLightboxSrc(src)}
                    className="h-full w-48 object-cover rounded-xl border-2 border-teal-400 opacity-80 shadow cursor-pointer hover:opacity-70 transition"
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeNewImage(i); }}
                    className="absolute top-2 right-2 w-7 h-7 bg-red-500 text-white rounded-full text-xs font-bold flex items-center justify-center shadow hover:bg-red-600"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            {showLimitMsg && (
              <p className="text-[10px] text-red-500 mt-1 font-bold text-right animate-bounce">
                ⚠️ 合計5枚までです
              </p>
            )}
          </div>

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-teal-50/50 rounded-xl border border-teal-100 text-[11px] leading-relaxed">
            <div>
              <p className="text-teal-600 font-bold uppercase mb-1">
                📋 登録情報
              </p>
              <p className="text-gray-600">
                名前:{" "}
                <span className="text-gray-900 font-medium">
                  {item.created_by || "不明"}
                </span>
              </p>
              <p className="text-gray-600">
                日時:{" "}
                <span className="text-gray-900 font-medium">
                  {formatDate(item.created_at)}
                </span>
              </p>
            </div>
            <div className="border-l border-teal-100 pl-4">
              <p className="text-orange-600 font-bold uppercase mb-1">
                ✏️ 最終編集
              </p>
              <p className="text-gray-600">
                名前:{" "}
                <span className="text-gray-900 font-medium">
                  {item.updated_by || "（未編集）"}
                </span>
              </p>
              <p className="text-gray-600">
                日時:{" "}
                <span className="text-gray-900 font-medium">
                  {item.updated_at ? formatDate(item.updated_at) : "---"}
                </span>
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                種類名
              </label>
              <input
                type="text"
                value={speciesName}
                onChange={(e) => setSpeciesName(e.target.value)}
                className="w-full border rounded-md p-2 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="block text-sm font-bold text-gray-700 ml-1">
                  日付
                </label>
                <input
                  type="date"
                  value={observedOn}
                  onChange={(e) => setObservedOn(e.target.value)}
                  className="w-full h-[46px] px-4 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="block text-sm font-bold text-gray-700 ml-1">
                  分類
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full h-[46px] appearance-none bg-gray-50 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-teal-500 outline-none cursor-pointer"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400 text-[10px]">
                    ▼
                  </div>
                </div>
              </div>
            </div>

            <div>
              <label className="flex items-center space-x-2 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={isIdentified}
                  onChange={(e) => setIsIdentified(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-500 focus:ring-teal-500"
                />
                <span className="text-gray-700">同定済み（名前確定）</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                場所
              </label>
              <div className="h-[42px] px-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm flex items-center text-gray-500">
                <span className="truncate">{locationName || "位置情報なし"}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                メモ
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full border rounded-md p-2 h-24 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                動画
              </label>
              <VideoUploader
                existingUrl={youtubeUrl}
                speciesName={speciesName}
                onUploaded={(url) => setYoutubeUrl(url)}
                onCleared={() => setYoutubeUrl("")}
                onUploadingChange={setVideoUploading}
              />
            </div>

            {/* Map */}
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                発見場所（地図）
              </label>
              <MapLeaflet
                lat={manualLat}
                lon={manualLon}
                interactive={true}
                onLocationChange={handleMapUpdate}
                className="w-full h-56 rounded-lg border shadow-inner cursor-crosshair"
              />
              <p className="text-[10px] text-gray-400 mt-1 italic">
                ※ 地図をクリックしてピンの位置を更新できます
              </p>
              {!manualLat && !manualLon && (
                <p className="text-xs text-orange-400 mt-1">
                  📍 位置情報がありません。地図をクリックしてピンを立ててください。
                </p>
              )}
            </div>

            <div className="flex gap-3 mt-6 border-t pt-6">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-50 text-red-600 py-3 rounded-xl font-bold hover:bg-red-100 transition flex items-center justify-center gap-2 border border-red-200 disabled:opacity-50"
              >
                🗑️ 削除
              </button>
              <button
                type="submit"
                disabled={saving || videoUploading}
                className="flex-[2] bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 shadow-md transition disabled:opacity-50"
              >
                {saving ? "保存中..." : videoUploading ? "動画アップロード中..." : "変更を保存する"}
              </button>
            </div>
          </form>
        </div>
      </div>
      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </div>
  );
}
