import postgres from "postgres";
import { randomBytes } from "node:crypto";

const currencies = new Set(["SGD", "USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "CHF", "THB", "IDR", "MYR"]);
const legacySymbols = {
  "$": "USD",
  "S$": "SGD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
  "¥": "JPY",
  "A$": "AUD",
  "C$": "CAD",
};

const defaultState = {
  schemaVersion: 3,
  version: 0,
  name: "Trip",
  currency: "SGD",
  people: [],
  expenses: [],
  createdAt: null,
  updatedAt: null,
};

let client;
let schemaPromise;

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function sql() {
  if (!process.env.DATABASE_URL) {
    throw Object.assign(new Error("Database not configured"), { statusCode: 503 });
  }
  if (!client) {
    client = postgres(process.env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
      onnotice: () => {},
    });
  }
  return client;
}

export function token() {
  return randomBytes(24).toString("base64url");
}

export function normalizeCurrency(value) {
  const raw = String(value || "").trim().toUpperCase();
  return currencies.has(raw) ? raw : legacySymbols[value] || "SGD";
}

export function sanitizeText(value, fallback, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return text || fallback;
}

export function validateTripId(value) {
  const isLegacyPasswordHash = typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
  if (typeof value !== "string" || isLegacyPasswordHash || !/^[a-zA-Z0-9_-]{24,96}$/.test(value)) {
    throw Object.assign(new Error("Missing or invalid trip id"), { statusCode: 400 });
  }
  return value;
}

function sanitizeDate(value, fallback = new Date().toISOString().slice(0, 10)) {
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function sanitizeTimestamp(value, fallback = new Date().toISOString()) {
  const date = new Date(value || fallback);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateString(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function sanitizePeople(people) {
  if (!Array.isArray(people)) return [];
  const seen = new Set();
  return people
    .map((person) => ({
      id: sanitizeText(person?.id, "", 80),
      name: sanitizeText(person?.name, "Someone", 80),
      createdAt: sanitizeTimestamp(person?.createdAt),
      updatedAt: sanitizeTimestamp(person?.updatedAt || person?.createdAt),
    }))
    .filter((person) => {
      if (!person.id || seen.has(person.id)) return false;
      seen.add(person.id);
      return true;
    })
    .slice(0, 40);
}

export function sanitizeExpense(expense, validPeople, tripCurrency) {
  const payerId = sanitizeText(expense?.payerId, "", 80);
  const splitWith = Array.isArray(expense?.splitWith)
    ? [...new Set(expense.splitWith.map((id) => sanitizeText(id, "", 80)).filter((id) => validPeople.has(id)))]
    : [];
  const currency = normalizeCurrency(expense?.currency || tripCurrency);
  const amountMinor = Number.isInteger(expense?.amountMinor)
    ? expense.amountMinor
    : Math.round(Number(expense?.amount || 0) * (currency === "JPY" || currency === "IDR" ? 1 : 100));

  if (!validPeople.has(payerId) || splitWith.length === 0 || !Number.isInteger(amountMinor) || amountMinor <= 0) return null;

  const expenseDate = sanitizeDate(expense?.date);
  const fxRate = Number(expense?.fx?.rate);
  const fx =
    currency === tripCurrency
      ? { from: currency, to: tripCurrency, rate: 1, date: expenseDate, source: "same-currency" }
      : Number.isFinite(fxRate) && fxRate > 0
        ? {
            from: normalizeCurrency(expense.fx.from || currency),
            to: normalizeCurrency(expense.fx.to || tripCurrency),
            rate: Number(fxRate.toFixed(8)),
            date: sanitizeDate(expense.fx.date || expenseDate, expenseDate),
            source: sanitizeText(expense.fx.source, "stored", 80),
          }
        : null;

  return {
    id: sanitizeText(expense?.id, token(), 96),
    description: sanitizeText(expense?.description, "Expense", 120),
    amountMinor,
    currency,
    payerId,
    splitWith,
    date: expenseDate,
    fx,
    createdAt: sanitizeTimestamp(expense?.createdAt),
    updatedAt: sanitizeTimestamp(expense?.updatedAt || expense?.createdAt),
  };
}

export function sanitizeState(input, previous = defaultState) {
  const now = new Date().toISOString();
  const currency = normalizeCurrency(input?.currency || previous.currency);
  const people = sanitizePeople(input?.people);
  const validPeople = new Set(people.map((person) => person.id));
  const expenses = Array.isArray(input?.expenses)
    ? input.expenses.map((expense) => sanitizeExpense(expense, validPeople, currency)).filter(Boolean).slice(0, 2000)
    : [];

  return {
    schemaVersion: 3,
    version: Number.isInteger(previous.version) ? previous.version : 0,
    name: sanitizeText(input?.name || input?.tripName, previous.name || "Trip", 100),
    currency,
    people,
    expenses,
    createdAt: previous.createdAt || sanitizeTimestamp(input?.createdAt, now),
    updatedAt: now,
  };
}

export async function ensureSchema() {
  if (!schemaPromise) {
    schemaPromise = sql().begin(async (tx) => {
      await tx`
        CREATE TABLE IF NOT EXISTS trips (
          id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL DEFAULT 3,
          version INTEGER NOT NULL DEFAULT 1,
          name TEXT NOT NULL,
          currency TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await tx`
        CREATE TABLE IF NOT EXISTS participants (
          id TEXT NOT NULL,
          trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (trip_id, id)
        )
      `;
      await tx`
        CREATE TABLE IF NOT EXISTS expenses (
          id TEXT NOT NULL,
          trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
          description TEXT NOT NULL,
          amount_minor BIGINT NOT NULL,
          currency TEXT NOT NULL,
          payer_id TEXT NOT NULL,
          expense_date DATE NOT NULL,
          fx_from TEXT,
          fx_to TEXT,
          fx_rate NUMERIC(18, 8),
          fx_date DATE,
          fx_source TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (trip_id, id),
          FOREIGN KEY (trip_id, payer_id) REFERENCES participants(trip_id, id)
        )
      `;
      await tx`
        CREATE TABLE IF NOT EXISTS expense_splits (
          trip_id TEXT NOT NULL,
          expense_id TEXT NOT NULL,
          participant_id TEXT NOT NULL,
          position INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (trip_id, expense_id, participant_id),
          FOREIGN KEY (trip_id, expense_id) REFERENCES expenses(trip_id, id) ON DELETE CASCADE,
          FOREIGN KEY (trip_id, participant_id) REFERENCES participants(trip_id, id) ON DELETE CASCADE
        )
      `;
      await tx`
        CREATE TABLE IF NOT EXISTS fx_rates (
          requested_date DATE NOT NULL,
          from_currency TEXT NOT NULL,
          to_currency TEXT NOT NULL,
          rate NUMERIC(18, 8) NOT NULL,
          provider_date DATE NOT NULL,
          source TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (requested_date, from_currency, to_currency)
        )
      `;
      await tx`CREATE INDEX IF NOT EXISTS participants_trip_position_idx ON participants(trip_id, position)`;
      await tx`CREATE INDEX IF NOT EXISTS expenses_trip_date_idx ON expenses(trip_id, expense_date DESC, created_at DESC)`;
      await tx`CREATE INDEX IF NOT EXISTS expense_splits_expense_position_idx ON expense_splits(trip_id, expense_id, position)`;
    });
  }
  return schemaPromise;
}

export async function readState(tripId) {
  await ensureSchema();
  const db = sql();
  const trips = await db`SELECT * FROM trips WHERE id = ${tripId}`;
  if (!trips.length) return null;
  const trip = trips[0];
  const peopleRows = await db`
    SELECT * FROM participants
    WHERE trip_id = ${tripId}
    ORDER BY position ASC, created_at ASC
  `;
  const expenseRows = await db`
    SELECT * FROM expenses
    WHERE trip_id = ${tripId}
    ORDER BY expense_date DESC, created_at DESC
  `;
  const splitRows = expenseRows.length
    ? await db`
        SELECT expense_id, participant_id
        FROM expense_splits
        WHERE trip_id = ${tripId}
          AND expense_id IN ${db(expenseRows.map((expense) => expense.id))}
        ORDER BY position ASC
      `
    : [];
  const splitsByExpense = new Map();
  for (const split of splitRows) {
    const list = splitsByExpense.get(split.expense_id) || [];
    list.push(split.participant_id);
    splitsByExpense.set(split.expense_id, list);
  }

  return {
    schemaVersion: Number(trip.schema_version || 3),
    version: Number(trip.version || 0),
    name: trip.name,
    currency: normalizeCurrency(trip.currency),
    people: peopleRows.map((person) => ({
      id: person.id,
      name: person.name,
      createdAt: toIso(person.created_at),
      updatedAt: toIso(person.updated_at),
    })),
    expenses: expenseRows.map((expense) => ({
      id: expense.id,
      description: expense.description,
      amountMinor: Number(expense.amount_minor),
      currency: normalizeCurrency(expense.currency),
      payerId: expense.payer_id,
      splitWith: splitsByExpense.get(expense.id) || [],
      date: toDateString(expense.expense_date),
      fx:
        expense.fx_rate === null
          ? null
          : {
              from: normalizeCurrency(expense.fx_from || expense.currency),
              to: normalizeCurrency(expense.fx_to || trip.currency),
              rate: Number(expense.fx_rate),
              date: toDateString(expense.fx_date || expense.expense_date),
              source: expense.fx_source || "stored",
            },
      createdAt: toIso(expense.created_at),
      updatedAt: toIso(expense.updated_at),
    })),
    createdAt: toIso(trip.created_at),
    updatedAt: toIso(trip.updated_at),
  };
}

async function replaceTripChildren(tx, tripId, state) {
  await tx`
    DELETE FROM expense_splits
    WHERE trip_id = ${tripId}
  `;
  await tx`DELETE FROM expenses WHERE trip_id = ${tripId}`;
  await tx`DELETE FROM participants WHERE trip_id = ${tripId}`;

  const participantRows = state.people.map((person, index) => ({
    id: person.id,
    trip_id: tripId,
    name: person.name,
    position: index,
    created_at: person.createdAt,
    updated_at: person.updatedAt,
  }));
  if (participantRows.length) {
    await tx`
      INSERT INTO participants ${tx(participantRows, "id", "trip_id", "name", "position", "created_at", "updated_at")}
    `;
  }

  const expenseRows = state.expenses.map((expense) => ({
    id: expense.id,
    trip_id: tripId,
    description: expense.description,
    amount_minor: expense.amountMinor,
    currency: expense.currency,
    payer_id: expense.payerId,
    expense_date: expense.date,
    fx_from: expense.fx?.from || null,
    fx_to: expense.fx?.to || null,
    fx_rate: expense.fx?.rate || null,
    fx_date: expense.fx?.date || null,
    fx_source: expense.fx?.source || null,
    created_at: expense.createdAt,
    updated_at: expense.updatedAt,
  }));
  if (expenseRows.length) {
    await tx`
      INSERT INTO expenses ${tx(
        expenseRows,
        "id",
        "trip_id",
        "description",
        "amount_minor",
        "currency",
        "payer_id",
        "expense_date",
        "fx_from",
        "fx_to",
        "fx_rate",
        "fx_date",
        "fx_source",
        "created_at",
        "updated_at",
      )}
    `;
  }

  const splitRows = state.expenses.flatMap((expense) =>
    expense.splitWith.map((participantId, splitIndex) => ({
      trip_id: tripId,
      expense_id: expense.id,
      participant_id: participantId,
      position: splitIndex,
    })),
  );
  if (splitRows.length) {
    await tx`
      INSERT INTO expense_splits ${tx(splitRows, "trip_id", "expense_id", "participant_id", "position")}
    `;
  }
}

export async function createState(input, explicitTripId = token()) {
  await ensureSchema();
  const tripId = validateTripId(explicitTripId);
  const initialVersion = Number.isInteger(input?.version) && input.version > 0 ? input.version : 1;
  const state = sanitizeState(input, { ...defaultState, version: initialVersion });
  await sql().begin(async (tx) => {
    await tx`
      INSERT INTO trips (id, schema_version, version, name, currency, created_at, updated_at)
      VALUES (${tripId}, ${state.schemaVersion}, ${state.version}, ${state.name}, ${state.currency}, ${state.createdAt}, ${state.updatedAt})
    `;
    await replaceTripChildren(tx, tripId, state);
  });
  return { tripId, state };
}

export async function deleteState(tripId) {
  await ensureSchema();
  await sql()`DELETE FROM trips WHERE id = ${tripId}`;
}

export async function updateState(tripId, expectedVersion, input) {
  await ensureSchema();
  const previous = await readState(tripId);
  if (!previous) return { status: "missing" };
  if (Number(expectedVersion) !== previous.version) return { status: "conflict", state: previous };

  const nextState = sanitizeState(input, previous);
  nextState.version = previous.version + 1;
  await sql().begin(async (tx) => {
    const updated = await tx`
      UPDATE trips
      SET schema_version = ${nextState.schemaVersion},
          version = ${nextState.version},
          name = ${nextState.name},
          currency = ${nextState.currency},
          updated_at = ${nextState.updatedAt}
      WHERE id = ${tripId}
        AND version = ${previous.version}
      RETURNING id
    `;
    if (!updated.length) {
      throw Object.assign(new Error("Trip changed elsewhere. Reload before saving."), { statusCode: 409 });
    }
    await replaceTripChildren(tx, tripId, nextState);
  });
  return { status: "ok", state: nextState };
}

export async function readCachedFxRate(date, from, to) {
  await ensureSchema();
  const rows = await sql()`
    SELECT *
    FROM fx_rates
    WHERE requested_date = ${date}
      AND from_currency = ${from}
      AND to_currency = ${to}
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return {
    from: row.from_currency,
    to: row.to_currency,
    rate: Number(row.rate),
    date: toDateString(row.provider_date),
    requestedDate: toDateString(row.requested_date),
    source: row.source,
  };
}

export async function cacheFxRate(payload) {
  await ensureSchema();
  await sql()`
    INSERT INTO fx_rates (requested_date, from_currency, to_currency, rate, provider_date, source)
    VALUES (${payload.requestedDate}, ${payload.from}, ${payload.to}, ${payload.rate}, ${payload.date}, ${payload.source})
    ON CONFLICT (requested_date, from_currency, to_currency)
    DO UPDATE SET
      rate = EXCLUDED.rate,
      provider_date = EXCLUDED.provider_date,
      source = EXCLUDED.source
  `;
}
