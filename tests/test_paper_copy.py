import json
import hashlib
import math
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from paper_copy_data import (EventHistory, INITIALIZE, MANAGER, MODIFY, SWAP, TRANSFER, USDG,
                             ZERO, connect, decode_initialization, keccak, pool_key_hash,
                             reconstruct, topic, RPC, RpcError, extract_pool_keys, collect, stamp)
from paper_copy import features, make_trade, portfolio, receipt_cost, price_response, safe_csv_row

TOKEN = "0x"+"1"*40
WALLET = "0x"+"2"*40
OTHER = "0x"+"3"*40
POOL = "0x"+"4"*64
TX = "0x"+"5"*64


def data(*values):
    return "0x"+"".join(format(v % (1<<256),"064x") for v in values)


def transfer(token,source,target,value,idx):
    return {"address":token,"topics":[TRANSFER,"0x"+source[2:].rjust(64,"0"),
        "0x"+target[2:].rjust(64,"0")],"data":data(value),"logIndex":hex(idx)}


def swap(block,idx,ts,sqrt=1.0,liquidity=10**12,tick=0):
    return {"address":MANAGER,"topics":[SWAP,POOL,"0x"+"0"*64],
        "data":data(-1,1,int(sqrt*2**96),liquidity,tick,1000),
        "transactionHash":TX,"logIndex":hex(idx),"blockNumber":hex(block)}


class CopyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = connect(Path(self.tmp.name)/"history.sqlite")

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def setup_history(self,events,hook=ZERO):
        self.db.execute("INSERT INTO pools VALUES (?,?,?,?,?,?,?,?)",
            (POOL,TOKEN,USDG,1000,200,hook,"test",TX))
        for token in (TOKEN,USDG):
            self.db.execute("INSERT INTO tokens VALUES (?,?,?,?,?)",(token,6,"T","test",0))
        for block,idx,ts,sqrt,liq,tick in events:
            log = swap(block,idx,ts,sqrt,liq,tick)
            self.db.execute("INSERT OR REPLACE INTO blocks VALUES (?,?,?)",(block,ts,"hash"))
            self.db.execute("INSERT OR REPLACE INTO raw_logs VALUES (?,?,?,?,?,?)",
                (TX,idx,block,MANAGER,json.dumps(log),"test"))
        self.db.commit()
        return EventHistory(self.db)

    def test_ethereum_keccak_vectors_and_not_sha3(self):
        self.assertEqual(keccak(b"").hex(),"c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
        self.assertEqual(topic("Transfer(address,address,uint256)"),TRANSFER)
        self.assertEqual(topic("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)"),SWAP)

    def test_receipt_fee_product_is_observed_not_assumed_copy_cost(self):
        r = receipt_cost({"transactionHash":TX,"gasUsed":"0x5208","effectiveGasPrice":hex(10**9)},
                         {"from":OTHER})
        self.assertEqual(r["gas_fee_product_wei"],str(21000*10**9))
        self.assertAlmostEqual(r["gas_fee_product_eth"],0.000021)
        self.assertEqual(r["transaction_sender"],OTHER)
        self.assertIsNone(receipt_cost({"transactionHash":TX})["gas_fee_product_wei"])

    def test_untrusted_csv_text_cannot_execute_spreadsheet_formula(self):
        row = {"symbol":"=HYPERLINK(\"malicious\")","loss":-2.5,"token":TOKEN}
        exported = safe_csv_row(row)
        self.assertTrue(exported["symbol"].startswith("'="))
        self.assertEqual(exported["loss"],-2.5)
        self.assertEqual(exported["token"],TOKEN)
        self.assertTrue(row["symbol"].startswith("="))

    def test_pool_key_requires_hash_matching_actual_swap(self):
        key = pool_key_hash(TOKEN,USDG,1000,200,ZERO)
        encoded = data(int(TOKEN,16),int(USDG,16),1000,200,0)
        log = swap(1,1,100)
        log["topics"][1] = key
        receipt = {"transactionHash":TX,"logs":[log,transfer(TOKEN,MANAGER,WALLET,100,2),
                                                     transfer(USDG,WALLET,MANAGER,100,3)]}
        pools = extract_pool_keys({"input":"0x12345678"+encoded[2:]},receipt)
        self.assertEqual([p["id"] for p in pools],[key])
        log["topics"][1] = POOL
        self.assertEqual(extract_pool_keys({"input":"0x12345678"+encoded[2:]},receipt),[])

    def test_failed_scan_does_not_become_empty_checkpoint(self):
        rpc = RPC(self.db)
        def fail(*args,**kwargs):
            raise RpcError("provider refused")
        rpc.call = fail
        with self.assertRaises(RpcError):
            rpc.scan("test",1,1,{"topics":[TRANSFER]})
        self.assertEqual(self.db.execute("SELECT count(*) FROM scans").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT count(*) FROM gaps").fetchone()[0],1)

    def test_completed_collection_resume_is_frozen_and_offline(self):
        roster = Path(self.tmp.name)/"roster.json"
        roster.write_text(json.dumps([{"address":WALLET,"handle":"test"}]))
        args = SimpleNamespace(output=self.tmp.name,roster=str(roster),start="2026-09-05T00:00:00Z",
                               end="2026-09-05T02:00:00Z",warmup=3600,horizon=960)
        saved = {"status":"complete","chain_id":4663,"cohort_start":stamp(args.start),
                 "cohort_end":stamp(args.end),"warmup_seconds":3600,"horizon_seconds":960,
                 "roster_sha256":hashlib.sha256(roster.read_bytes()).hexdigest()}
        self.db.execute("INSERT INTO settings VALUES ('manifest',?)",(json.dumps(saved),))
        self.db.commit()
        with patch.object(RPC,"call",side_effect=AssertionError("must remain offline")):
            self.assertEqual(collect(args),saved)
            args.end = "2026-09-05T03:00:00Z"
            with self.assertRaises(ValueError):
                collect(args)
        self.assertEqual(json.loads(self.db.execute("SELECT value FROM settings").fetchone()[0]),saved)

    def test_resume_scan_preserves_raw_rows_without_duplicate_queries(self):
        rpc = RPC(self.db)
        log = swap(1,1,100)
        calls = []
        def ok(*args,**kwargs):
            calls.append(args)
            return [log]
        rpc.call = ok
        rpc.scan("test",1,1,{"topics":[SWAP]})
        rpc.scan("test",1,1,{"topics":[SWAP]})
        self.assertEqual(len(calls),1)
        self.assertEqual(self.db.execute("SELECT count(*) FROM raw_logs").fetchone()[0],1)

    def test_archive_log_timestamp_is_checked_against_saved_header(self):
        rpc = RPC(self.db)
        log = swap(1,1,100)
        log.update({"blockTimestamp":"0x64","blockHash":"hash"})
        rpc.call = lambda *args,**kwargs: [log]
        rpc.scan("timestamp",1,1,{"address":[MANAGER]})
        self.assertEqual(tuple(self.db.execute("SELECT ts,hash FROM blocks WHERE number=1").fetchone()),(100,"hash"))
        log["blockTimestamp"] = "0x65"
        with self.assertRaises(RpcError):
            rpc.scan("conflict",1,1,{"address":MANAGER})
        self.assertEqual(self.db.execute("SELECT count(*) FROM scans").fetchone()[0],1)

    def test_zero_log_timestamp_is_not_invented_history(self):
        rpc = RPC(self.db)
        log = swap(1,1,100)
        log["blockTimestamp"] = "0x0"
        rpc.call = lambda *args,**kwargs: [log]
        rpc.scan("zero_timestamp",1,1,{"address":MANAGER})
        self.assertEqual(self.db.execute("SELECT count(*) FROM blocks").fetchone()[0],0)

    def test_no_future_pool_state_and_staleness(self):
        h = self.setup_history([(1,1,100,1.005,10**12,99),(2,2,200,2.0,10**12,13863)])
        self.assertIsNone(h.state(POOL,99))
        self.assertEqual(h.state(POOL,150)["order"],(100,1,1))
        self.assertIsNone(h.state(POOL,400,max_age=120))
        self.assertAlmostEqual(h.price(h.route(TOKEN,150),150),1.005**2)

    def test_prices_include_decimal_conversion(self):
        h = self.setup_history([(1,1,100,1.005,10**12,99)])
        h.decimals[TOKEN] = 18
        self.assertAlmostEqual(h.price(h.route(TOKEN,100),100),1.005**2*1e12)

    def test_price_response_is_separate_from_executable_profit(self):
        h = self.setup_history([(1,1,100,1.005,10**12,99),(2,2,200,2.0,10**12,13863)])
        signal = {"id":"s","ts":98,"handle":"test","token":TOKEN,"partition":"test"}
        r = price_response(h,signal,2,100,120)
        self.assertEqual(r["status"],"observed_price_path")
        self.assertAlmostEqual(r["spot_price_change"],4/1.005**2-1)
        self.assertFalse(r["is_trade_profit"])

    def test_finite_size_quotes_and_tick_crossing_rejection(self):
        h = self.setup_history([(1,1,100,1.005,10**12,99)])
        route = h.route(TOKEN,100)
        out,error = h.quote(route,100,25)
        self.assertIsNone(error)
        self.assertGreater(out,0)
        self.assertLess(out,25*1.005**2)
        out,error = h.quote(route,100,10**8)
        self.assertIsNone(out)
        self.assertEqual(error,"requires_unreconstructed_tick_crossing")

    def test_hooks_never_receive_strict_executable_status(self):
        h = self.setup_history([(1,1,100,1.005,10**12,99)],hook=OTHER)
        route = h.route(TOKEN,100)
        self.assertEqual(h.quote(route,100,10)[1],"unverified_pool_hook")
        self.assertIsNotNone(h.quote(route,100,10,allow_hooks=True)[0])

    def test_liquidity_removals_are_applied_before_quote(self):
        h = self.setup_history([(1,1,100,1.005,10**12,99)])
        log = {"address":MANAGER,"topics":[MODIFY,POOL,"0x"+"0"*64],
            "data":data(-200,200,-10**12,0),"blockNumber":"0x2","logIndex":"0x2", "transactionHash":TX}
        self.db.execute("INSERT INTO blocks VALUES (?,?,?)",(2,101,"hash2"))
        self.db.execute("INSERT INTO raw_logs VALUES (?,?,?,?,?,?)",(TX,2,2,MANAGER,json.dumps(log),"test"))
        self.db.commit()
        h = EventHistory(self.db)
        self.assertIsNone(h.route(TOKEN,101))

    def test_transfers_and_airdrops_are_not_buy_signals(self):
        r = {"transactionHash":TX,"blockNumber":"0x1","logs":[transfer(TOKEN,OTHER,WALLET,100,1)]}
        f = reconstruct(r,{WALLET:{"handle":"test"}},{TOKEN:6},100)[0]
        self.assertEqual(f["classification"],"transfer_only")
        self.assertIsNone(f["cash_usdg"])

    def test_nft_transfer_topic_collision_is_not_erc20_trade(self):
        log = transfer(TOKEN,OTHER,WALLET,100,1)
        log["topics"].append("0x"+"0"*63+"1")
        log["data"] = "0x"
        r = {"transactionHash":TX,"blockNumber":"0x1","logs":[log]}
        self.assertEqual(reconstruct(r,{WALLET:{"handle":"test"}},{TOKEN:6},100),[])

    def test_multiple_wallet_cash_attribution_rejected(self):
        r = {"transactionHash":TX,"blockNumber":"0x1","logs":[
            transfer(USDG,OTHER,MANAGER,100000000,0),transfer(TOKEN,MANAGER,WALLET,100,1),
            transfer(TOKEN,MANAGER,OTHER,100,2),swap(1,3,100)]}
        rows = reconstruct(r,{WALLET:{"handle":"a"},OTHER:{"handle":"b"}},{TOKEN:6},100)
        self.assertEqual(len(rows),2)
        self.assertTrue(all(r["classification"] == "ambiguous_route" for r in rows))

    def test_past_only_size_features_and_horizon_embargo(self):
        fills = [{"classification":"candidate_swap","cash_usdg":v,"side":"buy","wallet":WALLET,
            "token":TOKEN,"ts":100+i,"id":str(i)} for i,v in enumerate([10,10,10,10,10,100,10000])]
        rows = features(fills,100,110,106,2)
        self.assertEqual(rows[5]["prior_median_cash_usdg"],10)
        self.assertEqual(rows[5]["size_vs_prior_median"],10)
        self.assertEqual(rows[4]["partition"],"embargo")
        self.assertEqual(rows[6]["partition"],"test")

    def test_finite_cash_and_no_double_token_position(self):
        def row(i,token,entry,exit_time,status="closed_modelled"):
            return {"signal_id":str(i),"entry_ts":entry,"exit_ts":exit_time,"quantity":1,
                "token":token,"size_usdg":100,"exit_usdg":110,"status":status}
        rows = [row(1,"A",100,200),row(2,"A",101,201),row(3,"B",102,202),row(4,"C",103,203)]
        p = portfolio(rows,capital=201,network_cost=0.05)
        self.assertEqual(p["accepted_entries"],2)
        self.assertEqual(p["skips"]["token_position_already_open"],1)
        self.assertEqual(p["skips"]["insufficient_cash"],1)
        self.assertAlmostEqual(p["final_cash_usdg"],220.8)

    def test_unresolved_exit_is_retained_and_cash_stays_reserved(self):
        row = {"signal_id":"a","entry_ts":100,"exit_ts":200,"quantity":1,"token":"A",
            "size_usdg":100,"exit_usdg":None,"status":"unresolved_exit"}
        p = portfolio([row],capital=300,network_cost=.05)
        self.assertEqual(p["unresolved_positions"],1)
        self.assertAlmostEqual(p["final_cash_usdg"],199.95)


if __name__ == "__main__":
    unittest.main()
