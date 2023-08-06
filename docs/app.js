import { format, add, getHours, parse, parseISO } from "https://cdn.skypack.dev/date-fns@2.16.1";

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
        /* remove incomplete entries, e.g. if 15-interval is not activated some
         * Netzbetreiber put one entry for each day. This kind of data is not
         * useful for our purpose. */
        var entries = Object.entries(this.data);
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (Object.keys(e[1]).length < 2) {
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


var tracker = null;
var awattar = null;

const prevBtn = document.getElementById('prevBtn');
const graphDescr = document.getElementById('graphDescr');
const nextBtn = document.getElementById('nextBtn');
const costsMonthly = document.getElementById('costsMonthly');
const costsDaily = document.getElementById('costsDaily');
const costslblMonthly = document.getElementById('costslblMonthly');
const costslblDaily= document.getElementById('costslblDaily');
const warningholder = document.getElementById('warningHolder');
prevBtn.style.visibility = 'hidden';
graphDescr.style.visibility = 'hidden';
nextBtn.style.visibility = 'hidden';
costsMonthly.style.visibility = 'hidden';
costsDaily.style.visibility = 'hidden';
costslblMonthly.style.visibility = 'hidden';
costslblDaily.style.visibility = 'hidden';
warningHolder.style.visibility = 'hidden';
var dayIndex = 0;
var oldChart = null;

// awattar alt: https://web.archive.org/web/20230316213722/https://api.awattar.at/v1/templates/1126e217-aa97-4d3e-9fdf-93cd73f04d3f/content?accept-override=application/pdf
const initialTableStateMonthly = "<thead><tr> <td>Monat</td> <td>Energie</td> <td>Durchschnitt</td> <td>Netto</td> <td>+20% MwSt</td>"
    + "<td>+3% Aufschlag <br />+ 5,75 EUR Grundpreis<br />(<a href=\"https://api.awattar.at/v1/templates/1126e217-aa97-4d3e-9fdf-93cd73f04d3f/content?accept-override=application/pdf\">aWATTar alt</a>)</td>"
    + "<td>+3% + 1.5ct/kWh <br />+ 5,75 EUR Grundpreis<br />(<a href=\"https://api.awattar.at/v1/templates/bba9e568-777c-43a7-b181-79de2188439f/content?accept-override=application/pdf\">aWATTar neu</a>)</td>"
    + "<td>+ 1.2ct/kWh <br />+ 4,99 EUR Grundpreis<br />(<a href=\"https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf\">smartCONTROL</a>)</td>"
    + "</tr> </thead>"

const initialTableStateDaily= "<thead><tr> <td>Datum</td> <td>Energie</td> <td>Durchschnitt</td> <td>Netto</td> <td>+20% MwSt</td>"
+ "<td>+3% Aufschlag <br />(<a href=\"https://api.awattar.at/v1/templates/1126e217-aa97-4d3e-9fdf-93cd73f04d3f/content?accept-override=application/pdf\">aWATTar alt</a>)</td>"
+ "<td>+3% + 1.5ct/kWh <br /><br />(<a href=\"https://api.awattar.at/v1/templates/bba9e568-777c-43a7-b181-79de2188439f/content?accept-override=application/pdf\">aWATTar neu</a>)</td>"
+ "<td>+ 1.2ct/kWh <br /><br />(<a href=\"https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf\">smartCONTROL</a>)</td>"
+ "</tr> </thead>"

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
            /* reset state */
            awattar = loadAwattarCache();
            tracker = new Tracker();
            costsMonthly.innerHTML = initialTableStateMonthly;
            costsDaily.innerHTML = initialTableStateDaily;


            var fileContent = event.target.result;
            // console.log("fileContent: ", fileContent);
            fileContent = stripPlain(fileContent);
            // console.log("fileContent after strip: ", fileContent);

            const bytes = new Uint8Array(fileContent);
            var xls = XLSX.read(bytes, {
                raw: 'true'
            });
            // console.log("xls: ", xls);
            xls = stripXls(xls);
            // console.log("after strip, xls: ", xls);
            fileContent = XLSX.utils.sheet_to_csv(xls.Sheets[xls.SheetNames[0]]);
            console.log("csv: ", fileContent);

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
            reader.readAsArrayBuffer(file)
        }
    };
});

