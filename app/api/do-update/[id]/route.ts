import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import sharp from "sharp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const editorName =
    (user.user_metadata?.display_name as string) || user.email || "Unknown";

  const formData = await request.formData();
  const speciesName = (formData.get("species_name") as string) || null;
  const isIdentified = formData.get("is_identified") === "true";
  const observedOn = (formData.get("observed_on") as string) || null;
  const category = formData.get("category") as string;
  const locationName = formData.get("location_name") as string;
  const notes = (formData.get("notes") as string) || null;
  const manualLatStr = formData.get("manual_lat") as string | null;
  const manualLonStr = formData.get("manual_lon") as string | null;
  const manualLat =
    manualLatStr && manualLatStr !== "" ? parseFloat(manualLatStr) : null;
  const manualLon =
    manualLonStr && manualLonStr !== "" ? parseFloat(manualLonStr) : null;
  const existingUrlsRaw = (formData.get("existing_urls") as string) || "[]";
  const newFiles = formData.getAll("new_files") as File[];

  let imageUrls: string[] = JSON.parse(existingUrlsRaw);
  const validNewFiles = newFiles.filter((f) => f.size > 0);

  if (imageUrls.length + validNewFiles.length > 5) {
    return NextResponse.json(
      { error: `写真は合計5枚までです（現在${imageUrls.length}枚）` },
      { status: 400 }
    );
  }

  for (let i = 0; i < validNewFiles.length; i++) {
    const file = validNewFiles[i];
    const bytes = await file.arrayBuffer();
    const optimized = await sharp(Buffer.from(bytes))
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const ts = Date.now();
    const filePath = `observations/edit_${id}_${ts}_${i}.jpg`;
    await supabase.storage
      .from("photos")
      .upload(filePath, optimized, { contentType: "image/jpeg" });
    const { data: urlData } = supabase.storage
      .from("photos")
      .getPublicUrl(filePath);
    imageUrls.push(urlData.publicUrl);
  }

  const updateData: Record<string, unknown> = {
    updated_by: editorName,
    updated_at: new Date().toISOString(),
    species_name: speciesName,
    is_identified: isIdentified,
    location_name: locationName,
    category,
    notes,
    image_urls: imageUrls,
  };

  if (observedOn) updateData.observed_on = observedOn;
  if (manualLat !== null && manualLon !== null) {
    updateData.latitude = manualLat;
    updateData.longitude = manualLon;
  }

  const { error } = await supabase
    .from("observations")
    .update(updateData)
    .eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ status: "success" });
}
