# apify-analytics-mcp-server

MCP server for Analytics Model: run any Apify Actor and read its dataset as a table.

## Credential
Only one: an Apify API token (Apify Console -> Settings -> API & Integrations).
Pass it as the `APIFY_TOKEN` environment variable (per tenant).

## Build & run
```bash
npm install
npm run build
APIFY_TOKEN=apify_api_xxx npm start
```

## Tools
| Tool | Purpose |
|---|---|
| search_actors | Find Actors in the Apify Store |
| get_actor_input_schema | See which input fields an Actor needs |
| run_actor | Start a run (returns run_id immediately) |
| get_run_status | Poll until SUCCEEDED, returns dataset_id |
| get_dataset_items | Read result rows (paginated) |
| list_tables | Recent datasets as "tables" for the platform |

## First test (LinkedIn example)
1. `get_actor_input_schema` with `harvestapi/linkedin-profile-scraper`
2. `run_actor` with input built from that schema
3. `get_run_status` until SUCCEEDED
4. `get_dataset_items` with the returned dataset_id

## TODO before wiring into the platform
- Match the `list_tables` response envelope used by the other connector servers.
- Add Apify's attribution header (x-apify-integration-platform) per the integration skill.
- Decide transport (stdio here) to match your other servers.
