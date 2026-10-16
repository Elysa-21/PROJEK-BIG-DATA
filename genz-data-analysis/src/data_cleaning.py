from __future__ import annotations

import json
import logging
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DATA_PATH = PROJECT_ROOT / "data" / "raw" / "genz_social_media_usage_1M.csv"
RESULTS_PATH = PROJECT_ROOT / "data" / "processed" / "data_cleaning.csv"

EXPECTED_COLUMNS = (
    "age",
    "gender",
    "country",
    "daily_usage_hours",
    "primary_platform",
    "num_platforms_used",
    "purpose",
    "avg_session_minutes",
    "night_usage",
    "mental_health_score",
    "addiction_level",
    "screen_time_before_sleep",
)
NUMERIC_COLUMNS = (
    "age",
    "daily_usage_hours",
    "num_platforms_used",
    "avg_session_minutes",
    "night_usage",
    "mental_health_score",
    "screen_time_before_sleep",
)
CATEGORICAL_COLUMNS = (
    "gender",
    "country",
    "primary_platform",
    "purpose",
    "addiction_level",
)
AUDIT_COLUMNS = (
    "source_data_row",
    "action",
    "column",
    "original_value",
    "cleaned_value",
    "reason",
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%H:%M:%S",
)
LOGGER = logging.getLogger(__name__)


def read_data(path: Path = RAW_DATA_PATH) -> pd.DataFrame:
    """Read the source CSV and check that its required columns exist."""
    LOGGER.info("Membaca CSV: %s", path)
    try:
        dataframe = pd.read_csv(path, low_memory=False)
    except FileNotFoundError as exc:
        raise FileNotFoundError(f"File dataset tidak ditemukan: {path}") from exc
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as exc:
        raise ValueError(f"CSV kosong, rusak, atau formatnya tidak sesuai: {exc}") from exc
    except OSError as exc:
        raise OSError(f"Dataset tidak dapat dibaca: {exc}") from exc

    missing_columns = [column for column in EXPECTED_COLUMNS if column not in dataframe.columns]
    if missing_columns:
        raise ValueError(f"Kolom wajib tidak ditemukan: {missing_columns}")

    LOGGER.info(
        "Dataset terbaca: %s baris, %s kolom",
        f"{len(dataframe):,}",
        len(dataframe.columns),
    )
    return dataframe


def log_initial_profile(dataframe: pd.DataFrame) -> None:
    """Display the initial overview and descriptive statistics in the terminal."""
    LOGGER.info("Ukuran awal: %s baris x %s kolom", f"{len(dataframe):,}", len(dataframe.columns))
    LOGGER.info("Nama kolom: %s", list(dataframe.columns))
    LOGGER.info("Tipe data awal:\n%s", dataframe.dtypes.to_string())
    LOGGER.info("Lima baris pertama:\n%s", dataframe.head().to_string(index=False))
    LOGGER.info("Statistik numerik:\n%s", dataframe.describe(include="number").to_string())

    categorical = dataframe.select_dtypes(include=["object", "string"])
    if not categorical.empty:
        LOGGER.info("Statistik kategorikal:\n%s", categorical.describe().to_string())


def _numeric_values(dataframe: pd.DataFrame, column: str) -> pd.Series:
    return pd.to_numeric(dataframe[column], errors="coerce")


def _validation_masks(
    dataframe: pd.DataFrame,
) -> tuple[dict[str, pd.Series], dict[str, pd.Series]]:
    """Return hard violations and review-only flags; IQR never deletes records."""
    invalid: dict[str, pd.Series] = {}
    review: dict[str, pd.Series] = {}
    numeric = {column: _numeric_values(dataframe, column) for column in NUMERIC_COLUMNS}

    daily_hours = numeric["daily_usage_hours"]
    invalid["daily_usage_hours"] = daily_hours.notna() & (
        (daily_hours < 0) | (daily_hours > 24)
    )

    platform_count = numeric["num_platforms_used"]
    invalid["num_platforms_used"] = platform_count.notna() & (
        (platform_count <= 0) | (platform_count.mod(1) != 0)
    )

    session_minutes = numeric["avg_session_minutes"]
    invalid["avg_session_minutes"] = session_minutes.notna() & (
        (session_minutes < 0) | (session_minutes > 1440)
    )

    night_usage = numeric["night_usage"]
    invalid["night_usage"] = night_usage.notna() & ~night_usage.isin([0, 1])

    screen_minutes = numeric["screen_time_before_sleep"]
    invalid["screen_time_before_sleep"] = screen_minutes.notna() & (
        (screen_minutes < 0) | (screen_minutes > 1440)
    )

    age = numeric["age"]
    # Rentang 13-29 adalah asumsi awal penelitian, bukan definisi universal Gen Z.
    review["age"] = age.notna() & (~age.between(13, 29) | (age.mod(1) != 0))
    return invalid, review


