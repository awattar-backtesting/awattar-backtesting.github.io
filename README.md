# [awattar-backtesting.github.io](https://awattar-backtesting.github.io)
A tool to visualize your electricity usage with aWATTar

# Run Locally
Just start [index.html](docs\index.html), but make sure to allow CORS from local machine.
Therefore you either run your own webserver or just start chrome with disabled web security:
`chrome.exe --user-data-dir="C://Chrome dev session" --disable-web-security`

# Calc export tariffs
Export tariffs are automatically detected if the data is provided accordingly by the network operator.

## Netz OÖ
Change the line
> "Date";"kWh";"kW";"Status";
to
> "Date";"Feed-in kWh";"kW";"Status";
to use the feed-in data.
