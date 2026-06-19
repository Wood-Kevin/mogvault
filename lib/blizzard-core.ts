// Core Blizzard API client — no server-only guard.
// Import this directly from scripts. Route handlers should import lib/blizzard.ts
// instead (which adds the server-only guard on top of this).

import { type Region, regionHost, regionLocale, namespace as buildNamespace } from "./regions";

const CLIENT_ID = process.env.BLIZZARD_CLIENT_ID;
const CLIENT_SECRET = process.env.BLIZZARD_CLIENT_SECRET;

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
    signal: AbortSignal.timeout(10_000),
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
  region?: Region;
}

export async function getGameData(
  path: string,
  { namespace = "static", searchParams, region = "us" }: GameDataOptions = {}
): Promise<Response> {
  const token = await getAccessToken();
  return doRequest(path, token, namespace, region, searchParams);
}

async function doRequest(
  path: string,
  token: string,
  nsKind: BlizzardNamespace,
  region: Region,
  searchParams?: Record<string, string>,
  retried = false,
): Promise<Response> {
  const url = new URL(`${regionHost(region)}${path}`);
  url.searchParams.set("locale", regionLocale(region));
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Battlenet-Namespace": buildNamespace(nsKind, region),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (res.status === 401 && !retried) {
    tokenCache = null;
    const freshToken = await getAccessToken();
    return doRequest(path, freshToken, nsKind, region, searchParams, true);
  }

  return res;
}
