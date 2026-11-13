import argparse
import os
import random
import re
import time
from sqlalchemy import URL, create_engine, text
from pymongo import IndexModel, MongoClient
from datetime import datetime, timezone
from decimal import Decimal


# ============================================================
# KONFIGURASI MYSQL
# ============================================================

HOST = os.getenv("MYSQL_HOST", "localhost")
PORT = int(os.getenv("MYSQL_PORT", "3306"))
USER = os.getenv("MYSQL_USER", "root")
PASSWORD = os.getenv("MYSQL_PASSWORD", "")
DATABASE = os.getenv("MYSQL_DATABASE", "data_genz")

TABLE = os.getenv("MYSQL_TABLE", "genz_social_media_usage_1m")


# ============================================================
# KONFIGURASI MONGODB
# ============================================================

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
MONGO_DATABASE = os.getenv("MONGO_DB", "genz_analytics")
MONGO_COLLECTION = os.getenv("MONGO_SUMMARY_COLLECTION", "dashboard_summaries")
MONGO_SAMPLE_COLLECTION = os.getenv("MONGO_SAMPLE_COLLECTION", "dashboard_samples")
SAMPLE_SIZE = int(os.getenv("SAMPLE_SIZE", "10000"))
SAMPLE_BATCH_SIZE = int(os.getenv("SAMPLE_BATCH_SIZE", "1000"))

if not re.fullmatch(r"[A-Za-z0-9_]+", TABLE):
    raise ValueError("MYSQL_TABLE must contain only letters, numbers, and underscores.")
if SAMPLE_SIZE < 1 or SAMPLE_BATCH_SIZE < 1:
    raise ValueError("SAMPLE_SIZE and SAMPLE_BATCH_SIZE must be positive integers.")

# ============================================================
# MEMBUAT KONEKSI MYSQL
# ============================================================

engine = create_engine(
    URL.create(
        "mysql+pymysql",
        username=USER,
        password=PASSWORD,
        host=HOST,
        port=PORT,
        database=DATABASE,
    )
)


# ============================================================
# MEMBUAT KONEKSI MONGODB
# ============================================================

mongo_client = MongoClient(MONGO_URI)

mongo_db = mongo_client[MONGO_DATABASE]

summary_collection = mongo_db[MONGO_COLLECTION]


# ============================================================
# KONVERSI DATA DECIMAL
# ============================================================

def convert_decimal(data):

    if isinstance(data, Decimal):
        return float(data)

    elif isinstance(data, dict):
        return {
            key: convert_decimal(value)
            for key, value in data.items()
        }

    elif isinstance(data, list):
        return [
            convert_decimal(item)
            for item in data
        ]

    else:
        return data


# ============================================================
# FUNGSI MENJALANKAN QUERY MYSQL
# ============================================================

def query_to_records(connection, sql):

    result = connection.execute(text(sql))

    return [
        dict(row._mapping)
        for row in result
    ]


# ============================================================
# FUNGSI MENYIMPAN SUMMARY KE MONGODB
# ============================================================

def save_summary(summary_type, data):

    # Mengubah Decimal menjadi float
    data = convert_decimal(data)

    summary_collection.update_one(
        {"_id": summary_type},

        {
            "$set": {
                "summary_type": summary_type,
                "updated_at": datetime.now(timezone.utc),
                "data": data
            }
        },

        upsert=True
    )

    print(f"Summary tersimpan: {summary_type}")


