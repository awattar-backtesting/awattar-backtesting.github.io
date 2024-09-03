import requests
import csv
import os
import yaml
from datetime import datetime, timedelta

def load_config(filename='configuration.yaml'):
    with open(filename, 'r') as f:
        config = yaml.safe_load(f)
    return config

def download_data(date, metering_point, cookie):
    formatted_date = date.strftime("%Y-%m-%dT22:00:00.000Z")
    url = f"https://www.endkundenwebportal.at/enView.Portal/api/consumption/date?date={formatted_date}&meteringPointIdentifier={metering_point}&format=csv"
    headers = {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    }
    response = requests.get(url, headers=headers)
    if response.status_code == 200:
        return response.content
    else:
        print(f"Failed to download data for {formatted_date}. Status code: {response.status_code}")
        return None

def merge_csv_files(output_filename, input_filenames):
    with open(output_filename, 'w', newline='') as output_file:
        csv_writer = csv.writer(output_file)
        header_written = False
        for filename in input_filenames:
            with open(filename, 'r') as input_file:
                csv_reader = csv.reader(input_file)
                if not header_written:
                    csv_writer.writerow(next(csv_reader))
                    header_written = True
                else:
                    next(csv_reader)  # Skip the header
                    for row in csv_reader:
                        csv_writer.writerow(row)

def get_days_in_month(year, month):
    if month == 12:
        next_year = year + 1
        next_month = 1
    else:
        next_year = year
        next_month = month + 1
    days_in_month = (datetime(next_year, next_month, 1) - datetime(year, month, 1)).days
    return days_in_month

def main():
    config = load_config()
    metering_point = config.get('metering_point')
    cookie = config.get('cookie')
    year_month = input("Bitte geben Sie das Jahr und den Monat im Format YYYY-MM ein: ")
    year, month = map(int, year_month.split('-'))
    days_in_month = get_days_in_month(year, month)
    output_filename = f"ClamStrom-{year_month}.csv"
    input_filenames = []

    for day in range(1, days_in_month+1):
        date = datetime(year, month, day)
        data = download_data(date, metering_point, cookie)
        if data:
            filename = f"consumption_{date.strftime('%Y-%m-%d')}.csv"
            with open(filename, 'wb') as f:
                f.write(data)
            input_filenames.append(filename)

    merge_csv_files(output_filename, input_filenames)

    # Cleanup individual CSV files
    for filename in input_filenames:
        os.remove(filename)

if __name__ == "__main__":
    main()
