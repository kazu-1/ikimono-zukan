"use client";

import { useEffect, useRef } from "react";
import type { Observation } from "@/types";
import { CATEGORY_CONFIG } from "@/types";

interface Props {
  items: Observation[];
}

export default function FullMap({ items }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let map: ReturnType<typeof import("leaflet")["map"]> | null = null;

    import("leaflet").then((L) => {
      const Lf = L.default;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Lf.Icon.Default.prototype as any)._getIconUrl;
      Lf.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      map = Lf.map(containerRef.current!).setView([38.4149, 141.3028], 12);
      Lf.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
      }).addTo(map);

      const bounds: [number, number][] = [];

      items.forEach((item) => {
        if (!item.latitude || !item.longitude) return;
        const pos: [number, number] = [item.latitude, item.longitude];
        bounds.push(pos);

        const config = CATEGORY_CONFIG[item.category] || CATEGORY_CONFIG["その他"];

        const customIcon = Lf.divIcon({
          className: "custom-div-icon",
          html: `<div class="custom-pin" style="background-color:${config.color}"><span class="pin-content">${config.icon}</span></div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 40],
          popupAnchor: [0, -40],
        });

        const marker = Lf.marker(pos, { icon: customIcon }).addTo(map!);

        const firstImage = item.image_urls?.[0] || "";
        const popupContent = `
          <div style="width:340px">
            ${firstImage ? `<img src="${firstImage}" class="popup-img">` : ""}
            <div style="padding:16px">
              <p style="font-weight:bold;font-size:18px;color:#1f2937;margin-bottom:4px">
                ${item.species_name || "名称不明"}
              </p>
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <span style="font-size:10px;padding:2px 8px;border-radius:999px;background:${config.color}22;color:${config.color};border:1px solid ${config.color}44">
                  ${item.category}
                </span>
                ${item.is_identified ? '<span style="font-size:10px;background:#DBEAFE;color:#1D4ED8;padding:2px 8px;border-radius:999px">同定済</span>' : ""}
              </div>
              <p style="font-size:12px;color:#2563EB">📍 ${item.location_name || ""}</p>
            </div>
          </div>
        `;
        marker.bindPopup(popupContent);
      });

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40] });
      }
    });

    return () => {
      map?.remove();
    };
  }, [items]);

  return <div ref={containerRef} style={{ height: "calc(100vh - 64px)" }} />;
}