def build_sample(connection):
    """Create a uniformly random reservoir sample without sorting the full table."""
    columns = (
        "age, gender, country, primary_platform, purpose, num_platforms_used, "
        "daily_usage_hours, avg_session_minutes, night_usage, "
        "screen_time_before_sleep, mental_health_score, addiction_level"
    )
    result = connection.execution_options(stream_results=True).execute(
        text(f"SELECT {columns} FROM `{TABLE}`")
    )
    result = result.yield_per(SAMPLE_BATCH_SIZE)
    reservoir = []
    rng = random.Random()

    for row_number, row in enumerate(result, start=1):
        record = dict(row._mapping)
        if row_number <= SAMPLE_SIZE:
            reservoir.append(record)
        else:
            selected = rng.randint(1, row_number)
            if selected <= SAMPLE_SIZE:
                reservoir[selected - 1] = record

    sample_count = len(reservoir)
    staging_name = f"{MONGO_SAMPLE_COLLECTION}_building"
    mongo_db.drop_collection(staging_name)
    staging_collection = mongo_db[staging_name]
    indexes = [
        "age",
        "gender",
        "country",
        "primary_platform",
        "purpose",
        "num_platforms_used",
        "daily_usage_hours",
        "night_usage",
        "addiction_level",
    ]
    staging_collection.create_indexes(
        [IndexModel([(field, 1)]) for field in indexes]
    )

    documents = []
    for index, record in enumerate(reservoir, start=1):
        record["id"] = index
        documents.append(convert_decimal(record))
        if len(documents) == SAMPLE_BATCH_SIZE:
            staging_collection.insert_many(documents, ordered=False)
            documents.clear()
    if documents:
        staging_collection.insert_many(documents, ordered=False)

    staging_collection.rename(MONGO_SAMPLE_COLLECTION, dropTarget=True)
    print(f"Sampel tersimpan: {sample_count} record")


def build_numeric_summaries(connection):
    numeric_columns = [
        "age",
        "daily_usage_hours",
        "avg_session_minutes",
        "num_platforms_used",
        "screen_time_before_sleep",
        "mental_health_score",
    ]
    union_sql = "\nUNION ALL\n".join(
        f"""
        SELECT
            '{column}' AS metric,
            COUNT(`{column}`) AS total,
            MIN(`{column}`) AS minimum,
            MAX(`{column}`) AS maximum,
            AVG(`{column}`) AS average,
            STDDEV_POP(`{column}`) AS standard_deviation
        FROM `{TABLE}`
        """
        for column in numeric_columns
    )
    stats = query_to_records(connection, union_sql)

    for row in stats:
        column = row["metric"]
        median = connection.execute(
            text(
                f"""
                WITH ranked AS (
                    SELECT
                        `{column}` AS value,
                        ROW_NUMBER() OVER (ORDER BY `{column}`) AS rank_position,
                        COUNT(*) OVER () AS row_count
                    FROM `{TABLE}`
                    WHERE `{column}` IS NOT NULL
                )
                SELECT AVG(value) AS median
                FROM ranked
                WHERE rank_position IN (
                    FLOOR((row_count + 1) / 2),
                    FLOOR((row_count + 2) / 2)
                )
                """
            )
        ).scalar()
        row["median"] = median

    save_summary("numeric_stats_summary", stats)


def build_distribution_histogram(connection, column, summary_type, bin_count=8):
    rows = query_to_records(
        connection,
        f"""
        WITH bounds AS (
            SELECT MIN(`{column}`) AS minimum, MAX(`{column}`) AS maximum
            FROM `{TABLE}`
            WHERE `{column}` IS NOT NULL
        ),
        bucketed AS (
            SELECT
                CASE
                    WHEN bounds.maximum = bounds.minimum THEN 0
                    ELSE LEAST(
                        {bin_count - 1},
                        FLOOR(
                            (source.`{column}` - bounds.minimum)
                            / (bounds.maximum - bounds.minimum) * {bin_count}
                        )
                    )
                END AS bin_index,
                bounds.minimum,
                bounds.maximum
            FROM `{TABLE}` AS source
            CROSS JOIN bounds
            WHERE source.`{column}` IS NOT NULL
        )
        SELECT
            bin_index,
            ROUND(
                minimum + bin_index * (maximum - minimum) / {bin_count},
                2
            ) AS bin_start,
            ROUND(
                CASE
                    WHEN bin_index = {bin_count - 1} THEN maximum
                    ELSE minimum + (bin_index + 1) * (maximum - minimum) / {bin_count}
                END,
                2
            ) AS bin_end,
            COUNT(*) AS total,
            ROUND(
                COUNT(*) * 100.0
                / (SELECT COUNT(`{column}`) FROM `{TABLE}`),
                2
            ) AS percentage
        FROM bucketed
        GROUP BY bin_index, minimum, maximum
        ORDER BY bin_index
        """,
    )
    for row in rows:
        row["category"] = f'{row["bin_start"]}-{row["bin_end"]}'
    save_summary(summary_type, rows)


