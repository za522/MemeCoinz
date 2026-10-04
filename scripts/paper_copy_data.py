"""Read-only Robinhood Chain history, with resumable raw evidence and no credentials.

Wallet roster and trade-reconstruction approach: Fomopulse (MIT). Pool events:
Uniswap v4 IPoolManager. This module never signs or submits a transaction.
"""
from __future__ import annotations

import bisect
import datetime as dt
import hashlib
import json
import math
import sqlite3
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path

RPC_URLS = ("https://rpc.mainnet.chain.robinhood.com", "https://rpc.ordofi.network")
KNOWN_ROSTER_SHA256 = "6410d17c3e1ab27510361a0ae84b4de62436e296f424acbf83461da6243a6e86"
KNOWN_ROSTER_REVISION = "40f2e6cbbb45f7587fd20e03f82e95f354c4791f"
CHAIN_ID = 4663
MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951"
USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168"
WETH = "0x0bd7d308f8e1639fab988df18a8011f41eacad73"
ZERO = "0x" + "0" * 40
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"

# Keccak-256 uses Ethereum's padding, not hashlib.sha3_256's SHA-3 padding.
RC = (0x1, 0x8082, 0x800000000000808A, 0x8000000080008000, 0x808B,
      0x80000001, 0x8000000080008081, 0x8000000000008009, 0x8A, 0x88,
      0x80008009, 0x8000000A, 0x8000808B, 0x800000000000008B,
      0x8000000000008089, 0x8000000000008003, 0x8000000000008002,
      0x8000000000000080, 0x800A, 0x800000008000000A,
      0x8000000080008081, 0x8000000000008080, 0x80000001, 0x8000000080008008)
ROT = ((0, 36, 3, 41, 18), (1, 44, 10, 45, 2), (62, 6, 43, 15, 61),
       (28, 55, 25, 21, 56), (27, 20, 39, 8, 14))
MASK = (1 << 64) - 1


def keccak(data: bytes) -> bytes:
    padded = bytearray(data)
    padded.append(1)
    padded.extend(b"\0" * ((-len(padded)) % 136))
    padded[-1] |= 128
    a = [0] * 25
    for off in range(0, len(padded), 136):
        for j in range(17):
            a[j] ^= int.from_bytes(padded[off + 8*j:off + 8*j + 8], "little")
        for rc in RC:
            c = [a[x] ^ a[x+5] ^ a[x+10] ^ a[x+15] ^ a[x+20] for x in range(5)]
            d = [c[(x-1) % 5] ^ ((c[(x+1) % 5] << 1 | c[(x+1) % 5] >> 63) & MASK)
                 for x in range(5)]
            b = [0] * 25
            for x in range(5):
                for y in range(5):
                    v = a[x+5*y] ^ d[x]
                    r = ROT[x][y]
                    b[y+5*((2*x+3*y) % 5)] = ((v << r) | (v >> ((64-r) % 64))) & MASK
            for x in range(5):
                for y in range(5):
                    a[x+5*y] = b[x+5*y] ^ ((~b[(x+1) % 5+5*y]) & b[(x+2) % 5+5*y])
            a[0] ^= rc
    return b"".join(v.to_bytes(8, "little") for v in a)[:32]


def topic(signature: str) -> str:
    return "0x" + keccak(signature.encode()).hex()


INITIALIZE = topic("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)")
MODIFY = topic("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)")


def stamp(value: str) -> int:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("Dates require an explicit timezone, for example 2026-09-05T00:00:00Z")
    return int(parsed.timestamp())


def iso(value: int) -> str:
    return dt.datetime.fromtimestamp(value, dt.timezone.utc).isoformat()


def address(value: str) -> str:
    return "0x" + value[-40:].lower()


def words(data: str) -> list[int]:
    return [int(data[n:n+64], 16) for n in range(2, len(data), 64)]


def signed(value: int, bits: int = 256) -> int:
    value &= (1 << bits) - 1
    return value - (1 << bits) if value >> (bits-1) else value


