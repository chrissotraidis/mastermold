from __future__ import annotations
import json, math
from pathlib import Path
import numpy as np
import pytest

from ml import data as data_module
from ml.data import DataProvenance, ensure_single_source, fetch_coinbase_history, read_parquet_cache, write_parquet_cache
from ml.events import CusumState, cusum_step, extract_events
from ml.features import TrainStandardizer, feature_frame
from ml.infer import append_signal
from ml.labels import EventWindow, assert_no_overlap, purged_walk_forward_splits, triple_barrier_label

FIXTURES=Path(__file__).parents[1]/"ml"/"fixtures"

def test_cusum_fixture_parity():
    body=json.loads((FIXTURES/"cusum-parity.json").read_text())
    for case in body["cases"]:
        actual=extract_events(case["prices"],case["h_pct"])
        for row in actual: row["magnitude"]=round(row["magnitude"],12)
        assert actual==case["events"]

def test_barrier_fixture_parity_and_vertical_grid():
    body=json.loads((FIXTURES/"barrier-parity.json").read_text())
    for case in body["cases"]: assert triple_barrier_label(case["entry_price"],case["max_loss_bps"],case["horizon_bars"],case["bars"])==case["expected"]
    vertical=next(case for case in body["cases"] if case["name"]=="vertical-positive")
    assert triple_barrier_label(vertical["entry_price"],vertical["max_loss_bps"],24,vertical["bars"],keep_vertical=False) is None

def test_purging_and_two_day_embargo_have_no_overlap():
    day=86_400_000; windows=[EventWindow(i*day,(i+3)*day) for i in range(20)]
    splits=purged_walk_forward_splits(windows,[(8*day,11*day),(14*day,17*day)])
    for split in splits: assert_no_overlap(windows,split)
    assert all(windows[i].end_ms<8*day for i in splits[0]["train"])
    assert all(not (11*day<=windows[i].start_ms<13*day) for i in splits[1]["train"])

def test_33_features_and_train_only_standardization():
    pd=pytest.importorskip("pandas"); n=140; ts=np.arange(n)*60_000
    close=100+np.sin(np.arange(n)/9)+np.arange(n)*.01
    frame=pd.DataFrame({"timestamp":ts,"open":close-.1,"high":close+.3,"low":close-.3,"close":close,"volume":1000+np.arange(n)})
    features=feature_frame(frame); assert features.shape[1]==33
    train=features.iloc[60:110].fillna(0).to_numpy(); test=features.iloc[110:].fillna(0).to_numpy()+1000
    scaler=TrainStandardizer.fit(train); assert np.allclose(np.nanmean(scaler.transform(train),axis=0),0,atol=1e-7)
    assert np.nanmean(scaler.transform(test))>1 # future values did not leak into train stats

def test_parquet_cache_provenance_and_source_consistency(tmp_path):
    pd=pytest.importorskip("pandas"); pytest.importorskip("pyarrow")
    path=tmp_path/"SOL.parquet"; provenance=DataProvenance("SOL","coinbase","2026-07-12T00:00:00Z",60)
    write_parquet_cache(pd.DataFrame({"timestamp":[1],"open":[1],"high":[1],"low":[1],"close":[1],"volume":[1]}),path,provenance)
    frame,read=read_parquet_cache(path); assert len(frame)==1 and read==provenance
    with pytest.raises(ValueError): ensure_single_source([provenance,DataProvenance("SOL","kraken","x",60)])

def test_coinbase_chunk_cache_is_resumable_and_deduplicates_boundaries(tmp_path,monkeypatch):
    pd=pytest.importorskip("pandas"); calls=[]
    def fake(product,start_iso,end_iso,granularity):
        from datetime import datetime
        start=int(datetime.fromisoformat(start_iso.replace("Z","+00:00")).timestamp()*1000); end=int(datetime.fromisoformat(end_iso.replace("Z","+00:00")).timestamp()*1000); calls.append((start,end))
        return pd.DataFrame({"timestamp":[start,end],"low":[1,1],"high":[1,1],"open":[1,1],"close":[1,1],"volume":[1,1]})
    monkeypatch.setattr(data_module,"fetch_coinbase_candles",fake); cache=tmp_path/"chunks"
    first=fetch_coinbase_history("SOL-USD",0,36_000_000,60,pause_seconds=0,chunk_cache_dir=cache,workers=2); assert len(calls)==2 and first.timestamp.tolist()==[0,18_000_000,36_000_000]
    calls.clear(); second=fetch_coinbase_history("SOL-USD",0,36_000_000,60,pause_seconds=0,chunk_cache_dir=cache,workers=2); assert calls==[] and second.equals(first)

def test_incremental_coinbase_refresh_preserves_source_and_appends_only_new_rows(tmp_path,monkeypatch):
    pd=pytest.importorskip("pandas"); path=tmp_path/"SOL.parquet"; provenance=DataProvenance("SOL-USD","coinbase","old",60)
    write_parquet_cache(pd.DataFrame({"timestamp":[0,60_000],"open":[1,1],"high":[1,1],"low":[1,1],"close":[1,1],"volume":[1,1]}),path,provenance); calls=[]
    def fake(product,start,end,granularity,pause_seconds=.12,workers=1):
        calls.append((start,end,granularity)); return pd.DataFrame({"timestamp":[120_000,180_000],"open":[1,1],"high":[1,1],"low":[1,1],"close":[1,1],"volume":[1,1]})
    monkeypatch.setattr(data_module,"fetch_coinbase_history",fake); frame,meta=data_module.refresh_coinbase_cache(path,"SOL-USD",180_000,pause_seconds=0)
    assert calls==[(120_000,180_000,60)] and frame["timestamp"].tolist()==[0,60_000,120_000,180_000] and meta.source=="coinbase"

