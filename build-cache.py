import datetime
import urllib.request
import urllib.parse
import pickle
import os
import time
import pytz
import json

def _unix_time_stamp_ms(arg):
    return str(int(arg.timestamp() * 1000))

def _get_timestamp(day, month, year, timezoneinfo):
    return _unix_time_stamp_ms(_get_timestamp0(day, month, year, timezoneinfo))

def _get_timestamp0(day, month, year, timezoneinfo):
    dt = datetime.datetime(year = year, month = month, day = day, minute = 0)
    if timezoneinfo:
        return timezoneinfo.localize(dt)
    return dt


class EnergyCharts:
    def __init__(self):
        self.addr = "https://api.energy-charts.info/price"

    def _fetch_day(self, day, month, year, timezoneinfo):
        if day is None or month is None or year is None:
            raise Exception("awattar fetch: day/month/year not specified")

        dt = _get_timestamp0(day, month, year, timezoneinfo)
        bidding_zone = "AT"
        u = self.addr + "?start=" + dt.date().isoformat()
        print("u: " + str(u))
        with urllib.request.urlopen(u) as url:
            data = json.loads(url.read().decode())
            print("len price:" + str(len(data['price'])))
            o = {}
            o['license_info'] = data['license_info']
            payload = []
            for ts, price in zip(data['unix_seconds'], data['price']):
                tss = int(ts)
                payload.append({
                    'start_timestamp': tss * 1000,
                    'end_timestamp': (tss + 15*60) * 1000,
                    'marketprice': price,
                    'unit': data['unit']
                  })
            o['data'] = payload
            return o


class AwattarState:
    _disk_cache = "awattar_state.pickle"
    _delay = 6 # seconds
    def __init__(self):
        self.addr = "https://api.awattar.at/v1/marketdata"
        if os.path.isfile(self._disk_cache):
            self.day_cache = pickle.load(open(self._disk_cache, 'rb'))
        else:
            self.day_cache = {}


    def _fetch_awattar_day(self, day, month, year, timezoneinfo):
        if day is None or month is None or year is None:
            raise Exception("awattar fetch: day/month/year not specified")

        key = (day, month, year)
        if key in self.day_cache:
            timestamp, v = self.day_cache[key]
            if isinstance(v, str):
                return (timestamp, v)

        timestamp = _get_timestamp(day, month, year, timezoneinfo)
        u = self.addr + "?start=" + timestamp
        while True:
            try:
                with urllib.request.urlopen(u) as url:
                    jsondump = url.read().decode()
                    self.day_cache[key] = (timestamp, jsondump)
                    print(f"requested date={key} from '{u}'")
                    # print(f"jsondump from '{u}' for key={key} -> {jsondump}")
                    pickle.dump(self.day_cache, open(self._disk_cache, 'wb'))
                    return (timestamp, jsondump)
            except:
                print("too many requests")
                time.sleep(self._delay)


cet_timezone = pytz.timezone('Europe/Vienna')

awattarState = AwattarState()

endDate = dtoday = cet_timezone.localize(datetime.datetime.now()) - datetime.timedelta(days=1)
startDate = dtoday - datetime.timedelta(days=7*356)

iDate = startDate

# 60min cache
if False:
    while iDate < endDate:
        timestamp = _get_timestamp(iDate.day, iDate.month, iDate.year, cet_timezone)
        cachefile = "./docs/cache60/" + timestamp
        if not os.path.isfile(cachefile):
            timestamp2, jsondump = awattarState._fetch_awattar_day(iDate.day, iDate.month, iDate.year, cet_timezone)
            assert timestamp == timestamp2, f"iDate: {iDate}, timestamp: {timestamp}, timetamp2: {timestamp2}"
            with open(cachefile, 'w') as f:
                f.write(jsondump)
        iDate = iDate + datetime.timedelta(days=1)


# 15min cache
endDate = dtoday = cet_timezone.localize(datetime.datetime.now()) - datetime.timedelta(days=1)
startDate = dtoday - datetime.timedelta(days=2)

iDate = startDate

if True:
    while iDate < endDate:
        timestamp = _get_timestamp(iDate.day, iDate.month, iDate.year, cet_timezone)
        cachefile = "./docs/cache15/" + timestamp
        if not os.path.isfile(cachefile):
            jsondump = EnergyCharts()._fetch_day(iDate.day, iDate.month, iDate.year, cet_timezone)
            with open(cachefile, 'w') as f:
                json.dump(jsondump, f, indent=2)
        iDate = iDate + datetime.timedelta(days=1)
