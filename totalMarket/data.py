import requests
import csv
import time
from datetime import datetime

# =========================
# 설정
# =========================
SYMBOL = "BTCUSDT"
INTERVAL = "1m"   # 1m, 5m, 15m, 1h ...
START_DATE = "2024-01-01 00:00:00"

BATCH_LIMIT = 1500
SLEEP_SEC = 0.2

INTERVAL_MS_MAP = {
    "1m": 60_000,
    "3m": 3 * 60_000,
    "5m": 5 * 60_000,
    "15m": 15 * 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "2h": 2 * 60 * 60_000,
    "4h": 4 * 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "8h": 8 * 60 * 60_000,
    "12h": 12 * 60 * 60_000,
    "1d": 24 * 60 * 60_000,
}

def to_ms(date_str):
    dt = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
    return int(dt.timestamp() * 1000)

def ms_to_str(ms):
    return datetime.fromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M:%S")

def collect(symbol, interval, start_date):
    url = "https://fapi.binance.com/fapi/v1/klines"

    interval_ms = INTERVAL_MS_MAP[interval]
    start_ms = to_ms(start_date)

    all_rows = []

    while True:
        params = {
            "symbol": symbol,
            "interval": interval,
            "startTime": start_ms,
            "limit": BATCH_LIMIT
        }

        response = requests.get(url, params=params)
        data = response.json()

        if not data:
            break

        all_rows.extend(data)

        first = data[0][0]
        last = data[-1][0]

        print(
            f"{ms_to_str(first)} ~ {ms_to_str(last)} "
            f"| batch {len(data)} | total {len(all_rows)}"
        )

        start_ms = last + interval_ms

        if len(data) < BATCH_LIMIT:
            break

        time.sleep(SLEEP_SEC)

    return all_rows

def save_csv(symbol, interval, rows):
    filename = f"{symbol}_{interval}.csv"

    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f)
        writer.writerow([
            "time","open","high","low","close","volume"
        ])

        for r in rows:
            writer.writerow([
                ms_to_str(r[0]),
                r[1],
                r[2],
                r[3],
                r[4],
                r[5]
            ])

    print(f"saved -> {filename}")

if __name__ == "__main__":
    rows = collect(
        symbol=SYMBOL,
        interval=INTERVAL,
        start_date=START_DATE
    )

    save_csv(SYMBOL, INTERVAL, rows)