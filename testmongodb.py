from pymongo import MongoClient

# Koneksi MongoDB
client = MongoClient("mongodb://localhost:27017/")

# Memilih database
db = client["genz_analytics"]

# Memilih collection
collection = db["analytics_summary"]

# Mengecek koneksi
try:
    client.admin.command("ping")
    print("Koneksi MongoDB berhasil!")

    # Memasukkan data percobaan
    data = {
        "summary_type": "test",
        "dataset": "Gen Z Social Media Usage",
        "total_records": 1000000
    }

    collection.insert_one(data)

    print("Data berhasil dimasukkan!")

except Exception as e:
    print("Error:", e)

finally:
    client.close()