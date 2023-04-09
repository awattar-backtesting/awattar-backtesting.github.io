import { format, add, getHours, parse } from "https://cdn.skypack.dev/date-fns@2.16.1";

class Tracker {
    data = {}
    days = new Set();
    addEntry(netzbetreiber, entry) {
        var res = netzbetreiber.processEntry(entry);
        if (res === null) {
            // skip
            return;
        }
        var hour = format(res.timestamp, "H");
        var fullday = format(res.timestamp, "yyyyMMdd")
        this.days.add(fullday);

        if (!(fullday in this.data)) {
            this.data[fullday] = {};
        }
        if (!(hour in this.data[fullday])) {
            this.data[fullday][hour] = 0;
        }
        this.data[fullday][hour] += res.usage;
        return awattar.addDay(fullday);
    }

    postProcess() {
        /* remove incomplete entries */
        var entries = Object.entries(this.data);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (Object.keys(e[1]).length < 22) {
                // console.log("e: ", e);
                // console.log("e[1]: ", e[1]);
                // console.log("e[1].length: ", Object.keys(e[1]).length);
                // console.log("removing this entry: ", e);
                // console.log("removing this entry via: ", e[0]);
                this.days.delete(e[0])
                delete this.data[e[0]];
            }
        }
    }

    getDateBegin() {
        // console.log("entries: ", Object.entries(this.data));
        var ret = Object.entries(this.data)[0]
        // console.log("ret: ", ret);
        return ret[0];
    }

    getDateEnd() {
    }
}

class Awattar {
    data = {}
    async addDay(fullday) {
        if (fullday in this.data) {
            // console.log("cache hit for ", fullday);
            return;
        }
        this.data[fullday] = "requesting"

        var date = parse(fullday, "yyyyMMdd", new Date());
        var unixStamp = date.getTime();

        const response = await fetch('https://api.awattar.at/v1/marketdata?start=' + unixStamp)
        const data = await response.json();
        var i = 0;

        this.data[fullday] = []
        for (i = 0; i < data['data'].length; i++) {
            this.data[fullday][i] = data['data'][i].marketprice / 10.0;
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
    localStorage.setItem('awattarCache', JSON.stringify(a.data));
}


const tracker = new Tracker();
const awattar = loadAwattarCache();

const prevBtn = document.getElementById('prevBtn');
const graphDescr = document.getElementById('graphDescr');
const nextBtn = document.getElementById('nextBtn');
const costs = document.getElementById('costs');
const costslbl = document.getElementById('costslbl');
const warningholder = document.getElementById('warningHolder');
prevBtn.style.visibility = 'hidden';
graphDescr.style.visibility = 'hidden';
nextBtn.style.visibility = 'hidden';
costs.style.visibility = 'hidden';
costslbl.style.visibility = 'hidden';
warningHolder.style.visibility = 'hidden';
var dayIndex = 0;
var oldChart = null;

prevBtn.addEventListener('click', e => {
	dayIndex--;
	if (dayIndex < 0) {
        var len = Array.from(tracker.days.keys()).length;
		dayIndex = len - 1;
	}
    displayDay(dayIndex);
});
nextBtn.addEventListener('click', e => {
	dayIndex++;
    var len = Array.from(tracker.days.keys()).length;
	if (dayIndex >= len) {
        dayIndex = 0;
	}
    displayDay(dayIndex);
});

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
        warningHolder.style.visibility = 'hidden';
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
                    tracker.postProcess();

                    (async () => {
                        await Promise.all(entries).then(data => {
                            storeAwattarCache(awattar);
                            console.log("final awattar", awattar);
                            prevBtn.style.visibility = 'visible';
                            graphDescr.style.visibility = 'visible';
                            nextBtn.style.visibility = 'visible';
                            calculateCosts();
                            displayDay(dayIndex);
                        });
                    })();
                }
            });
        };

        for (let file of fileInputs[0].files) {
            reader.readAsText(file)
        }
    };
});

