import { list, put } from "@vercel/blob";

const currencies = new Set(["SGD", "USD", "EUR", "GBP", "INR", "JPY", "AUD", "CAD", "CHF", "THB", "IDR", "MYR"]);

function cleanCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  if (!currencies.has(currency)) throw Object.assign(new Error("Unsupported currency"), { statusCode: 400 });
  return currency;
}

function cleanDate(value) {
  const today = new Date().toISOString().slice(0, 10);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : today;
  return date > today ? today : date;
}

function keyForRate(date, from, to) {
  return `fx/${date}/${from}-${to}.json`;
}

async function getCachedRate(key) {
  const result = await list({ prefix: key, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === key);
  if (!blob) return null;
  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

async function cacheRate(key, payload) {
  await put(key, JSON.stringify(payload), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function fetchFrankfurterRate(date, from, to) {
  const url = new URL(`https://api.frankfurter.dev/v1/${date}`);
  url.searchParams.set("base", from);
  url.searchParams.set("symbols", to);

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("FX provider unavailable");
  const payload = await response.json();
  const rate = Number(payload?.rates?.[to]);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("FX rate unavailable");

  return {
    from,
    to,
    rate: Number(rate.toFixed(8)),
    date: payload.date || date,
    requestedDate: date,
    source: "frankfurter.dev",
  };
}

function sendError(res, error) {
  const status = error.statusCode || 502;
  res.status(status).json({ error: error.message || "FX lookup failed" });
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "public, max-age=3600, stale-while-revalidate=86400");
  res.setHeader("x-robots-tag", "noindex");

  try {
    if (req.method !== "GET") {
      res.setHeader("allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const from = cleanCurrency(req.query?.from);
    const to = cleanCurrency(req.query?.to);
    const date = cleanDate(req.query?.date);

    if (from === to) {
      res.status(200).json({ from, to, rate: 1, date, requestedDate: date, source: "same-currency" });
      return;
    }

    const key = keyForRate(date, from, to);
    const cached = await getCachedRate(key);
    if (cached) {
      res.status(200).json({ ...cached, cached: true });
      return;
    }

    const rate = await fetchFrankfurterRate(date, from, to);
    await cacheRate(key, rate);
    res.status(200).json(rate);
  } catch (error) {
    sendError(res, error);
  }
}
