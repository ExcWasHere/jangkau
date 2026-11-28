import type { Route } from "./+types/home";

import { fetchFeed } from "~/features/feed/api";
import { FeedRacks } from "~/features/feed/feed-racks";
import { AppShell } from "~/shared/layout/app-shell";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Jangkau — berita bencana yang bisa langsung dibantu" },
    {
      name: "description",
      content:
        "Warga melaporkan bencana di lokasinya, komunitas mendukung, penyalur terverifikasi menangani, dan setiap rupiah bisa dilacak.",
    },
  ];
}

export async function loader() {
  return { feed: await fetchFeed({ limit: 24 }) };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { feed } = loaderData;

  return (
    <AppShell>
      <div className="flex flex-col gap-8">
        <section className="flex flex-col gap-2">
          <h1 className="text-[32px] font-extrabold leading-tight">
            Bantuan yang sampai ke lokasi yang tepat.
          </h1>
          <p className="max-w-[640px] text-[15px] leading-relaxed text-muted">
            Warga melaporkan bencana di sekitarnya. Laporan yang sama digabung menjadi satu berita,
            lalu didukung bersama. Begitu ada penanggung jawab terverifikasi, kebutuhan posko dan
            penggunaan dana terbuka untuk publik.
          </p>
        </section>

        <FeedRacks items={feed.items} />
      </div>
    </AppShell>
  );
}
