from __future__ import annotations
import argparse, hashlib, io, json
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
from .features import TrainStandardizer
from .model import predict, train_model

SEEDS=[17,29,43]
MIN_EVENTS=800
MIN_REAL_SPAN_DAYS=28

def classification_metrics(probabilities, labels, cost_bps: float, gross_bps=None):
    probabilities=np.asarray(probabilities); labels=np.asarray(labels); take=(probabilities>0.60)|(probabilities<0.40); predictions=(probabilities>0.5).astype(int); selected=predictions[take]==labels[take]
    hit=float(selected.mean()) if selected.size else 0.0
    # gross_bps is the realized UP-direction return. A short receives its
    # negation; a wrong directional call therefore cannot accidentally book
    # the underlying return as profit.
    realized_up=np.asarray(gross_bps) if gross_bps is not None else np.where(labels>0,220.0,-220.0)
    gross=np.where(predictions[take]>0,realized_up[take],-realized_up[take])
    net=float((gross-cost_bps).mean()) if gross.size else None
    return {"trades":int(selected.size),"hit_rate":hit,"net_expectancy_bps":net}

def assert_real_training_gate(event_ts_ms, fixture: bool):
    if fixture: return
    values=np.asarray(event_ts_ms,dtype=np.int64)
    if values.size<MIN_EVENTS: raise ValueError(f"real training requires {MIN_EVENTS} events; got {values.size}")
    span=(values.max()-values.min())/86_400_000
    if span<MIN_REAL_SPAN_DAYS: raise ValueError(f"real training requires {MIN_REAL_SPAN_DAYS} days; got {span:.1f}")

def content_hash(models) -> str:
    import torch
    buffer=io.BytesIO(); torch.save([model.state_dict() for model in models],buffer); return hashlib.sha256(buffer.getvalue()).hexdigest()[:16]

def iso_ms(value: int) -> str:
    return datetime.fromtimestamp(int(value)/1000,tz=timezone.utc).isoformat().replace("+00:00","Z")

def write_model_card(path: Path, payload: dict):
    verdict="DEPLOYABLE" if payload["criterion_passed"] and not payload["fixture"] else "FIXTURE ONLY — NOT DEPLOYABLE" if payload["fixture"] else "REJECTED"
    path.write_text(f"# ML model card\n\n- Model id: `{payload['model_id']}`\n- Dataset: {'fixture' if payload['fixture'] else 'real'}\n- Symbol/source: {payload['symbol']} / {payload['source']}\n- Source granularity: {payload['granularity_sec']} seconds\n- Source history span: {payload['history_span_days']:.1f} days\n- CUSUM training threshold: {payload['h_pct']}%\n- Data contract compliant: {payload['data_compliant']}\n- Events: {payload['events']}\n- Range: {payload['from_ts']} through {payload['to_ts']}\n- First tuning/validation quarter: {payload['first_validation_quarter']}\n- Later held-out events: {payload['heldout_events']}\n- Seeds: {payload['seeds']}\n- Ensemble models: {payload['ensemble_models']}\n- Architecture: 3 residual Conv1d blocks + BatchNorm/ReLU/dropout, LSTM head, sigmoid\n- Frozen filter: long >0.60, short <0.40\n- ML hit/net: {payload['ml_metrics']}\n- Rule hit/net: {payload['rule_metrics']}\n- Frozen success criterion passed: {payload['criterion_passed']}\n- Verdict: **{verdict}**\n\nOperator review is required before writing `APPROVED_MODEL`; the daemon also independently requires 28 days of CUSUM shadow evidence.\n")

def scalar(data, key, default):
    return data[key].item() if key in data else default

def data_contract_compliant(asset_class: str, granularity_sec: int, history_span_days: float, fixture: bool=False) -> bool:
    return bool(fixture or (asset_class=="major" and granularity_sec==60 and history_span_days>=3*365) or (asset_class=="tier_b" and granularity_sec==300 and history_span_days>=180))

def _standardize(train_x, test_x):
    scaler=TrainStandardizer.fit(train_x.reshape(-1,train_x.shape[-1])); return scaler.transform(train_x),scaler.transform(test_x)

