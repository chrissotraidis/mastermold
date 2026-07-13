from __future__ import annotations
import argparse, json, time
from datetime import datetime, timezone
from pathlib import Path
import numpy as np

from .features import feature_frame
from .model import build_resnet_lstm, predict
from .events import CusumState, cusum_step
from .data import refresh_coinbase_cache

def append_signal(path: Path, signal: dict) -> None:
    required={"mint","event_ts","p_up","model_id","trained_through","scored_at"}
    if set(signal)<required or not 0<=float(signal["p_up"])<=1: raise ValueError("invalid ML signal")
    path.parent.mkdir(parents=True,exist_ok=True)
    with path.open("a",encoding="utf-8") as handle: handle.write(json.dumps(signal,sort_keys=True,separators=(",",":"))+"\n")

def load_checkpoint(path: Path):
    import torch
    checkpoint=torch.load(path,map_location="cpu",weights_only=False); models=[]
    state_dicts=checkpoint.get("state_dicts") or [checkpoint["state_dict"]]
    configs=checkpoint.get("configs") or [checkpoint["config"]]
    for state_dict,config in zip(state_dicts,configs):
        architecture={key:value for key,value in config.items() if key!="learning_rate"}
        model=build_resnet_lstm(**architecture); model.load_state_dict(state_dict); model.eval(); models.append(model)
    return checkpoint,models

def _ordered_raw(cache_path: Path):
    import pandas as pd
    return pd.read_parquet(cache_path).sort_values("timestamp").drop_duplicates("timestamp").reset_index(drop=True)

def _advance_events(frame, h_pct: float, state: CusumState | None=None):
    """Advance only unseen raw bars; returned state is owned by the caller."""
    import pandas as pd
    if frame.empty: return frame.copy(),state or CusumState()
    start=0
    if state is None:
        state=CusumState(last_price=float(frame.iloc[0]["close"])); start=1
    rows=[]
    for row in frame.iloc[start:].itertuples(index=False):
        if cusum_step(state,float(row.close),h_pct,int(row.timestamp)): rows.append(row._asdict())
    return pd.DataFrame(rows,columns=frame.columns),state

def _event_frame(cache_path: Path, h_pct: float):
    events,_=_advance_events(_ordered_raw(cache_path),h_pct)
    return events

def event_window_from_frame(events, event_ts: int, mean, std):
    matches=np.where(events["timestamp"].to_numpy()==event_ts)[0]
    if len(matches)!=1: raise ValueError(f"{event_ts} is not an exact Python CUSUM event")
    position=int(matches[0]); through=events.iloc[:position+1]
    features=feature_frame(through).ffill().fillna(0).to_numpy(dtype="float32")
    if len(features)<96: raise ValueError(f"need 96 event bars through {event_ts}; got {len(features)}")
    window=features[-96:]; scale=np.where(np.asarray(std)>0,np.asarray(std),1.0)
    return ((window-np.asarray(mean))/scale).astype("float32")[None,:,:]

def event_window_asof(events, event_ts: int, mean, std):
    eligible=events[events["timestamp"]<=event_ts]
    if len(eligible)<96: raise ValueError(f"need 96 event bars through {event_ts}; got {len(eligible)}")
    features=feature_frame(eligible).ffill().fillna(0).to_numpy(dtype="float32"); window=features[-96:]; scale=np.where(np.asarray(std)>0,np.asarray(std),1.0)
    return ((window-np.asarray(mean))/scale).astype("float32")[None,:,:]

def event_window_from_cache(cache_path: Path, event_ts: int, mean, std, h_pct: float=2.5):
    return event_window_from_frame(_event_frame(cache_path,h_pct),event_ts,mean,std)

def _score_loaded(checkpoint,models,events,mint: str,event_ts: int,scored_at: str | None=None) -> dict:
    window=event_window_from_frame(events,event_ts,checkpoint["mean"],checkpoint["std"])
    p_up=float(np.mean([predict(model,window)[0] for model in models]))
    return {"mint":mint,"event_ts":int(event_ts),"p_up":p_up,"model_id":checkpoint["model_id"],"trained_through":checkpoint["trained_through"],"scored_at":scored_at or datetime.now(timezone.utc).isoformat().replace("+00:00","Z")}

def _score_asof_loaded(checkpoint,models,events,mint: str,event_ts: int,scored_at: str | None=None) -> dict:
    window=event_window_asof(events,event_ts,checkpoint["mean"],checkpoint["std"]); p_up=float(np.mean([predict(model,window)[0] for model in models]))
    return {"mint":mint,"event_ts":int(event_ts),"p_up":p_up,"model_id":checkpoint["model_id"],"trained_through":checkpoint["trained_through"],"scored_at":scored_at or datetime.now(timezone.utc).isoformat().replace("+00:00","Z")}

def score_event(model_path: Path, cache_path: Path, mint: str, event_ts: int, scored_at: str | None=None, h_pct: float=2.5) -> dict:
    checkpoint,models=load_checkpoint(model_path)
    return _score_loaded(checkpoint,models,_event_frame(cache_path,h_pct),mint,event_ts,scored_at)

