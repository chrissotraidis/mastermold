from __future__ import annotations
from dataclasses import dataclass
import numpy as np

EMA_WINDOWS = [5,10,15,20,50]
RSI_WINDOWS = [6,10,14]

def _rsi(close, n):
    delta=close.diff(); up=delta.clip(lower=0).ewm(alpha=1/n,adjust=False).mean(); down=(-delta.clip(upper=0)).ewm(alpha=1/n,adjust=False).mean()
    return 100 - 100/(1 + up/down.replace(0,np.nan))

def feature_frame(frame):
    import pandas as pd
    f = pd.DataFrame(index=frame.index)
    for name in ["open","high","low","close","volume"]: f[name]=frame[name].astype(float)
    close=f["close"]
    for n in EMA_WINDOWS: f[f"ema_{n}"]=close.ewm(span=n,adjust=False).mean()
    for n in EMA_WINDOWS: f[f"std_{n}"]=close.rolling(n).std()
    macd=close.ewm(span=12,adjust=False).mean()-close.ewm(span=26,adjust=False).mean(); signal=macd.ewm(span=9,adjust=False).mean()
    # The frozen 33-feature block carries MACD and its signal line. The
    # histogram is exactly their difference and would make this 34 features,
    # so it is deliberately omitted rather than adding a redundant input.
    f["macd"]=macd; f["macd_signal"]=signal
    for n in RSI_WINDOWS: f[f"rsi_{n}"]=_rsi(close,n)
    lo=f["low"].rolling(14).min(); hi=f["high"].rolling(14).max(); f["stoch_k_14"]=100*(close-lo)/(hi-lo); f["stoch_d_14"]=f["stoch_k_14"].rolling(3).mean(); f["williams_r_14"]=-100*(hi-close)/(hi-lo)
    mid=close.rolling(5).mean(); std=close.rolling(5).std(); f["bb_mid_5"]=mid; f["bb_upper_5"]=mid+2*std; f["bb_lower_5"]=mid-2*std
    f["bar_return"]=close.pct_change()
    multiplier=((close-f["low"])-(f["high"]-close))/(f["high"]-f["low"]).replace(0,np.nan); f["cmf_21"]=(multiplier*f["volume"]).rolling(21).sum()/f["volume"].rolling(21).sum()
    typical=(f["high"]+f["low"]+close)/3; money=typical*f["volume"]; positive=money.where(typical.diff()>0,0).rolling(14).sum(); negative=money.where(typical.diff()<0,0).rolling(14).sum(); f["mfi_14"]=100-100/(1+positive/negative.replace(0,np.nan))
    ts=pd.to_datetime(frame["timestamp"],unit="ms",utc=True); f["hour_sin"]=np.sin(2*np.pi*ts.dt.hour/24); f["hour_cos"]=np.cos(2*np.pi*ts.dt.hour/24); f["weekday_sin"]=np.sin(2*np.pi*ts.dt.weekday/7); f["weekday_cos"]=np.cos(2*np.pi*ts.dt.weekday/7)
    assert f.shape[1] == 33
    return f.replace([np.inf,-np.inf],np.nan)

@dataclass
class TrainStandardizer:
    mean: np.ndarray
    std: np.ndarray
    @classmethod
    def fit(cls, train):
        values=np.asarray(train,dtype=float); spread=np.nanstd(values,axis=0)
        return cls(np.nanmean(values,axis=0), np.where(spread>1e-12,spread,1.0))
    def transform(self, values): return (np.asarray(values,dtype=float)-self.mean)/self.std
