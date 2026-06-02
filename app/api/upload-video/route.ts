import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 10;

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error_description || "アクセストークン取得失敗");
  return data.access_token;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const chunk = formData.get("chunk") as File;
    const totalSize = parseInt(formData.get("totalSize") as string, 10);
    const chunkStart = parseInt(formData.get("chunkStart") as string, 10);
    const youtubeUploadUrl = (formData.get("youtubeUploadUrl") as string) || "";
    const title = (formData.get("title") as string) || "生き物の観察動画";

    if (!chunk || chunk.size === 0) {
      return NextResponse.json({ error: "チャンクデータがありません" }, { status: 400 });
    }

    const chunkBuffer = await chunk.arrayBuffer();
    const chunkEnd = chunkStart + chunkBuffer.byteLength - 1;

    // 最初のチャンク: YouTubeアップロードセッションを開始
    let uploadUrl = youtubeUploadUrl;
    if (!uploadUrl) {
      const accessToken = await getAccessToken();
      const initRes = await fetch(
        "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/*",
            "X-Upload-Content-Length": totalSize.toString(),
          },
          body: JSON.stringify({
            snippet: { title, description: "石巻の生き物図鑑 観察記録" },
            status: { privacyStatus: "unlisted" },
          }),
        }
      );
      if (!initRes.ok) {
        const err = await initRes.text();
        return NextResponse.json({ error: `YouTube APIエラー: ${err}` }, { status: 500 });
      }
      uploadUrl = initRes.headers.get("Location") || "";
      if (!uploadUrl) {
        return NextResponse.json({ error: "アップロードURLが取得できませんでした" }, { status: 500 });
      }
    }

    // チャンクをYouTubeへ転送
    const chunkRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "video/*",
        "Content-Range": `bytes ${chunkStart}-${chunkEnd}/${totalSize}`,
      },
      body: chunkBuffer,
    });

    // 308: 途中のチャンク受信済み、続きを送信
    if (chunkRes.status === 308) {
      return NextResponse.json({ youtubeUploadUrl: uploadUrl, done: false });
    }

    // 200/201: アップロード完了
    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const videoData = await chunkRes.json();
      return NextResponse.json({
        done: true,
        youtubeUrl: `https://youtu.be/${videoData.id}`,
      });
    }

    const err = await chunkRes.text();
    return NextResponse.json(
      { error: `YouTube チャンクエラー (${chunkRes.status}): ${err}` },
      { status: 500 }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "不明なエラー";
    console.error("[upload-video] エラー:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
