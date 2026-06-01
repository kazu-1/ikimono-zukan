import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const CATEGORIES = [
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
];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

    const prompt = `この画像に写っている生き物を分析してください。

以下のカテゴリから最も適切なものを1つ選んでください:
${CATEGORIES.join(", ")}

回答は以下のJSON形式のみで返してください（他の文章は不要）:
{
  "category": "カテゴリ名",
  "species": "生き物の和名（わかれば。不明な場合はnull）"
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          parts: [
            { inlineData: { mimeType, data: base64 } },
            { text: prompt },
          ],
        },
      ],
    });

    const rawText = response.text?.trim() ?? "";
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      return NextResponse.json({
        suggestion: result.category || "その他",
        species:
          result.species && result.species !== "null" ? result.species : null,
      });
    }

    return NextResponse.json({ suggestion: "その他", species: null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
