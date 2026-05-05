"""Refresh the on-disk EPEX price caches under docs/.

Two sources, two cache directories:

  docs/cache60/  hourly EPEX prices from api.awattar.at (2017+ history)
  docs/cache15/  15-min EPEX prices from api.energy-charts.info AT bidding
                 zone. The AT zone only switched to quarter-hourly on
                 2025-10-01; 2025-09-30 is still hourly and we grab it too
                 so the dataset is contiguous.

Cache filenames are the local-midnight (Europe/Vienna) timestamp in ms.
Both sources emit the same payload shape (a JSON object with `data: [{
start_timestamp, end_timestamp, marketprice, unit }]`) so the frontend
loader can stay format-agnostic.
"""

import datetime
import json
import os
import time
import urllib.request

import pytz


def _unix_time_stamp_ms(dt):
    return str(int(dt.timestamp() * 1000))


def _midnight(day, month, year, tz):
    return tz.localize(datetime.datetime(year=year, month=month, day=day))


class AwattarSource:
    """Hourly EPEX prices from api.awattar.at."""
    cache_dir = "./docs/cache60"
    _retry_delay = 6  # seconds

    def __init__(self):
        self.addr = "https://api.awattar.at/v1/marketdata"

    def fetch(self, dt):
        u = self.addr + "?start=" + _unix_time_stamp_ms(dt)
        while True:
            try:
                with urllib.request.urlopen(u) as url:
                    return url.read().decode()
            except Exception as e:
                print(f"[awattar] fetch failed ({e!r}); retrying in {self._retry_delay}s", flush=True)
                time.sleep(self._retry_delay)


class EnergyChartsSource:
    """15-min EPEX prices from api.energy-charts.info (AT bidding zone)."""
    cache_dir = "./docs/cache15"
    _retry_delay = 6
    _bidding_zone = "AT"

    def __init__(self):
        self.addr = "https://api.energy-charts.info/price"

    def fetch(self, dt):
        u = f"{self.addr}?bzn={self._bidding_zone}&start={dt.date().isoformat()}"
        while True:
            try:
                with urllib.request.urlopen(u) as url:
                    raw = json.loads(url.read().decode())
                    return self._normalize(raw)
            except Exception as e:
                print(f"[energy-charts] fetch failed ({e!r}); retrying in {self._retry_delay}s", flush=True)
                time.sleep(self._retry_delay)

    @staticmethod
    def _normalize(raw):
        # Slot duration is implicit: hourly responses have ~24 entries
        # (22..25 with DST), 15-minute responses have ~96 (92..100). The
        # threshold sits comfortably between the two regimes.
        slot_minutes = 60 if len(raw['price']) < 26 else 15
        payload = []
        for ts, price in zip(raw['unix_seconds'], raw['price']):
            tss = int(ts)
            payload.append({
                'start_timestamp': tss * 1000,
                'end_timestamp': (tss + slot_minutes * 60) * 1000,
                'marketprice': price,
                'unit': raw['unit'],
            })
        return json.dumps({
            'license_info': raw['license_info'],
            'data': payload,
        }, indent=2)


def fill_cache(source, start_date, end_date, tz):
    os.makedirs(source.cache_dir, exist_ok=True)
    total_days = (end_date.date() - start_date.date()).days
    name = type(source).__name__
    print(f"[{name}] window {start_date.date()} .. {end_date.date()} ({total_days} days)", flush=True)

    fetched = 0
    skipped = 0
    iDate = start_date
    day_idx = 0
    while iDate < end_date:
        day_idx += 1
        dt = _midnight(iDate.day, iDate.month, iDate.year, tz)
        cachefile = f"{source.cache_dir}/{_unix_time_stamp_ms(dt)}"
        if os.path.isfile(cachefile):
            skipped += 1
        else:
            print(f"[{name}] {day_idx}/{total_days} fetching {iDate.date()}", flush=True)
            payload = source.fetch(dt)
            with open(cachefile, 'w') as f:
                f.write(payload)
            fetched += 1
        iDate += datetime.timedelta(days=1)

    print(f"[{name}] done: fetched {fetched}, skipped {skipped} (already cached)", flush=True)


if __name__ == "__main__":
    cet = pytz.timezone("Europe/Vienna")
    # Snap to local midnight so the loop's strict `<` comparison against
    # `end_date` always covers yesterday — without this, an end_date set
    # to wall-clock now would race the day key it is meant to include.
    today = datetime.datetime.now(cet).date()
    end_date = cet.localize(datetime.datetime.combine(today, datetime.time()))

    fill_cache(
        AwattarSource(),
        end_date - datetime.timedelta(days=7 * 356),
        end_date,
        cet,
    )

    fill_cache(
        EnergyChartsSource(),
        cet.localize(datetime.datetime(2025, 9, 30)),
        end_date,
        cet,
    )
