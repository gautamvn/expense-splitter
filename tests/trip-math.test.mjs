import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateBalances,
  calculateSettlements,
  calculateTotalMinor,
  convertedAmountMinor,
  formatMoney,
  orderPeopleByBalance,
  toMinorUnits,
} from "../public/trip-math.js";

const people = [
  { id: "g", name: "Gautam" },
  { id: "j", name: "Jaya" },
  { id: "v", name: "Vikram" },
];

test("calculates equal split balances across multiple expenses", () => {
  const balances = calculateBalances({
    people,
    currency: "SGD",
    expenses: [
      { payerId: "g", amountMinor: 9000, currency: "SGD", splitWith: ["g", "j", "v"] },
      { payerId: "j", amountMinor: 3000, currency: "SGD", splitWith: ["g", "j"] },
    ],
  });

  assert.deepEqual(balances, {
    g: 4500,
    j: -1500,
    v: -3000,
  });
});

test("ignores expenses with unknown payers and unknown split participants", () => {
  const balances = calculateBalances({
    people,
    currency: "SGD",
    expenses: [
      { payerId: "unknown", amountMinor: 10000, currency: "SGD", splitWith: ["g", "j"] },
      { payerId: "g", amountMinor: 6000, currency: "SGD", splitWith: ["g", "missing"] },
      { payerId: "j", amountMinor: 4000, currency: "SGD", splitWith: [] },
    ],
  });

  assert.deepEqual(balances, {
    g: 3000,
    j: 0,
    v: 0,
  });
});

test("calculates settlements that clear balances", () => {
  assert.deepEqual(calculateSettlements({ g: 4500, j: 0, v: -4500 }), [
    { from: "v", to: "g", amount: 4500 },
  ]);
});

test("ignores sub-cent balances in settlements", () => {
  assert.deepEqual(calculateSettlements({ g: 0.4, j: -0.4 }), []);
});

test("settles multiple debtors and creditors", () => {
  assert.deepEqual(calculateSettlements({ a: 3000, b: 2000, c: -1000, d: -4000 }), [
    { from: "c", to: "a", amount: 1000 },
    { from: "d", to: "a", amount: 2000 },
    { from: "d", to: "b", amount: 2000 },
  ]);
});

test("converts foreign expenses with their stored FX rate", () => {
  const expense = {
    amountMinor: 4800,
    currency: "EUR",
    fx: { from: "EUR", to: "SGD", rate: 1.455, date: "2026-06-20", source: "test" },
  };

  assert.equal(convertedAmountMinor(expense, "SGD"), 6984);
});

test("leaves expenses pending when FX is missing", () => {
  assert.equal(convertedAmountMinor({ amountMinor: 4800, currency: "EUR" }, "SGD"), null);
});

test("changes trip currency without mutating original expense amounts", () => {
  const state = {
    currency: "USD",
    people,
    expenses: [
      {
        payerId: "g",
        amountMinor: 10000,
        currency: "SGD",
        splitWith: ["g", "j"],
        fx: { from: "SGD", to: "USD", rate: 0.74, date: "2026-06-20", source: "test" },
      },
    ],
  };

  assert.equal(calculateTotalMinor(state), 7400);
  assert.equal(state.expenses[0].amountMinor, 10000);
});

test("formats currencies using minor unit rules", () => {
  assert.equal(toMinorUnits(12.345, "SGD"), 1235);
  assert.equal(toMinorUnits(1200.4, "JPY"), 1200);
  assert.equal(formatMoney(-1235, "SGD", { signed: true }), "-S$12.35");
});

test("orders people from owing most to being owed most", () => {
  assert.deepEqual(
    orderPeopleByBalance(people, { g: 4500, j: -1500, v: -3000 }).map((person) => person.id),
    ["v", "j", "g"],
  );
});

test("preserves participant order when balances are effectively tied", () => {
  assert.deepEqual(
    orderPeopleByBalance(people, { g: 0.2, j: 0, v: -0.2 }).map((person) => person.id),
    ["g", "j", "v"],
  );
});
