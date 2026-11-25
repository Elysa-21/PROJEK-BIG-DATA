import numpy as np
import pandas as pd

from train_model import (
    CATEGORICAL_FEATURES,
    FEATURES,
    NUMERIC_FEATURES,
    TARGETS,
    build_models,
    split_indices,
)


def make_training_data(row_count: int = 60) -> pd.DataFrame:
    labels = ["Low", "Medium", "High"] * (row_count // 3)
    return pd.DataFrame(
        {
            "gender": ["Female", "Male", "Other"] * (row_count // 3),
            "country": ["USA", "India", "Brazil"] * (row_count // 3),
            "primary_platform": ["Instagram", "TikTok", "YouTube"] * (row_count // 3),
            "purpose": ["Education", "News", "Entertainment"] * (row_count // 3),
            "age": np.arange(row_count) % 14 + 14,
            "num_platforms_used": np.arange(row_count) % 5 + 1,
            "daily_usage_hours": np.arange(row_count) % 8 + 0.5,
            "avg_session_minutes": np.arange(row_count) % 40 + 5,
            "night_usage": np.arange(row_count) % 2,
            "screen_time_before_sleep": np.arange(row_count) % 75,
            "addiction_level": labels,
            "mental_health_score": np.arange(row_count, dtype=float) % 10 + 1,
        }
    )


def test_split_is_reproducible_disjoint_and_exactly_eighty_twenty():
    labels = make_training_data()["addiction_level"]

    training, testing = split_indices(labels, len(labels))
    repeated_training, repeated_testing = split_indices(labels, len(labels))

    assert len(training) == 48
    assert len(testing) == 12
    assert not set(training).intersection(testing)
    np.testing.assert_array_equal(training, repeated_training)
    np.testing.assert_array_equal(testing, repeated_testing)


def test_pipelines_fit_preprocessing_on_training_and_allow_unseen_categories():
    data = make_training_data()
    training = data.iloc[:54]
    testing = data.iloc[54:].copy()
    testing.loc[:, CATEGORICAL_FEATURES] = "Unseen category"
    classifier, regressor = build_models()
    classifier.fit(training[FEATURES], training["addiction_level"])
    regressor.fit(training[FEATURES], training["mental_health_score"])

    assert not set(TARGETS).intersection(FEATURES)
    assert len(classifier.predict(testing[FEATURES])) == 6
    assert len(regressor.predict(testing[FEATURES])) == 6
    assert set(NUMERIC_FEATURES).issubset(FEATURES)
