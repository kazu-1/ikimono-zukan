"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, username, action: tab }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "エラーが発生しました");
      } else if (tab === "signup") {
        setSuccess("アカウントを作成しました！さっそくログインしてみよう。");
        setTab("login");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("ネットワークエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🌿</div>
          <h1 className="text-2xl font-bold text-teal-700">
            石巻の生き物図鑑へようこそ
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            ログインして生き物を記録しよう
          </p>
        </div>

        <div className="flex mb-6 bg-gray-100 rounded-xl p-1">
          <button
            onClick={() => setTab("login")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === "login"
                ? "bg-white shadow text-teal-700"
                : "text-gray-500"
            }`}
          >
            ログイン
          </button>
          <button
            onClick={() => setTab("signup")}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              tab === "signup"
                ? "bg-white shadow text-teal-700"
                : "text-gray-500"
            }`}
          >
            新規登録
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "signup" && (
            <input
              type="text"
              placeholder="ニックネーム"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-teal-400 outline-none"
              required
            />
          )}
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-teal-400 outline-none"
            required
          />
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm focus:border-teal-400 outline-none"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-teal-600 text-white py-3 rounded-xl font-bold hover:bg-teal-700 transition disabled:opacity-50"
          >
            {loading ? "処理中..." : tab === "login" ? "ログイン" : "登録する"}
          </button>
        </form>
      </div>
    </div>
  );
}
