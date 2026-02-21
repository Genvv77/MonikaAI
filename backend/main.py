from fastapi import FastAPI
from pydantic import BaseModel
import onnxruntime as ort
import numpy as np
from typing import List

app = FastAPI()

# 1. Load the Brain once when the server starts
# Using the CPU provider for Railway (unless you pay for a GPU)
session = ort.InferenceSession("monika.onnx", providers=['CPUExecutionProvider'])

class CandleData(BaseModel):
    # Expecting an array of closing prices
    prices: List[float]

@app.post("/predict")
async def get_prediction(data: CandleData):
    BLOCK_SIZE = 64
    prices = data.prices
    
    # A. Preprocess: Convert prices to the 0-4 tokens
    # Ensure we have exactly 65 prices to get 64 changes
    if len(prices) < 65:
        # Pad with the first price if data is short
        prices = [prices[0]] * (65 - len(prices)) + prices
    
    recent_prices = prices[-65:]
    tokens = []
    
    for i in range(1, len(recent_prices)):
        prev = recent_prices[i-1]
        curr = recent_prices[i]
        pct = (curr - prev) / prev
        
        if pct < -0.02: tokens.append(0)    # Big Dump
        elif pct < -0.005: tokens.append(1) # Dump
        elif pct > 0.02: tokens.append(4)   # Big Pump
        elif pct > 0.005: tokens.append(3)  # Pump
        else: tokens.append(2)              # Flat
        
    # B. Run Inference
    # Convert to numpy array with shape (1, 64)
    input_ids = np.array([tokens], dtype=np.int64)
    
    # The name must match 'input_ids' from our export script
    outputs = session.run(["logits"], {"input_ids": input_ids})
    logits = outputs[0][0] # Get the first batch's result
    
    # C. Interpret
    max_idx = int(np.argmax(logits))
    labels = ["BIG_DUMP", "DUMP", "FLAT", "PUMP", "BIG_PUMP"]
    
    # Softmax for confidence
    exp_logits = np.exp(logits - np.max(logits))
    confidence = float(exp_logits[max_idx] / np.sum(exp_logits))

    return {
        "prediction": labels[max_idx],
        "confidence": confidence,
        "token": max_idx
    }

@app.get("/health")
def health():
    return {"status": "online", "brain": "ready"}