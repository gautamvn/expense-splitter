import test from "node:test";
import assert from "node:assert/strict";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const dbTest = hasDatabase ? test : test.skip;

dbTest("stores and updates trip state in Postgres", async () => {
  const { createState, deleteState, readState, updateState } = await import("../api/db.js");
  const tripId = `test_${crypto.randomUUID().replaceAll("-", "_")}`;
  const initial = {
    name: "DB test",
    currency: "EUR",
    people: [
      { id: "alice", name: "Alice" },
      { id: "bob", name: "bob" },
    ],
    expenses: [
      {
        id: "meal",
        description: "Meal",
        amountMinor: 3100,
        currency: "EUR",
        payerId: "alice",
        splitWith: ["alice", "bob"],
        date: "2026-06-24",
        fx: { from: "EUR", to: "EUR", rate: 1, date: "2026-06-24", source: "same-currency" },
      },
    ],
  };

  try {
    const created = await createState(initial, tripId);
    assert.equal(created.tripId, tripId);
    assert.equal(created.state.version, 1);
    assert.equal(created.state.people[1].name, "bob");

    const stored = await readState(tripId);
    assert.equal(stored.expenses[0].description, "Meal");
    assert.deepEqual(stored.expenses[0].splitWith, ["alice", "bob"]);

    const updated = await updateState(tripId, stored.version, {
      ...stored,
      expenses: [
        ...stored.expenses,
        {
          id: "taxi",
          description: "Taxi",
          amountMinor: 1000,
          currency: "USD",
          payerId: "bob",
          splitWith: ["alice", "bob"],
          date: "2026-06-24",
          fx: { from: "USD", to: "EUR", rate: 0.88, date: "2026-06-23", source: "test" },
        },
      ],
    });
    assert.equal(updated.status, "ok");
    assert.equal(updated.state.version, 2);
    assert.equal(updated.state.expenses.length, 2);

    const conflict = await updateState(tripId, stored.version, updated.state);
    assert.equal(conflict.status, "conflict");
  } finally {
    await deleteState(tripId);
  }
});
