"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: { preventDefault(): void }, action: "login" | "signup") => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const supabase = createClient();

    try {
      if (action === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { display_name: username } },
        });
        if (error) throw error;
        setSuccess("アカウントを作成しました！さっそくログインしてみよう。");
        setIsSignup(false);
        setUsername("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "エラーが発生しました";
      let friendly = msg;
      if (msg.includes("6 characters")) friendly = "パスワードは6文字以上で入力してください。";
      else if (msg.includes("Invalid login credentials")) friendly = "メールアドレスまたはパスワードが正しくありません。";
      else if (msg.includes("already registered")) friendly = "このメールアドレスは既に登録されています。";
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  const switchToSignup = () => {
    setIsSignup(true);
    setError("");
    setSuccess("");
  };

  const switchToLogin = () => {
    setIsSignup(false);
    setError("");
    setSuccess("");
    setUsername("");
  };

  return (
    <div className="flex items-center justify-center min-h-screen relative">
      {/* body::before の白オーバーレイを上書きする専用背景 */}
      <div
        className="fixed inset-0"
        style={{
          backgroundImage: "url('/photo/hamaguri.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundAttachment: "fixed",
          zIndex: 0,
        }}
      />
      {/* 背景画像の上に薄い暗幕 */}
      <div className="fixed inset-0 bg-black/30" style={{ zIndex: 1 }} />

      <div className="relative bg-white/90 backdrop-blur-md p-8 rounded-2xl shadow-2xl w-full max-w-md" style={{ zIndex: 2 }}>
        <h1 className="text-2xl font-bold text-center text-teal-800 mb-6">
          石巻の生き物図鑑へようこそ
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border-l-4 border-red-500 text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-100 border-l-4 border-green-500 text-green-700 text-sm rounded">
            {success}
          </div>
        )}

        <form
          onSubmit={(e) => handleSubmit(e, isSignup ? "signup" : "login")}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-700">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="6文字以上で入力してください"
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          {isSignup && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                ユーザー名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                placeholder="図鑑に表示される名前"
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>
          )}

          <div className="flex flex-col gap-3 pt-2">
            {!isSignup ? (
              <>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-teal-600 text-white py-2 rounded-lg font-bold hover:bg-teal-700 transition disabled:opacity-50"
                >
                  {loading ? "処理中..." : "ログイン"}
                </button>
                <button
                  type="button"
                  onClick={switchToSignup}
                  className="w-full border-2 border-teal-600 text-teal-600 py-2 rounded-lg font-bold hover:bg-teal-50 transition"
                >
                  新規アカウント作成
                </button>
              </>
            ) : (
              <>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-orange-500 text-white py-2 rounded-lg font-bold hover:bg-orange-600 transition disabled:opacity-50"
                >
                  {loading ? "処理中..." : "この内容で登録する"}
                </button>
                <button
                  type="button"
                  onClick={switchToLogin}
                  className="w-full text-gray-500 text-sm font-medium hover:underline transition py-2"
                >
                  すでにアカウントをお持ちの方（ログイン）
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
