import numpy as np
from fastapi.testclient import TestClient

import model_service
from train_model import FEATURES


class StubClassifier:
    classes_ = np.array(["High", "Low", "Medium"])

    def predict(self, features):
        assert set(features.columns) == set(FEATURES)
        return np.array(["Medium"])

    def predict_proba(self, features):
        return np.array([[0.2, 0.3, 0.5]])


class StubRegressor:
    def predict(self, features):
        assert set(features.columns) == set(FEATURES)
        return np.array([6.25])


def test_prediction_api_returns_both_model_outputs_and_metrics(monkeypatch):
    bundle = {
        "classifier": StubClassifier(),
        "regressor": StubRegressor(),
        "metadata": {
            "trained_at": "2026-01-01T00:00:00+00:00",
            "source_rows": 1_000_000,
            "train_rows": 800_000,
            "test_rows": 200_000,
            "target_definition_audit": {
                "feature_checked": "daily_usage_hours",
                "ranges_are_non_overlapping": True,
            },
            "classification_metrics": {"accuracy": 0.8},
            "regression_metrics": {"mae": 0.5},
        },
    }
    monkeypatch.setattr(model_service, "load_bundle", lambda: bundle)
    client = TestClient(model_service.app)
    payload = {
        "age": 20,
        "gender": "Female",
        "country": "USA",
        "primary_platform": "Instagram",
        "purpose": "Socializing",
        "num_platforms_used": 3,
        "daily_usage_hours": 4,
        "avg_session_minutes": 20,
        "night_usage": 0,
        "screen_time_before_sleep": 15,
    }

    response = client.post("/ml/predict", json=payload)

    assert response.status_code == 200
    result = response.json()
    assert result["addiction_level"] == "Medium"
    assert result["addiction_probabilities"]["Medium"] == 0.5
    assert result["mental_health_score"] == 6.25
    assert result["evaluation"]["classification"]["accuracy"] == 0.8
    assert result["model_metadata"]["test_rows"] == 200_000
    assert result["model_metadata"]["target_definition_audit"]["ranges_are_non_overlapping"]