function calculateCosts() {
    console.log("tracker: ", tracker);
    var months = {}
    var monthsKwh = {}
    var monthsFee = {}

    let daily = {}
    let dailyKwh = {}
    let dailyFee = {}

    var days = Array.from(tracker.days);
    for (var idx = 0; idx < days.length; idx++) {
        var day = days[idx];
        var monthKey = day.substring(0, 6);

        let dayKey=day;
        if (!(dayKey in daily)) {
            daily[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyKwh)) {
            dailyKwh[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyFee)) {
            dailyFee[dayKey] = new Decimal(0.0);
        }

        if (!(monthKey in months)) {
            months[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsKwh)) {
            monthsKwh[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsFee)) {
            monthsFee[monthKey] = new Decimal(0.0);
        }
        var len = Array.from(Object.keys(tracker.data[day])).length;
        var usages = tracker.data[day];
        var prices = awattar.data[day];
        var sumPrice = new Decimal(0.0);
        var sumKwh = new Decimal(0.0);
        var sumFee = new Decimal(0.0);
        for (var i = 0; i < len; i++) {
            if (!(i in usages)) {
                // Zeitumstellung
                continue;
            }
            var dUsage = new Decimal(usages[i]);
            var dPrice = new Decimal(prices[i]);

            sumPrice = sumPrice.plus(dUsage.times(dPrice));
            sumFee = sumFee.plus(dPrice.abs().times(0.03));
            sumKwh = sumKwh.plus(dUsage);
            // console.log("dPrice: ", dPrice.toFixed(2));
            // console.log("sumPrice: ", sumPrice.toFixed(2));
        }
        daily[dayKey]=daily[dayKey].plus(sumPrice);
        dailyKwh[dayKey] = dailyKwh[dayKey].plus(sumKwh);
        dailyFee[dayKey] = dailyFee[dayKey].plus(sumFee);

        months[monthKey] = months[monthKey].plus(sumPrice);
        monthsKwh[monthKey] = monthsKwh[monthKey].plus(sumKwh);
        monthsFee[monthKey] = monthsFee[monthKey].plus(sumFee);
    }

    var content = drawTableTframe(months, monthsKwh, monthsFee, "yyyyMM", "yyyy-MM", new Array(575 /* awattar_alt */, 575 /* awattar_neu */, 499 /* smartcontrol */));
    costsMonthly.innerHTML += content;
    costsMonthly.style.visibility = 'visible';
    costslblMonthly.style.visibility = 'visible';

    content = drawTableTframe(daily, dailyKwh, dailyFee, "yyyyMMdd", "yyyy-MM-dd", new Array(0, 0, 0));
    costsDaily.innerHTML += content;
    costsDaily.style.visibility = 'visible';
    costslblDaily.style.visibility = 'visible';
}