def build_correlation_summary(connection):
    columns = [
        "age",
        "daily_usage_hours",
        "avg_session_minutes",
        "screen_time_before_sleep",
        "num_platforms_used",
        "mental_health_score",
    ]
    expressions = ["COUNT(*) AS total"]
    for column in columns:
        expressions.extend(
            [
                f"AVG(`{column}`) AS `avg_{column}`",
                f"MIN(`{column}`) AS `min_{column}`",
                f"MAX(`{column}`) AS `max_{column}`",
                f"STDDEV_POP(`{column}`) AS `std_{column}`",
            ]
        )
    pairs = [(left, right) for left in columns for right in columns]
    for left, right in pairs:
        expressions.append(
            f"AVG(`{left}` * `{right}`) AS `avg_product_{left}_{right}`"
        )

    aggregates = connection.execute(
        text(f"SELECT {', '.join(expressions)} FROM `{TABLE}`")
    ).mappings().one()
    rows = []
    for left, right in pairs:
        average_product = float(aggregates[f"avg_product_{left}_{right}"] or 0)
        average_x = float(aggregates[f"avg_{left}"] or 0)
        average_y = float(aggregates[f"avg_{right}"] or 0)
        covariance = average_product - average_x * average_y
        left_std = float(aggregates[f"std_{left}"] or 0)
        right_std = float(aggregates[f"std_{right}"] or 0)
        correlation = covariance / (left_std * right_std) if left_std and right_std else 0
        slope = covariance / (left_std**2) if left_std else 0
        rows.append(
            {
                "x_key": left,
                "y_key": right,
                "total": aggregates["total"],
                "correlation": correlation,
                "slope": slope,
                "intercept": average_y - slope * average_x,
                "x_average": average_x,
                "y_average": average_y,
                "x_minimum": float(aggregates[f"min_{left}"]),
                "x_maximum": float(aggregates[f"max_{left}"]),
            }
        )
    save_summary("correlation_summary", rows)


# ============================================================
# PROSES PEMBUATAN SUMMARY
# ============================================================