function calculateCosts() {
    console.log("tracker: ", tracker);
    var months = {}
    var monthsKwh = {}
    var days = Array.from(tracker.days);
    for (var idx = 0; idx < days.length; idx++) {
        var day = days[idx];
        var monthKey = day.substring(0, 6);
        if (!(monthKey in months)) {
            months[monthKey] = 0.0;
        }
        if (!(monthKey in monthsKwh)) {
            monthsKwh[monthKey] = 0.0;
        }
        var len = Array.from(Object.keys(tracker.data[day])).length;
        var usages = tracker.data[day];
        var prices = awattar.data[day];
        var sumPrice = 0.0;
        var sumKwh = 0.0;
        for (var i = 0; i < len; i++) {
            if (!(i in usages)) {
                // Zeitumstellung
                continue;
            }
            sumPrice += usages[i] * prices[i];
            sumKwh += usages[i];
        }
        months[monthKey] += sumPrice;
        monthsKwh[monthKey] += sumKwh;
    }
    var content = "<tbody>";
    var monthsArray = Object.keys(months);
    for (var idx = 0; idx < monthsArray.length; idx++) {
        var e = monthsArray[idx];
        content += "<tr>";
        content += "<td><b>" + format(parse(e, "yyyyMM", new Date()), "yyyy-MM") + "<b></td>";
        content += "<td>" + (monthsKwh[e]).toFixed(2) + " kWh</td>";
        content += "<td>" + ((months[e] / 100) / monthsKwh[e]).toFixed(2) + " ct/kWh</td>";
        content += "<td>" + (months[e] / 100).toFixed(2) + " &euro;</td>";
        content += "<td>" + (months[e] * 1.2 / 100).toFixed(2) + " &euro;</td>";
        content += "<td>" + (months[e] * 1.2 * 1.03 / 100).toFixed(2) + " &euro;</td>";
        content += "</tr>";
    }
    content += "</tbody>";
    costs.innerHTML += content;
	costs.style.visibility = 'visible';
    costslbl.style.visibility = 'visible';
}

function displayDay(index) {
    var fullday = Array.from(tracker.days)[index];
    graphDescr.innerHTML = '' + format(parse(fullday, 'yyyyMMdd', new Date()), 'yyyy-MM-dd');

    if (oldChart != null) {
        oldChart.destroy();
    }
    var ctx = document.getElementById('awattarChart').getContext('2d');

    // console.log("awattar.data[fullday]: ", awattar.data[fullday]);
    var data = {
        // labels: ['January', 'February', 'March', 'April', 'May', 'June', 'July'],
        labels: Array.from({length: 25}, (_, i) => i.toString()),
        datasets: [
            {
                label: 'Verbrauch in kWh',
                data: tracker.data[fullday],
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                yAxisID: 'y1',
                tension: 0.1
            },
            {
                label: 'ct/kWh',
                data: awattar.data[fullday],
                fill: false,
                borderColor: 'rgb(192, 75, 75)',
                yAxisID: 'y2',
                tension: 0.1
            },
        ]
    };

    var options = {
        scales: {
            x: {
                title: {
                    text: 'Stunde',
                    display: true,
                    align: 'center',
                }
            },
            y1: {
                title: {
                    display: true,
                    text: 'kWh',
                },
                position: 'left',
                beginAtZero: true
            },
            y2: {
                title: {
                    display: true,
                    text: 'ct/kWh',
                },
                position: 'right',
                beginAtZero: true
            }
        },
        interaction: {
            mode: 'index'
        }
    };

    var myChart = new Chart(ctx, {
        type: 'line',
        data: data,
        options: options
    });
    oldChart = myChart;
}

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

function displayWarning(warning) {
    console.log("Fehler: ", warning);
    warningHolder.innerHTML = warning;
    warningHolder.style.visibility = 'visible';
}
function selectBetreiber(sample) {
    if (NetzNOEEinspeiser.probe(sample)) {
        displayWarning("Falsche Daten (Einspeisepunkt). Bitte Bezug waehlen");
        return null;
    }
    if (NetzNOEVerbrauch.probe(sample)) {
        return NetzNOEVerbrauch;
    }
    displayWarning("Netzbetreiber fuer Upload unbekannt: ");
    console.log("sample: ", sample);
    return null;
}