def test_frozen_data_contract_boundaries():
    from ml.train import data_contract_compliant
    assert data_contract_compliant("major",60,1095) is True
    assert data_contract_compliant("major",300,1096) is False
    assert data_contract_compliant("major",60,1094.99) is False
    assert data_contract_compliant("tier_b",300,180) is True
    assert data_contract_compliant("tier_b",60,365) is False

def test_signal_jsonl_is_append_only_and_validated(tmp_path):
    path=tmp_path/"signals.jsonl"; signal={"mint":"m","event_ts":1,"p_up":.7,"model_id":"id","trained_through":"2026-07-01T00:00:00Z","scored_at":"2026-07-12T00:00:00Z"}
    append_signal(path,signal); append_signal(path,{**signal,"event_ts":2}); assert len(path.read_text().splitlines())==2
    with pytest.raises(ValueError): append_signal(path,{**signal,"p_up":2})

def test_incremental_inference_cursor_matches_full_cusum_extraction():
    pd=pytest.importorskip("pandas"); from ml.infer import _advance_events
    close=np.where(np.arange(160)%2==0,100.0,103.0); frame=pd.DataFrame({"timestamp":np.arange(160,dtype="int64")*60_000,"open":close,"high":close*1.001,"low":close*.999,"close":close,"volume":1000.0})
    full,_=_advance_events(frame,2.5); first,state=_advance_events(frame.iloc[:80].reset_index(drop=True),2.5); second,state=_advance_events(frame.iloc[80:].reset_index(drop=True),2.5,state)
    incremental=pd.concat([first,second],ignore_index=True)
    assert incremental["timestamp"].tolist()==full["timestamp"].tolist() and state.events==len(full)

def test_asof_window_uses_latest_python_events_but_keeps_daemon_event_key():
    pd=pytest.importorskip("pandas"); from ml.infer import _advance_events,event_window_asof
    close=np.where(np.arange(140)%2==0,100.0,103.0); frame=pd.DataFrame({"timestamp":np.arange(140,dtype="int64")*60_000,"open":close,"high":close*1.001,"low":close*.999,"close":close,"volume":1000.0}); events,_=_advance_events(frame,2.5)
    daemon_ts=int(events.iloc[-1]["timestamp"])+20_000; window=event_window_asof(events,daemon_ts,np.zeros(33),np.ones(33)); assert window.shape==(1,96,33)

def test_tiny_resnet_lstm_training_writes_fixture_only_modelcard(tmp_path):
    pytest.importorskip("torch")
    from ml.train import run_training
    rng=np.random.default_rng(7); x=rng.normal(size=(20,96,33)).astype("float32"); y=np.asarray([0,1]*10,dtype="float32"); ts=np.arange(20,dtype="int64")*86_400_000
    data=tmp_path/"tiny.npz"; np.savez(data,x=x,y=y,event_ts_ms=ts,direction=np.where(y>0,1,-1),gross_bps=np.where(y>0,220,-220),cost_bps=20)
    result=run_training(data,tmp_path/"ml"/"models",fixture=True,seeds=[17],epochs=1)
    card=(tmp_path/"ml"/"MODELCARD.md").read_text(); assert result["fixture"] is True and "FIXTURE ONLY — NOT DEPLOYABLE" in card
    # End to end: cached OHLCV -> exact Python CUSUM event -> checkpoint
    # ensemble -> append-only signal consumed by the TypeScript contract tests.
    pd=pytest.importorskip("pandas"); from ml.infer import append_signal, load_checkpoint, process_event_requests_once, score_event
    event_ts=np.arange(140,dtype="int64")*300_000; close=np.where(np.arange(140)%2==0,100.0,103.0)
    cache=tmp_path/"SOL.parquet"; pd.DataFrame({"timestamp":event_ts,"open":close,"high":close*1.001,"low":close*.999,"close":close,"volume":1000.0}).to_parquet(cache,index=False)
    model=tmp_path/"ml"/"models"/f"{result['model_id']}.pt"; row=score_event(model,cache,"mint",int(event_ts[-1]),h_pct=2.5)
    signals=tmp_path/"ml"/"signals.jsonl"; append_signal(signals,row)
    written=json.loads(signals.read_text()); assert written["model_id"]==result["model_id"] and 0<=written["p_up"]<=1 and written["event_ts"]==int(event_ts[-1])
    requests=tmp_path/"ml"/"events.jsonl"; daemon_event=int(event_ts[-1])+20_000; requests.write_text(json.dumps({"mint":"mint","event_ts":daemon_event})+"\n"); contract_signals=tmp_path/"ml"/"contract-signals.jsonl"; checkpoint,models=load_checkpoint(model)
    offset,count=process_event_requests_once(requests,0,contract_signals,checkpoint,models,cache,"mint"); contract=json.loads(contract_signals.read_text())
    assert offset==requests.stat().st_size and count==1 and contract["event_ts"]==daemon_event and contract["model_id"]==result["model_id"]