def connect(path: Path) -> sqlite3.Connection:
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    db.executescript("""
      PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS rpc_cache (
        key TEXT PRIMARY KEY, method TEXT, params TEXT, response TEXT,
        source TEXT, fetched_at INTEGER);
      CREATE TABLE IF NOT EXISTS raw_logs (
        tx TEXT, idx INTEGER, block INTEGER, address TEXT, data TEXT, source TEXT,
        PRIMARY KEY(tx,idx));
      CREATE INDEX IF NOT EXISTS raw_logs_block ON raw_logs(block);
      CREATE TABLE IF NOT EXISTS scans (
        key TEXT PRIMARY KEY, kind TEXT, lo INTEGER, hi INTEGER, filters TEXT,
        count INTEGER, source TEXT, completed_at INTEGER);
      CREATE TABLE IF NOT EXISTS gaps (
        kind TEXT, lo INTEGER, hi INTEGER, error TEXT, created_at INTEGER);
      CREATE TABLE IF NOT EXISTS receipts (tx TEXT PRIMARY KEY, block INTEGER, ts INTEGER, data TEXT);
      CREATE TABLE IF NOT EXISTS transactions (tx TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS blocks (number INTEGER PRIMARY KEY, ts INTEGER, hash TEXT);
      CREATE TABLE IF NOT EXISTS tokens (
        address TEXT PRIMARY KEY, decimals INTEGER, symbol TEXT,
        metadata_fidelity TEXT, observed_at INTEGER);
      CREATE TABLE IF NOT EXISTS pools (
        id TEXT PRIMARY KEY, c0 TEXT, c1 TEXT, fee INTEGER, spacing INTEGER,
        hook TEXT, fidelity TEXT, evidence_tx TEXT);
      CREATE TABLE IF NOT EXISTS fills (
        id TEXT PRIMARY KEY, wallet TEXT, handle TEXT, token TEXT, side TEXT,
        amount_raw TEXT, amount REAL, cash_usdg REAL, ts INTEGER, block INTEGER,
        tx TEXT, idx INTEGER, classification TEXT, reason TEXT);
      CREATE INDEX IF NOT EXISTS fills_time ON fills(ts,block,idx);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
    """)
    return db


class RpcError(RuntimeError):
    pass


