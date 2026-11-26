import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";

import { MarketingFooter, MarketingHeader } from "~/features/marketing/components/chrome";
import { apiFetch, ApiError } from "~/shared/api/client";
import { Badge, Card, EmptyState } from "~/shared/ui/primitives";
import { MapView, type MapPost } from "~/shared/ui/map-view";

type Post = MapPost & { province: string | null; capacity: number | null; openReportCount: number };

/**
 * Peta publik semua pos pengungsian. Bisa dibuka tanpa akun; tiap marker
 * membawa tautan ke halaman pos.
 */
export function PostsMapPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [focusId, setFocusId] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: Post[] }>("/posts");
      setPosts(data.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Gagal memuat pos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Peta pos pengungsian</h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted">
            Setiap titik adalah pos yang menerima laporan. Lingkaran di sekelilingnya adalah radius
            validasi: laporan dari luar radius ditolak, sehingga kebutuhan yang masuk memang berasal
            dari sekitar pos.
          </p>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-danger">{error}</p>}

        {loading ? (
          <p className="text-[13px] text-muted">Memuat peta…</p>
        ) : posts.length === 0 ? (
          <EmptyState
            title="Belum ada pos"
            body="Peta akan terisi setelah admin membuat pos pengungsian."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <MapView posts={posts} focusId={focusId} height={460} zoom={13} />
          </Card>
        )}

        {posts.length > 0 && (
          <section>
            <h2 className="text-[13px] font-semibold">Daftar pos</h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {posts.map((post) => (
                <li key={post.id}>
                  <Card className="flex h-full flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[14px] font-semibold">{post.name}</h3>
                      <Badge tone={post.openReportCount > 0 ? "warn" : "ok"}>
                        {post.openReportCount} laporan
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted">
                      {[post.regency, post.province].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-2 text-[12px] text-muted tabular-nums">
                      {post.headcount} pengungsi
                      {post.capacity ? ` dari ${post.capacity} kapasitas` : ""} · radius{" "}
                      {post.radius_m} m
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setFocusId(post.id)}
                        className="text-[12px] font-semibold text-brand hover:underline"
                      >
                        Sorot di peta
                      </button>
                      <Link
                        to={`/pos/${post.id}`}
                        className="text-[12px] font-semibold text-muted hover:text-ink"
                      >
                        Buka pos
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      </main>
      <MarketingFooter />
    </>
  );
}
