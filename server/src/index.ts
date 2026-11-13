import compression from "compression";
import cors from "cors";
import dotenv from "dotenv";
import express, { type ErrorRequestHandler } from "express";
import { MongoClient, type ChangeStream, type Document } from "mongodb";
import type { ServerResponse } from "node:http";

dotenv.config();

const port = Number(process.env.PORT ?? 3001);
const mongoUri = process.env.MONGO_URI ?? "mongodb://localhost:27017/";
const databaseName = process.env.MONGO_DB ?? "genz_analytics";
const viteOrigin = process.env.VITE_ORIGIN ?? "http://localhost:8443";
const summaryCollectionName = process.env.MONGO_SUMMARY_COLLECTION ?? "dashboard_summaries";
const sampleCollectionName = process.env.MONGO_SAMPLE_COLLECTION ?? "dashboard_samples";
const pollIntervalMs = 5_000;

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

type SummaryDocument = {
  _id: string;
  data: unknown;
  updated_at?: Date | string;
};

type SummaryUpdate = {
  summary_type: string;
  updated_at: string;
};

const mongoClient = new MongoClient(mongoUri);
const database = mongoClient.db(databaseName);
const summaries = database.collection<SummaryDocument>(summaryCollectionName);
const samples = database.collection(sampleCollectionName);
const app = express();
const streamClients = new Set<ServerResponse>();
const lastUpdated = new Map<string, string>();

let server: ReturnType<typeof app.listen> | undefined;
let changeStream: ChangeStream<Document> | undefined;
let pollTimer: NodeJS.Timeout | undefined;
let streamMode: "starting" | "change-streams" | "polling" = "starting";
let shuttingDown = false;

app.use(cors({ origin: viteOrigin }));
app.use(compression());
app.use(express.json());

function toIso(value: Date | string | undefined): string {
  if (!value) return new Date(0).toISOString();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function sendUpdate(update: SummaryUpdate) {
  lastUpdated.set(update.summary_type, update.updated_at);
  const payload = `event: summary-updated\ndata: ${JSON.stringify(update)}\n\n`;
  for (const response of streamClients) {
    if (!response.destroyed) response.write(payload);
  }
}

async function pollSummaryUpdates(initialize = false) {
  const documents = await summaries
    .find({}, { projection: { _id: 1, updated_at: 1 } })
    .toArray();
  for (const document of documents) {
    const updatedAt = toIso(document.updated_at);
    const previous = lastUpdated.get(document._id);
    if (initialize) {
      lastUpdated.set(document._id, updatedAt);
    } else if (previous !== updatedAt) {
      sendUpdate({ summary_type: document._id, updated_at: updatedAt });
    }
  }
}

async function startPolling() {
  if (pollTimer || shuttingDown) return;
  streamMode = "polling";
  await pollSummaryUpdates(true);
  console.info(`MongoDB summary update mode: polling every ${pollIntervalMs / 1000}s`);
  pollTimer = setInterval(() => {
    void pollSummaryUpdates().catch((error: unknown) => {
      console.error("MongoDB summary polling failed:", error);
    });
  }, pollIntervalMs);
}

async function fallBackToPolling(error: Error) {
  if (streamMode === "polling" || shuttingDown) return;
  console.warn("MongoDB Change Streams unavailable; switching to polling:", error.message);
  streamMode = "starting";
  try {
    await changeStream?.close();
  } catch (closeError) {
    console.error("Failed to close MongoDB Change Stream:", closeError);
  }
  changeStream = undefined;
  try {
    await startPolling();
  } catch (pollError) {
    console.error("Failed to start MongoDB summary polling:", pollError);
  }
}

function startChangeStream() {
  try {
    changeStream = summaries.watch([], { fullDocument: "updateLookup" });
    streamMode = "change-streams";
    console.info("MongoDB summary update mode: Change Streams");
    changeStream.on("change", (change) => {
      if (!("fullDocument" in change)) return;
      const document = change.fullDocument as SummaryDocument | null;
      if (!document?._id) return;
      sendUpdate({
        summary_type: document._id,
        updated_at: toIso(document.updated_at),
      });
    });
    changeStream.on("error", (error: Error) => {
      void fallBackToPolling(error);
    });
  } catch (error) {
    void fallBackToPolling(error instanceof Error ? error : new Error(String(error)));
  }
}

app.get("/api/summary", async (_request, response) => {
  const documents = await summaries
    .find({}, { projection: { _id: 1, data: 1, updated_at: 1 } })
    .toArray();
  const result = Object.fromEntries(
    documents.map((document) => [
      document._id,
      { data: document.data, updated_at: toIso(document.updated_at) },
    ]),
  );
  response.json(result);
});

app.get("/api/summary/:type", async (request, response) => {
  const document = await summaries.findOne(
    { _id: request.params.type },
    { projection: { _id: 1, data: 1, updated_at: 1 } },
  );
  if (!document) {
    response.status(404).json({ error: `Summary '${request.params.type}' was not found.` });
    return;
  }
  response.json({ data: document.data, updated_at: toIso(document.updated_at) });
});

app.get("/api/samples", async (_request, response) => {
  const records = await samples.find({}, { projection: { _id: 0 } }).toArray();
  response.json(records);
});

app.get("/api/stream", (request, response) => {
  response.status(200);
  response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  response.flushHeaders();
  response.write("retry: 3000\n\n");
  streamClients.add(response);

  const heartbeat = setInterval(() => {
    if (!response.destroyed) response.write(": heartbeat\n\n");
  }, 20_000);

  request.on("close", () => {
    clearInterval(heartbeat);
    streamClients.delete(response);
  });
});

app.get("/api/health", async (_request, response) => {
  await database.command({ ping: 1 });
  response.json({ status: "ok", mongodb: "connected", stream_mode: streamMode });
});

app.use((request, response) => {
  response.status(404).json({ error: `Route '${request.path}' was not found.` });
});

const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  console.error("API request failed:", error);
  response.status(500).json({ error: "Internal server error." });
};
app.use(errorHandler);

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`${signal} received; shutting down API server.`);
  if (pollTimer) clearInterval(pollTimer);
  for (const response of streamClients) response.end();
  streamClients.clear();
  try {
    await changeStream?.close();
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((error) => (error ? reject(error) : resolve()));
      });
    }
    await mongoClient.close();
  } catch (error) {
    console.error("Graceful shutdown failed:", error);
    process.exitCode = 1;
  }
}

async function start() {
  await mongoClient.connect();
  await database.command({ ping: 1 });
  startChangeStream();
  server = app.listen(port, () => {
    console.info(`Dashboard API listening on http://localhost:${port}`);
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void start().catch(async (error: unknown) => {
  console.error("Failed to start Dashboard API:", error);
  await mongoClient.close();
  process.exitCode = 1;
});
