import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

async function getAddressFromCoords(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja&addressdetails=1`,
      { headers: { "User-Agent": "ishimaki-ikimono-zukan/1.0" } }
    );
    const data = await res.json();
    if (!data.address) return data.display_name || null;
    const addr = data.address;
    const prefecture = addr.province || addr.state || "";
    const city =
      addr.city || addr.town || addr.village || addr.city_district || "";
    const areaParts: string[] = [
      addr.suburb,
      addr.quarter,
      addr.neighbourhood,
      addr.hamlet,
    ].filter(Boolean);
    const seen = new Set<string>();
    let area = "";
    for (const part of areaParts) {
      if (part && !seen.has(part) && part !== city) {
        area += part;
        seen.add(part);
      }
    }
    return `${prefecture}${city}${area}` || data.display_name || null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const displayName =
    (user.user_metadata?.display_name as string) || user.email || "Unknown";

  const formData = await request.formData();
  const speciesName = (formData.get("species_name") as string) || null;
  const isIdentified = formData.get("is_identified") === "true";
  const observedOn = formData.get("observed_on") as string;
  const category = formData.get("category") as string;
  const notes = (formData.get("notes") as string) || null;
  const locationName = (formData.get("location_name") as string) || null;
  const manualLatStr = formData.get("manual_lat") as string | null;
  const manualLonStr = formData.get("manual_lon") as string | null;
  const manualLat =
    manualLatStr && manualLatStr !== "" ? parseFloat(manualLatStr) : null;
  const manualLon =
    manualLonStr && manualLonStr !== "" ? parseFloat(manualLonStr) : null;
  const files = formData.getAll("files") as File[];

  const validFiles = files.filter((f) => f.size > 0);
  if (!validFiles.length)
    return NextResponse.json(
      { error: "画像を選択してください" },
      { status: 400 }
    );
  if (validFiles.length > 5)
    return NextResponse.json(
      { error: "写真は最大5枚までです" },
      { status: 400 }
    );

  let lat: number | null = null;
  let lon: number | null = null;
  let finalAddress: string | null = null;
  const processedImages: Buffer[] = [];

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const optimized = await sharp(buffer)
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    processedImages.push(optimized);
  }

  if (manualLat !== null && manualLon !== null) {
    lat = manualLat;
    lon = manualLon;
    finalAddress = locationName || (await getAddressFromCoords(lat, lon));
  } else if (locationName?.trim()) {
    finalAddress = locationName.trim();
  } else {
    return NextResponse.json(
      { status: "need_location", message: "場所情報を入力してください。" },
      { status: 400 }
    );
  }

  const imageUrls: string[] = [];
  for (let i = 0; i < processedImages.length; i++) {
    const ts = Date.now();
    const filePath = `observations/${ts}_${i}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(filePath, processedImages[i], { contentType: "image/jpeg" });
    if (uploadError)
      return NextResponse.json(
        { error: uploadError.message },
        { status: 500 }
      );
    const { data: urlData } = supabase.storage
      .from("photos")
      .getPublicUrl(filePath);
    imageUrls.push(urlData.publicUrl);
  }

  const { error: insertError } = await supabase.from("observations").insert({
    user_id: user.id,
    created_by: displayName,
    species_name: speciesName,
    is_identified: isIdentified,
    observed_on: observedOn,
    location_name: finalAddress,
    category,
    notes,
    image_urls: imageUrls,
    latitude: lat,
    longitude: lon,
  });

  if (insertError)
    return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ status: "success" });
}