def quarter_labels(ts):
    dates=np.asarray(ts,dtype="datetime64[ms]").astype("datetime64[M]")
    return np.array([f"{str(d)[:4]}-Q{(int(str(d)[5:7])-1)//3+1}" for d in dates])

def first_validation_configs(x,y,ts,barrier_end_ts,epochs,fixture):
    base={"channels":8 if fixture else 32,"lstm_hidden":8 if fixture else 32,"dropout":0.2,"kernel_size":3,"learning_rate":1e-3}
    if fixture: return [base],None
    import optuna
    quarters=quarter_labels(ts); unique=list(dict.fromkeys(quarters)); values=np.asarray(ts,dtype=np.int64); ends=np.asarray(barrier_end_ts,dtype=np.int64)
    validation_quarter=None; train_idx=None; val_idx=None
    for quarter in unique[1:]:
        candidate=np.where(quarters==quarter)[0]; start=int(values[candidate].min()); prior=np.where((values<start)&(ends<start))[0]
        if len(prior)>=MIN_EVENTS and len(candidate): validation_quarter=quarter; train_idx=prior; val_idx=candidate; break
    if validation_quarter is None or train_idx is None or val_idx is None: raise ValueError("no first quarterly validation split with 800 purged prior events")
    train_x,val_x=_standardize(x[train_idx],x[val_idx]); train_y,val_y=y[train_idx],y[val_idx]
    def objective(trial):
        config={"channels":trial.suggest_categorical("channels",[16,32,64]),"lstm_hidden":trial.suggest_categorical("lstm_hidden",[16,32,64]),"dropout":trial.suggest_float("dropout",0.1,0.4),"kernel_size":trial.suggest_categorical("kernel_size",[3,5]),"learning_rate":trial.suggest_float("learning_rate",1e-4,3e-3,log=True)}
        model=train_model(train_x,train_y,seed=SEEDS[0],epochs=epochs,validation_x=val_x,validation_y=val_y,trial=trial,**config); p=predict(model,val_x); return float(((p>0.5)==val_y).mean())
    study=optuna.create_study(direction="maximize",sampler=optuna.samplers.TPESampler(seed=SEEDS[0]),pruner=optuna.pruners.HyperbandPruner()); study.optimize(objective,n_trials=9)
    completed=[trial for trial in study.trials if trial.value is not None]
    return [{**base,**trial.params} for trial in sorted(completed,key=lambda trial: trial.value,reverse=True)[:3]],validation_quarter

def heldout_predictions(x,y,ts,configs,seeds,epochs,fixture,barrier_end_ts=None,after_quarter=None):
    if fixture:
        folds=[(np.arange(0,max(2,int(len(y)*0.7))),np.arange(max(2,int(len(y)*0.7)),len(y)))]
    else:
        quarters=quarter_labels(ts); unique=list(dict.fromkeys(quarters)); folds=[]
        embargoes=[]
        ends=np.asarray(barrier_end_ts if barrier_end_ts is not None else ts,dtype=np.int64)
        for quarter in unique[1:]:
            if after_quarter is not None and quarter<=after_quarter: continue
            test=np.where(quarters==quarter)[0]; test_start=int(np.asarray(ts)[test].min()); test_end=int(np.asarray(ts)[test].max())
            train=np.where((np.asarray(ts)<test_start)&(ends<test_start))[0]
            if embargoes: train=np.asarray([i for i in train if not any(int(ts[i])<end and int(ends[i])>=start for start,end in embargoes)])
            if len(train)>=MIN_EVENTS and len(test): folds.append((train,test))
            embargoes.append((test_end,test_end+2*86_400_000))
    if not folds: raise ValueError("no valid expanding walk-forward fold with enough prior events")
    out_p=[]; out_y=[]; out_i=[]
    for train_idx,test_idx in folds:
        train_x,test_x=_standardize(x[train_idx],x[test_idx]); ensemble=[]
        for config in configs:
            for seed in seeds:
                model=train_model(train_x,y[train_idx],seed=seed,epochs=epochs,**config); ensemble.append(predict(model,test_x))
        out_p.extend(np.mean(ensemble,axis=0)); out_y.extend(y[test_idx]); out_i.extend(test_idx)
    return np.asarray(out_p),np.asarray(out_y),np.asarray(out_i)

