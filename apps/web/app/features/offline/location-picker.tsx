import { useEffect, useRef, useState } from "react";
import type { LeafletMouseEvent, Map as LeafletMap, Marker } from "leaflet";

import { useT } from "~/i18n";

/**
 * Pemilih lokasi manual di peta.
 *
 * Dipakai ketika GPS tidak bisa memberi titik: izin diblokir, perangkat tidak
 * punya penerima, atau akurasinya terlalu kasar. Titik yang dipilih di sini
 * ditandai `manual` di database dan selalu masuk tinjauan admin — peta tidak
 * membuktikan pelapor berada di lokasi.
 *
 * Leaflet dimuat dinamis di dalam efek karena pustaka ini menyentuh `window`
 * saat diimpor, sedangkan halaman ini dirender di server juga.
 */
export function LocationPicker({
  initial,
  onConfirm,
  onCancel,
}: {
  initial?: { lat: number; lng: number } | null;
  onConfirm: (point: { lat: number; lng: number }) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState(initial ?? { lat: -2.5489, lng: 118.0149 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let map: LeafletMap | null = null;
    let marker: Marker | null = null;
    let cancelled = false;
    let cleanupObserver: (() => void) | null = null;

    void (async () => {
      const L = await import("leaflet");
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !containerRef.current) return;

      const container = containerRef.current;

      // Leaflet mengukur ukuran container saat dibuat. Di dalam modal yang baru
      // dipasang, layout belum selesai sehingga tingginya masih 0 dan peta
      // tidak pernah muncul. Menunggu satu frame memastikan container sudah
      // punya ukuran.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (cancelled) return;

      map = L.map(container, {
        center: [point.lat, point.lng],
        zoom: initial ? 13 : 5,
        attributionControl: true,
      });

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);

      marker = L.marker([point.lat, point.lng], { draggable: true }).addTo(map);

      marker.on("dragend", () => {
        const next = marker?.getLatLng();
        if (next) setPoint({ lat: next.lat, lng: next.lng });
      });

      map.on("click", (event: LeafletMouseEvent) => {
        marker?.setLatLng(event.latlng);
        setPoint({ lat: event.latlng.lat, lng: event.latlng.lng });
      });

      // Jaring pengaman kedua: kalau container berubah ukuran (mis. orientasi
      // perangkat berubah atau modal selesai beranimasi), beri tahu Leaflet.
      const observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(container);

      setReady(true);

      cleanupObserver = () => observer.disconnect();
    })();

    return () => {
      cancelled = true;
      cleanupObserver?.();
      map?.remove();
    };
    // Peta dibuat sekali; perubahan titik ditangani lewat marker, bukan re-init.
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="picker-title"
      className="fixed inset-0 z-60 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
    >
      <div className="w-full max-w-lg rounded-t-xl border border-line bg-surface p-4 shadow-2xl sm:rounded-xl">
        <h2 id="picker-title" className="text-[16px] font-bold">
          {t("gps.manualTitle")}
        </h2>
        <p className="mt-1 text-[12px] leading-relaxed text-muted">{t("gps.manualIntro")}</p>

        <div
          ref={containerRef}
          className="mt-3 h-64 w-full overflow-hidden rounded-lg border border-line bg-surface-2"
          aria-label={t("gps.manualTitle")}
        />

        <p className="mt-2 font-mono text-[12px] text-muted">
          {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
          {ready ? "" : " · memuat peta…"}
        </p>

        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(point)}
            className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white"
          >
            {t("gps.manualConfirm")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-line px-4 py-2 text-[13px] font-semibold"
          >
            {t("gps.manualCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
