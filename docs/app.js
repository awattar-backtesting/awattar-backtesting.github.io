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
        }
        this[fullday][hour] += res.usage;
        return awattar.addDay(fullday);
    }

    getSubTracker(start, end) {
    }

    getDateBegin() {
    }

    getDateEnd() {
    }
}

class Awattar {
    data = {}
    first = true;
    async addDay(fullday) {
        if (fullday in this.data) {
            console.log("cache hit for ", fullday);
            return;
        }
        Object.defineProperty(this.data, fullday, {
            value: "requesting",
            writable: true
        });

        var date = parse(fullday, "yyyy-MM-dd", new Date());
        var unixStamp = date.getTime();

        if (this.first) {
            console.log("unixStamp: ", unixStamp);
        }

        const response = await fetch('https://api.awattar.at/v1/marketdata?start=' + unixStamp)
        const data = await response.json();
        if (this.first) {
            console.log("awattar data: ", data['data']);
        }
        var i = 0;

        Object.defineProperty(this.data, fullday, {
            value: [],
            writable: true
        });
        for (i = 0; i < data['data'].length; i++) {
            this.data[fullday][i] = data['data'][i].marketprice / 10.0;
        }
        if (this.first) {
            console.log('addDay', this);
        }
        this.first = false;
    }
}

function loadAwattarCache() {
    var awattar = new Awattar();
    var cache = localStorage.getItem('awattarCache');
    if (cache === null) {
        return awattar;
    }
    awattar.data = JSON.parse(cache);
    return awattar;
}

function storeAwattarCache(a) {
    var obj = Object.assign({}, a.data)
    console.log("stringify for: ", obj);
    console.log("stringify for: ", JSON.stringify(obj));
    localStorage.setItem('awattarCache', JSON.stringify(obj));
}


const tracker = new Tracker();
const awattar = loadAwattarCache();

document.addEventListener("DOMContentLoaded", function() {
    /* <Collapsible support> */
    var coll = document.getElementsByClassName("collapsible");
    var i;

    for (i = 0; i < coll.length; i++) {
      coll[i].addEventListener("click", function() {
        this.classList.toggle("active");
        var content = this.nextElementSibling;
        if (content.style.maxHeight){
          content.style.maxHeight = null;
        } else {
          content.style.maxHeight = content.scrollHeight + "px";
        }
      });
    }
    /* </Collapsible support> */

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
                    var entries = [];

                    while (i < d.length) {
                        entries.push(tracker.addEntry(netzbetreiber, d[i]));
                        i++;
                    }
                    (async () => {
                        await Promise.all(entries);
                        storeAwattarCache(awattar);
                        console.log("final awattar", awattar);
                    })();

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

