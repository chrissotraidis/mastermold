from __future__ import annotations

def _torch():
    import torch
    return torch

class ResidualBlock:
    """Factory wrapper keeps importing ml.model safe when torch is absent."""
    @staticmethod
    def build(channels: int, kernel_size: int, dropout: float):
        torch = _torch(); nn = torch.nn; padding = kernel_size // 2
        class Block(nn.Module):
            def __init__(self):
                super().__init__(); self.net=nn.Sequential(nn.Conv1d(channels,channels,kernel_size,padding=padding),nn.BatchNorm1d(channels),nn.ReLU(),nn.Dropout(dropout),nn.Conv1d(channels,channels,kernel_size,padding=padding),nn.BatchNorm1d(channels))
            def forward(self,x): return torch.relu(x+self.net(x))
        return Block()

def build_resnet_lstm(input_features: int = 33, channels: int = 32, lstm_hidden: int = 32, dropout: float = 0.2, kernel_size: int = 3):
    torch=_torch(); nn=torch.nn
    class ResNetLSTM(nn.Module):
        def __init__(self):
            super().__init__(); self.project=nn.Conv1d(input_features,channels,1); self.blocks=nn.Sequential(*[ResidualBlock.build(channels,kernel_size,dropout) for _ in range(3)]); self.lstm=nn.LSTM(channels,lstm_hidden,batch_first=True); self.dropout=nn.Dropout(dropout); self.head=nn.Linear(lstm_hidden,1)
        def forward(self,x):
            z=self.blocks(self.project(x.transpose(1,2))).transpose(1,2); z,_=self.lstm(z); return torch.sigmoid(self.head(self.dropout(z[:,-1,:]))).squeeze(-1)
    return ResNetLSTM()

def train_model(x, y, seed: int = 7, epochs: int = 2, learning_rate: float = 1e-3, batch_size: int = 128, validation_x=None, validation_y=None, trial=None, **config):
    import numpy as np
    torch=_torch(); torch.manual_seed(seed); np.random.seed(seed)
    model=build_resnet_lstm(**config); optimizer=torch.optim.Adam(model.parameters(),lr=learning_rate); loss_fn=torch.nn.BCELoss(); tx=torch.tensor(x,dtype=torch.float32); ty=torch.tensor(y,dtype=torch.float32)
    generator=torch.Generator().manual_seed(seed); loader=torch.utils.data.DataLoader(torch.utils.data.TensorDataset(tx,ty),batch_size=min(batch_size,len(tx)),shuffle=True,generator=generator)
    for epoch in range(epochs):
        model.train()
        for bx,by in loader: optimizer.zero_grad(); loss=loss_fn(model(bx),by); loss.backward(); optimizer.step()
        if trial is not None and validation_x is not None:
            score=float(((predict(model,validation_x)>0.5)==np.asarray(validation_y)).mean()); trial.report(score,epoch)
            if trial.should_prune():
                import optuna
                raise optuna.TrialPruned()
    model.eval(); return model

def predict(model, x, batch_size: int=256):
    import numpy as np
    torch=_torch(); model.eval(); tx=torch.tensor(x,dtype=torch.float32); rows=[]
    with torch.no_grad():
        for start in range(0,len(tx),batch_size): rows.append(model(tx[start:start+batch_size]).cpu().numpy())
    return np.concatenate(rows) if rows else np.asarray([],dtype="float32")

def train_tiny(x, y, seed: int = 7, epochs: int = 2, **config):
    model=train_model(x,y,seed=seed,epochs=epochs,**config); return model,predict(model,x)
