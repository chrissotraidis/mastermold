from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
import time
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed

@dataclass(frozen=True)
class DataProvenance:
    symbol: str
    source: str
    fetched_at: str
    granularity_sec: int

def ensure_single_source(provenance: list[DataProvenance]) -> None:
    by_symbol: dict[str, set[str]] = {}
    for row in provenance: by_symbol.setdefault(row.symbol, set()).add(row.source)
    mixed = {symbol: sources for symbol, sources in by_symbol.items() if len(sources) > 1}
    if mixed: raise ValueError(f"mixed OHLCV sources in one run: {mixed}")

def write_parquet_cache(frame, path: Path, provenance: DataProvenance) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    frame.to_parquet(path, index=False)
    path.with_suffix(path.suffix + ".meta.json").write_text(json.dumps(provenance.__dict__, sort_keys=True) + "\n")

def read_parquet_cache(path: Path):
    import pandas as pd
    frame = pd.read_parquet(path)
    meta = DataProvenance(**json.loads(path.with_suffix(path.suffix + ".meta.json").read_text()))
    return frame, meta

def _public_json(url: str, *, retries: int=5, timeout: int=20):
    for attempt in range(retries+1):
        try:
            with urlopen(Request(url,headers={"Accept":"application/json","User-Agent":"Mastermold-ML/1"}),timeout=timeout) as response: return json.load(response)
        except HTTPError as error:
            if error.code!=429 and error.code<500: raise
            if attempt>=retries: raise
            retry_after=error.headers.get("Retry-After") if error.headers else None
            time.sleep(float(retry_after) if retry_after and retry_after.isdigit() else min(30,2**attempt))
        except (URLError,TimeoutError):
            if attempt>=retries: raise
            time.sleep(min(30,2**attempt))

def fetch_coinbase_candles(product: str, start_iso: str, end_iso: str, granularity: int = 60):
    import pandas as pd
    url = f"https://api.exchange.coinbase.com/products/{product}/candles?" + urlencode({"start": start_iso, "end": end_iso, "granularity": granularity})
    body=_public_json(url)
    if not isinstance(body,list): raise ValueError(f"Coinbase candles returned {type(body).__name__}")
    rows = [{"timestamp": int(r[0]) * 1000, "low":r[1], "high":r[2], "open":r[3], "close":r[4], "volume":r[5]} for r in body]
    return pd.DataFrame(rows,columns=["timestamp","low","high","open","close","volume"]).sort_values("timestamp").drop_duplicates("timestamp")

def _iso(epoch_seconds: int) -> str:
    return datetime.fromtimestamp(epoch_seconds,tz=timezone.utc).isoformat().replace("+00:00","Z")

def fetch_coinbase_history(product: str, start_ms: int, end_ms: int, granularity: int=60, pause_seconds: float=.12, chunk_cache_dir: Path | None=None, workers: int=4):
    """Chunk Coinbase's public 300-candle endpoint without gaps and resume."""
    import pandas as pd
    chunk_seconds=granularity*300; cursor=int(start_ms//1000); end=int(end_ms//1000); frames=[]; chunks=[]
    if chunk_cache_dir: chunk_cache_dir.mkdir(parents=True,exist_ok=True)
    while cursor<end:
        chunk_end=min(end,cursor+chunk_seconds)
        chunks.append((cursor,chunk_end)); cursor=chunk_end

    def load_chunk(bounds):
        cursor,chunk_end=bounds
        chunk_path=chunk_cache_dir/f"{cursor}-{chunk_end}.json" if chunk_cache_dir else None
        if chunk_path and chunk_path.exists():
            frame=pd.read_json(chunk_path,orient="records",convert_dates=False)
            if frame.empty: frame=pd.DataFrame(columns=["timestamp","low","high","open","close","volume"])
        else:
            frame=fetch_coinbase_candles(product,_iso(cursor),_iso(chunk_end),granularity)
            if chunk_path: chunk_path.write_text(frame.to_json(orient="records"))
        if pause_seconds: time.sleep(pause_seconds)
        return frame

    with ThreadPoolExecutor(max_workers=max(1,min(8,workers))) as pool:
        futures=[pool.submit(load_chunk,bounds) for bounds in chunks]
        for completed,future in enumerate(as_completed(futures),1):
            frames.append(future.result())
            if completed%250==0 or completed==len(futures): print(f"Coinbase chunks {completed}/{len(futures)}",flush=True)
    frames=[frame for frame in frames if not frame.empty]
    if not frames: return pd.DataFrame(columns=["timestamp","open","high","low","close","volume"])
    combined=pd.concat(frames,ignore_index=True); combined["timestamp"]=pd.to_numeric(combined["timestamp"],errors="raise").astype("int64")
    return combined.sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)

