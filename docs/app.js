import { format, add, getHours, parse } from "https://cdn.skypack.dev/date-fns@2.16.1";

class Tracker {
    addEntry(netzbetreiber, entry) {
        var res = netzbetreiber.processEntry(entry);
        if (res === null) {
            // skip
            return;
        }
        var hour = format(res.timestamp, "H");
        var fullday = format(res.timestamp, "yyyy-MM-dd")

        if (!(fullday in this)) {
            Object.defineProperty(this, fullday, {
                value: {},
                writable: true
            });
        }
        if (!(hour in this[fullday])) {
            this[fullday][hour] = 0;
            // Object.defineProperty(this.fullday, hour, 0);
        }
        this[fullday][hour] += res.usage;
    }

    getSubTracker(start, end) {
    }

    getDateBegin() {
    }

    getDateEnd() {
    }
}


const tracker = new Tracker();

document.addEventListener("DOMContentLoaded", function() {
    fetch('https://api.awattar.at/v1/marketdata?start=1561932000000')
        .then((response) => response.json())
        .then((data) => console.log(data));

    const fileInputs = document.getElementById('file-form');

    fileInputs.onchange = () => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const fileContent = event.target.result;
            Papa.parse(fileContent, {
                header: true,
                complete: (results) => {
                    var d = results.data;
                    var netzbetreiber = selectBetreiber(d[0]);
                    var i = 0;
                    var labels = []
                    var consumption = []
                    while (i < d.length) {
                        tracker.addEntry(netzbetreiber, d[i]);
                        i++;
                    }

                    console.log("tracker: ", tracker);

                    var ctx = document.getElementById('awattarChart').getContext('2d');

                    var data = {
                        // labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
                        labels: Array.from({length: 25}, (_, i) => i.toString()),
                        datasets: [{
                            label: 'Verbrauch in kWh',
                            // data: [150, 200, 180, 220, 250, 230, 240],
                            data: tracker['2023-01-01'],
                            fill: false,
                            borderColor: 'rgb(75, 192, 192)',
                            tension: 0.1
                        }]
                    };

                    // Define chart options
                    var options = {
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    };

                    // Create chart
                    var myChart = new Chart(ctx, {
                        type: 'line',
                        data: data,
                        options: options
                    });
                }
            });
        };

        for (let file of fileInputs[0].files) {
            reader.readAsText(file)
        }
    };


});

class Netzbetreiber {
    name = "name";
    descriptorUsage = "usage";
    descriptorTimestamp = "timestamp";
    dateFormatString = "foo";

    constructor(name, descriptorUsage, descriptorTimestamp, dateFormatString, usageParser) {
        this.name = name;
        this.descriptorUsage = descriptorUsage;
        this.descriptorTimestamp = descriptorTimestamp;
        this.dateFormatString = dateFormatString;
        this.usageParser = usageParser;
    }

    probe(entry) {
        if (!(this.descriptorUsage in entry)) {
            return false;
        }
        if (!(this.descriptorTimestamp in entry)) {
            return false;
        }
        return true;
    }

    processEntry(entry) {
        if (!this.probe(entry)) {
            return null;
        }
        var valueUsage = entry[this.descriptorUsage];
        var valueTimestamp = entry[this.descriptorTimestamp];
        var parsedTimestamp = parse(valueTimestamp, this.dateFormatString, new Date())
        var parsedUsage = this.usageParser(valueUsage);

        return {
            timestamp: parsedTimestamp,
            usage: parsedUsage,
        }
    }
};

const NetzNOEEinspeiser = new Netzbetreiber("NetzNÖ", "Gemessene Menge (kWh)", "Messzeitpunkt", "dd.MM.yyyy HH:mm", null);

const NetzNOEVerbrauch = new Netzbetreiber("NetzNÖ", "Gemessener Verbrauch (kWh)", "Messzeitpunkt", "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}));

function selectBetreiber(sample) {
    if (NetzNOEEinspeiser.probe(sample)) {
        console.log("Falsche Daten (Einspeisepunkt). Bitte Bezug waehlen");
        return null;
    }
    if (NetzNOEVerbrauch.probe(sample)) {
        return NetzNOEVerbrauch;
    }
    console.log("Netzbetreiber fuer sample unbekannt: ", sample);
    return null;
}

