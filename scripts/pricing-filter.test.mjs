import assert from "node:assert/strict";
import test from "node:test";
import { isWholeDollarInput, matchesPricingAmount, PRICE_RANGES } from "../lib/pricing-filter.ts";

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
  assert.ok(PRICE_RANGES.some((range) => range.min === 201 && range.max === 300));
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