def fetch_kraken_candles(pair: str, since_seconds: int, interval_minutes: int=1):
    import pandas as pd
    url="https://api.kraken.com/0/public/OHLC?"+urlencode({"pair":pair,"interval":interval_minutes,"since":since_seconds})
    body=_public_json(url)
    if body.get("error"): raise RuntimeError(f"Kraken OHLC: {body['error']}")
    result=body["result"]; key=next(key for key in result if key!="last")
    rows=[{"timestamp":int(r[0])*1000,"open":float(r[1]),"high":float(r[2]),"low":float(r[3]),"close":float(r[4]),"volume":float(r[6])} for r in result[key]]
    return pd.DataFrame(rows).sort_values("timestamp").drop_duplicates("timestamp"),int(result["last"])

def fetch_geckoterminal_candles(pool_address: str, before_seconds: int | None=None, pages: int=1):
    """Fetch Solana pool 5-minute OHLCV pages (up to 1,000 rows/page)."""
    import pandas as pd
    frames=[]; before=before_seconds
    for _ in range(max(1,pages)):
        params={"aggregate":5,"limit":1000,"currency":"usd","token":"base"}
        if before is not None: params["before_timestamp"]=before
        url=f"https://api.geckoterminal.com/api/v2/networks/solana/pools/{pool_address}/ohlcv/minute?"+urlencode(params)
        body=_public_json(url)
        raw=body.get("data",{}).get("attributes",{}).get("ohlcv_list",[])
        if not raw: break
        frames.append(pd.DataFrame([{"timestamp":int(r[0])*1000,"open":r[1],"high":r[2],"low":r[3],"close":r[4],"volume":r[5]} for r in raw]))
        before=min(int(r[0]) for r in raw)-1
    if not frames: return pd.DataFrame(columns=["timestamp","open","high","low","close","volume"])
    return pd.concat(frames,ignore_index=True).sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)

def history_span_days(frame) -> float:
    if len(frame)<2: return 0.0
    return (float(frame["timestamp"].max())-float(frame["timestamp"].min()))/86_400_000

def cache_symbol(frame, symbol: str, source: str, cache_dir: Path, granularity_sec: int, min_history_days: int=0) -> Path | None:
    """Write one source per symbol; short-history Tier B assets return None."""
    if history_span_days(frame)<min_history_days: return None
    path=cache_dir/f"{symbol}.parquet"
    meta_path=path.with_suffix(path.suffix+".meta.json")
    if meta_path.exists():
        prior=DataProvenance(**json.loads(meta_path.read_text()))
        if prior.source!=source: raise ValueError(f"refusing to mix {prior.source} and {source} for {symbol}")
    write_parquet_cache(frame,path,DataProvenance(symbol,source,utc_now(),granularity_sec))
    return path

def refresh_coinbase_cache(path: Path, product: str, through_ms: int, pause_seconds: float=.12):
    """Append only missing closed minutes to an existing Coinbase Parquet."""
    import pandas as pd
    frame,provenance=read_parquet_cache(path)
    if provenance.source!="coinbase": raise ValueError(f"cannot refresh {provenance.source} cache from Coinbase")
    last=int(frame["timestamp"].max()) if len(frame) else through_ms
    start=last+provenance.granularity_sec*1000
    if start>through_ms: return frame,provenance
    fresh=fetch_coinbase_history(product,start,through_ms,provenance.granularity_sec,pause_seconds=pause_seconds,workers=1)
    if len(fresh): frame=pd.concat([frame,fresh],ignore_index=True).sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)
    next_provenance=DataProvenance(provenance.symbol,provenance.source,utc_now(),provenance.granularity_sec)
    write_parquet_cache(frame,path,next_provenance); return frame,next_provenance

