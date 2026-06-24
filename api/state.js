import { createState, readState, updateState, validateTripId } from "./db.js";

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
      const { tripId, state } = await createState(req.body);
      res.status(201).json({ tripId, state });
      return;
    }

    if (req.method === "PUT") {
      const tripId = validateTripId(req.body?.tripId);
      const result = await updateState(tripId, req.body?.version, req.body?.state);
      if (result.status === "missing") {
        res.status(404).json({ error: "Trip not found" });
        return;
      }
      if (result.status === "conflict") {
        res.status(409).json({ error: "Trip changed elsewhere. Reload before saving.", state: result.state });
        return;
      }
      res.status(200).json({ tripId, state: result.state });
      return;
    }

    res.setHeader("allow", "GET, POST, PUT");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    sendError(res, error);
  }
}
