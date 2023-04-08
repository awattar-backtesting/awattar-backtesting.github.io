import { format, add, getHours, parse } from "https://cdn.skypack.dev/date-fns@2.16.1";

document.addEventListener("DOMContentLoaded", function() {
    fetch('https://api.awattar.at/v1/marketdata?start=1561932000000')
        .then((response) => response.json())
        .then((data) => console.log(data));

    console.log("" + document.getElementById('submit'));

    const fileInputs = document.getElementById('file-form');

    fileInputs.onchange = () => {
        console.log("fileInputs: " + fileInputs[0].files);

        const reader = new FileReader();

        reader.onload = (event) => {
            const fileContent = event.target.result;
            Papa.parse(fileContent, {
                header: true,
                complete: (results) => {
                    var d = results.data;
                    var netzbetreiber = selectBetreiber(d[0]);
                    console.log("length: " + d.length);
                    var i = 0;
                    var labels = []
                    var consumption = []
                    while (i < d.length) {
                        const {date, usage} = netzbetreiber.processEntry(d[i]);
                        labels.push(date)
                        consumption.push(usage);
                        i++;
                    }

                    var ctx = document.getElementById('awattarChart').getContext('2d');

                    var data = {
                        // labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
                        labels: labels,
                        datasets: [{
                            label: 'Electricity Usage',
                            // data: [150, 200, 180, 220, 250, 230, 240],
                            data: consumption,
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

class Tracker {

    getSubTracker(start, end) {
    }

    getDateBegin() {
    }

    getDateEnd() {
    }
}


class Netzbetreiber {
    name = "name";
    descriptorUsage = "usage";
    descriptorTimestamp = "timestamp";
    dateFormatString = "foo";

    constructor(name, descriptorUsage, descriptorTimestamp, dateFormatString) {
        this.name = name;
        this.descriptorUsage = descriptorUsage;
        this.descriptorTimestamp = descriptorTimestamp;
        this.dateFormatString = dateFormatString;
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
        var valueUsage = entry[this.descriptorUsage];
        var valueTimestamp = entry[this.descriptorTimestamp];
        var parsedTimestamp = parse(valueTimestamp, this.dateFormatString, new Date())

        return {
            timestamp: valueTimestamp,
            usage: valueUsage,
        }
    }
};

const NetzNOE = new Netzbetreiber("NetzNÖ", "Gemessene Menge (kWh)", "Messzeitpunkt", "dd.MM.yy HH:mm");

function selectBetreiber(sample) {
    if (NetzNOE.probe(sample)) {
        return NetzNOE;
    }
    console.log("Netzbetreiber fuer sample unbekannt: ", sample);
    return null;
}

