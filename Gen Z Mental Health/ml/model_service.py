import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field


MODEL_PATH = Path(
    os.getenv(
        "MODEL_BUNDLE_PATH",
        str(Path(__file__).resolve().parent / "artifacts" / "model_bundle.joblib"),
    )
)
app = FastAPI(title="Gen Z Mental Health Final Models", version="1.0.0")


class SimulatorProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    age: float = Field(ge=13, le=27)
    gender: Literal["Male", "Female", "Other"]
    country: Literal["USA", "India", "Brazil", "UK", "Canada", "Australia", "Germany"]
    primary_platform: Literal["Instagram", "TikTok", "YouTube", "Twitter", "Snapchat"]
    purpose: Literal[
        "Entertainment", "Socializing", "Education", "News", "Content Creation"
    ]
    num_platforms_used: int = Field(ge=1, le=5)
    daily_usage_hours: float = Field(ge=0, le=24)
    avg_session_minutes: float = Field(ge=0, le=1440)
    night_usage: int = Field(ge=0, le=1)
    screen_time_before_sleep: float = Field(ge=0, le=1440)


@lru_cache(maxsize=1)
def load_bundle() -> dict:
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Trained model bundle not found at {MODEL_PATH}. Run train_model.py first."
        )
    bundle = joblib.load(MODEL_PATH)
    if not all(key in bundle for key in ("classifier", "regressor", "metadata")):
        raise ValueError(f"Model bundle at {MODEL_PATH} is missing required models or metadata.")
    return bundle


@app.get("/ml/health")
def health() -> dict:
    try:
        bundle = load_bundle()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    metadata = bundle["metadata"]
    return {
        "status": "ok",
        "model_bundle": MODEL_PATH.name,
        "trained_at": metadata["trained_at"],
        "source_rows": metadata["source_rows"],
        "train_rows": metadata["train_rows"],
        "test_rows": metadata["test_rows"],
    }


@app.post("/ml/predict")
def predict(profile: SimulatorProfile) -> dict:
    try:
        bundle = load_bundle()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    features = pd.DataFrame([profile.model_dump()])
    classifier = bundle["classifier"]
    regressor = bundle["regressor"]
    addiction_level = str(classifier.predict(features)[0])
    probabilities = classifier.predict_proba(features)[0]
    score = float(regressor.predict(features)[0])
    return {
        "addiction_level": addiction_level,
        "addiction_probabilities": {
            str(label): float(probability)
            for label, probability in zip(classifier.classes_, probabilities, strict=True)
        },
        "mental_health_score": score,
        "evaluation": {
            "classification": bundle["metadata"]["classification_metrics"],
            "regression": bundle["metadata"]["regression_metrics"],
        },
        "model_metadata": {
            "trained_at": bundle["metadata"]["trained_at"],
            "train_rows": bundle["metadata"]["train_rows"],
            "test_rows": bundle["metadata"]["test_rows"],
            "target_definition_audit": bundle["metadata"]["target_definition_audit"],
        },
    }