def build_training_npz(frame, output: Path, h_pct: float=2.5, cost_bps: float=77.0, keep_vertical: bool=True, *, symbol: str="unknown", source: str="unknown", granularity_sec: int=0, asset_class: str="major") -> int:
    """Turn one symbol's OHLCV into 96-event windows + exact TB labels."""
    import numpy as np
    from .events import CusumState,cusum_step
    from .features import feature_frame
    from .labels import triple_barrier_label
    clean=frame.sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)
    if len(clean)<2: raise ValueError("need at least two OHLCV rows")
    state=CusumState(last_price=float(clean.iloc[0]["close"])); event_indexes=[]; directions=[]
    for index in range(1,len(clean)):
        row=clean.iloc[index]; event=cusum_step(state,float(row["close"]),h_pct,int(row["timestamp"]))
        if event: event_indexes.append(index); directions.append(1 if event["direction"]=="up" else -1)
    if len(event_indexes)<121: raise ValueError(f"need at least 121 CUSUM events; got {len(event_indexes)}")
    event_bars=clean.iloc[event_indexes].reset_index(drop=True)
    features=feature_frame(event_bars).ffill().fillna(0).to_numpy(dtype="float32")
    x=[]; y=[]; event_ts=[]; barrier_end=[]; kept_directions=[]; gross=[]; barrier_bps=2.2*h_pct*100
    for event_index in range(95,len(event_bars)-24):
        entry=float(event_bars.iloc[event_index]["close"])
        future=[{"h":r.high,"l":r.low,"c":r.close} for r in event_bars.iloc[event_index+1:event_index+25].itertuples()]
        label=triple_barrier_label(entry,barrier_bps,24,future,keep_vertical=keep_vertical)
        if label is None: continue
        hit=event_index+1+int(label["hit_index"]); exit_close=float(event_bars.iloc[hit]["close"])
        realized=((exit_close-entry)/entry)*10_000 if label["vertical"] else float(label["label"])*barrier_bps
        x.append(features[event_index-95:event_index+1]); y.append(1 if label["label"]>0 else 0); event_ts.append(int(event_bars.iloc[event_index]["timestamp"])); barrier_end.append(int(event_bars.iloc[hit]["timestamp"])); kept_directions.append(directions[event_index]); gross.append(realized)
    output.parent.mkdir(parents=True,exist_ok=True)
    np.savez(output,x=np.asarray(x,dtype="float32"),y=np.asarray(y,dtype="float32"),event_ts_ms=np.asarray(event_ts,dtype="int64"),barrier_end_ts_ms=np.asarray(barrier_end,dtype="int64"),direction=np.asarray(kept_directions,dtype="int8"),gross_bps=np.asarray(gross,dtype="float32"),cost_bps=float(cost_bps),h_pct=float(h_pct),symbol=symbol,source=source,granularity_sec=int(granularity_sec),asset_class=asset_class,history_span_days=float(history_span_days(clean)))
    return len(y)

def read_replay_json(path: Path):
    """Reuse the deterministic TS replay cache without duplicating a download."""
    import pandas as pd
    body=json.loads(path.read_text()); series=body["series"]
    if len(series)!=1: raise ValueError("ML preparation accepts one symbol per run")
    row=series[0]; frame=pd.DataFrame([{"timestamp":bar["ts_ms"],"open":bar["o"],"high":bar["h"],"low":bar["l"],"close":bar["c"],"volume":bar["volume"]} for bar in row["bars"]])
    return frame,DataProvenance(row["symbol"],row["source"],body.get("fetched_at",utc_now()),int(row["granularity_sec"]))

def utc_now() -> str: return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _parse_iso_ms(value: str) -> int:
    return int(datetime.fromisoformat(value.replace("Z","+00:00")).timestamp()*1000)

def main():
    import argparse
    parser=argparse.ArgumentParser(description="Acquire one-source OHLCV and prepare CUSUM/TB training windows")
    source=parser.add_mutually_exclusive_group(required=True); source.add_argument("--replay-json"); source.add_argument("--coinbase-product"); source.add_argument("--gecko-pool")
    parser.add_argument("--symbol",default="SOL-USD"); parser.add_argument("--from",dest="from_iso"); parser.add_argument("--to",dest="to_iso"); parser.add_argument("--granularity",type=int,default=60); parser.add_argument("--gecko-pages",type=int,default=1); parser.add_argument("--workers",type=int,default=4)
    parser.add_argument("--asset-class",choices=["major","tier_b"],default="major"); parser.add_argument("--h-pct",type=float,default=2.5); parser.add_argument("--cost-bps",type=float,default=77); parser.add_argument("--out",default="out/ml/training-data.npz"); parser.add_argument("--cache-dir",default="out/cache/ohlcv")
    args=parser.parse_args()
    if args.replay_json:
        frame,provenance=read_replay_json(Path(args.replay_json))
    elif args.coinbase_product:
        if not args.from_iso or not args.to_iso: parser.error("Coinbase requires --from and --to")
        chunk_dir=Path(args.cache_dir)/".chunks"/args.symbol
        frame=fetch_coinbase_history(args.coinbase_product,_parse_iso_ms(args.from_iso),_parse_iso_ms(args.to_iso),args.granularity,chunk_cache_dir=chunk_dir,workers=args.workers)
        provenance=DataProvenance(args.symbol,"coinbase",utc_now(),args.granularity)
    else:
        frame=fetch_geckoterminal_candles(args.gecko_pool,pages=args.gecko_pages)
        provenance=DataProvenance(args.symbol,"geckoterminal",utc_now(),300)
    cache=cache_symbol(frame,args.symbol,provenance.source,Path(args.cache_dir),provenance.granularity_sec,min_history_days=180 if args.asset_class=="tier_b" else 0)
    if cache is None: raise SystemExit("excluded: Tier B history is shorter than six months")
    events=build_training_npz(frame,Path(args.out),args.h_pct,args.cost_bps,symbol=args.symbol,source=provenance.source,granularity_sec=provenance.granularity_sec,asset_class=args.asset_class)
    if args.coinbase_product: shutil.rmtree(chunk_dir,ignore_errors=True)
    print(json.dumps({"symbol":args.symbol,"source":provenance.source,"bars":len(frame),"history_span_days":history_span_days(frame),"events":events,"cache":str(cache),"training_data":args.out},indent=2))

if __name__=="__main__": main()
