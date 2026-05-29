"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";

interface Props {
  lat?: number | null;
  lon?: number | null;
  interactive?: boolean;
  onLocationChange?: (lat: number, lon: number, address: string) => void;
  className?: string;
}

export default function MapLeaflet({
  lat,
  lon,
  interactive = false,
  onLocationChange,
  className = "w-full h-56",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !containerRef.current) return;

    let map = mapRef.current;

    import("leaflet").then((LeafletModule) => {
      const Lf = LeafletModule.default;

      // Fix default icon
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Lf.Icon.Default.prototype as any)._getIconUrl;
      Lf.Icon.Default.mergeOptions({
        iconUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl:
          "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const center: [number, number] =
        lat && lon ? [lat, lon] : [38.4149, 141.3028];
      const zoom = lat && lon ? 15 : 13;

      if (!map && containerRef.current) {
        map = Lf.map(containerRef.current).setView(center, zoom);
        mapRef.current = map;
        Lf.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          { attribution: "© OpenStreetMap contributors" }
        ).addTo(map);

        if (interactive) {
          map.on("click", async (e: L.LeafletMouseEvent) => {
            const clickLat = e.latlng.lat;
            const clickLon = e.latlng.lng;

            if (markerRef.current) {
              markerRef.current.setLatLng([clickLat, clickLon]);
            } else {
              markerRef.current = Lf.marker([clickLat, clickLon]).addTo(map!);
            }

            let address = `${clickLat.toFixed(5)}, ${clickLon.toFixed(5)}`;
            try {
              const res = await fetch(
                `/api/reverse-geocode?lat=${clickLat}&lon=${clickLon}`
              );
              const data = await res.json();
              if (data.address) address = data.address;
            } catch {}

            onLocationChange?.(clickLat, clickLon, address);
          });
        }
      } else if (map) {
        map.setView(center, zoom);
        setTimeout(() => map!.invalidateSize(), 100);
      }

      if (map && lat && lon) {
        if (markerRef.current) {
          markerRef.current.setLatLng([lat, lon]);
        } else {
          markerRef.current = Lf.marker([lat, lon]).addTo(map);
        }
      } else if (map && (!lat || !lon) && markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
    });

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position when lat/lon change without remounting
  useEffect(() => {
    if (!mapRef.current) return;
    import("leaflet").then((LeafletModule) => {
      const Lf = LeafletModule.default;
      const map = mapRef.current!;
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

  return <div ref={containerRef} className={className} />;
}
