"use client";

import { MAX_PRICE_STEP, PRICE_STEPS, priceStepLabel } from "@/lib/pricing-filter";

const percent = (step: number) => (step / MAX_PRICE_STEP) * 100;

// Histogram + two-thumb slider over PRICE_STEPS, with Min/Max selects below.
// `counts` holds the number of priced creators in each band between stops.
export function PriceRangeFilter({ low, high, counts, onChange }: {
  low: number;
  high: number;
  counts: number[];
  onChange: (low: number, high: number) => void;
}) {
  const peak = Math.max(1, ...counts);
  const selectClass = "h-10 min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent";

  return (
    <div className="w-full">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Price</p>
      {/* The inner area is inset by half a thumb so stops line up with thumb centers. */}
      <div className="relative px-[9px]">
        <div className="flex h-10 items-end" aria-hidden="true">
          {counts.map((count, band) => (
            <div
              key={band}
              title={`${priceStepLabel(band)}${band === MAX_PRICE_STEP - 1 ? "+" : ` – $${(PRICE_STEPS[band + 1] - 1).toLocaleString("en-US")}`}: ${count.toLocaleString()} creators`}
              className={`flex-1 ${band >= low && band < high ? "bg-foreground/20" : "bg-foreground/[0.07]"}`}
              // Square-root scale keeps small bands visible next to the busiest one.
              style={{ height: count ? `${Math.max(8, Math.sqrt(count / peak) * 100)}%` : "0" }}
            />
          ))}
        </div>
        <div className="relative h-1.5 rounded-full bg-border">
          <div className="absolute inset-y-0 rounded-full bg-accent" style={{ left: `${percent(low)}%`, right: `${100 - percent(high)}%` }} />
        </div>
        <div className="relative mt-2 h-1" aria-hidden="true">
          {PRICE_STEPS.map((_, step) => (
            <span key={step} className="absolute size-1 -translate-x-1/2 rounded-full bg-muted/60" style={{ left: `${percent(step)}%` }} />
          ))}
        </div>
        {/* Two overlaid range inputs; only their thumbs take pointer input. */}
        <input
          type="range"
          min={0}
          max={MAX_PRICE_STEP}
          step={1}
          value={low}
          aria-label="Minimum price"
          aria-valuetext={low === 0 ? "No minimum" : priceStepLabel(low)}
          onChange={(event) => onChange(Math.min(Number(event.target.value), high - 1), high)}
          className={`range-thumb absolute inset-x-0 bottom-[6px] h-[18px] w-full ${low > MAX_PRICE_STEP / 2 ? "z-20" : "z-10"}`}
        />
        <input
          type="range"
          min={0}
          max={MAX_PRICE_STEP}
          step={1}
          value={high}
          aria-label="Maximum price"
          aria-valuetext={high === MAX_PRICE_STEP ? "No maximum" : priceStepLabel(high)}
          onChange={(event) => onChange(low, Math.max(Number(event.target.value), low + 1))}
          className="range-thumb absolute inset-x-0 bottom-[6px] z-10 h-[18px] w-full"
        />
      </div>
      <div className="mt-3 flex items-center gap-3 text-sm">
        <select aria-label="Minimum price" value={low} onChange={(event) => onChange(Number(event.target.value), high)} className={selectClass}>
          {PRICE_STEPS.slice(0, -1).map((_, step) => (
            <option key={step} value={step} disabled={step >= high}>{step === 0 ? "Min" : priceStepLabel(step)}</option>
          ))}
        </select>
        <span className="text-muted">to</span>
        <select aria-label="Maximum price" value={high} onChange={(event) => onChange(low, Number(event.target.value))} className={selectClass}>
          {PRICE_STEPS.map((_, step) => step > 0 && (
            <option key={step} value={step} disabled={step <= low}>{priceStepLabel(step)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