def process_event_requests_once(events_path: Path, offset: int, signal_path: Path, checkpoint, models, cache_path: Path, mint: str, product: str | None=None, max_cache_lag_ms: int=5*60_000):
    if not events_path.exists(): return offset,0
    h_pct=float(checkpoint.get("h_pct",2.5)); written=0
    with events_path.open("r",encoding="utf-8") as handle:
        handle.seek(offset)
        while line:=handle.readline():
            try:
                event=json.loads(line)
                if event.get("mint")!=mint: continue
                event_ts=int(event["event_ts"])
                if product: refresh_coinbase_cache(cache_path,product,event_ts)
                raw=_ordered_raw(cache_path)
                if raw.empty or event_ts-int(raw["timestamp"].max())>max_cache_lag_ms: continue
                events=_event_frame(cache_path,h_pct)
                append_signal(signal_path,_score_asof_loaded(checkpoint,models,events,mint,event_ts)); written+=1
            except Exception as error:
                print(f"ML event skipped safely: {type(error).__name__}: {error}",flush=True)
        return handle.tell(),written

def watch_events(events_path: Path, signal_path: Path, model_path: Path, cache_path: Path, mint: str, product: str | None=None, poll_seconds: float=1.0, max_cache_lag_ms: int=5*60_000) -> None:
    """Tail exact TS event keys; scheduling owns this process, never daemon."""
    offset=0; checkpoint,models=load_checkpoint(model_path)
    while True:
        offset,_=process_event_requests_once(events_path,offset,signal_path,checkpoint,models,cache_path,mint,product,max_cache_lag_ms)
        time.sleep(poll_seconds)

def watch_cache(signal_path: Path, model_path: Path, cache_path: Path, mint: str, h_pct: float=2.5, poll_seconds: float=5.0) -> None:
    """Score only newly appended raw bars; never rescan history each poll."""
    import pandas as pd
    checkpoint,models=load_checkpoint(model_path); events=pd.DataFrame(); state=None; last_ts=None; last_mtime=None
    if cache_path.exists():
        raw=_ordered_raw(cache_path); events,state=_advance_events(raw,h_pct); last_ts=int(raw["timestamp"].max()) if len(raw) else None; last_mtime=cache_path.stat().st_mtime_ns
    while True:
        if cache_path.exists():
            mtime=cache_path.stat().st_mtime_ns
            if last_mtime is None or mtime!=last_mtime:
                raw=_ordered_raw(cache_path)
                # Append-only is the contract. A replacement that drops the
                # cursor fails closed by rebuilding its baseline and emitting
                # no historical scores.
                if last_ts is None or not bool((raw["timestamp"]==last_ts).any()):
                    events,state=_advance_events(raw,h_pct); last_ts=int(raw["timestamp"].max()) if len(raw) else None
                else:
                    tail=raw[raw["timestamp"]>last_ts].reset_index(drop=True); new_events,state=_advance_events(tail,h_pct,state)
                    if len(new_events):
                        events=pd.concat([events,new_events],ignore_index=True)
                        for event_ts in new_events["timestamp"].astype("int64").tolist():
                            try: append_signal(signal_path,_score_loaded(checkpoint,models,events,mint,int(event_ts)))
                            except ValueError: continue
                    if len(raw): last_ts=int(raw["timestamp"].max())
                last_mtime=mtime
        time.sleep(poll_seconds)

def main():
    parser=argparse.ArgumentParser(description="CUSUM scorer; scheduling owns this process, never the trading daemon.")
    parser.add_argument("--out",default="out/ml/signals.jsonl"); parser.add_argument("--model"); parser.add_argument("--cache"); parser.add_argument("--mint"); parser.add_argument("--product",help="Coinbase product used to refresh cache before event scoring"); parser.add_argument("--event-ts",type=int); parser.add_argument("--watch-events",help="append-only exact daemon event request file"); parser.add_argument("--watch-cache",action="store_true"); parser.add_argument("--h-pct",type=float,default=2.5)
    parser.add_argument("--signal",help="Validation/test seam: append an already-scored JSON payload")
    args=parser.parse_args()
    if args.signal: append_signal(Path(args.out),json.loads(args.signal)); return
    if not (args.model and args.cache and args.mint): parser.error("--model, --cache, and --mint are required for scoring")
    if args.watch_cache: watch_cache(Path(args.out),Path(args.model),Path(args.cache),args.mint,args.h_pct); return
    if args.watch_events: watch_events(Path(args.watch_events),Path(args.out),Path(args.model),Path(args.cache),args.mint,args.product); return
    if args.event_ts is None: parser.error("--event-ts or --watch-events is required")
    append_signal(Path(args.out),score_event(Path(args.model),Path(args.cache),args.mint,args.event_ts,h_pct=args.h_pct))
if __name__=="__main__": main()
