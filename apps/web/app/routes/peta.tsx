import { PostsMapPage } from "~/features/posts/posts-map-page";

export function meta() {
  return [
    { title: "Peta pos pengungsian — Jangkau" },
    {
      name: "description",
      content: "Sebaran pos pengungsian beserta radius validasi laporan.",
    },
  ];
}

export default function Route() {
  return <PostsMapPage />;
}