class RPC:
    def __init__(self, db, urls=RPC_URLS, pace=0.15, timeout=18):
        self.db, self.urls, self.pace, self.timeout = db, tuple(urls), pace, timeout
        self.last_request = 0.0
        self.calls = Counter()
        self.source = None

    def call(self, method, params, cache=True):
        encoded = json.dumps(params, separators=(",", ":"), sort_keys=True)
        key = hashlib.sha256((method + encoded).encode()).hexdigest()
        old = self.db.execute("SELECT response,source FROM rpc_cache WHERE key=?", (key,)).fetchone()
        if cache and old:
            self.source = old["source"]
            return json.loads(old["response"])
        failures = []
        for attempt in range(2):
            for url in self.urls:
                time.sleep(max(0, self.last_request + self.pace - time.monotonic()))
                self.last_request = time.monotonic()
                self.calls[method] += 1
                request = urllib.request.Request(url, data=json.dumps({"jsonrpc":"2.0", "id":1,
                    "method":method, "params":params}).encode(), headers={
                    "Content-Type":"application/json", "User-Agent":"MemeTrace-PaperResearch/1.0"})
                try:
                    with urllib.request.urlopen(request, timeout=self.timeout) as response:
                        payload = json.load(response)
                    if payload.get("error"):
                        raise RpcError(str(payload["error"]))
                    result = payload.get("result")
                    if result is None:
                        raise RpcError("null result")
                    self.source = url
                    if cache:
                        self.db.execute("INSERT OR REPLACE INTO rpc_cache VALUES (?,?,?,?,?,?)",
                            (key,method,encoded,json.dumps(result,separators=(",", ":")),url,int(time.time())))
                        self.db.commit()
                    return result
                except (OSError, ValueError, RpcError) as exc:
                    failures.append(f"{url}: {str(exc)[:250]}")
            if attempt == 0:
                time.sleep(0.75)
        raise RpcError("; ".join(failures))

    def many(self, calls, batch_size=20):
        """Bounded RPC batches, persisted with the same per-call cache and provenance."""
        results = []
        for start in range(0,len(calls),batch_size):
            group = calls[start:start+batch_size]
            pending,answer = [],{}
            for i,(method,params) in enumerate(group):
                encoded = json.dumps(params,separators=(",", ":"),sort_keys=True)
                key = hashlib.sha256((method+encoded).encode()).hexdigest()
                old = self.db.execute("SELECT response FROM rpc_cache WHERE key=?",(key,)).fetchone()
                if old:
                    answer[i] = json.loads(old[0])
                else:
                    pending.append((i,method,params,encoded,key))
            if pending:
                error = None
                for url in self.urls:
                    try:
                        time.sleep(max(0,self.last_request+self.pace-time.monotonic()))
                        self.last_request = time.monotonic()
                        body = [{"jsonrpc":"2.0","id":i,"method":m,"params":p} for i,m,p,_,_ in pending]
                        request = urllib.request.Request(url,data=json.dumps(body).encode(),headers={
                            "Content-Type":"application/json","User-Agent":"MemeTrace-PaperResearch/1.0"})
                        with urllib.request.urlopen(request,timeout=self.timeout) as response:
                            payload = json.load(response)
                        if not isinstance(payload,list):
                            raise RpcError("Endpoint refused a JSON-RPC batch")
                        by_id = {item["id"]:item for item in payload}
                        for i,m,p,encoded,key in pending:
                            item = by_id.get(i,{})
                            if item.get("error") or item.get("result") is None:
                                raise RpcError(str(item.get("error","missing batch result")))
                        for i,m,p,encoded,key in pending:
                            answer[i] = by_id[i]["result"]
                            self.calls[m] += 1
                            self.db.execute("INSERT OR REPLACE INTO rpc_cache VALUES (?,?,?,?,?,?)",
                                (key,m,encoded,json.dumps(answer[i],separators=(",", ":")),url,int(time.time())))
                        self.db.commit()
                        error = None
                        break
                    except (OSError,ValueError,RpcError) as exc:
                        error = exc
                if error:
                    for i,m,p,_,_ in pending:
                        answer[i] = self.call(m,p)
            results.extend(answer[i] for i in range(len(group)))
            if calls and start % 200 == 0:
                print(f"Historical {group[0][0]} replies: {start+len(group)}/{len(calls)}",flush=True)
        return results

    def blocks(self, numbers):
        missing = [n for n in sorted(set(numbers)) if not self.db.execute(
            "SELECT 1 FROM blocks WHERE number=?",(n,)).fetchone()]
        # This public fallback accepted 200-header batches in the source preflight.
        # Larger batches produced per-item rate errors and are deliberately not used.
        reader = RPC(self.db,urls=tuple(reversed(self.urls)),pace=self.pace,timeout=self.timeout)
        for start in range(0,len(missing),200):
            group = missing[start:start+200]
            raw = reader.many([("eth_getBlockByNumber",[hex(n),False]) for n in group],200)
            for n,b in zip(group,raw):
                self.db.execute("INSERT OR REPLACE INTO blocks VALUES (?,?,?)",(n,int(b["timestamp"],16),b["hash"]))
            self.db.commit()
            if start % 1000 == 0:
                print(f"Event block timestamps: {start+len(group)}/{len(missing)}",flush=True)
        self.calls.update(reader.calls)

    def block(self, number):
        cached = self.db.execute("SELECT * FROM blocks WHERE number=?", (number,)).fetchone()
        if cached:
            return dict(cached)
        raw = self.call("eth_getBlockByNumber", [hex(number), False])
        result = {"number": number, "ts": int(raw["timestamp"],16), "hash": raw["hash"]}
        self.db.execute("INSERT OR REPLACE INTO blocks VALUES (?,?,?)",
                        (number,result["ts"],result["hash"]))
        self.db.commit()
        return result

    def at_time(self, ts):
        stored = self.db.execute("SELECT value FROM settings WHERE key=?",(f"block_at_{ts}",)).fetchone()
        if stored:
            return int(stored[0])
        lo, hi = 0, int(self.call("eth_blockNumber", [], cache=False),16)
        if ts > self.block(hi)["ts"]:
            raise ValueError("The requested time is beyond the current blockchain head")
        while lo < hi:
            mid = (lo + hi) // 2
            if self.block(mid)["ts"] < ts:
                lo = mid+1
            else:
                hi = mid
        self.db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)",(f"block_at_{ts}",str(lo)))
        self.db.commit()
        return lo

    def scan(self, kind, lo, hi, filters, chunk=1000):
        """Only successful intervals are checkpoints; errors never become empty history."""
        if lo > hi:
            return
        for start in range(lo, hi+1, chunk):
            end = min(hi,start+chunk-1)
            query = {**filters, "fromBlock":hex(start), "toBlock":hex(end)}
            encoded = json.dumps(query, sort_keys=True)
            key = hashlib.sha256(encoded.encode()).hexdigest()
            if self.db.execute("SELECT 1 FROM scans WHERE key=?", (key,)).fetchone():
                continue
            try:
                logs = self.call("eth_getLogs", [query])
            except RpcError as exc:
                if end-start >= 125:
                    self.scan(kind,start,end,filters,max(125,(end-start+1)//2))
                    continue
                self.db.execute("INSERT INTO gaps VALUES (?,?,?,?,?)",
                                (kind,start,end,str(exc),int(time.time())))
                self.db.commit()
                raise
            for item in logs:
                if item.get("removed"):
                    continue
                self.db.execute("INSERT OR IGNORE INTO raw_logs VALUES (?,?,?,?,?,?)", (
                    item["transactionHash"].lower(),int(item["logIndex"],16),
                    int(item["blockNumber"],16),item["address"].lower(),
                    json.dumps(item,separators=(",", ":")),self.source))
            # Some archive providers include genuine block timestamps in log replies.
            # The official endpoint returns 0, which is never treated as a timestamp.
            times = {}
            for item in logs:
                if item.get("removed"):
                    continue
                ts = int(item.get("blockTimestamp","0x0"),16)
                if not ts:
                    continue
                number = int(item["blockNumber"],16)
                value = (ts,item["blockHash"])
                if number in times and times[number] != value:
                    raise RpcError("Conflicting timestamps/hash within a block")
                times[number] = value
            for number,(ts,block_hash) in times.items():
                old = self.db.execute("SELECT ts,hash FROM blocks WHERE number=?",(number,)).fetchone()
                if old and tuple(old) != (ts,block_hash):
                    raise RpcError("Log block timestamp/hash conflicts with saved header")
                self.db.execute("INSERT OR IGNORE INTO blocks VALUES (?,?,?)",(number,ts,block_hash))
            self.db.execute("INSERT OR REPLACE INTO scans VALUES (?,?,?,?,?,?,?,?)",
                            (key,kind,start,end,json.dumps(filters),len(logs),self.source,int(time.time())))
            self.db.commit()
            print(f"{kind}: blocks {start}–{end}; {len(logs)} logs", flush=True)


def transfers(receipt):
    return [{"token":l["address"].lower(), "from":address(l["topics"][1]),
             "to":address(l["topics"][2]), "value":int(l["data"],16),
            "idx":int(l["logIndex"],16)} for l in receipt.get("logs",[])
            if len(l["topics"]) == 3 and l["topics"][0] == TRANSFER and len(l["data"]) == 66]


def reconstruct(receipt, roster, decimals, ts):
    """Retain transfers and ambiguous routes; price only single-wallet, single-token USDG swaps."""
    all_transfers = transfers(receipt)
    flows = defaultdict(lambda: defaultdict(int))
    first = {}
    for t in all_transfers:
        for wallet, sign in ((t["from"],-1),(t["to"],1)):
            if wallet in roster and t["token"] not in (USDG,WETH):
                flows[wallet][t["token"]] += sign*t["value"]
                first.setdefault((wallet,t["token"]),t["idx"])
    legs = [(w,t,n) for w,by_token in flows.items() for t,n in by_token.items() if n]
    has_swap = any(l["address"].lower() == MANAGER and l["topics"][0] == SWAP
                   for l in receipt.get("logs",[]) if l["topics"])
    cash = [t["value"]/1e6 for t in all_transfers if t["token"] == USDG]
    records = []
    for wallet,token,net in legs:
        classification,reason = "candidate_swap", "single-wallet single-token route"
        if not has_swap:
            classification,reason = "transfer_only", "No supported pool swap in receipt; not a buy signal"
        elif len(legs) != 1:
            classification,reason = "ambiguous_route", "Multiple tracked-wallet/token legs; cash cannot be attributed"
        elif not cash:
            classification,reason = "unpriced_swap", "No USDG leg; historical dollar cost not reconstructed"
        if classification == "candidate_swap":
            same = [t for t in all_transfers if t["token"] == token and t["to"] == wallet]
            if net > 0 and any(sum(1 for x in all_transfers if x["token"] == token
                                  and x["from"] == t["from"] and x["value"] == t["value"]) >= 5
                               for t in same):
                classification,reason = "handout", "Identical transfers to at least five recipients"
        dec = decimals.get(token)
        records.append({"id":f'{receipt["transactionHash"]}:{wallet}:{token}', "wallet":wallet,
            "handle":roster[wallet]["handle"], "token":token, "side":"buy" if net > 0 else "sell",
            "amount_raw":str(abs(net)), "amount":abs(net)/10**dec if dec is not None else None,
            "cash_usdg":max(cash) if cash and classification == "candidate_swap" else None,
            "ts":ts, "block":int(receipt["blockNumber"],16), "tx":receipt["transactionHash"].lower(),
            "idx":first[(wallet,token)], "classification":classification,"reason":reason})
    return records


def decode_string(raw):
    b = bytes.fromhex(raw[2:])
    if len(b) == 32:
        return b.rstrip(b"\0").decode("utf8",errors="replace")
    if len(b) < 64:
        return None
    offset = int.from_bytes(b[:32],"big")
    if offset+32 > len(b):
        return None
    length = int.from_bytes(b[offset:offset+32],"big")
    return b[offset+32:offset+32+min(length,120)].decode("utf8",errors="replace")


def token_metadata(rpc, token):
    old = rpc.db.execute("SELECT decimals FROM tokens WHERE address=?", (token,)).fetchone()
    if old:
        return old[0]
    try:
        dec = int(rpc.call("eth_call",[{"to":token,"data":"0x313ce567"},"latest"]),16)
        if not 0 <= dec <= 36:
            raise ValueError("unsupported decimals")
    except (RpcError,ValueError):
        dec = None
    try:
        symbol = decode_string(rpc.call("eth_call",[{"to":token,"data":"0x95d89b41"},"latest"]))
    except (RpcError,ValueError):
        symbol = None
    rpc.db.execute("INSERT OR REPLACE INTO tokens VALUES (?,?,?,?,?)",
                   (token,dec,symbol,"current_metadata_not_historical",int(time.time())))
    rpc.db.commit()
    return dec


def prefetch_metadata(rpc, tokens):
    """Small batches speed valid metadata reads; failures remain explicitly missing."""
    missing = [t for t in sorted(tokens) if t != ZERO and not rpc.db.execute(
        "SELECT 1 FROM tokens WHERE address=?",(t,)).fetchone()]
    for offset in range(0,len(missing),10):
        group = missing[offset:offset+10]
        for selector in ("0x313ce567","0x95d89b41"):
            try:
                rpc.many([("eth_call",[{"to":t,"data":selector},"latest"]) for t in group],10)
            except RpcError:
                # Successful individual replies are already cached, and normal parsing below
                # records unavailable decimals/symbols without substituting a guessed value.
                pass
        for token in group:
            token_metadata(rpc,token)
        print(f"Token metadata: {offset+len(group)}/{len(missing)}",flush=True)


def decode_initialization(log):
    w = words(log["data"])
    if log["topics"][0] != INITIALIZE or len(w) != 5 or len(log["topics"]) != 4:
        raise ValueError("Not a v4 Initialize event")
    return {"id":log["topics"][1],"c0":address(log["topics"][2]),
            "c1":address(log["topics"][3]),"fee":w[0],"spacing":signed(w[1]),
            "hook":"0x"+format(w[2],"040x"),"fidelity":"historical_initialize_event",
            "evidence_tx":log["transactionHash"]}


def save_pool(db, pool):
    if pool_key_hash(pool["c0"],pool["c1"],pool["fee"],pool["spacing"],pool["hook"]) != pool["id"]:
        raise ValueError("Pool key hash does not match the historical pool identifier")
    db.execute("INSERT OR IGNORE INTO pools VALUES (:id,:c0,:c1,:fee,:spacing,:hook,:fidelity,:evidence_tx)",pool)


@lru_cache(maxsize=65536)
def pool_key_hash(c0,c1,fee,spacing,hook):
    return "0x"+keccak(b"".join(int(v,16).to_bytes(32,"big") if isinstance(v,str)
        else (v % (1<<256)).to_bytes(32,"big") for v in (c0,c1,fee,spacing,hook))).hex()


def extract_pool_keys(transaction, receipt):
    """A key is accepted only if its ABI hash matches a historical Swap pool ID."""
    encoded = transaction.get("input","0x")[2:]
    wanted = {l["topics"][1] for l in receipt["logs"] if l["address"].lower() == MANAGER
              and l["topics"] and l["topics"][0] == SWAP}
    tokens = {t["token"] for t in transfers(receipt)} | {ZERO}
    found = {}
    # Full ABI PoolKey, including nested offsets, is still five adjacent words.
    for offset in range(0,len(encoded)-320+1,2):
        chunk = encoded[offset:offset+320]
        if chunk[:24] != "0"*24 or chunk[64:88] != "0"*24:
            continue
        w = [int(chunk[i:i+64],16) for i in range(0,320,64)]
        c0,c1 = "0x"+format(w[0],"040x"),"0x"+format(w[1],"040x")
        if c0 not in tokens or c1 not in tokens or int(c0,16) >= int(c1,16):
            continue
        spacing = signed(w[3])
        if w[2] > 0xFFFFFF or not 1 <= spacing <= 32767 or w[4] >= 1<<160:
            continue
        key = pool_key_hash(c0,c1,w[2],spacing,"0x"+format(w[4],"040x"))
        if key in wanted:
            found[key] = {"id":key,"c0":c0,"c1":c1,"fee":w[2],"spacing":spacing,
                "hook":"0x"+format(w[4],"040x"),"fidelity":"historical_calldata_hash_verified",
                "evidence_tx":receipt["transactionHash"]}
    # v4 compact paths carry currency1/fee/tickSpacing/hook; currency0 is inherited.
    for c1 in tokens:
        start = 0
        while True:
            off = encoded.find(c1[2:], start)
            if off < 0:
                break
            start = off+40
            tail = encoded[off+40:off+92]
            if len(tail) != 52:
                continue
            fee,spacing = int(tail[:6],16),signed(int(tail[6:12],16),24)
            hook = "0x"+tail[12:52]
            if not 1 <= spacing <= 32767 or fee > 0x800000:
                continue
            for c0 in tokens:
                a,b = sorted((c0,c1),key=lambda x:int(x,16))
                if a == b:
                    continue
                key = pool_key_hash(a,b,fee,spacing,hook)
                if key in wanted:
                    found[key] = {"id":key,"c0":a,"c1":b,"fee":fee,"spacing":spacing,
                        "hook":hook,"fidelity":"historical_calldata_hash_verified",
                        "evidence_tx":receipt["transactionHash"]}
    return list(found.values())


def collect(args):
    out = Path(args.output)
    out.mkdir(parents=True,exist_ok=True)
    db = connect(out/"history.sqlite")
    prior = db.execute("SELECT value FROM settings WHERE key='manifest'").fetchone()
    if prior:
        p = json.loads(prior[0])
        expected = {"cohort_start":stamp(args.start),"cohort_end":stamp(args.end),
            "roster_sha256":hashlib.sha256(Path(args.roster).read_bytes()).hexdigest(),
            "warmup_seconds":args.warmup,"horizon_seconds":args.horizon}
        if any(p.get(k) != v for k,v in expected.items()):
            raise ValueError("Use a new output directory for a different cohort or roster")
        if p["status"] == "complete":
            print("Saved collection already complete; no network request or evidence rewrite.",flush=True)
            return p
    rpc = RPC(db, pace=args.pace)
    chain = int(rpc.call("eth_chainId",[],cache=False),16)
    if chain != CHAIN_ID:
        raise ValueError(f"Wrong chain: {chain}")
    roster_list = json.loads(Path(args.roster).read_text())
    roster = {w["address"].lower():w for w in roster_list}
    if len(roster) != len(roster_list):
        raise ValueError("Duplicate wallet in roster")
    (out/"roster.json").write_bytes(Path(args.roster).read_bytes())
    start,end = stamp(args.start),stamp(args.end)
    if end <= start:
        raise ValueError("end must be later than start")
    manifest = {"schema_version":1,"chain_id":chain,"cohort_start":start,"cohort_end":end,
        "warmup_seconds":args.warmup,"horizon_seconds":args.horizon,"wallets":len(roster),
        "roster_sha256":hashlib.sha256(Path(args.roster).read_bytes()).hexdigest(),
        "roster_source":"https://github.com/itsnex1s/fomopulse-robinhood-chain-tape",
        "rpc_urls":list(RPC_URLS),"started_at":int(time.time()),"status":"collecting",
        "identity_fidelity":"public_roster_association_not_verified_ownership",
        "selection":"fixed chronological window; all roster wallets; includes rejected evidence"}
    manifest["roster_source_revision"] = KNOWN_ROSTER_REVISION if manifest["roster_sha256"] == KNOWN_ROSTER_SHA256 else None
    prior = db.execute("SELECT value FROM settings WHERE key='manifest' ").fetchone()
    if prior:
        p = json.loads(prior[0])
        for key in ("cohort_start","cohort_end","roster_sha256","warmup_seconds","horizon_seconds"):
            if p[key] != manifest[key]:
                raise ValueError("Use a new output directory for a different cohort or roster")
    def save_manifest():
        manifest["rpc_calls_this_pass"] = dict(rpc.calls)
        db.execute("INSERT OR REPLACE INTO settings VALUES ('manifest',?)",(json.dumps(manifest),))
        db.commit()
        (out/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n")
    save_manifest()
    try:
        lo = p["from_block"] if prior and "from_block" in p else rpc.at_time(start-args.warmup)
        hi = p["to_block"] if prior and "to_block" in p else rpc.at_time(end+args.horizon)-1
        manifest.update({"from_block":lo,"to_block":hi,"status":"wallet_history"})
        save_manifest()
        wallet_topics = ["0x"+w[2:].rjust(64,"0") for w in sorted(roster)]
        for side,topics in (("incoming",[TRANSFER,None,wallet_topics]),("outgoing",[TRANSFER,wallet_topics])):
            rpc.scan("wallet_"+side,lo,hi,{"topics":topics},args.chunk)
        txs = [r[0] for r in db.execute("SELECT tx FROM raw_logs WHERE address != ? "
                                       "GROUP BY tx ORDER BY MIN(block),MIN(idx)",(MANAGER,))]
        print(f"Fetching {len(txs)} full receipts",flush=True)
        missing_txs = [tx for tx in txs if not db.execute("SELECT 1 FROM receipts WHERE tx=?",(tx,)).fetchone()]
        fetched = rpc.many([("eth_getTransactionReceipt",[tx]) for tx in missing_txs],10)
        rpc.blocks([int(r["blockNumber"],16) for r in fetched])
        for tx,r in zip(missing_txs,fetched):
            if int(r["status"],16) == 1:
                block = int(r["blockNumber"],16)
                db.execute("INSERT OR REPLACE INTO receipts VALUES (?,?,?,?)",
                           (tx,block,rpc.block(block)["ts"],json.dumps(r)))
        db.commit()
        swap_txs = [tx for tx in txs if any(l["address"].lower() == MANAGER and l["topics"]
            and l["topics"][0] == SWAP for l in json.loads(db.execute(
                "SELECT data FROM receipts WHERE tx=?",(tx,)).fetchone()[0])["logs"])]
        missing_transactions = [tx for tx in swap_txs if not db.execute(
            "SELECT 1 FROM transactions WHERE tx=?",(tx,)).fetchone()]
        for tx,t in zip(missing_transactions,rpc.many([("eth_getTransactionByHash",[tx]) for tx in missing_transactions],10)):
            db.execute("INSERT OR REPLACE INTO transactions VALUES (?,?)",(tx,json.dumps(t)))
        db.commit()
        for i,tx in enumerate(txs):
            if db.execute("SELECT 1 FROM receipts WHERE tx=?",(tx,)).fetchone():
                continue
            r = rpc.call("eth_getTransactionReceipt",[tx])
            if int(r["status"],16) != 1:
                continue
            block = int(r["blockNumber"],16)
            ts = rpc.block(block)["ts"]
            db.execute("INSERT OR REPLACE INTO receipts VALUES (?,?,?,?)",(tx,block,ts,json.dumps(r)))
            if any(l["address"].lower() == MANAGER and l["topics"] and l["topics"][0] == SWAP for l in r["logs"]):
                transaction = rpc.call("eth_getTransactionByHash",[tx])
                db.execute("INSERT OR REPLACE INTO transactions VALUES (?,?)",(tx,json.dumps(transaction)))
                for pool in extract_pool_keys(transaction,r):
                    save_pool(db,pool)
            db.commit()
            if i % 20 == 0:
                print(f"Receipts: {i+1}/{len(txs)}",flush=True)
        # Resume repair: deriving keys and fills is cheap and deterministic from stored receipts.
        for row in db.execute("SELECT r.data,t.data AS calldata FROM receipts r LEFT JOIN transactions t ON r.tx=t.tx"):
            if row["calldata"]:
                for pool in extract_pool_keys(json.loads(row["calldata"]),json.loads(row["data"])):
                    save_pool(db,pool)
        db.commit()
        wanted = set()
        relevant_tokens = {USDG,WETH}
        for row in db.execute("SELECT data FROM receipts"):
            receipt = json.loads(row[0])
            for t in transfers(receipt):
                if t["from"] in roster or t["to"] in roster:
                    relevant_tokens.add(t["token"])
            wanted.update(l["topics"][1] for l in receipt["logs"] if l["address"].lower() == MANAGER
                          and l["topics"] and l["topics"][0] == SWAP)
        known = {r[0] for r in db.execute("SELECT id FROM pools")}
        missing = sorted(wanted-known)
        if missing:
            # Indexed IDs avoid a scan of every unrelated pool; do not assume today's pool metadata.
            try:
                logs = rpc.call("eth_getLogs",[{"address":MANAGER,"topics":[INITIALIZE,missing],
                                               "fromBlock":"0x0","toBlock":hex(hi)}])
                for log in logs:
                    save_pool(db,decode_initialization(log))
            except RpcError as exc:
                manifest["pool_initialization_error"] = str(exc)
            for row in db.execute("SELECT data FROM raw_logs WHERE address=?",(MANAGER,)):
                log = json.loads(row[0])
                if log["topics"][0] == INITIALIZE:
                    save_pool(db,decode_initialization(log))
            db.commit()
        keys = [dict(r) for r in db.execute("SELECT * FROM pools")]
        for p in keys:
            relevant_tokens.update((p["c0"],p["c1"]))
        print(f"Historical pool keys: {len(keys)}/{len(wanted)}; metadata: {len(relevant_tokens)} tokens",flush=True)
        prefetch_metadata(rpc,relevant_tokens)
        decimals = {r["address"]:r["decimals"] for r in db.execute("SELECT * FROM tokens")}
        for row in db.execute("SELECT * FROM receipts"):
            records = reconstruct(json.loads(row["data"]),roster,decimals,row["ts"])
            for record in records:
                db.execute("INSERT OR REPLACE INTO fills VALUES (:id,:wallet,:handle,:token,:side,:amount_raw,:amount,"
                           ":cash_usdg,:ts,:block,:tx,:idx,:classification,:reason)",record)
        db.commit()
        manifest["status"] = "pool_history"
        save_manifest()
        # Get swaps and liquidity changes for every used pool, including other traders' activity.
        if wanted:
            rpc.scan("pool_events",lo,hi,{"address":MANAGER,"topics":[[SWAP,MODIFY],sorted(wanted)]},args.chunk)
        # Times come from real blocks. Some providers return blockTimestamp=0 in logs.
        block_nums = [r[0] for r in db.execute("SELECT DISTINCT block FROM raw_logs WHERE address=? ORDER BY block",(MANAGER,))]
        missing_times = sum(not db.execute("SELECT 1 FROM blocks WHERE number=?",(n,)).fetchone()
                            for n in block_nums)
        if wanted and missing_times > 10000:
            # An equivalent address-list filter keeps the supplementary source reply
            # distinct from the zero-timestamp official cache. This is a timestamp
            # repair, not a retry of a denied/private endpoint.
            archive = RPC(db,urls=tuple(reversed(RPC_URLS)),pace=args.pace)
            archive.scan("pool_timestamp_evidence",lo,hi,
                {"address":[MANAGER],"topics":[[SWAP,MODIFY],sorted(wanted)]},args.chunk)
            rpc.calls.update(archive.calls)
            block_nums = [r[0] for r in db.execute("SELECT DISTINCT block FROM raw_logs WHERE address=?",(MANAGER,))]
        rpc.blocks(block_nums)
        manifest.update({"status":"complete","completed_at":int(time.time()),"pool_ids_seen":len(wanted),
                         "pool_keys_resolved":len(keys),"pool_keys_missing":sorted(wanted-{p["id"] for p in keys}),
                         "raw_logs":db.execute("SELECT COUNT(*) FROM raw_logs").fetchone()[0],
                         "receipts":db.execute("SELECT COUNT(*) FROM receipts").fetchone()[0],
                         "timestamp_method":"block headers and nonzero archive log timestamps, cross-checked where overlapping",
                         "fills":db.execute("SELECT COUNT(*) FROM fills").fetchone()[0],
                         "classifications":dict(db.execute("SELECT classification,COUNT(*) FROM fills GROUP BY classification").fetchall())})
        save_manifest()
    except Exception as exc:
        manifest.update({"status":"incomplete","error":str(exc)})
        save_manifest()
        raise
    print(json.dumps(manifest,indent=2),flush=True)
    return manifest


class EventHistory:
    """Pool snapshots ordered by real block/transaction/log order, with no future lookup."""
    def __init__(self,db):
        self.pools = {r["id"]:dict(r) for r in db.execute("SELECT * FROM pools")}
        self.decimals = {r["address"]:r["decimals"] for r in db.execute("SELECT * FROM tokens")}
        self.rows = defaultdict(list)
        current = {}
        for row in db.execute("SELECT l.data,b.ts FROM raw_logs l JOIN blocks b ON b.number=l.block "
                              "WHERE l.address=? ORDER BY l.block,l.idx",(MANAGER,)):
            log = json.loads(row["data"])
            if len(log["topics"]) < 2 or log["topics"][1] not in self.pools:
                continue
            pool = log["topics"][1]
            w = words(log["data"])
            order = (row["ts"],int(log["blockNumber"],16),int(log["logIndex"],16))
            if log["topics"][0] == SWAP and len(w) == 6:
                state = {"sqrt":w[2]/2**96,"liquidity":w[3],"tick":signed(w[4]),
                         "fee":w[5],"order":order,"swap_ts":row["ts"],"tx":log["transactionHash"]}
                current[pool] = state
            elif log["topics"][0] == MODIFY and pool in current and len(w) == 4:
                state = dict(current[pool])
                lower,upper,delta = signed(w[0]),signed(w[1]),signed(w[2])
                if lower <= state["tick"] < upper:
                    state["liquidity"] += delta
                state["order"] = order
                current[pool] = state
            else:
                continue
            self.rows[pool].append(dict(current[pool]))
        self.orders = {p:[s["order"] for s in states] for p,states in self.rows.items()}
        self.adj = defaultdict(list)
        for p,key in self.pools.items():
            self.adj[key["c0"]].append((key["c1"],p))
            self.adj[key["c1"]].append((key["c0"],p))

    def state(self,pool,ts,max_age=120):
        orders = self.orders.get(pool,[])
        # All transactions in the cutoff second have landed before entry in the next second.
        i = bisect.bisect_right(orders,(ts,1<<63,1<<63))-1
        if i < 0:
            return None
        state = self.rows[pool][i]
        if state["liquidity"] <= 0 or ts-state["swap_ts"] > max_age:
            return None
        return state

    @lru_cache(maxsize=16384)
    def route(self,token,ts,max_age=120,max_hops=3):
        found = []
        def walk(current,path,seen):
            if current == USDG:
                found.append(path)
                return
            if len(path) >= max_hops:
                return
            for other,p in self.adj.get(current,[]):
                if other not in seen and self.state(p,ts,max_age) is not None:
                    walk(other,path+[(current,other,p)],seen|{other})
        walk(token,[],{token})
        if not found:
            return None
        # Choose the shortest path and stable pool-id ordering using entry-time data only.
        return min(found,key=lambda p:(len(p),[e[2] for e in p]))

    def price(self,route,ts,max_age=120):
        value = 1.0
        for source,target,pool in route:
            state = self.state(pool,ts,max_age)
            d0,d1 = self.decimals.get(source),self.decimals.get(target)
            if state is None or d0 is None or d1 is None:
                return None
            key = self.pools[pool]
            ratio = state["sqrt"]**2 if source == key["c0"] else 1/state["sqrt"]**2
            value *= ratio*10**(d0-d1)
        return value

    def quote(self,route,ts,amount,max_age=120,allow_hooks=False):
        """Finite-size v4 quote within one tick-spacing cell; no invented tick-crossing liquidity."""
        for source,target,pool in route:
            key = self.pools[pool]
            if key["hook"] != ZERO and not allow_hooks:
                return None,"unverified_pool_hook"
            state = self.state(pool,ts,max_age)
            if state is None:
                return None,"missing_or_stale_pool_state"
            if self.decimals.get(source) is None or self.decimals.get(target) is None:
                return None,"missing_decimals"
            liquidity,p = state["liquidity"],state["sqrt"]
            fee = state["fee"]/1e6
            if not 0 <= fee < 1:
                return None,"invalid_pool_fee"
            effective = amount*10**self.decimals[source]*(1-fee)
            spacing = key["spacing"]
            lower = math.floor(state["tick"]/spacing)*spacing
            upper = lower+spacing
            if source == key["c0"]:
                next_p = liquidity*p/(liquidity+effective*p)
                if next_p < math.exp(lower*math.log(1.0001)/2):
                    return None,"requires_unreconstructed_tick_crossing"
                output = liquidity*(p-next_p)
            else:
                next_p = p+effective/liquidity
                if next_p > math.exp(upper*math.log(1.0001)/2):
                    return None,"requires_unreconstructed_tick_crossing"
                output = liquidity*(1/p-1/next_p)
            amount = output/10**self.decimals[target]
            if not math.isfinite(amount) or amount <= 0:
                return None,"invalid_quote"
        return amount,None