function drawTableTframe(tframe, tframeKwh, tframeFee, tframeFmt1, tframeFmt2, vendorgrundgebuehr) {
    let content = "<tbody>";
    var tframeArray = Object.keys(tframe);
    for (var idx = 0; idx < tframeArray.length; idx++) {
        var e = tframeArray[idx];
        content += "<tr>";
        content += "<td><b>" + format(parse(e, tframeFmt1, new Date()), tframeFmt2) + "<b></td>";
        content += "<td>" + tframeKwh[e].toFixed(2) + " kWh</td>";
        content += "<td>" + tframe[e].dividedBy(tframeKwh[e]).toFixed(2) + " ct/kWh</td>";
        content += "<td>" + tframe[e].dividedBy(100).toFixed(2) + " &euro;</td>";
        content += "<td>" + tframe[e].times(1.2).dividedBy(100).toFixed(2) + " &euro;</td>";
        var awattar_alt = tframe[e].times(1.2).plus(tframeFee[e].plus(vendorgrundgebuehr[0]));
        var awattar_neu = tframe[e].plus(tframeKwh[e].times(1.5)).times(1.2).plus(tframeFee[e].plus(vendorgrundgebuehr[1]));
        var smartcontrol = tframe[e].plus(tframeKwh[e].times(1.2)).times(1.2).plus(vendorgrundgebuehr[2]);
        content += "<td>" + awattar_alt.dividedBy(100).toFixed(2)  + " &euro; (&rArr; " + awattar_alt.dividedBy(tframeKwh[e]).toFixed(2)  + " ct/kWh) </td>"; // awattar alt
        content += "<td>" + awattar_neu.dividedBy(100).toFixed(2)  + " &euro; (&rArr; " + awattar_neu.dividedBy(tframeKwh[e]).toFixed(2)  + " ct/kWh) </td>"; // awattar neu (Juli 2023)
        content += "<td>" + smartcontrol.dividedBy(100).toFixed(2) + " &euro; (&rArr; " + smartcontrol.dividedBy(tframeKwh[e]).toFixed(2) + " ct/kWh) </td>"; // smartcontrol
        content += "</tr>";
    }
    return content + "</tbody>";
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
    descriptorTimesub = "timesub";
    dateFormatString = "foo";

    constructor(name, descriptorUsage, descriptorTimestamp, descriptorTimeSub, dateFormatString, usageParser, otherFields, shouldSkip) {
        this.name = name;
        this.descriptorUsage = descriptorUsage;
        this.descriptorTimestamp = descriptorTimestamp;
        this.descriptorTimeSub = descriptorTimeSub;
        this.dateFormatString = dateFormatString;
        this.usageParser = usageParser;
        this.otherFields = otherFields;
        this.shouldSkip = shouldSkip;
    }

    matchUsage(entry) {
        if (this.descriptorUsage[0] === '!') {
            /* fuzzy check as we don't know the exact column name */
            var desc = this.descriptorUsage.substring(1);
            var entries = Object.keys(entry);
            for (var e in entries) {
                if (entries[e].includes(desc)) {
                    return entries[e];
                }
            }
        } else {
            if (this.descriptorUsage in entry) {
                return this.descriptorUsage;
            }
        }
        return null;
    }

    probe(entry) {
        if (this.matchUsage(entry) === null) {
            return false;
        }
        if (!(this.descriptorTimestamp in entry)) {
            return false;
        }
        for (var e in this.otherFields) {
            if (!(this.otherFields[e] in entry)) {
                return false;
            }
        }
        return true;
    }

    processEntry(entry) {
        if (!this.probe(entry)) {
            return null;
        }
        if (this.shouldSkip !== null && this.shouldSkip(entry)) {
            return null;
        }

        var valueTimestamp = entry[this.descriptorTimestamp];
        if (this.descriptorTimeSub !== null) {
            valueTimestamp += " " + entry[this.descriptorTimeSub];
        }
        var parsedTimestamp = null;
        if (this.dateFormatString === "parseISO") {
            parsedTimestamp = parseISO(valueTimestamp);
        } else {
            parsedTimestamp = parse(valueTimestamp, this.dateFormatString, new Date())
        }

        var valueUsage = entry[this.matchUsage(entry)];
        var parsedUsage = valueUsage === "" || valueUsage === undefined ? 0.0 : this.usageParser(valueUsage);

        return {
            timestamp: parsedTimestamp,
            usage: parsedUsage,
        }
    }
};

const NetzNOEEinspeiser = new Netzbetreiber("NetzNÖ", "Gemessene Menge (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", null, null, null);

const NetzNOEVerbrauch = new Netzbetreiber("NetzNÖ", "Gemessener Verbrauch (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ersatzwert"], null);

const NetzOOE = new Netzbetreiber("NetzOÖ", "kWh", "Datum", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["kW", "Status"], null);

const KaerntenNetz = new Netzbetreiber("KaerntenNetz", "kWh", "Datum", "Zeit", "dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Status"], null);

const EbnerStrom = new Netzbetreiber("EbnerStrom", "Wert (kWh)", "Zeitstempel String", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage);
}), ["Angezeigter Zeitraum"], (function (row) {
    var valueObiscode = row["Obiscode"];
    return valueObiscode !== "1.8.0";
}));

const WienerNetze = new Netzbetreiber("WienerNetze", "!Verbrauch [kWh]", "Datum", "Zeit von", "dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Zeit bis"], null);

const SalzburgNetz = new Netzbetreiber("SalzburgNetz", "!Lastgänge", "Datum und Uhrzeit", null, "yyyy-MM-dd HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Status"], null);

