import { useEffect, useRef } from "react";

import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type * as LeafletNamespace from "leaflet";

type LeafletModule = typeof LeafletNamespace;

export type MapPost = {
  id: string;
  name: string;
  regency: string | null;
  lat: number;
  lng: number;
  radius_m: number;
  headcount: number;
  openReportCount?: number;
};

type Props = {
  posts: MapPost[];
  /** Pos yang disorot; peta langsung fokus ke sini. */
  focusId?: string;
  height?: number;
  zoom?: number;
};

/**
 * Peta pos pengungsian.
 *
 * Leaflet menyentuh `window` saat modul dievaluasi, jadi pustaka ini
 * diimpor di dalam effect — bukan di top-level — agar SSR di Cloudflare
 * Workers tidak gagal. CSS-nya aman diimpor statis.
 *
 * Tile memakai OpenStreetMap. Itu satu-satunya request eksternal di
 * halaman ini, dan hanya terjadi saat peta benar-benar dirender.
 */
export function MapView({ posts, focusId, height = 340, zoom = 12 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const node = containerRef.current;
      if (!node || mapRef.current) return;

      // Platform-specific module: tidak ada di server, jadi impor dinamis.
      const leaflet = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;

      const focus = posts.find((post) => post.id === focusId) ?? posts[0];
      const center: [number, number] = focus
        ? [focus.lat, focus.lng]
        : [-7.9666, 112.6333];

      const map = leaflet.map(node, {
        center,
        zoom: focus ? zoom : 11,
        scrollWheelZoom: false,
        attributionControl: true,
      });

      leaflet
        .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        })
        .addTo(map);

      mapRef.current = map;
      layerRef.current = leaflet.layerGroup().addTo(map);

      draw(leaflet, map);
    }

    function draw(leaflet: LeafletModule, map: LeafletMap) {
      const layer = layerRef.current;
      if (!layer) return;
      layer.clearLayers();

      for (const post of posts) {
        leaflet
          .circle([post.lat, post.lng], {
            radius: post.radius_m,
            color: "#0369a1",
            weight: 1.5,
            fillColor: "#0369a1",
            fillOpacity: 0.08,
          })
          .addTo(layer);

        const marker = leaflet
          .circleMarker([post.lat, post.lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: "#0369a1",
            fillOpacity: 1,
          })
          .addTo(layer);

        marker.bindPopup(
          `<div style="font-family:inherit;font-size:12px;line-height:1.5">
             <strong>${escapeHtml(post.name)}</strong><br/>
             ${post.regency ? `${escapeHtml(post.regency)} · ` : ""}${post.headcount} pengungsi
             ${post.openReportCount !== undefined ? `<br/>${post.openReportCount} laporan terbuka` : ""}
             <br/><a href="/pos/${post.id}" style="color:#0369a1;font-weight:600">Buka pos</a>
           </div>`,
        );
      }

      if (posts.length > 1) {
        const bounds = leaflet.latLngBounds(posts.map((post) => [post.lat, post.lng] as [number, number]));
        map.fitBounds(bounds.pad(0.35), { maxZoom: zoom });
      }

      map.invalidateSize();
    }

    void init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, [focusId, posts, zoom]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="z-0 w-full overflow-hidden rounded-xl border border-line bg-surface"
      role="application"
      aria-label="Peta pos pengungsian"
    />
  );
}

/** Popup diisi HTML string, jadi nilai dari database harus di-escape. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}