def run_training(data_path: Path, out_dir: Path, fixture: bool=False, seeds=SEEDS, epochs: int=2):
    data=np.load(data_path); x=data["x"]; y=data["y"]; ts=data["event_ts_ms"]; cost=float(data["cost_bps"] if "cost_bps" in data else 77)
    symbol=str(scalar(data,"symbol","fixture" if fixture else "unknown")); source=str(scalar(data,"source","fixture" if fixture else "unknown")); granularity=int(scalar(data,"granularity_sec",0)); asset_class=str(scalar(data,"asset_class","fixture" if fixture else "major")); history_span=float(scalar(data,"history_span_days",(int(ts.max())-int(ts.min()))/86_400_000)); h_pct=float(scalar(data,"h_pct",2.5))
    data_compliant=data_contract_compliant(asset_class,granularity,history_span,fixture)
    assert x.ndim==3 and x.shape[1:]==(96,33); assert_real_training_gate(ts,fixture)
    # Hyperparameters are frozen before held-out scoring. Fixture mode uses the
    # minimal cell; real mode's Optuna/Hyperband search is confined to the first 20% validation split.
    barrier_ends=data["barrier_end_ts_ms"] if "barrier_end_ts_ms" in data else ts
    configs,validation_quarter=first_validation_configs(x,y,ts,barrier_ends,epochs,fixture)
    ensemble,held_y,held_idx=heldout_predictions(x,y,ts,configs,seeds,epochs,fixture,barrier_ends,validation_quarter)
    gross=data["gross_bps"] if "gross_bps" in data else np.where(y>0,220.0,-220.0)
    ml=classification_metrics(ensemble,held_y,cost,gross[held_idx])
    directions=data["direction"] if "direction" in data else np.ones_like(y); rule_prob=np.where(directions[held_idx]>0,0.61,0.39); rule=classification_metrics(rule_prob,held_y,cost,gross[held_idx])
    passed=bool(data_compliant and ml["net_expectancy_bps"] is not None and rule["net_expectancy_bps"] is not None and ml["hit_rate"]>rule["hit_rate"] and ml["net_expectancy_bps"]>rule["net_expectancy_bps"])
    full_scaler=TrainStandardizer.fit(x.reshape(-1,x.shape[-1])); full_x=full_scaler.transform(x)
    models=[train_model(full_x,y,seed=seed,epochs=epochs,**config) for config in configs for seed in seeds]
    model_id=content_hash(models); out_dir.mkdir(parents=True,exist_ok=True)
    import torch
    torch.save({"state_dicts":[model.state_dict() for model in models],"configs":[config for config in configs for _ in seeds],"model_id":model_id,"mean":full_scaler.mean,"std":full_scaler.std,"trained_through":iso_ms(int(ts.max())),"h_pct":h_pct},out_dir/f"{model_id}.pt")
    payload={"model_id":model_id,"fixture":fixture,"symbol":symbol,"source":source,"granularity_sec":granularity,"history_span_days":history_span,"h_pct":h_pct,"data_compliant":data_compliant,"events":len(y),"from_ts":iso_ms(int(ts.min())),"to_ts":iso_ms(int(ts.max())),"first_validation_quarter":validation_quarter,"heldout_events":len(held_y),"seeds":list(seeds),"configs":configs,"ensemble_models":len(models),"ml_metrics":ml,"rule_metrics":rule,"criterion_passed":passed}
    write_model_card(out_dir.parent/"MODELCARD.md",payload); (out_dir.parent/"training-result.json").write_text(json.dumps(payload,sort_keys=True,allow_nan=False)+"\n")
    return payload

def main():
    parser=argparse.ArgumentParser(); parser.add_argument("--data",required=True); parser.add_argument("--out",default="out/ml/models"); parser.add_argument("--fixture",action="store_true"); parser.add_argument("--epochs",type=int,default=2); args=parser.parse_args()
    print(json.dumps(run_training(Path(args.data),Path(args.out),args.fixture,[17] if args.fixture else SEEDS,args.epochs),indent=2))
if __name__=="__main__": main()
