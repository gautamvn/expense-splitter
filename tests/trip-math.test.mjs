import test from "node:test";
import assert from "node:assert/strict";

import { calculateBalances, calculateSettlements } from "../public/trip-math.js";

const people = [
  { id: "g", name: "Gautam" },
  { id: "j", name: "Jaya" },
  { id: "v", name: "Vikram" },
];

test("calculates equal split balances across multiple expenses", () => {
  const balances = calculateBalances({
    people,
    expenses: [
      { payerId: "g", amount: 90, splitWith: ["g", "j", "v"] },
      { payerId: "j", amount: 30, splitWith: ["g", "j"] },
    ],
  });

  assert.deepEqual(balances, {
    g: 45,
    j: -15,
    v: -30,
  });
});

test("ignores expenses with unknown payers and unknown split participants", () => {
  const balances = calculateBalances({
    people,
    expenses: [
      { payerId: "unknown", amount: 100, splitWith: ["g", "j"] },
      { payerId: "g", amount: 60, splitWith: ["g", "missing"] },
      { payerId: "j", amount: 40, splitWith: [] },
    ],
  });

  assert.deepEqual(balances, {
    g: 30,
    j: 0,
    v: 0,
  });
});

test("calculates settlements that clear balances", () => {
  assert.deepEqual(calculateSettlements({ g: 45, j: 0, v: -45 }), [
    { from: "v", to: "g", amount: 45 },
  ]);
});

test("ignores sub-cent balances in settlements", () => {
  assert.deepEqual(calculateSettlements({ g: 0.004, j: -0.004 }), []);
});

test("settles multiple debtors and creditors", () => {
  assert.deepEqual(calculateSettlements({ a: 30, b: 20, c: -10, d: -40 }), [
    { from: "c", to: "a", amount: 10 },
    { from: "d", to: "a", amount: 20 },
    { from: "d", to: "b", amount: 20 },
  ]);
});
