from sqlalchemy import create_engine, text
import pandas as pd

# Konfigurasi MySQL Laragon
HOST = "localhost"
PORT = 3306
USER = "root"
PASSWORD = ""
DATABASE = "data_genz"

# Nama tabel
TABLE = "genz_social_media_usage_1m"

# Membuat koneksi
engine = create_engine(
    f"mysql+pymysql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DATABASE}"
)

try:
    with engine.connect() as connection:

        print("Koneksi MySQL berhasil!")

        # Menghitung jumlah data
        query = text(f"SELECT COUNT(*) FROM `{TABLE}`")

        total_data = connection.execute(query).scalar()

        print(f"Total data Gen Z: {total_data:,}")

        # Mengambil 5 data pertama
        df = pd.read_sql_query(
            f"SELECT * FROM `{TABLE}` LIMIT 5",
            connection
        )

        print("\nContoh data:")
        print(df)

except Exception as e:
    print("Koneksi gagal!")
    print(e)

finally:
    engine.dispose()