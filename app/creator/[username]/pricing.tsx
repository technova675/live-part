import type { CreatorPricing } from "@/lib/creator-pricing";
import { pricingRates } from "@/lib/pricing-display";

export function Pricing({ pricing }: { pricing: CreatorPricing | null }) {
  const rates = pricingRates(pricing);
  if (!rates.length) return null;

  return (
    <section aria-labelledby="creator-pricing-heading" className="border-b border-border px-4 py-4">
      <h2 id="creator-pricing-heading" className="text-[15px] font-bold">Partnership rates</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3">
        {rates.map(({ label, value }) => (
          <div key={label} className={`rounded-xl border border-border px-3 py-3${label.length > 32 ? " col-span-2" : ""}`}>
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="mt-1 break-words text-lg font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
