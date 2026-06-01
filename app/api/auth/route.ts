import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const { email, password, username, action } = await request.json();

  const cookiesToSetLater: Array<{
    name: string;
    value: string;
    options: CookieOptions;
  }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach((c) => cookiesToSetLater.push(c));
        },
      },
    }
  );

  try {
    if (action === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { display_name: username } },
      });
      if (error) throw error;
      return NextResponse.json({ success: true });
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const response = NextResponse.json({ success: true });
      cookiesToSetLater.forEach(({ name, value, options }) =>
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
      );
      return response;
    }
  } catch (e: unknown) {
    const msg =
      e instanceof Error ? e.message : "エラーが発生しました";
    let friendly = msg;
    if (msg.includes("6 characters"))
      friendly = "パスワードは6文字以上で入力してください。";
    else if (msg.includes("Invalid login credentials"))
      friendly = "メールアドレスまたはパスワードが正しくありません。";
    else if (msg.includes("already registered"))
      friendly = "このメールアドレスは既に登録されています。";
    return NextResponse.json({ error: friendly }, { status: 401 });
  }
}
