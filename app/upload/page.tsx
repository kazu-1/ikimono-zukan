"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CATEGORIES } from "@/types";

const MapLeaflet = dynamic(() => import("@/components/MapLeaflet"), {
  ssr: false,
});

export default function UploadPage() {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [category, setCategory] = useState("その他");
  const [speciesName, setSpeciesName] = useState("");
  const [isIdentified, setIsIdentified] = useState(false);
  const [observedOn, setObservedOn] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationSource, setLocationSource] = useState<"gps" | "map" | null>(
    null
  );
  const [manualLat, setManualLat] = useState<number | null>(null);
  const [manualLon, setManualLon] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [pendingLat, setPendingLat] = useState<number | null>(null);
  const [pendingLon, setPendingLon] = useState<number | null>(null);
  const [pendingAddress, setPendingAddress] = useState("");
  const [fileCountMsg, setFileCountMsg] = useState(
    "※ 5枚以内の画像を選択してください"
  );
  const [fileCountError, setFileCountError] = useState(false);
  const [toast, setToast] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setLocation = (address: string, source: "gps" | "map") => {
    setLocationName(address);
    setLocationSource(source);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 5) {
      alert("写真は最大5枚までしかアップロードできません。");
      if (fileInputRef.current) fileInputRef.current.value = "";
      setFileCountMsg("⚠️ 5枚を超えています");
      setFileCountError(true);
      setFiles([]);
      setPreviews([]);
      return;
    }
    setFileCountMsg(
      selected.length > 0
        ? `${selected.length}枚の画像を選択中`
        : "※ 5枚以内の画像を選択してください"
    );
    setFileCountError(false);
    setFiles(selected);

    const newPreviews = await Promise.all(
      selected.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => resolve(ev.target?.result as string);
            reader.readAsDataURL(f);
          })
      )
    );
    setPreviews(newPreviews);

    if (selected.length > 0) {
      const firstFile = selected[0];
      setAnalyzing(true);
      setLocationName("");
      setLocationSource(null);
      setManualLat(null);
      setManualLon(null);

      // Parallel: AI category + GPS extraction
      const aiFormData = new FormData();
      aiFormData.append("file", firstFile);

      try {
        const [aiRes, gpsResult] = await Promise.all([
          fetch("/api/suggest-category", {
            method: "POST",
            body: aiFormData,
          }),
          extractGPS(firstFile),
        ]);

        if (aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData.suggestion) setCategory(aiData.suggestion);
          if (aiData.species) setSpeciesName(aiData.species);
        }

        if (gpsResult) {
          setManualLat(gpsResult.lat);
          setManualLon(gpsResult.lon);
          setLocation(gpsResult.address, "gps");
        }
      } catch (err) {
        console.error("解析エラー:", err);
      } finally {
        setAnalyzing(false);
      }
    }
  };

  const extractGPS = async (
    file: File
  ): Promise<{ lat: number; lon: number; address: string } | null> => {
    try {
      const exifr = (await import("exifr")).default;
      const gps = await exifr.gps(file);
      if (!gps?.latitude || !gps?.longitude) return null;

      const lat = gps.latitude;
      const lon = gps.longitude;

      let address = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
      try {
        const res = await fetch(
          `/api/reverse-geocode?lat=${lat}&lon=${lon}`
        );
        const data = await res.json();
        if (data.address) address = data.address;
      } catch {}

      return { lat, lon, address };
    } catch {
      return null;
    }
  };

  const handleMapLocationChange = (
    lat: number,
    lon: number,
    address: string
  ) => {
    setPendingLat(lat);
    setPendingLon(lon);
    setPendingAddress(address);
  };

  const confirmMapLocation = () => {
    if (pendingLat === null || pendingLon === null) return;
    setManualLat(pendingLat);
    setManualLon(pendingLon);
    setLocation(pendingAddress, "map");
    setShowMapModal(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) {
      alert("画像を選択してください");
      return;
    }
    setSubmitting(true);

    const formData = new FormData();
    files.forEach((f) => formData.append("files", f));
    formData.append("species_name", speciesName);
    formData.append("is_identified", isIdentified.toString());
    formData.append("observed_on", observedOn);
    formData.append("category", category);
    formData.append("notes", notes);
    formData.append("location_name", locationName);
    if (manualLat !== null) formData.append("manual_lat", manualLat.toString());
    if (manualLon !== null) formData.append("manual_lon", manualLon.toString());

    try {
      const res = await fetch("/api/do-upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (res.status === 400 && result.status === "need_location") {
        alert(result.message);
        setSubmitting(false);
        return;
      }
      if (!res.ok) throw new Error(result.error || "予期せぬエラー");

      setToast(true);
      setTimeout(() => {
        setToast(false);
        router.push("/");
      }, 2500);
    } catch (err: unknown) {
      alert("エラー: " + (err instanceof Error ? err.message : "不明なエラー"));
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20">
      {/* Toast */}
      <div
        className={`fixed top-10 right-10 z-[100] transition-all duration-500 pointer-events-none ${
          toast
            ? "opacity-100 translate-y-0 pointer-events-auto"
            : "opacity-0 -translate-y-5"
        }`}
      >
        <div className="bg-teal-600 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-4 border-2 border-white/20">
          <span className="text-2xl">✅</span>
          <div className="flex flex-col">
            <span className="font-bold text-lg">投稿が完了しました！🌿</span>
            <span className="text-xs opacity-80">トップページへ戻ります...</span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto my-10 px-4">
        <div className="bg-white p-8 rounded-3xl shadow-2xl border border-white/40">
          <header className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-teal-700 mb-2">
              新規投稿
            </h2>
            <p className="text-gray-500 text-sm">
              見つけた生き物を記録しましょう
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Image upload */}
            <div>
              <label className="block text-sm font-extrabold text-teal-800 mb-2 ml-1">
                📸 写真 (最大5枚まで)
              </label>
              <div className="mt-1 flex flex-col items-center justify-center border-2 border-gray-300 border-dashed rounded-2xl hover:border-teal-500 transition-all bg-gray-50/50 p-6">
                <div className="space-y-2 text-center">
                  {analyzing ? (
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
                  ) : (
                    <svg
                      className="mx-auto h-12 w-12 text-gray-400"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  <div className="flex flex-col items-center text-sm text-gray-600">
                    <label className="relative cursor-pointer bg-teal-50 rounded-lg font-bold text-teal-700 hover:bg-teal-100 transition px-4 py-2 mt-2">
                      <span>
                        {analyzing
                          ? "🔍 AI解析中..."
                          : files.length > 0
                          ? `${files.length}枚の画像を選択中`
                          : "ファイルを選択"}
                      </span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        required
                        className="sr-only"
                        onChange={handleFileChange}
                        disabled={analyzing}
                      />
                    </label>
                    <p
                      className={`text-[10px] mt-2 italic ${
                        fileCountError ? "text-red-500" : "text-gray-400"
                      }`}
                    >
                      {fileCountMsg}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1 italic">
                      ※ AI判定は1枚目の画像を使用します
                    </p>
                  </div>
                </div>

                {previews.length > 0 && (
                  <div className="w-full mt-4 border-t pt-4">
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                      {previews.map((src, i) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={i}
                          src={src}
                          alt=""
                          className="w-24 h-24 object-cover rounded-lg shadow-sm flex-shrink-0 border-2 border-white"
                        />
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 text-center mt-2 italic">
                      左右にスワイプして確認できます。再度クリックで画像変更。
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            <div>
              <label className="text-xs font-extrabold text-teal-800 mb-1.5 ml-1 block">
                📍 撮影場所
              </label>
              <div className="flex gap-2 items-center">
                <div
                  className={`flex-1 h-[46px] px-4 bg-gray-50 border-2 border-gray-100 rounded-xl text-sm flex items-center transition ${
                    locationName ? "text-gray-800" : "text-gray-400"
                  } ${analyzing ? "animate-pulse bg-teal-50" : ""}`}
                >
                  <span className="truncate">
                    {analyzing
                      ? "📍 取得中..."
                      : locationName
                      ? (locationSource === "gps" ? "📷 " : "🗺️ ") +
                        locationName
                      : "写真から自動取得 または 地図で選んでください"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className="h-[46px] px-4 bg-teal-50 border-2 border-teal-100 rounded-xl text-teal-700 text-xs font-bold hover:bg-teal-100 transition whitespace-nowrap flex-shrink-0"
                >
                  🗺️ 地図で選ぶ
                </button>
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="text-xs font-extrabold text-teal-800 mb-1.5 ml-1 block">
                🏷️ 分類
              </label>
              <div className="relative">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className={`w-full h-[46px] appearance-none bg-gray-50 border-2 border-gray-100 rounded-xl px-4 text-sm focus:bg-white focus:border-teal-500 outline-none transition-all cursor-pointer ${
                    analyzing ? "animate-pulse border-teal-400" : ""
                  }`}
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

            {/* Species + identified */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">
                  種名
                </label>
                <input
                  type="text"
                  value={speciesName}
                  onChange={(e) => setSpeciesName(e.target.value)}
                  placeholder="例：マツバガイ"
                  className={`w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none shadow-sm transition-all ${
                    analyzing ? "animate-pulse bg-teal-50" : ""
                  }`}
                />
              </div>
              <div className="pb-3 px-1">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={isIdentified}
                    onChange={(e) => setIsIdentified(e.target.checked)}
                    className="w-5 h-5 rounded text-teal-500 border-gray-300 focus:ring-teal-500"
                  />
                  <span className="text-xs font-bold text-gray-600 group-hover:text-teal-600 transition">
                    同定済み
                  </span>
                </label>
              </div>
            </div>

            {/* Date + notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">
                  観察日
                </label>
                <input
                  type="date"
                  value={observedOn}
                  onChange={(e) => setObservedOn(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2 ml-1">
                  メモ
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={1}
                  placeholder="特徴など"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => router.push("/")}
                className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-bold hover:bg-gray-200 transition shadow-sm"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={submitting || analyzing}
                className="flex-[2] bg-teal-600 text-white py-4 rounded-2xl font-bold hover:bg-teal-700 shadow-lg transition transform active:scale-95 disabled:bg-gray-400"
              >
                {submitting ? "処理中..." : "投稿を公開する"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Map modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <h2 className="font-bold text-gray-800">
                📍 場所を地図で選ぶ
              </h2>
              <button
                onClick={() => setShowMapModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ✕
              </button>
            </div>
            <MapLeaflet
              lat={pendingLat}
              lon={pendingLon}
              interactive={true}
              onLocationChange={handleMapLocationChange}
              className="w-full"
              // inline style needed for exact height
            />
            <div className="px-5 py-3 bg-gray-50 border-t">
              <p className="text-xs text-gray-500 mb-1">
                地図をタップしてピンを立ててください
              </p>
              <p className="text-sm font-bold text-teal-700 min-h-[20px]">
                {pendingAddress}
              </p>
            </div>
            <div className="flex gap-3 px-5 py-3 border-t">
              <button
                onClick={() => setShowMapModal(false)}
                className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-bold hover:bg-gray-200 transition"
              >
                キャンセル
              </button>
              <button
                onClick={confirmMapLocation}
                disabled={pendingLat === null}
                className="flex-[2] py-2 rounded-xl bg-teal-600 text-white text-sm font-bold hover:bg-teal-700 transition disabled:bg-gray-300"
              >
                この場所に決定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
