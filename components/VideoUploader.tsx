"use client";

import { useRef, useState } from "react";

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB（Vercel Hobby 4.5MB制限に収める）

interface Props {
  existingUrl?: string;
  speciesName?: string;
  onUploaded: (youtubeUrl: string) => void;
  onCleared: () => void;
}

export default function VideoUploader({
  existingUrl,
  speciesName,
  onUploaded,
  onCleared,
}: Props) {
  const [status, setStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 20 * 1024 * 1024) {
      setStatus("error");
      setErrorMsg(`ファイルサイズが大きすぎます（${(file.size / 1024 / 1024).toFixed(1)}MB）。20MB以内の動画を選択してください。`);
      return;
    }

    setStatus("uploading");
    setProgress(0);
    setErrorMsg("");

    const title = speciesName ? `${speciesName}の観察動画` : "生き物の観察動画";
    let youtubeUploadUrl = "";
    let offset = 0;

    try {
      while (offset < file.size) {
        const chunkBlob = file.slice(offset, offset + CHUNK_SIZE);

        const formData = new FormData();
        formData.append("chunk", chunkBlob, "chunk");
        formData.append("totalSize", file.size.toString());
        formData.append("chunkStart", offset.toString());
        formData.append("youtubeUploadUrl", youtubeUploadUrl);
        formData.append("title", title);

        const res = await fetch("/api/upload-video", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `サーバーエラー (${res.status})`);

        if (data.done) {
          setStatus("done");
          setProgress(100);
          onUploaded(data.youtubeUrl);
          return;
        }

        youtubeUploadUrl = data.youtubeUploadUrl;
        offset += chunkBlob.size;
        setProgress(Math.round((offset / file.size) * 100));
      }

      throw new Error("アップロードが完了しませんでした");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "アップロードに失敗しました");
    }
  };

  const hasVideo = !!existingUrl || status === "done";

  const handleClear = () => {
    setStatus("idle");
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onCleared();
  };

  return (
    <div>
      {!hasVideo && status !== "uploading" && status !== "error" && (
        <label className="cursor-pointer flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-300 rounded-xl p-5 hover:border-red-400 hover:bg-red-50 transition">
          <span className="text-2xl">🎬</span>
          <span className="text-sm font-bold text-gray-500">
            動画を選択してアップロード
          </span>
          <span className="text-xs text-gray-400">
            MP4・MOV など（YouTube限定公開で保存）
          </span>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </label>
      )}

      {status === "uploading" && (
        <div className="border-2 border-red-100 bg-red-50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-red-700">
              YouTubeにアップロード中...
            </span>
            <span className="text-sm font-bold text-red-700">{progress}%</span>
          </div>
          <div className="w-full bg-red-200 rounded-full h-2 overflow-hidden">
            <div
              className="bg-red-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-red-400 mt-2">
            ※ アップロード中は画面を閉じないでください
          </p>
        </div>
      )}

      {hasVideo && status !== "uploading" && status !== "error" && (
        <div className="flex items-center justify-between gap-3 bg-red-50 border-2 border-red-100 rounded-xl px-4 py-3">
          <span className="text-sm font-bold text-red-700">▶ 動画あり</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-gray-400 hover:text-red-600 underline transition"
          >
            削除する
          </button>
        </div>
      )}

      {status === "error" && (
        <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4">
          <p className="text-sm font-bold text-orange-700 mb-2">
            ❌ {errorMsg}
          </p>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="text-xs font-bold text-orange-600 hover:underline"
          >
            再試行する
          </button>
        </div>
      )}
    </div>
  );
}