const LinzAG = new Netzbetreiber("LinzAG", "Energiemenge in kWh", "Datum von", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ersatzwert"], null);

const StromnetzGraz = new Netzbetreiber("StromnetzGraz", "Verbrauch Einheitstarif", "Ablesezeitpunkt", null, "parseISO", (function (usage) {
    return parseFloat(usage);
}), ["Zaehlerstand Einheitstarif", "Zaehlerstand Hochtarif", "Zaehlerstand Niedertarif", "Verbrauch Hochtarif", "Verbrauch Niedertarif"], null);

const EnergienetzeSteiermark = new Netzbetreiber("EnergieNetzeSteiermark", "Verbrauch", "Verbrauchszeitraum Beginn", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Anlagennummer","Zaehlpunkt","Tarif","Verbrauchszeitraum Ende","Einheit","Messwert: VAL...gemessen, EST...rechnerisch ermittelt"], null);


const EnergienetzeSteiermarkLeistung = new Netzbetreiber("EnergienetzeSteiermarkLeistung", "Wert", "Statistikzeitraum Beginn", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Anlagennummer","Zaehlpunkt","Tarif","Statistikzeitraum Ende","Einheit","Messwert: VAL...gemessen, EST...rechnerisch ermittelt"], null);

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
    if (NetzOOE.probe(sample)) {
        return NetzOOE;
    }
    if (KaerntenNetz.probe(sample)) {
        return KaerntenNetz;
    }
    if (EbnerStrom.probe(sample)) {
        return EbnerStrom;
    }
    if (WienerNetze.probe(sample)) {
        return WienerNetze;
    }
    if (SalzburgNetz.probe(sample)) {
        return SalzburgNetz;
    }
    if (LinzAG.probe(sample)) {
        return LinzAG;
    }
    if (StromnetzGraz.probe(sample)) {
        return StromnetzGraz;
    }
    if (EnergienetzeSteiermark.probe(sample)) {
        return EnergienetzeSteiermark;
    }
    if (EnergienetzeSteiermarkLeistung.probe(sample)) {
        return EnergienetzeSteiermarkLeistung;
    }
    displayWarning("Netzbetreiber fuer Upload unbekannt: ");
    console.log("sample: ", sample);
    return null;
}

function bufferToString(buf) {
    return new Uint8Array(buf)
        .reduce((data, byte) => data + String.fromCharCode(byte), '')
}
function stringToBuffer(str) {
    var buf = new ArrayBuffer(str.length);
    var bufView = new Uint8Array(buf);
    for (var i=0, strLen=str.length; i < strLen; i++) {
        bufView[i] = str.charCodeAt(i);
    }
    return buf;
}
function stripPlain(buf) {
    var input = bufferToString(buf);
    // Kaernten Netz
    // > Kundennummer;XXXXXX
    // > Kundenname;YYYYYYYY
    // > ZP-Nummer;ATXXXXX00XXXX0000XX0XXX0XXXXXXXXX
    // > Beginn;01.01.2020
    // > Ende;29.03.2023
    // > Energierichtung;Netzbezug
    if (input.includes("Kundennummer") && input.includes("Kundenname") && input.includes("ZP-Nummer") && input.includes("Energierichtung")) {
        if (!input.includes("Netzbezug")) {
            displayWarning("Falsche Daten (Einspeisepunkt?). Bitte Bezug waehlen");
            return null;
        }
        return stringToBuffer(input.split("\n").slice(8).join("\n"));
    }
    return buf;
}

function ec(r, c){
    return XLSX.utils.encode_cell({r:r,c:c});
}

function delete_row(ws, row_index){
    var variable = XLSX.utils.decode_range(ws["!ref"])
    for(var R = row_index; R < variable.e.r; ++R){
        for(var C = variable.s.c; C <= variable.e.c; ++C){
            ws[ec(R,C)] = ws[ec(R+1,C)];
        }
    }
    variable.e.r--
    ws['!ref'] = XLSX.utils.encode_range(variable.s, variable.e);
    return ws;
}

function update_sheet_range(ws) {
  var range = {s:{r:20000000, c:20000000},e:{r:0,c:0}};
  Object.keys(ws).filter(function(x) { return x.charAt(0) != "!"; }).map(XLSX.utils.decode_cell).forEach(function(x) {
    range.s.c = Math.min(range.s.c, x.c); range.s.r = Math.min(range.s.r, x.r);
    range.e.c = Math.max(range.e.c, x.c); range.e.r = Math.max(range.e.r, x.r);
  });
  ws['!ref'] = XLSX.utils.encode_range(range);
}

function stripXls(xls) {
    var first_ws = xls.Sheets[xls.SheetNames[0]];
    // Ebner Strom
    // > Zeitstempel String	Obiscode	Wert (kWh)	Angezeigter Zeitraum
    // > Zählpunkt: AT0034600000000000000000XXYYYZZZZ	
    // > 01.03.2023 00:15	1.8.0	0,28	01.03.2023 - 31.03.2023
    // > 01.03.2023 00:15	2.8.0	0	01.03.2023 - 31.03.2023
    if (first_ws.A1.v.includes("Zeitstempel String") && first_ws.A2.v.includes("hlpunkt")) {
        /* fixup broken XLS, so that [!ref] is set correctly */
        update_sheet_range(first_ws);
        /* delete "Zaehlpunkt" row, it confuses the CSV parser */
        delete_row(first_ws, 1);
    }
    return xls;
}
