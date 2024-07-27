import datetime
import urllib.request
import urllib.parse
import pickle
import os
import time

def _unix_time_stamp_ms(arg):
    return str(int(arg.timestamp() * 1000))

class AwattarState:
    _disk_cache = "awattar_state.pickle"
    _delay = 6 # seconds
    def __init__(self):
        self.addr = "https://api.awattar.at/v1/marketdata"
        if os.path.isfile(self._disk_cache):
            self.day_cache = pickle.load(open(self._disk_cache, 'rb'))
        else:
            self.day_cache = {}

    def _get_timestamp(self, day, month, year):
        dt = datetime.datetime(year = year, month = month, day = day, minute = 0)
        return _unix_time_stamp_ms(dt)


    def _fetch_awattar_day(self, day, month, year):
        if day is None or month is None or year is None:
            raise Exception("awattar fetch: day/month/year not specified")

        key = (day, month, year)
        dt_now = datetime.datetime.now()
        if key in self.day_cache:
            timestamp, v = self.day_cache[key]
            if isinstance(v, str):
                return (timestamp, v)

        timestamp = self._get_timestamp(day, month, year)
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


awattarState = AwattarState()

endDate = dtoday = datetime.datetime.now() - datetime.timedelta(days=1)
startDate = dtoday - datetime.timedelta(days=7*356)

iDate = startDate

while iDate < endDate:
    timestamp = awattarState._get_timestamp(iDate.day, iDate.month, iDate.year)
    cachefile = "./docs/cache/" + str(timestamp)
    if not os.path.isfile(cachefile):
        timestamp2, jsondump = awattarState._fetch_awattar_day(iDate.day, iDate.month, iDate.year)
        assert timestamp == timestamp2, f"iDate: {iDate}, timestamp: {timestamp}, timetamp2: {timestamp2}"
        with open(cachefile, 'w') as f:
            f.write(jsondump)
    iDate = iDate + datetime.timedelta(days=1)
