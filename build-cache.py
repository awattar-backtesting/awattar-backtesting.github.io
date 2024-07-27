import datetime

def _unix_time_stamp_ms(arg):
    r = str(int(arg.timestamp() * 1000))
    print(f"unix time stamp: {r}")
    return r

def _get_timestamp(day, month, year):
    dt = datetime.datetime(year = year, month = month, day = day)
    print(f"dt: {dt}")
    return _unix_time_stamp_ms(dt)

endDate = datetime.datetime.now()
_get_timestamp(endDate.day, endDate.month, endDate.year)