def _parse_error_masks(dataframe: pd.DataFrame) -> dict[str, pd.Series]:
    return {
        column: dataframe[column].notna() & _numeric_values(dataframe, column).isna()
        for column in NUMERIC_COLUMNS
    }


def quality_report(dataframe: pd.DataFrame, stage: str) -> pd.DataFrame:
    """Build per-column missing, type, category, range, and review diagnostics."""
    invalid_masks, review_masks = _validation_masks(dataframe)
    parse_masks = _parse_error_masks(dataframe)
    rows: list[dict[str, Any]] = []

    for column in dataframe.columns:
        values = dataframe[column]
        row: dict[str, Any] = {
            "stage": stage,
            "column": column,
            "dtype": str(values.dtype),
            "row_count": len(dataframe),
            "non_missing_count": int(values.notna().sum()),
            "missing_count": int(values.isna().sum()),
            "missing_pct": round(float(values.isna().mean() * 100), 6),
            "unique_count": int(values.nunique(dropna=True)),
            "numeric_parse_error_count": int(parse_masks[column].sum())
            if column in parse_masks
            else 0,
            "hard_rule_violation_count": int(invalid_masks[column].sum())
            if column in invalid_masks
            else 0,
            "review_flag_count": int(review_masks[column].sum())
            if column in review_masks
            else 0,
            "whitespace_issue_count": 0,
            "case_or_spacing_variant_groups": 0,
            "observed_value_examples": "",
        }

        if column in CATEGORICAL_COLUMNS:
            category_values = values.dropna().astype("string")
            stripped = category_values.str.strip()
            row["whitespace_issue_count"] = int(category_values.ne(stripped).sum())
            row["case_or_spacing_variant_groups"] = int(
                stripped.nunique(dropna=True)
                - stripped.str.casefold().nunique(dropna=True)
            )
            examples = pd.unique(category_values)[:50].tolist()
            row["observed_value_examples"] = json.dumps(examples, ensure_ascii=True)
        elif not pd.api.types.is_numeric_dtype(values.dtype):
            examples = pd.unique(values.dropna().astype("string"))[:50].tolist()
            row["observed_value_examples"] = json.dumps(examples, ensure_ascii=True)
        else:
            examples = values.dropna().head(5).tolist()
            row["observed_value_examples"] = json.dumps(examples, ensure_ascii=True)
        rows.append(row)

    return pd.DataFrame(rows)


def outlier_report(dataframe: pd.DataFrame, stage: str) -> pd.DataFrame:
    """Count IQR fences as review flags; outliers are never removed."""
    rows: list[dict[str, Any]] = []
    for column in NUMERIC_COLUMNS:
        values = _numeric_values(dataframe, column).dropna()
        if values.empty:
            q1 = q3 = iqr = lower_fence = upper_fence = np.nan
            lower_count = upper_count = 0
        else:
            q1 = float(values.quantile(0.25))
            q3 = float(values.quantile(0.75))
            iqr = q3 - q1
            lower_fence = q1 - 1.5 * iqr
            upper_fence = q3 + 1.5 * iqr
            lower_count = int((values < lower_fence).sum())
            upper_count = int((values > upper_fence).sum())

        rows.append(
            {
                "stage": stage,
                "column": column,
                "method": "IQR (Q1 - 1.5*IQR, Q3 + 1.5*IQR)",
                "non_missing_numeric_count": int(len(values)),
                "q1": q1,
                "q3": q3,
                "iqr": iqr,
                "lower_fence": lower_fence,
                "upper_fence": upper_fence,
                "lower_outlier_count": lower_count,
                "upper_outlier_count": upper_count,
                "total_outlier_count": lower_count + upper_count,
                "action_taken": "Flagged for review; not removed",
            }
        )
    return pd.DataFrame(rows)


