import type { Route } from "./+types/post-detail";

import { MarketingFooter, MarketingHeader } from "~/features/marketing/components/chrome";
import { PostDetailPage, type PostDetail } from "~/features/posts/post-detail-page";
import { apiFetch } from "~/shared/api/client";

export function meta({ data }: Route.MetaArgs) {
  const name = data?.detail?.post.name;
  return [
    { title: name ? `${name} — Jangkau` : "Pos pengungsian — Jangkau" },
    {
      name: "description",
      content: name
        ? `Kebutuhan, stok, dan kampanye di ${name}.`
        : "Kebutuhan dan stok per pos pengungsian.",
    },
  ];
}

/**
 * Halaman publik: di-SSR supaya tautan pos bisa dibagikan dan langsung
 * terbaca mesin pencari. Tidak butuh token.
 */
export async function loader({ params }: Route.LoaderArgs) {
  try {
    const detail = await apiFetch<PostDetail>(`/posts/${params.postId}`);
    return { detail };
  } catch {
    return { detail: null };
  }
}

export default function PostDetailRoute({ loaderData }: Route.ComponentProps) {
  const { detail } = loaderData;

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        {detail ? (
          <PostDetailPage data={detail} />
        ) : (
          <div className="rounded-xl border border-dashed border-line bg-surface/60 px-6 py-14 text-center">
            <h1 className="text-xl font-bold">Pos tidak ditemukan</h1>
            <p className="mt-2 text-[13px] text-muted">
              Pos ini mungkin sudah ditutup atau tautannya salah.
            </p>
          </div>
        )}
      </main>
      <MarketingFooter />
    </>
  );
}
