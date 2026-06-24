import { list, put } from "@vercel/blob";
import { randomBytes } from "node:crypto";

const defaultState = {
  schemaVersion: 2,
  version: 0,
  name: "Trip",
  currency: "SGD",
  people: [],
  expenses: [],
  createdAt: null,
  updatedAt: null,
};

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

function normalizeCurrency(value) {
  const raw = String(value || "").trim().toUpperCase();
  return currencies.has(raw) ? raw : legacySymbols[value] || "SGD";
}

function sanitizeText(value, fallback, maxLength) {
  const text = String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  return text || fallback;
}

function token() {
  return randomBytes(24).toString("base64url");
}

function validateTripId(value) {
  const isLegacyPasswordHash = typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
  if (typeof value !== "string" || isLegacyPasswordHash || !/^[a-zA-Z0-9_-]{24,96}$/.test(value)) {
    throw Object.assign(new Error("Missing or invalid trip id"), { statusCode: 400 });
  }
  return value;
}

function keyForTrip(tripId) {
  return `trips/${tripId}.json`;
}

function backupKeyForTrip(tripId) {
  return `backups/trips/${tripId}/${new Date().toISOString().replaceAll(":", "-")}.json`;
}

async function getBlob(pathname) {
  const result = await list({ prefix: pathname, limit: 1 });
  return result.blobs.find((item) => item.pathname === pathname);
}

async function readJson(pathname) {
  const blob = await getBlob(pathname);
  if (!blob) return null;
  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

function sanitizePeople(people) {
  if (!Array.isArray(people)) return [];
  const seen = new Set();
  return people
    .map((person) => ({
      id: sanitizeText(person?.id, "", 80),
      name: sanitizeText(person?.name, "Someone", 80),
    }))
    .filter((person) => {
      if (!person.id || seen.has(person.id)) return false;
      seen.add(person.id);
      return true;
    })
    .slice(0, 40);
}

function sanitizeExpense(expense, validPeople, tripCurrency) {
  const payerId = sanitizeText(expense?.payerId, "", 80);
  const splitWith = Array.isArray(expense?.splitWith)
    ? [...new Set(expense.splitWith.map((id) => sanitizeText(id, "", 80)).filter((id) => validPeople.has(id)))]
    : [];
  const currency = normalizeCurrency(expense?.currency || tripCurrency);
  const amountMinor = Number.isInteger(expense?.amountMinor)
    ? expense.amountMinor
    : Math.round(Number(expense?.amount || 0) * (currency === "JPY" || currency === "IDR" ? 1 : 100));

  if (!validPeople.has(payerId) || splitWith.length === 0 || !Number.isInteger(amountMinor) || amountMinor <= 0) return null;

  const fxRate = Number(expense?.fx?.rate);
  const fx =
    currency === tripCurrency
      ? { from: currency, to: tripCurrency, rate: 1, date: sanitizeText(expense?.date, new Date().toISOString().slice(0, 10), 10), source: "same-currency" }
      : Number.isFinite(fxRate) && fxRate > 0
        ? {
            from: normalizeCurrency(expense.fx.from || currency),
            to: normalizeCurrency(expense.fx.to || tripCurrency),
            rate: Number(fxRate.toFixed(8)),
            date: sanitizeText(expense.fx.date || expense.date, "", 10),
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
    date: sanitizeText(expense?.date, new Date().toISOString().slice(0, 10), 10),
    fx,
    createdAt: sanitizeText(expense?.createdAt, new Date().toISOString(), 40),
    updatedAt: sanitizeText(expense?.updatedAt, expense?.createdAt || new Date().toISOString(), 40),
  };
}

function sanitizeState(input, previous = defaultState) {
  const now = new Date().toISOString();
  const currency = normalizeCurrency(input?.currency || previous.currency);
  const people = sanitizePeople(input?.people);
  const validPeople = new Set(people.map((person) => person.id));
  const expenses = Array.isArray(input?.expenses)
    ? input.expenses.map((expense) => sanitizeExpense(expense, validPeople, currency)).filter(Boolean).slice(0, 2000)
    : [];

  return {
    schemaVersion: 2,
    version: Number.isInteger(previous.version) ? previous.version : 0,
    name: sanitizeText(input?.name || input?.tripName, previous.name || "Trip", 100),
    currency,
    people,
    expenses,
    createdAt: previous.createdAt || input?.createdAt || now,
    updatedAt: now,
  };
}

async function readState(tripId) {
  const raw = await readJson(keyForTrip(tripId));
  if (!raw) return null;
  return sanitizeState(raw, { ...defaultState, version: Number.isInteger(raw.version) ? raw.version : 0, createdAt: raw.createdAt });
}

async function writeState(tripId, state) {
  const key = keyForTrip(tripId);
  const previous = await readJson(key);
  if (previous) {
    await put(backupKeyForTrip(tripId), JSON.stringify(previous), {
      access: "public",
      contentType: "application/json",
    });
  }
  await put(key, JSON.stringify(state), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function sendError(res, error) {
  const status = error.statusCode || 500;
  res.status(status).json({ error: status >= 500 ? "State request failed" : error.message });
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-robots-tag", "noindex");

  try {
    if (req.method === "GET") {
      const tripId = validateTripId(req.query?.tripId);
      const state = await readState(tripId);
      if (!state) {
        res.status(404).json({ error: "Trip not found" });
        return;
      }
      res.status(200).json({ tripId, state });
      return;
    }

    if (req.method === "POST") {
      const tripId = token();
      const state = sanitizeState(req.body, { ...defaultState, version: 1 });
      await writeState(tripId, state);
      res.status(201).json({ tripId, state });
      return;
    }

    if (req.method === "PUT") {
      const tripId = validateTripId(req.body?.tripId);
      const previous = await readState(tripId);
      if (!previous) {
        res.status(404).json({ error: "Trip not found" });
        return;
      }
      if (Number(req.body?.version) !== previous.version) {
        res.status(409).json({ error: "Trip changed elsewhere. Reload before saving.", state: previous });
        return;
      }
      const nextState = sanitizeState(req.body?.state, previous);
      nextState.version = previous.version + 1;
      await writeState(tripId, nextState);
      res.status(200).json({ tripId, state: nextState });
      return;
    }

    res.setHeader("allow", "GET, POST, PUT");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    sendError(res, error);
  }
}