def _display_value(value: Any) -> str:
    if pd.isna(value):
        return ""
    if isinstance(value, np.generic):
        value = value.item()
    return str(value)


def _add_audit_entry(
    audit_rows: list[dict[str, Any]],
    row_number: int,
    action: str,
    column: str,
    original_value: Any,
    cleaned_value: Any,
    reason: str,
) -> None:
    audit_rows.append(
        {
            "source_data_row": row_number,
            "action": action,
            "column": column,
            "original_value": _display_value(original_value),
            "cleaned_value": _display_value(cleaned_value),
            "reason": reason,
        }
    )


def clean_data(dataframe: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Apply documented corrections and remove only exact duplicate rows."""
    LOGGER.info("Memeriksa duplikat dan merapikan nilai kategori")
    cleaned = dataframe.copy()
    source_rows = pd.Series(np.arange(2, len(dataframe) + 2), index=dataframe.index)
    audit_rows: list[dict[str, Any]] = []

    duplicate_mask = cleaned.duplicated(keep="first")
    for index in cleaned.index[duplicate_mask]:
        original_row = cleaned.loc[index].to_dict()
        _add_audit_entry(
            audit_rows,
            int(source_rows.loc[index]),
            "exact_duplicate_removed",
            "*",
            json.dumps(original_row, ensure_ascii=True, default=str),
            "",
            "Baris identik penuh; kemunculan pertama dipertahankan.",
        )
    cleaned = cleaned.loc[~duplicate_mask].copy()
    source_rows = source_rows.loc[~duplicate_mask]

    for column in CATEGORICAL_COLUMNS:
        original = cleaned[column].copy()
        text = original.astype("string")
        stripped = text.str.strip()
        blank_mask = text.notna() & stripped.eq("")
        stripped = stripped.mask(blank_mask, pd.NA)
        keys = stripped.str.casefold()

        # Ejaan paling sering dipakai hanya untuk label yang sama setelah trim/casefold.
        canonical_values: dict[str, str] = {}
        for key in keys.dropna().unique():
            candidates = stripped.loc[keys.eq(key)].dropna()
            canonical_values[str(key)] = str(candidates.value_counts().index[0])
        normalized = keys.map(canonical_values).astype("string")

        original_text = original.astype("string")
        changed = original.isna().ne(normalized.isna()) | (
            original.notna()
            & normalized.notna()
            & original_text.ne(normalized).fillna(False)
        )
        for index in cleaned.index[changed]:
            is_blank = bool(blank_mask.loc[index])
            _add_audit_entry(
                audit_rows,
                int(source_rows.loc[index]),
                "blank_to_missing" if is_blank else "category_normalized",
                column,
                original.loc[index],
                normalized.loc[index],
                "String kosong dijadikan missing."
                if is_blank
                else "Spasi tepi/kapitalisasi diseragamkan ke ejaan terbanyak dalam grup yang sama.",
            )
        cleaned[column] = normalized

    for column in NUMERIC_COLUMNS:
        original = cleaned[column].copy()
        converted = pd.to_numeric(original, errors="coerce")
        parse_errors = original.notna() & converted.isna()
        for index in cleaned.index[parse_errors]:
            _add_audit_entry(
                audit_rows,
                int(source_rows.loc[index]),
                "unparseable_numeric_set_missing",
                column,
                original.loc[index],
                np.nan,
                "Nilai numerik tidak dapat dikonversi; nilai pengganti tidak dibuat.",
            )

        if not pd.api.types.is_numeric_dtype(original.dtype):
            converted_ok = original.notna() & converted.notna()
            for index in cleaned.index[converted_ok]:
                _add_audit_entry(
                    audit_rows,
                    int(source_rows.loc[index]),
                    "numeric_type_converted",
                    column,
                    original.loc[index],
                    converted.loc[index],
                    "Representasi angka dikonversi ke tipe numerik tanpa mengubah nilainya.",
                )
        cleaned[column] = converted

    invalid_masks, _ = _validation_masks(cleaned)
    invalid_reasons = {
        "daily_usage_hours": "Durasi harian harus berada pada rentang 0 sampai 24 jam.",
        "num_platforms_used": "Jumlah platform harus berupa bilangan bulat positif.",
        "avg_session_minutes": "Durasi sesi harus berada pada rentang 0 sampai 1.440 menit.",
        "night_usage": "Indikator night_usage harus bernilai 0 atau 1.",
        "screen_time_before_sleep": "Durasi layar harus berada pada rentang 0 sampai 1.440 menit.",
    }
    for column, mask in invalid_masks.items():
        for index in cleaned.index[mask]:
            before = cleaned.at[index, column]
            _add_audit_entry(
                audit_rows,
                int(source_rows.loc[index]),
                "invalid_value_set_missing",
                column,
                before,
                np.nan,
                invalid_reasons[column],
            )
        cleaned.loc[mask, column] = np.nan

    audit = pd.DataFrame(audit_rows, columns=AUDIT_COLUMNS)
    LOGGER.info(
        "Cleaning selesai: %s baris duplikat dihapus, %s entri audit",
        f"{int(duplicate_mask.sum()):,}",
        f"{len(audit):,}",
    )
    return cleaned, audit


def validate_cleaned(dataframe: pd.DataFrame) -> dict[str, Any]:
    """Check required columns, numeric types, uniqueness, and hard rules."""
    missing_columns = [column for column in EXPECTED_COLUMNS if column not in dataframe.columns]
    if missing_columns:
        raise ValueError(f"Validasi gagal; kolom wajib hilang: {missing_columns}")

    non_numeric_columns = [
        column
        for column in NUMERIC_COLUMNS
        if not pd.api.types.is_numeric_dtype(dataframe[column].dtype)
    ]
    if non_numeric_columns:
        raise ValueError(f"Validasi gagal; kolom belum numerik: {non_numeric_columns}")

    duplicate_count = int(dataframe.duplicated().sum())
    invalid_masks, _ = _validation_masks(dataframe)
    violation_counts = {column: int(mask.sum()) for column, mask in invalid_masks.items()}
    if duplicate_count or any(violation_counts.values()):
        raise ValueError(
            f"Validasi gagal: {duplicate_count} duplikat, pelanggaran rentang {violation_counts}"
        )

    return {
        "status": "passed",
        "duplicate_rows": duplicate_count,
        "hard_rule_violations": sum(violation_counts.values()),
        "hard_rule_violations_by_column": violation_counts,
    }


def cleaning_summary(
    original: pd.DataFrame,
    cleaned: pd.DataFrame,
    audit: pd.DataFrame,
    validation: dict[str, Any],
) -> pd.DataFrame:
    action_counts = Counter(audit["action"].tolist()) if not audit.empty else Counter()
    corrected_actions = (
        "category_normalized",
        "blank_to_missing",
        "numeric_type_converted",
        "invalid_value_set_missing",
        "unparseable_numeric_set_missing",
    )
    corrected_cells = sum(action_counts[action] for action in corrected_actions)
    original_violations, _ = _validation_masks(original)
    rows = [
        ("row_count", len(original), len(cleaned), "Baris dipertahankan kecuali duplikat identik penuh."),
        ("rows_deleted_total", 0, int(action_counts["exact_duplicate_removed"]), "Hanya baris duplikat identik penuh yang dihapus."),
        ("corrected_cells_total", 0, int(corrected_cells), "Total sel yang dikoreksi; detail perubahan ada di cleaning_audit.csv."),
        ("missing_cells", int(original.isna().sum().sum()), int(cleaned.isna().sum().sum()), "Missing yang ada dipertahankan; nilai pengganti tidak dikarang."),
        ("exact_duplicate_rows_removed", int(action_counts["exact_duplicate_removed"]), 0, "Kemunculan pertama dari baris identik penuh dipertahankan."),
        ("category_cells_normalized", 0, int(action_counts["category_normalized"]), "Trim spasi dan kapitalisasi dalam grup kategori yang sama."),
        ("blank_category_cells_set_missing", 0, int(action_counts["blank_to_missing"]), "String kosong dijadikan missing, tanpa imputasi."),
        ("numeric_values_converted", 0, int(action_counts["numeric_type_converted"]), "Representasi angka dikonversi tanpa mengubah nilainya."),
        ("invalid_values_set_missing", 0, int(action_counts["invalid_value_set_missing"] + action_counts["unparseable_numeric_set_missing"]), "Nilai tak terbaca atau melanggar batas tegas dijadikan missing dan diaudit."),
        ("outlier_values_removed", 0, 0, "Tidak ada; outlier IQR hanya ditandai untuk ditinjau."),
        ("post_cleaning_duplicate_rows", int(original.duplicated().sum()), int(cleaned.duplicated().sum()), "Harus nol setelah deduplikasi."),
        ("post_cleaning_hard_rule_violations", sum(int(mask.sum()) for mask in original_violations.values()), validation["hard_rule_violations"], "Usia di luar asumsi 13-29 hanya ditandai, bukan diubah."),
        ("post_cleaning_validation_status", "not_run", validation["status"], "Validasi kolom, tipe, duplikat, dan aturan rentang tegas."),
    ]
    return pd.DataFrame(
        [
            {
                "metric": metric,
                "before": before,
                "after": after,
                "change": after - before
                if isinstance(before, (int, float)) and isinstance(after, (int, float))
                else "",
                "reason": reason,
            }
            for metric, before, after, reason in rows
        ]
    )


def save_outputs(cleaned: pd.DataFrame) -> None:
    try:
        RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
        cleaned.to_csv(RESULTS_PATH, index=False)

        # Remove only generated outputs from earlier versions of this pipeline.
        previous_outputs = [
            PROJECT_ROOT / "data" / "processed" / "genz_social_media_cleaning_results.xlsx",
            PROJECT_ROOT / "data" / "processed" / "genz_social_media_cleaned.csv",
            PROJECT_ROOT / "reports" / "data_quality_report.csv",
            PROJECT_ROOT / "reports" / "cleaning_summary.csv",
            PROJECT_ROOT / "reports" / "outlier_report.csv",
            PROJECT_ROOT / "reports" / "cleaning_audit.csv",
        ]
        for old_path in previous_outputs:
            if old_path.exists():
                old_path.unlink()

        LOGGER.info("Data cleaning tersimpan dalam satu file: %s", RESULTS_PATH)
    except OSError as exc:
        raise OSError(f"Gagal menyimpan CSV {RESULTS_PATH}: {exc}") from exc


def main() -> int:
    try:
        original = read_data()
        log_initial_profile(original)
        LOGGER.info("Membuat laporan kondisi awal")
        quality_before = quality_report(original, "before_cleaning")
        outliers_before = outlier_report(original, "before_cleaning")

        cleaned, audit = clean_data(original)
        LOGGER.info("Memvalidasi dataset hasil cleaning")
        validation = validate_cleaned(cleaned)
        quality_after = quality_report(cleaned, "after_cleaning")
        outliers_after = outlier_report(cleaned, "after_cleaning")
        summary = cleaning_summary(original, cleaned, audit, validation)

        LOGGER.info("Pemeriksaan kualitas selesai: %s kolom", len(quality_before))
        LOGGER.info("Jumlah outlier IQR per kolom: %s", dict(zip(
            outliers_before["column"], outliers_before["total_outlier_count"]
        )))
        LOGGER.info("Jumlah koreksi dalam audit: %s", len(audit))
        LOGGER.info("Ringkasan cleaning:\n%s", summary.to_string(index=False))
        save_outputs(cleaned)
        LOGGER.info(
            "Selesai: %s -> %s baris; validasi %s",
            f"{len(original):,}",
            f"{len(cleaned):,}",
            validation["status"],
        )
        return 0
    except (FileNotFoundError, ValueError, OSError) as exc:
        LOGGER.error("Proses dihentikan: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