def build_once():

    try:

        with engine.connect() as connection:

            print("Koneksi MySQL berhasil!")

            # =================================================
            # 1. SUMMARY UTAMA DASHBOARD
            # =================================================

            overview = query_to_records(
                connection,

                f"""
                SELECT
                    COUNT(*) AS total_respondents,

                    ROUND(AVG(age), 2)
                    AS average_age,

                    ROUND(AVG(daily_usage_hours), 2)
                    AS average_daily_usage_hours,

                    ROUND(AVG(avg_session_minutes), 2)
                    AS average_session_minutes,

                    ROUND(AVG(mental_health_score), 2)
                    AS average_mental_health_score,

                    ROUND(AVG(num_platforms_used), 2)
                    AS average_platforms_used

                FROM `{TABLE}`
                """
            )

            save_summary(
                "overview",
                overview[0]
            )


            # =================================================
            # 2. DISTRIBUSI DATA
            # =================================================

            distribution_columns = [
                "age",
                "gender",
                "country",
                "primary_platform",
                "purpose",
                "addiction_level",
                "night_usage"
            ]

            for column in distribution_columns:

                rows = query_to_records(
                    connection,

                    f"""
                    SELECT
                        `{column}` AS category,

                        COUNT(*) AS total,

                        ROUND(
                            COUNT(*) * 100.0 /
                            (SELECT COUNT(*) FROM `{TABLE}`),
                            2
                        ) AS percentage

                    FROM `{TABLE}`

                    GROUP BY `{column}`

                    ORDER BY total DESC
                    """
                )

                save_summary(
                    f"distribution_{column}",
                    rows
                )


            # =================================================
            # 3. SUMMARY PLATFORM
            # =================================================

            platform_rows = query_to_records(
                connection,

                f"""
                SELECT
                    primary_platform AS platform,

                    COUNT(*) AS total_users,

                    ROUND(
                        AVG(daily_usage_hours),
                        2
                    ) AS average_daily_usage_hours,

                    ROUND(
                        AVG(avg_session_minutes),
                        2
                    ) AS average_session_minutes,

                    ROUND(
                        AVG(mental_health_score),
                        2
                    ) AS average_mental_health_score,

                    ROUND(
                        AVG(num_platforms_used),
                        2
                    ) AS average_platforms_used,

                    SUM(addiction_level = 'High') AS high_addiction_count,

                    ROUND(
                        SUM(addiction_level = 'High') * 100.0 / COUNT(*),
                        2
                    ) AS high_addiction_percentage

                FROM `{TABLE}`

                GROUP BY primary_platform

                ORDER BY total_users DESC
                """
            )

            save_summary(
                "platform_summary",
                platform_rows
            )


            # =================================================
            # 4. SUMMARY NEGARA
            # =================================================

            country_rows = query_to_records(
                connection,

                f"""
                SELECT
                    country,

                    COUNT(*) AS total_respondents,

                    ROUND(
                        AVG(daily_usage_hours),
                        2
                    ) AS average_daily_usage_hours,

                    ROUND(
                        AVG(mental_health_score),
                        2
                    ) AS average_mental_health_score,

                    ROUND(
                        AVG(avg_session_minutes),
                        2
                    ) AS average_session_minutes,

                    SUM(addiction_level = 'High') AS high_addiction_count,

                    ROUND(
                        SUM(addiction_level = 'High') * 100.0 / COUNT(*),
                        2
                    ) AS high_addiction_percentage,

                    SUM(night_usage = 1) AS night_usage_count,

                    ROUND(
                        SUM(night_usage = 1) * 100.0 / COUNT(*),
                        2
                    ) AS night_usage_percentage

                FROM `{TABLE}`

                GROUP BY country

                ORDER BY total_respondents DESC
                """
            )

            save_summary(
                "country_summary",
                country_rows
            )


            # =================================================
            # 5. SUMMARY TINGKAT ADIKSI
            # =================================================

            addiction_rows = query_to_records(
                connection,

                f"""
                SELECT
                    addiction_level,

                    COUNT(*) AS total_respondents,

                    ROUND(
                        AVG(daily_usage_hours),
                        2
                    ) AS average_daily_usage_hours,

                    ROUND(
                        AVG(mental_health_score),
                        2
                    ) AS average_mental_health_score,

                    ROUND(
                        AVG(screen_time_before_sleep),
                        2
                    ) AS average_screen_time_before_sleep

                FROM `{TABLE}`

                GROUP BY addiction_level

                ORDER BY total_respondents DESC
                """
            )

            save_summary(
                "addiction_summary",
                addiction_rows
            )


            # =================================================
            # 6. PENGGUNAAN MEDIA SOSIAL VS KESEHATAN MENTAL
            # =================================================

            usage_health_rows = query_to_records(
                connection,

                f"""
                SELECT
                    FLOOR(daily_usage_hours)
                    AS usage_hours_group,

                    COUNT(*) AS total_respondents,

                    ROUND(
                        AVG(mental_health_score),
                        2
                    ) AS average_mental_health_score

                FROM `{TABLE}`

                GROUP BY FLOOR(daily_usage_hours)

                ORDER BY usage_hours_group
                """
            )

            save_summary(
                "usage_mental_health_summary",
                usage_health_rows
            )


            # =================================================
            # 7. SUMMARY PENGGUNAAN MALAM HARI
            # =================================================

            night_rows = query_to_records(
                connection,

                f"""
                SELECT
                    night_usage,

                    COUNT(*) AS total_respondents,

                    ROUND(
                        AVG(daily_usage_hours),
                        2
                    ) AS average_daily_usage_hours,

                    ROUND(
                        AVG(screen_time_before_sleep),
                        2
                    ) AS average_screen_time_before_sleep,

                    ROUND(
                        AVG(mental_health_score),
                        2
                    ) AS average_mental_health_score,

                    SUM(addiction_level = 'High') AS high_addiction_count,

                    ROUND(
                        SUM(addiction_level = 'High') * 100.0 / COUNT(*),
                        2
                    ) AS high_addiction_percentage

                FROM `{TABLE}`

                GROUP BY night_usage

                ORDER BY total_respondents DESC
                """
            )

            save_summary(
                "night_usage_summary",
                night_rows
            )

            purpose_rows = query_to_records(
                connection,
                f"""
                SELECT
                    purpose,
                    COUNT(*) AS total_respondents,
                    ROUND(AVG(mental_health_score), 2) AS average_mental_health_score
                FROM `{TABLE}`
                GROUP BY purpose
                ORDER BY total_respondents DESC
                """,
            )
            save_summary("purpose_summary", purpose_rows)

            platform_addiction_rows = query_to_records(
                connection,
                f"""
                SELECT
                    primary_platform AS platform,
                    addiction_level,
                    COUNT(*) AS total_respondents,
                    ROUND(
                        COUNT(*) * 100.0
                        / SUM(COUNT(*)) OVER (PARTITION BY primary_platform),
                        2
                    ) AS percentage
                FROM `{TABLE}`
                GROUP BY primary_platform, addiction_level
                ORDER BY primary_platform, addiction_level
                """,
            )
            save_summary("platform_addiction_summary", platform_addiction_rows)

            platform_purpose_rows = query_to_records(
                connection,
                f"""
                SELECT
                    primary_platform AS platform,
                    purpose,
                    COUNT(*) AS total_respondents
                FROM `{TABLE}`
                GROUP BY primary_platform, purpose
                ORDER BY primary_platform, purpose
                """,
            )
            save_summary("platform_purpose_summary", platform_purpose_rows)

            addiction_score_rows = query_to_records(
                connection,
                f"""
                WITH ranked AS (
                    SELECT
                        addiction_level,
                        mental_health_score,
                        ROW_NUMBER() OVER (
                            PARTITION BY addiction_level
                            ORDER BY mental_health_score
                        ) AS rank_position,
                        COUNT(*) OVER (PARTITION BY addiction_level) AS row_count
                    FROM `{TABLE}`
                    WHERE mental_health_score IS NOT NULL
                )
                SELECT
                    addiction_level,
                    COUNT(*) AS total_respondents,
                    AVG(mental_health_score) AS average_mental_health_score,
                    MAX(
                        CASE
                            WHEN rank_position = FLOOR((row_count - 1) * 0.25) + 1
                            THEN mental_health_score
                        END
                    ) AS score_q1,
                    MAX(
                        CASE
                            WHEN rank_position = FLOOR((row_count - 1) * 0.75) + 1
                            THEN mental_health_score
                        END
                    ) AS score_q3
                FROM ranked
                GROUP BY addiction_level
                ORDER BY addiction_level
                """,
            )
            save_summary("addiction_score_summary", addiction_score_rows)

            build_distribution_histogram(
                connection, "daily_usage_hours", "distribution_daily_usage_hours"
            )
            build_distribution_histogram(
                connection, "mental_health_score", "distribution_mental_health_score"
            )
            build_numeric_summaries(connection)
            build_correlation_summary(connection)
            build_sample(connection)


            # =================================================
            # SELESAI
            # =================================================

            print("\n===================================")
            print("SUMMARY BERHASIL DIBUAT!")
            print("===================================")

            print(f"Database MongoDB : {MONGO_DATABASE}")

            print(f"Collection       : {MONGO_COLLECTION}")

            print("Silakan cek hasilnya di MongoDB Compass.")


    except Exception as error:

        print("\nTerjadi kesalahan:")

        print(error)
        raise


    finally:

        engine.dispose()


def positive_seconds(value):
    seconds = int(value)
    if seconds < 1:
        raise argparse.ArgumentTypeError("--loop must be a positive number of seconds.")
    return seconds


def main():
    parser = argparse.ArgumentParser(description="Build dashboard summaries and sample data.")
    parser.add_argument(
        "--loop",
        type=positive_seconds,
        metavar="N",
        help="Repeat the pipeline every N seconds.",
    )
    args = parser.parse_args()

    try:
        while True:
            build_once()
            if args.loop is None:
                break
            print(f"\nMenunggu {args.loop} detik sebelum pembaruan berikutnya.")
            time.sleep(args.loop)
    finally:
        mongo_client.close()


# ============================================================
# MENJALANKAN PROGRAM
# ============================================================

if __name__ == "__main__":

    main()