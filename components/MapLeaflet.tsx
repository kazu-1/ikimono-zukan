"use client";

import { useEffect, useRef } from "react";

interface Props {
  lat?: number | null;
  lon?: number | null;
  interactive?: boolean;
  onLocationChange?: (lat: number, lon: number, address: string) => void;
  className?: string;
  height?: number; // explicit pixel height for Leaflet
}

type LeafletContainer = HTMLElement & { _leaflet_id?: number };

export default function MapLeaflet({
  lat,
  lon,
  interactive = false,
  onLocationChange,
  className = "w-full",
  height = 224, // default: 14rem = 224px (same as h-56)
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  onLocationChangeRef.current = onLocationChange;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Strict Mode / double-mount guard: skip if already initialized
    if ((container as LeafletContainer)._leaflet_id) return;

    let cancelled = false;

    import("leaflet").then((mod) => {
      if (cancelled || !container) return;
      if ((container as LeafletContainer)._leaflet_id) return;

      const Lf = mod.default;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Lf.Icon.Default.prototype as any)._getIconUrl;
      Lf.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center: [number, number] =
        lat && lon ? [lat, lon] : [38.4149, 141.3028];
      const zoom = lat && lon ? 15 : 13;

      const map = Lf.map(container).setView(center, zoom);
      mapRef.current = map;

      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      if (lat && lon) {
        markerRef.current = Lf.marker([lat, lon]).addTo(map);
      }

      if (interactive) {
        map.on("click", async (e: { latlng: { lat: number; lng: number } }) => {
          const clickLat = e.latlng.lat;
          const clickLon = e.latlng.lng;

          if (markerRef.current) {
            markerRef.current.setLatLng([clickLat, clickLon]);
          } else {
            markerRef.current = Lf.marker([clickLat, clickLon]).addTo(map);
          }

          let address = `${clickLat.toFixed(5)}, ${clickLon.toFixed(5)}`;
          try {
            const res = await fetch(
              `/api/reverse-geocode?lat=${clickLat}&lon=${clickLon}`
            );
            const data = await res.json();
            if (data.address) address = data.address;
          } catch {}

          onLocationChangeRef.current?.(clickLat, clickLon, address);
        });
      }

      const tryInvalidate = () => {
        if (!cancelled && mapRef.current) {
          mapRef.current.invalidateSize();
        }
      };

      // ダブル rAF でブラウザの描画完了後に確実に呼び出す
      requestAnimationFrame(() => requestAnimationFrame(tryInvalidate));
      // モーダル内でアニメーションや遅延描画がある場合のバックアップ
      setTimeout(tryInvalidate, 500);
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position when lat/lon props change after mount
  useEffect(() => {
    if (!mapRef.current) return;

    import("leaflet").then((mod) => {
      const Lf = mod.default;
      const map = mapRef.current;
      if (!map) return;

      if (lat && lon) {
        map.setView([lat, lon], 15);
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lon]);
        } else {
          markerRef.current = Lf.marker([lat, lon]).addTo(map);
        }
      } else if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    });
  }, [lat, lon]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height: `${height}px` }}
    />
  );
}
