from sqlalchemy import create_engine, text
from pymongo import MongoClient
from datetime import datetime, timezone
from decimal import Decimal


# ============================================================
# KONFIGURASI MYSQL
# ============================================================

HOST = "localhost"
PORT = 3306
USER = "root"
PASSWORD = ""
DATABASE = "data_genz"

TABLE = "genz_social_media_usage_1m"


# ============================================================
# KONFIGURASI MONGODB
# ============================================================

MONGO_URI = "mongodb://localhost:27017/"
MONGO_DATABASE = "genz_analytics"
MONGO_COLLECTION = "dashboard_summaries"


# ============================================================
# MEMBUAT KONEKSI MYSQL
# ============================================================

engine = create_engine(
    f"mysql+pymysql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DATABASE}"
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


# ============================================================
# PROSES PEMBUATAN SUMMARY
# ============================================================

def main():

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
                    ) AS average_platforms_used

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
                    ) AS average_session_minutes

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
                    ) AS average_mental_health_score

                FROM `{TABLE}`

                GROUP BY night_usage

                ORDER BY total_respondents DESC
                """
            )

            save_summary(
                "night_usage_summary",
                night_rows
            )


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


    finally:

        engine.dispose()

        mongo_client.close()


# ============================================================
# MENJALANKAN PROGRAM
# ============================================================

if __name__ == "__main__":

    main()