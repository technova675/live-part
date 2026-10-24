/* eslint-disable @next/next/no-img-element -- remote X media is rendered at its original source URL */
import type { PaidPost } from "@/lib/authors";

export function PostMedia({ post, embedded = false }: { post: Pick<PaidPost, "attachments" | "card" | "url">; embedded?: boolean }) {
  if (post.attachments.length) {
    const count = post.attachments.length;
    const layout = count === 1 ? "" : count === 2 ? "grid grid-cols-2 aspect-[1.43]" : "grid grid-cols-2 grid-rows-2 aspect-[1.43]";
    return (
      <div className={`${embedded ? "mt-2 border-t" : "mt-3 rounded-2xl border"} gap-0.5 overflow-hidden border-border bg-border ${layout}`}>
        {post.attachments.map((media, index) => (
          <div key={`${media.imageUrl}-${index}`} className={`min-h-0 min-w-0 bg-black ${count === 3 && index === 0 ? "row-span-2" : ""}`}>
            {media.type !== "photo" && media.videoUrl ? (
              <video
                controls={media.type !== "animated_gif"}
                autoPlay={media.type === "animated_gif"}
                loop={media.type === "animated_gif"}
                muted={media.type === "animated_gif"}
                playsInline
                preload="metadata"
                poster={media.imageUrl}
                width={media.width ?? undefined}
                height={media.height ?? undefined}
                aria-label={media.type === "animated_gif" ? "Animated post attachment" : "Post video"}
                className={`block w-full object-contain ${count === 1 ? "max-h-[640px]" : "h-full"}`}
              >
                <source src={media.videoUrl} type="video/mp4" />
                <a href={post.url}>Watch this video on X</a>
              </video>
            ) : (
              <a href={media.type === "photo" ? media.imageUrl : post.url} target="_blank" rel="noopener noreferrer" className="relative block h-full">
                <img src={media.imageUrl} width={media.width ?? undefined} height={media.height ?? undefined} alt={media.alt} loading="lazy" className={`block w-full ${count === 1 ? "max-h-[640px] object-contain" : "h-full object-cover"}`} />
                {media.type !== "photo" && <span className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-center text-sm font-semibold text-white">Watch on X ↗</span>}
              </a>
            )}
          </div>
        ))}
      </div>
    );
  }
  const card = post.card;
  if (!card) return null;
  return (
    <a href={card.url} target="_blank" rel="noopener noreferrer" className={`${embedded ? "mt-2 border-t" : "mt-3 rounded-2xl border"} block overflow-hidden border-border hover:bg-foreground/5`}>
      {card.imageUrl && <img src={card.imageUrl} alt="" loading="lazy" className="aspect-[1.91] w-full object-cover" />}
      <div className="px-3 py-2.5 text-[15px] leading-5">
        <p className="truncate text-[13px] text-muted">{card.domain}</p>
        <p className="mt-0.5 line-clamp-2 font-medium">{card.title}</p>
        {card.description && <p className="mt-0.5 line-clamp-2 text-muted">{card.description}</p>}
      </div>
    </a>
  );
}


