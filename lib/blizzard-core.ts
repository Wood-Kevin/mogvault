// Core Blizzard API client — no server-only guard.
// Import this directly from scripts. Route handlers should import lib/blizzard.ts
// instead (which adds the server-only guard on top of this).

const REGION = process.env.BLIZZARD_REGION ?? "us";
const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;

const API_BASE = `https://${REGION}.api.blizzard.com`;
const TOKEN_URL = "https://oauth.battle.net/token";

// ── Token cache ───────────────────────────────────────────────────────────────

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

let tokenCache: TokenCache | null = null;

async function fetchNewToken(): Promise<TokenCache> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      "BLIZZARD_CLIENT_ID and BLIZZARD_CLIENT_SECRET must be set in .env.local"
    );
  }

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64"
  );

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(
      `Blizzard OAuth failed: ${res.status} ${res.statusText}`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };
}

export async function getAccessToken(): Promise<string> {
  if (!tokenCache || Date.now() >= tokenCache.expiresAt) {
    tokenCache = await fetchNewToken();
  }
  return tokenCache.token;
}

// ── Game Data fetch ───────────────────────────────────────────────────────────

export type BlizzardNamespace = "static" | "profile" | "dynamic";

interface GameDataOptions {
  namespace?: BlizzardNamespace;
  searchParams?: Record<string, string>;
}

export async function getGameData(
  path: string,
  { namespace = "static", searchParams }: GameDataOptions = {}
): Promise<Response> {
  const token = await getAccessToken();
  return doRequest(path, token, namespace, searchParams);
}

async function doRequest(
  path: string,
  token: string,
  namespace: BlizzardNamespace,
  searchParams?: Record<string, string>
): Promise<Response> {
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("locale", "en_US");
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Battlenet-Namespace": `${namespace}-${REGION}`,
    },
    cache: "no-store",
  });

  if (res.status === 401) {
    tokenCache = null;
    const freshToken = await getAccessToken();
    return doRequest(path, freshToken, namespace, searchParams);
  }

  return res;
}
