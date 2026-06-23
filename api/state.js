import { list, put } from "@vercel/blob";

const defaultState = {
  currency: "$",
  people: [],
  expenses: [],
};

function sanitizeState(input) {
  return {
    currency: String(input?.currency || "$").slice(0, 4),
    people: Array.isArray(input?.people) ? input.people : [],
    expenses: Array.isArray(input?.expenses) ? input.expenses : [],
  };
}

function getTripId(req) {
  const tripId = req.method === "GET" ? req.query?.tripId : req.body?.tripId;
  if (typeof tripId !== "string" || !/^[a-f0-9]{64}$/.test(tripId)) {
    throw new Error("Missing or invalid trip password");
  }
  return tripId;
}

function keyForTrip(tripId) {
  return `trips/${tripId}.json`;
}

async function readState(tripId) {
  const key = keyForTrip(tripId);
  const result = await list({ prefix: key, limit: 1 });
  const blob = result.blobs.find((item) => item.pathname === key);
  if (!blob) return defaultState;

  const response = await fetch(blob.downloadUrl || blob.url, { cache: "no-store" });
  if (!response.ok) return defaultState;
  return response.json();
}

async function writeState(tripId, state) {
  await put(keyForTrip(tripId), JSON.stringify(sanitizeState(state)), {
    access: "public",
    allowOverwrite: true,
    contentType: "application/json",
  });
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");

  try {
    if (req.method === "GET") {
      res.status(200).json(sanitizeState(await readState(getTripId(req))));
      return;
    }

    if (req.method === "POST") {
      const tripId = getTripId(req);
      const nextState = sanitizeState(req.body);
      await writeState(tripId, nextState);
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("allow", "GET, POST");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
