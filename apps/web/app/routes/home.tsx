import type { Route } from "./+types/home";

import { MarketingFooter, MarketingHeader } from "~/features/marketing/components/chrome";
import { LandingPage } from "~/features/marketing/landing-page";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Jangkau — bantuan tepat sasaran untuk pos pengungsian" },
    {
      name: "description",
      content:
        "Warga melaporkan kebutuhan pos pengungsian, organisasi terverifikasi menyusun RAB, donor melihat ke mana bantuan pergi.",
    },
  ];
}

export default function Home() {
  return (
    <>
      <MarketingHeader />
      <main>
        <LandingPage />
      </main>
      <MarketingFooter />
    </>
  );
}
