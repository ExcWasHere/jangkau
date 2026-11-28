/**
 * Kerangka muat dengan bentuk yang sama seperti konten akhir, bukan spinner
 * di tengah layar. Dengan begitu tata letak tidak melompat saat data tiba.
 */

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-lg bg-surface-2 ${className}`}
    />
  );
}

/** Kerangka satu kartu event: foto 16:9, judul dua baris, metadata satu baris. */
export function EventCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <Skeleton className="aspect-video w-full rounded-none" />
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="mt-2 h-3 w-2/5" />
      </div>
    </div>
  );
}

export function EventGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, index) => (
        <EventCardSkeleton key={index} />
      ))}
    </div>
  );
}

export function EventDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="aspect-video w-full" />
      <Skeleton className="h-4 w-full max-w-[720px]" />
      <Skeleton className="h-4 w-2/3 max-w-[720px]" />
    </div>
  );
}
