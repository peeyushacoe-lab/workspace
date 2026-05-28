/**
 * Meilisearch client singleton.
 * Gracefully returns null when MEILISEARCH_URL is not configured so every
 * caller can fall back to Prisma ILIKE without crashing.
 */
import type { MeiliSearch, Index } from "meilisearch";

let _client: MeiliSearch | null = null;
let _initialized = false;

async function getClient(): Promise<MeiliSearch | null> {
  if (_initialized) return _client;
  _initialized = true;

  const url = process.env.MEILISEARCH_URL;
  const key = process.env.MEILISEARCH_API_KEY;
  if (!url) return null;

  try {
    const { MeiliSearch } = await import("meilisearch");
    _client = new MeiliSearch({ host: url, apiKey: key });
    return _client;
  } catch {
    console.warn("[search-engine] meilisearch package not installed — falling back to Prisma");
    return null;
  }
}

export type SearchableResource = "email" | "chat_message" | "file" | "doc" | "note" | "calendar_event";

const INDEX_NAMES: Record<SearchableResource, string> = {
  email:          "emails",
  chat_message:   "chat_messages",
  file:           "files",
  doc:            "docs",
  note:           "notes",
  calendar_event: "calendar_events",
};

// Settings applied once when an index is first created
const INDEX_SETTINGS: Partial<Record<SearchableResource, object>> = {
  email: {
    searchableAttributes: ["subject", "body", "fromEmail", "toEmail"],
    filterableAttributes: ["userId", "threadId", "isRead", "priority"],
    sortableAttributes: ["updatedAt"],
    rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
  },
  chat_message: {
    searchableAttributes: ["content", "senderName", "channelName"],
    filterableAttributes: ["userId", "channelId", "isMember"],
    sortableAttributes: ["createdAt"],
  },
  doc: {
    searchableAttributes: ["title", "content", "ownerName"],
    filterableAttributes: ["ownerId"],
    sortableAttributes: ["updatedAt"],
  },
  file: {
    searchableAttributes: ["name", "mimeType"],
    filterableAttributes: ["ownerId"],
    sortableAttributes: ["createdAt"],
  },
};

async function ensureIndex(client: MeiliSearch, resource: SearchableResource): Promise<Index> {
  const name = INDEX_NAMES[resource];
  try {
    return client.index(name);
  } catch {
    await client.createIndex(name, { primaryKey: "id" });
    const idx = client.index(name);
    const settings = INDEX_SETTINGS[resource];
    if (settings) await idx.updateSettings(settings).catch(() => {});
    return idx;
  }
}

export async function indexDocument(
  resource: SearchableResource,
  id: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const idx = await ensureIndex(client, resource);
    await idx.addDocuments([{ id, ...fields }]);
  } catch (err) {
    console.error("[search-engine] indexDocument error:", (err as Error).message);
  }
}

export async function deindexDocument(resource: SearchableResource, id: string): Promise<void> {
  const client = await getClient();
  if (!client) return;
  try {
    const idx = await ensureIndex(client, resource);
    await idx.deleteDocument(id);
  } catch (err) {
    console.error("[search-engine] deindexDocument error:", (err as Error).message);
  }
}

export type SearchResult = {
  id: string;
  [key: string]: unknown;
};

export async function searchIndex(
  resource: SearchableResource,
  query: string,
  options?: { filter?: string; limit?: number },
): Promise<SearchResult[]> {
  const client = await getClient();
  if (!client) return [];
  try {
    const idx = await ensureIndex(client, resource);
    const results = await idx.search(query, {
      limit: options?.limit ?? 10,
      filter: options?.filter,
      attributesToHighlight: ["*"],
      highlightPreTag: "**",
      highlightPostTag: "**",
    });
    return results.hits as SearchResult[];
  } catch (err) {
    console.error("[search-engine] searchIndex error:", (err as Error).message);
    return [];
  }
}

export async function isSearchAvailable(): Promise<boolean> {
  const client = await getClient();
  if (!client) return false;
  try {
    await client.health();
    return true;
  } catch {
    return false;
  }
}
