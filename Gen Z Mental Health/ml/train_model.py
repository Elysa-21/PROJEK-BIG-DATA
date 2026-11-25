import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import (
    accuracy_score,
    balanced_accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sqlalchemy import URL, create_engine, text


ROOT = Path(__file__).resolve().parent
ARTIFACTS_DIR = ROOT / "artifacts"
RESULTS_DIR = ROOT / "results"
EXPECTED_ROWS = 1_000_000
TEST_SIZE = 0.2
RANDOM_STATE = 42
CHUNK_SIZE = 100_000

CATEGORICAL_FEATURES = ["gender", "country", "primary_platform", "purpose"]
NUMERIC_FEATURES = [
    "age",
    "num_platforms_used",
    "daily_usage_hours",
    "avg_session_minutes",
    "night_usage",
    "screen_time_before_sleep",
]
FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES
TARGETS = ["addiction_level", "mental_health_score"]
DATA_COLUMNS = FEATURES + TARGETS
ADDICTION_LABELS = ["Low", "Medium", "High"]


def load_dataset() -> pd.DataFrame:
    table = os.getenv("MYSQL_TABLE", "genz_social_media_usage_1m")
    if not re.fullmatch(r"[A-Za-z0-9_]+", table):
        raise ValueError("MYSQL_TABLE must contain only letters, numbers, and underscores.")

    engine = create_engine(
        URL.create(
            "mysql+pymysql",
            username=os.getenv("MYSQL_USER", "root"),
            password=os.getenv("MYSQL_PASSWORD", ""),
            host=os.getenv("MYSQL_HOST", "localhost"),
            port=int(os.getenv("MYSQL_PORT", "3306")),
            database=os.getenv("MYSQL_DATABASE", "data_genz"),
        ),
        pool_pre_ping=True,
    )
    try:
        with engine.connect() as connection:
            row_count = connection.execute(
                text(f"SELECT COUNT(*) FROM `{table}`")
            ).scalar_one()
            if row_count != EXPECTED_ROWS:
                raise ValueError(
                    f"Expected exactly {EXPECTED_ROWS:,} source rows, found {row_count:,}."
                )

            query = text(f"SELECT {', '.join(f'`{column}`' for column in DATA_COLUMNS)} FROM `{table}`")
            chunks = pd.read_sql_query(query, connection, chunksize=CHUNK_SIZE)
            data = pd.concat(chunks, ignore_index=True)
    finally:
        engine.dispose()

    missing_columns = sorted(set(DATA_COLUMNS) - set(data.columns))
    if missing_columns:
        raise ValueError(f"Dataset is missing required columns: {', '.join(missing_columns)}.")
    if len(data) != EXPECTED_ROWS:
        raise ValueError(f"Expected {EXPECTED_ROWS:,} rows, loaded {len(data):,}.")

    for column in NUMERIC_FEATURES + ["mental_health_score"]:
        data[column] = pd.to_numeric(data[column], errors="coerce")

    data = data.dropna(subset=DATA_COLUMNS).copy()
    data["addiction_level"] = data["addiction_level"].astype(str).str.strip()
    data = data[data["addiction_level"].isin(ADDICTION_LABELS)].copy()
    for column in CATEGORICAL_FEATURES:
        data[column] = data[column].astype(str).str.strip()

    if data.empty:
        raise ValueError("No complete rows with supported addiction labels remain after validation.")

    # Stable ordering makes the seeded split reproducible even if database row order changes.
    return data.sort_values(DATA_COLUMNS, kind="mergesort").reset_index(drop=True)


def make_preprocessor(scale_numeric: bool) -> ColumnTransformer:
    numeric_steps: list[tuple[str, Any]] = [("imputer", SimpleImputer(strategy="median"))]
    if scale_numeric:
        numeric_steps.append(("scaler", StandardScaler()))
    categorical_pipeline = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="most_frequent")),
            ("encoder", OneHotEncoder(handle_unknown="ignore")),
        ]
    )
    numeric_pipeline = Pipeline(steps=numeric_steps)
    return ColumnTransformer(
        transformers=[
            ("categorical", categorical_pipeline, CATEGORICAL_FEATURES),
            ("numeric", numeric_pipeline, NUMERIC_FEATURES),
        ],
        remainder="drop",
        sparse_threshold=1.0,
    )


def build_models() -> tuple[Pipeline, Pipeline]:
    classifier = Pipeline(
        steps=[
            ("preprocessing", make_preprocessor(scale_numeric=False)),
            (
                "model",
                RandomForestClassifier(
                    n_estimators=100,
                    max_depth=18,
                    max_features="sqrt",
                    min_samples_leaf=5,
                    class_weight="balanced_subsample",
                    random_state=RANDOM_STATE,
                    n_jobs=-1,
                ),
            ),
        ]
    )
    regressor = Pipeline(
        steps=[
            ("preprocessing", make_preprocessor(scale_numeric=True)),
            ("model", LinearRegression()),
        ]
    )
    return classifier, regressor


def split_indices(labels: pd.Series, row_count: int) -> tuple[np.ndarray, np.ndarray]:
    return train_test_split(
        np.arange(row_count),
        test_size=TEST_SIZE,
        random_state=RANDOM_STATE,
        stratify=labels,
    )


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=path.parent, delete=False
    ) as temporary:
        json.dump(payload, temporary, ensure_ascii=False, indent=2)
        temporary.write("\n")
        temp_path = Path(temporary.name)
    temp_path.replace(path)


