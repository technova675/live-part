import assert from "node:assert/strict";
import test from "node:test";
import { isWholeDollarInput, matchesPricingAmount, MAX_PRICE_STEP, PRICE_BANDS, priceStepBounds, priceStepLabel } from "../lib/pricing-filter.ts";

const empty = { retweet_rate: null, comment_rate: null, quote_rate: null, bundle_rate_min: null, bundle_rate_max: null };

test("whole-dollar input accepts integers and clearing, rejects decimals and alternate number syntax", () => {
  for (const value of ["", "0", "10", "2500", "00010"]) assert.equal(isWholeDollarInput(value), true);
  for (const value of ["10.5", "10.0", "1e2", "-10", "+10", "$10", "1,000", "ten", " 10", "10\n", "9007199254740992"]) {
    assert.equal(isWholeDollarInput(value), false, value);
  }
});

test("exact dollar search matches a numeric rate rather than a substring or rounded value", () => {
  assert.equal(matchesPricingAmount({ ...empty, retweet_rate: 10 }, 10), true);
  assert.equal(matchesPricingAmount({ ...empty, comment_rate: 100 }, 10), false);
  assert.equal(matchesPricingAmount({ ...empty, quote_rate: 10.5 }, 10), false);
  assert.equal(matchesPricingAmount({ ...empty, comment_rate: 0 }, 0), true);
  assert.equal(matchesPricingAmount(empty, 0), false);
  assert.equal(matchesPricingAmount(undefined, 10), false);
});

test("requested price brackets include their boundaries and exclude neighboring whole dollars", () => {
  for (const value of [10, 50]) assert.equal(matchesPricingAmount({ ...empty, quote_rate: value }, 10, 50), true);
  for (const value of [9, 51]) assert.equal(matchesPricingAmount({ ...empty, quote_rate: value }, 10, 50), false);
  assert.equal(matchesPricingAmount({ ...empty, retweet_rate: 100 }, 101, 200), false);
  assert.equal(matchesPricingAmount({ ...empty, retweet_rate: 101 }, 101, 200), true);
});

test("price slider stops map to inclusive bounds, with an open-ended top stop", () => {
  assert.deepEqual(priceStepBounds(0, MAX_PRICE_STEP), { min: 0, max: Number.MAX_SAFE_INTEGER });
  assert.deepEqual(priceStepBounds(1, 3), { min: 10, max: 50 });
  assert.equal(priceStepLabel(MAX_PRICE_STEP), "$3,000+");
  assert.equal(PRICE_BANDS.length, MAX_PRICE_STEP);
  assert.deepEqual(PRICE_BANDS[0], { min: 0, max: 9 });
  assert.equal(PRICE_BANDS.at(-1).max, Number.MAX_SAFE_INTEGER);
});

test("bundle ranges match only overlapping budgets, including open-ended ranges", () => {
  const bundle = { ...empty, bundle_rate_min: 400, bundle_rate_max: 500 };
  assert.equal(matchesPricingAmount(bundle, 450), true);
  assert.equal(matchesPricingAmount(bundle, 399), false);
  assert.equal(matchesPricingAmount(bundle, 501), false);
  assert.equal(matchesPricingAmount(bundle, 300, 400), true);
  assert.equal(matchesPricingAmount(bundle, 501, 600), false);
  assert.equal(matchesPricingAmount({ ...empty, bundle_rate_min: 100 }, 99), false);
  assert.equal(matchesPricingAmount({ ...empty, bundle_rate_min: 100 }, 500), true);
  assert.equal(matchesPricingAmount({ ...empty, bundle_rate_max: 100 }, 50), true);
});
