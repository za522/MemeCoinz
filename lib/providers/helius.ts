import { getHeliusApiKey } from "./config";
import {
  asBoolean,
  asNumber,
  asString,
  getArray,
  getRecord,
  isRecord,
  safeFetchJson,
} from "./http";
import type { HeliusAssetData, UpstreamResult } from "./types";

function notConfigured<T>(): UpstreamResult<T> {
  return {
    ok: false,
    code: "not_configured",
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    httpStatus: null,
  };
}

function getHeliusUrl(apiKey: string): URL {
  const url = new URL("https://mainnet.helius-rpc.com/");
  url.searchParams.set("api-key", apiKey);
  return url;
}

export async function getHeliusAsset(
  mint: string,
): Promise<UpstreamResult<HeliusAssetData>> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return notConfigured();

  const result = await safeFetchJson<unknown>(getHeliusUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "memetrace",
      method: "getAsset",
      params: { id: mint },
    }),
    timeoutMs: 6_000,
  });
  if (!result.ok) return result;
  if (!isRecord(result.data) || !isRecord(result.data.result)) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }

  const asset = result.data.result;
  const content = getRecord(asset, "content");
  const metadata = content ? getRecord(content, "metadata") : null;
  const ownership = getRecord(asset, "ownership");
  const tokenInfo = getRecord(asset, "token_info");
  const files = content ? getArray(content, "files") : [];
  const firstFile = files.find(isRecord);

  let mintAuthority: string | null = tokenInfo
    ? asString(tokenInfo.mint_authority)
    : null;
  let freezeAuthority: string | null = tokenInfo
    ? asString(tokenInfo.freeze_authority)
    : null;
  for (const authority of getArray(asset, "authorities")) {
    if (!isRecord(authority)) continue;
    const address = asString(authority.address);
    const scopes = Array.isArray(authority.scopes) ? authority.scopes : [];
    if (!mintAuthority && scopes.includes("mint")) mintAuthority = address;
    if (!freezeAuthority && scopes.includes("freeze")) freezeAuthority = address;
  }

  return {
    ...result,
    data: {
      id: asString(asset.id) ?? mint,
      interface: asString(asset.interface),
      name: metadata ? asString(metadata.name) : null,
      symbol: metadata ? asString(metadata.symbol) : null,
      description: metadata ? asString(metadata.description) : null,
      jsonUri: content ? asString(content.json_uri) : null,
      imageUri: firstFile ? asString(firstFile.cdn_uri) ?? asString(firstFile.uri) : null,
      owner: ownership ? asString(ownership.owner) : null,
      frozen: ownership ? asBoolean(ownership.frozen) : null,
      burnt: asBoolean(asset.burnt),
      tokenSupply: tokenInfo
        ? asString(tokenInfo.supply) ??
          (asNumber(tokenInfo.supply) === null ? null : String(tokenInfo.supply))
        : null,
      decimals: tokenInfo ? asNumber(tokenInfo.decimals) : null,
      mintAuthority,
      freezeAuthority,
      lastIndexedSlot: asNumber(asset.last_indexed_slot),
    },
  };
}

export async function checkHeliusHealth(): Promise<
  UpstreamResult<{ health: string }>
> {
  const apiKey = getHeliusApiKey();
  if (!apiKey) return notConfigured();
  const result = await safeFetchJson<unknown>(getHeliusUrl(apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "memetrace", method: "getHealth" }),
    timeoutMs: 5_000,
  });
  if (!result.ok) return result;
  const health = isRecord(result.data) ? asString(result.data.result) : null;
  if (!health) {
    return {
      ok: false,
      code: "invalid_response",
      checkedAt: result.checkedAt,
      latencyMs: result.latencyMs,
      httpStatus: result.httpStatus,
    };
  }
  return { ...result, data: { health } };
}