def train_and_evaluate(data: pd.DataFrame) -> dict[str, Any]:
    x = data[FEATURES]
    y_classifier = data["addiction_level"]
    y_regression = data["mental_health_score"].astype(float)
    train_indices, test_indices = split_indices(y_classifier, len(data))
    x_train = x.iloc[train_indices]
    x_test = x.iloc[test_indices]
    y_class_train = y_classifier.iloc[train_indices]
    y_class_test = y_classifier.iloc[test_indices]
    y_score_train = y_regression.iloc[train_indices]
    y_score_test = y_regression.iloc[test_indices]

    classifier, regressor = build_models()
    classifier.fit(x_train, y_class_train)
    regressor.fit(x_train, y_score_train)

    class_predictions = classifier.predict(x_test)
    class_probabilities = classifier.predict_proba(x_test)
    score_predictions = regressor.predict(x_test)
    classification_metrics = {
        "accuracy": float(accuracy_score(y_class_test, class_predictions)),
        "balanced_accuracy": float(balanced_accuracy_score(y_class_test, class_predictions)),
        "precision_macro": float(
            precision_score(y_class_test, class_predictions, average="macro", zero_division=0)
        ),
        "recall_macro": float(
            recall_score(y_class_test, class_predictions, average="macro", zero_division=0)
        ),
        "f1_macro": float(
            f1_score(y_class_test, class_predictions, average="macro", zero_division=0)
        ),
        "labels": ADDICTION_LABELS,
        "confusion_matrix": confusion_matrix(
            y_class_test, class_predictions, labels=ADDICTION_LABELS
        ).tolist(),
    }
    regression_metrics = {
        "mae": float(mean_absolute_error(y_score_test, score_predictions)),
        "rmse": float(np.sqrt(mean_squared_error(y_score_test, score_predictions))),
        "r2": float(r2_score(y_score_test, score_predictions)),
    }
    usage_ranges = (
        pd.DataFrame(
            {
                "addiction_level": y_class_train,
                "daily_usage_hours": x_train["daily_usage_hours"],
            }
        )
        .groupby("addiction_level")["daily_usage_hours"]
        .agg(["min", "max"])
        .sort_values("min")
    )
    ranges = [
        {"label": str(label), "minimum": float(row["min"]), "maximum": float(row["max"])}
        for label, row in usage_ranges.iterrows()
    ]
    non_overlapping_ranges = all(
        ranges[index]["maximum"] < ranges[index + 1]["minimum"]
        for index in range(len(ranges) - 1)
    )
    trained_at = datetime.now(timezone.utc).isoformat()
    metadata = {
        "trained_at": trained_at,
        "source_table": os.getenv("MYSQL_TABLE", "genz_social_media_usage_1m"),
        "source_rows": EXPECTED_ROWS,
        "valid_rows": int(len(data)),
        "dropped_rows": EXPECTED_ROWS - int(len(data)),
        "train_rows": int(len(train_indices)),
        "test_rows": int(len(test_indices)),
        "test_ratio": TEST_SIZE,
        "random_state": RANDOM_STATE,
        "features": FEATURES,
        "targets": TARGETS,
        "classifier": "RandomForestClassifier",
        "regressor": "LinearRegression",
        "target_definition_audit": {
            "feature_checked": "daily_usage_hours",
            "training_ranges_by_addiction_level": ranges,
            "ranges_are_non_overlapping": non_overlapping_ranges,
            "note": (
                "Non-overlapping usage ranges indicate the source addiction labels may be "
                "rule-derived from daily usage; classification metrics should not be read as "
                "clinical predictive performance."
            ),
        },
        "classification_metrics": classification_metrics,
        "regression_metrics": regression_metrics,
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    bundle_path = ARTIFACTS_DIR / "model_bundle.joblib"
    with tempfile.NamedTemporaryFile(
        mode="wb", suffix=".joblib", dir=ARTIFACTS_DIR, delete=False
    ) as temporary:
        temp_bundle = Path(temporary.name)
    try:
        joblib.dump(
            {
                "classifier": classifier,
                "regressor": regressor,
                "metadata": metadata,
            },
            temp_bundle,
            compress=3,
        )
        temp_bundle.replace(bundle_path)
    finally:
        temp_bundle.unlink(missing_ok=True)

    np.savez_compressed(
        RESULTS_DIR / "split_indices.npz",
        training_indices=train_indices,
        testing_indices=test_indices,
    )
    write_json(RESULTS_DIR / "evaluation_metrics.json", metadata)
    pd.DataFrame(
        {
            "source_row_index": test_indices,
            "actual_addiction_level": y_class_test.to_numpy(),
            "predicted_addiction_level": class_predictions,
            "actual_mental_health_score": y_score_test.to_numpy(),
            "predicted_mental_health_score": score_predictions,
            **{
                f"probability_{label.lower()}": class_probabilities[:, column_index]
                for column_index, label in enumerate(classifier.classes_)
            },
        }
    ).to_csv(RESULTS_DIR / "testing_predictions.csv", index=False)
    return metadata


def main() -> None:
    print("Loading the 1,000,000-row MySQL dataset...")
    data = load_dataset()
    print(f"Validated rows: {len(data):,}; dropped rows: {EXPECTED_ROWS - len(data):,}")
    result = train_and_evaluate(data)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"Model saved to: {ARTIFACTS_DIR / 'model_bundle.joblib'}")
    print(f"Evaluation saved to: {RESULTS_DIR}")


if __name__ == "__main__":
    main()
