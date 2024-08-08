import datetime
import time

def _get_unix_timestamp(day, month, year):
    dt = datetime.datetime(year = year, month = month, day = day)
    print(f"dt: {dt}")
    return dt.timestamp()

endDate = datetime.datetime.now()
print("unix timestamp: " + str(_get_unix_timestamp(endDate.day, endDate.month, endDate.year)))

print("mytz: " + "%+4.4d" % (time.timezone / -(60*60) * 100))

