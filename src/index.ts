#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ApifyClient } from "apify-client";
import { z } from "zod";

const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error("APIFY_TOKEN is required");
  process.exit(1);
}

// One client per server process = one Apify account (the tenant's own token).
// TODO: add Apify's attribution header (x-apify-integration-platform) once the
// exact way to set it in apify-client is confirmed from the integration skill.
const client = new ApifyClient({ token });

const server = new McpServer({ name: "apify-analytics-mcp-server", version: "0.1.0" });

// ---------- helpers ----------
const ok = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const fail = (e: unknown) => ({
  isError: true,
  content: [{ type: "text" as const, text: `Apify error: ${e instanceof Error ? e.message : String(e)}` }],
});

// ---------- tools ----------

server.registerTool(
  "search_actors",
  {
    description: "Search the Apify Store for Actors (ready-made scrapers/automations) by keyword.",
    inputSchema: {
      query: z.string().describe("e.g. 'linkedin profile', 'google maps'"),
      limit: z.number().int().min(1).max(20).default(10),
    },
  },
  async ({ query, limit }) => {
    try {
      const res = await client.store().list({ search: query, limit });
      return ok(
        res.items.map((a) => ({
          id: `${a.username}/${a.name}`,
          title: a.title,
          description: a.description,
        })),
      );
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "get_actor_input_schema",
  {
    description:
      "Get the input fields an Actor expects. Call this before run_actor so the input is built correctly.",
    inputSchema: { actor_id: z.string().describe("e.g. 'harvestapi/linkedin-profile-scraper'") },
  },
  async ({ actor_id }) => {
    try {
      const build = await client.actor(actor_id).defaultBuild();
      const details = await build.get();
      return ok({ actor_id, inputSchema: details?.actorDefinition?.input ?? null });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "run_actor",
  {
    description:
      "Start an Actor run with the given input. Returns immediately with a run_id; poll get_run_status until it succeeds.",
    inputSchema: {
      actor_id: z.string(),
      input: z.record(z.string(), z.unknown()).describe("Actor input object (see get_actor_input_schema)"),
    },
  },
  async ({ actor_id, input }) => {
    try {
      const run = await client.actor(actor_id).start(input);
      return ok({ run_id: run.id, status: run.status, dataset_id: run.defaultDatasetId });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "get_run_status",
  {
    description: "Check an Actor run. When status is SUCCEEDED, read the results with get_dataset_items.",
    inputSchema: { run_id: z.string() },
  },
  async ({ run_id }) => {
    try {
      const run = await client.run(run_id).get();
      if (!run) return fail(new Error("Run not found"));
      return ok({
        run_id: run.id,
        status: run.status,
        dataset_id: run.defaultDatasetId,
        started_at: run.startedAt,
        finished_at: run.finishedAt,
      });
    } catch (e) {
      return fail(e);
    }
  },
);

server.registerTool(
  "get_dataset_items",
  {
    description: "Read rows from a dataset (the results of an Actor run), with pagination.",
    inputSchema: {
      dataset_id: z.string(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(1000).default(100),
    },
  },
  async ({ dataset_id, offset, limit }) => {
    try {
      const page = await client.dataset(dataset_id).listItems({ offset, limit });
      return ok({ total: page.total, offset: page.offset, count: page.count, items: page.items });
    } catch (e) {
      return fail(e);
    }
  },
);

// Platform contract: datasets exposed as "tables".
// NOTE: match the exact envelope used by the other connector servers (Clio/Dropbox).
server.registerTool(
  "list_tables",
  {
    description: "List recent Actor-run datasets as tables.",
    inputSchema: { limit: z.number().int().min(1).max(50).default(20) },
  },
  async ({ limit }) => {
    try {
      const res = await client.datasets().list({ limit, desc: true });
      const tables = res.items.map((d) => ({
        name: d.id,
        description: d.name ?? `Dataset ${d.id}`,
        row_count: d.itemCount,
        created_at: d.createdAt,
      }));
      return ok({ tables });
    } catch (e) {
      return fail(e);
    }
  },
);

// ---------- start ----------
const transport = new StdioServerTransport();
await server.connect(transport);
