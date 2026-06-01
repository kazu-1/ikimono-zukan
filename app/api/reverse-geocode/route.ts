import { NextResponse } from "next/server";

async function getAddressFromCoords(
  lat: string,
  lon: string
): Promise<string | null> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=ja&addressdetails=1`,
    {
      headers: { "User-Agent": "ishimaki-ikimono-zukan/1.0" },
      next: { revalidate: 0 },
    }
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
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat");
  const lon = searchParams.get("lon");
  if (!lat || !lon) return NextResponse.json({ address: null });

  try {
    const address = await getAddressFromCoords(lat, lon);
    return NextResponse.json({ address });
  } catch {
    return NextResponse.json({ address: null });
  }
}
