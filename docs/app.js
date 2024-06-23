import { format, add, getHours, parse, parseISO } from "https://cdn.skypack.dev/date-fns@2.16.1";
import {
    awattar_alt,
    awattar_neu,
    smartcontrol_alt,
    smartcontrol_neu,
    steirerstrom,
    spotty_direkt,
    smartcontrol_sunny } from "./tariffs.js";
import {
    listOfNetzbetreiber,
} from "./netzbetreiber.js";

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
            this.data[fullday][hour] = new Decimal(0.0);
        }
        this.data[fullday][hour] = this.data[fullday][hour].plus(new Decimal(res.usage));
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
}

class Awattar {
    data = {}

    /* bump if format changes */
    version = "2023-12-29_v2";

    async addDay(fullday) {
        if (fullday in this.data) {
            // console.log("cache hit for ", fullday);
            return;
        }
        this.data[fullday] = "requesting"

        var date = parse(fullday, "yyyyMMdd", new Date());
        var unixStamp = date.getTime();

        const response = await fetchAwattarMarketdata(unixStamp); 
        const d = await response.json();
        var i = 0;

        this.data[fullday] = []
        for (i = 0; i < d['data'].length; i++) {
            this.data[fullday][i]       = new Decimal(d['data'][i].marketprice).dividedBy(10).toFixed(3);
        }
    }
}

async function fetchAwattarMarketdata(unixStamp) {
    // cannot access 'x-retry-in' header from response as CORS headers are not returned on failures from Awattar
    var waitForRetryMillis = 10000;

    var retryFetch = 0;
    do {
        var response;
        try {
            response = await fetch('https://api.awattar.at/v1/marketdata?start=' + unixStamp)
        } catch (error) {
            console.log("Requested failed; will retry to get Awattar market data:", error);
            retryFetch++;
        }
        if (response && response.ok || retryFetch > 10) {
            return response;
        } // else
        if (retryFetch > 0) {
            await sleep (waitForRetryMillis);
        }
    } while (retryFetch > 0);
}

function sleep (time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

function loadAwattarCache() {
    var a = new Awattar();
    var cache = localStorage.getItem('awattarCache');
    if (cache === null) {
        return a;
    }

    let cached = JSON.parse(cache);
    if (cached.version != a.version) {
        return a;
    }
    a.data = cached.data;
    return a;
}

function storeAwattarCache(a) {
    let object = {
        version: a.version,
        data: a.data,
    }
    localStorage.setItem('awattarCache', JSON.stringify(object));
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

function genTableInit(datefmt, tariffs, feedin) {
    let content = "<thead>";
    content += "<tr class=\"tablethickborderbottom\">"
    content += "<td>" + datefmt + "</td>";
    content += "<td>Energie</td>";
    content += "<td>Erzielter Ø Preis</td>";
    if (!feedin) {
        content += "<td>H0 Lastprofil Ø <sup>1</sup></td>";
    }
    if (!feedin) {
        content += "<td>Netto</td>";
        content += "<td class=\"tablethickborderright\">+20% MwSt</td>";
    } else {
        content += "<td class=\"tablethickborderright\">Netto</td>";
    }
    tariffs.forEach (t => {
        let description = (datefmt == "Monat") ? t.description : t.description_day;
        content += "<td>"+ description + "</br>(<a href=\"" + t.tarifflink + "\">" + t.name + "</a>)</td>";
    })
    content += "</tr></thead>";
    return content;
}

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

            var fileContent = event.target.result;
            // console.log("fileContent: ", fileContent);
            fileContent = stripPlain(fileContent);
            console.log("fileContent after strip: ", fileContent);

            const bytes = new Uint8Array(fileContent);
            var xls = XLSX.read(bytes, {
                raw: 'true'
            });
            console.log("xls: ", xls);
            xls = stripXls(xls);
            console.log("after strip, xls: ", xls);
            fileContent = XLSX.utils.sheet_to_csv(xls.Sheets[xls.SheetNames[0]]);
            console.log("csv: ", fileContent);

            Papa.parse(fileContent, {
                header: true,
                complete: (results) => {
                    var d = results.data;
                    var netzbetreiber = selectBetreiber(d[0]);
                    var feedin = netzbetreiber.feedin;
                    var i = 0;
                    var entries = [];

                    while (i < d.length) {
                        entries.push(tracker.addEntry(netzbetreiber, d[i]));
                        i++;
                    }
                    tracker.postProcess();

                    (async () => {
                        const lastprofile_array = await (await fetch('./lastprofile.xls')).arrayBuffer();
                        const lastprofile_sheets = XLSX.read(lastprofile_array);
                        const h0Sheet = lastprofile_sheets.Sheets[lastprofile_sheets.SheetNames[0]];
                        await Promise.all(entries).then(data => {
                            storeAwattarCache(awattar);
                            console.log("final awattar", awattar);
                            prevBtn.style.visibility = 'visible';
                            graphDescr.style.visibility = 'visible';
                            nextBtn.style.visibility = 'visible';
                            costslblMonthly.innerHTML = '&Uuml;bersicht ' + (feedin ? 'Einspeisung' : 'Energiekosten') + ' monatlich →';
                            costslblDaily.innerHTML = '&Uuml;bersicht ' + (feedin ? 'Einspeisung' : 'Energiekosten') + ' t&auml;glich →';
                            calculateCosts(h0Sheet, feedin);
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


const Zeitzone = {
	Sommer: 0,
	Winter: 1,
	Uebergang: 2,
};

function computeZeitzone(date) {
    /*
     * Ein Jahreslastprofil besteht aus drei Zeitzonen,
     * → Winter: 1.11.-20.03.,
     * → Sommer: 15.05.-14.09. und
     * → Übergang: 21.03.-14.05. bzw. 15.09.-31.10
     */

    const year = Number(date.substring(0, 4));
    const month = Number(date.substring(4, 6));
    const day = Number(date.substring(6, 8));

    if (month <= 2 || (month <= 3 && day <= 20)) {
        return Zeitzone.Winter;
    } else if (month >= 11) {
        return Zeitzone.Winter;
    } else if ((month >= 6 && month <= 8) || (month == 5 && day >= 15) || (month == 9 && day <= 14)) {
        return Zeitzone.Sommer;
    }
    return Zeitzone.Uebergang;
}

function computeSheetIndex(zeitzone, dayIndex) {
    /* layout:
     * B = Winter_Samstag
     * C = Winter_Sonntag
     * D = Winter_Werktag
     *
     * E = Sommer_Samstag
     * F = Sommer_Sonntag
     * G = Sommer_Werktag
     *
     * H = Übergang_Samstag
     * I = Übergang_Sonntag
     * J = Übergang_Werktag
     */
    switch (zeitzone) {
        case Zeitzone.Winter:
            if (dayIndex == 6) {
                return 'B';
            } else if (dayIndex == 0) {
                return 'C';
            } else {
                return 'D';
            }
            break;
        case Zeitzone.Sommer:
            if (dayIndex == 6) {
                return 'E';
            } else if (dayIndex == 0) {
                return 'F';
            } else {
                return 'G';
            }
            break;
        case Zeitzone.Uebergang:
            if (dayIndex == 6) {
                return 'H';
            } else if (dayIndex == 0) {
                return 'I';
            } else {
                return 'J';
            }
            break;
    }
}

function computeH0Day(h0Sheet, day) {
    const zeitzone = computeZeitzone(day);
    const dayAsDate = new Date(day.substring(0, 4), day.substring(4, 6) - 1, day.substring(6,8), day.substring(8, 10));
    const dayIndex = dayAsDate.getDay();  // 0 == Sonntag, 6 == Samstag

    var sheetIndex = computeSheetIndex(zeitzone, dayIndex);

    var h0DayProfile = new Array(24).fill(0);

    for (let i = 0; i < 24; i++) {
        // Werte in 15min Takte, startet in Zeile 4
        const offset = 4;

        for (let j = 0; j < 4; j++) {
            h0DayProfile[i] += h0Sheet['' + sheetIndex + (offset + i*4 + j)].v;
        }
    }
    // console.log("computed zeitzone for day=" + day + " -> " + zeitzone + ", dayIndex = " + dayIndex);
    // console.log("h0DayProfile: " + h0DayProfile);

    return h0DayProfile;
}

function calculateCosts(h0Sheet, feedin) {
    console.log("tracker: ", tracker);
    var months = {}
    var monthsKwh = {}
    var monthsH0Norm = {}
    var monthsH0NormKwh = {}

    let daily = {}
    let dailyKwh = {}
    let dailyH0Norm = {}
    let dailyH0NormKwh = {}

    var days = Array.from(tracker.days);
    for (var idx = 0; idx < days.length; idx++) {
        var day = days[idx];
        var monthKey = day.substring(0, 6);

        let dayKey = day;
        if (!(dayKey in daily)) {
            daily[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyKwh)) {
            dailyKwh[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyH0Norm)) {
            dailyH0Norm[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyH0NormKwh)) {
            dailyH0NormKwh[dayKey] = new Decimal(0.0);
        }

        if (!(monthKey in months)) {
            months[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsKwh)) {
            monthsKwh[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsH0Norm)) {
            monthsH0Norm[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsH0NormKwh)) {
            monthsH0NormKwh[monthKey] = new Decimal(0.0);
        }

        var len = Array.from(Object.keys(tracker.data[day])).length;
        var usages = tracker.data[day];
        var prices = awattar.data[day];
        var sumPrice = new Decimal(0.0);
        var sumKwh = new Decimal(0.0);
        var sumH0NormPrice = new Decimal(0.0);
        var sumH0NormKwh = new Decimal(0.0);

        const h0DayProfile = computeH0Day(h0Sheet, day);

        Object.keys(tracker.data[day]).forEach(hour => {
            var dUsage = usages[hour];
            var dPrice = new Decimal(prices[hour]);

            sumPrice = sumPrice.plus(dUsage.times(dPrice));
            sumKwh = sumKwh.plus(dUsage);
            // console.log("dPrice: ", dPrice.toFixed(2));
            // console.log("sumPrice: ", sumPrice.toFixed(2));

            const h0KwhInHour = new Decimal(h0DayProfile[hour]);
            sumH0NormKwh = sumH0NormKwh.plus(h0KwhInHour);
            const h0PriceOfHour = h0KwhInHour.times(prices[hour]);
            sumH0NormPrice = sumH0NormPrice.plus(h0PriceOfHour);
        });

        daily[dayKey] = daily[dayKey].plus(sumPrice);
        dailyKwh[dayKey] = dailyKwh[dayKey].plus(sumKwh);

        dailyH0Norm[dayKey] = dailyH0Norm[dayKey].plus(sumH0NormPrice);
        dailyH0NormKwh[dayKey] = dailyH0NormKwh[dayKey].plus(sumH0NormKwh);

        months[monthKey] = months[monthKey].plus(sumPrice);
        monthsKwh[monthKey] = monthsKwh[monthKey].plus(sumKwh);

        monthsH0Norm[monthKey] = monthsH0Norm[monthKey].plus(sumH0NormPrice);
        monthsH0NormKwh[monthKey] = monthsH0NormKwh[monthKey].plus(sumH0NormKwh);
    }

    var tariffs = [awattar_alt, awattar_neu, smartcontrol_alt, smartcontrol_neu, steirerstrom, spotty_direkt];
    if (feedin) {
        tariffs = [smartcontrol_sunny];
    }

    var content = genTableInit("Monat", tariffs, feedin);
    let includeMonthlyFee = true;
    content += drawTableTframe(includeMonthlyFee, months, monthsKwh, monthsH0Norm, monthsH0NormKwh, "yyyyMM", "yyyy-MM", tariffs, feedin);
    costsMonthly.innerHTML = content
    costsMonthly.style.visibility = 'visible';
    costslblMonthly.style.visibility = 'visible';

    content = genTableInit("Datum", tariffs, feedin);
    includeMonthlyFee = false;
    content += drawTableTframe(includeMonthlyFee, daily, dailyKwh, dailyH0Norm, dailyH0NormKwh, "yyyyMMdd", "yyyy-MM-dd", tariffs, feedin, false);
    costsDaily.innerHTML = content;
    costsDaily.style.visibility = 'visible';
    costslblDaily.style.visibility = 'visible';

    /* monthly should be opened by default */
    /* click each one at least once, in order to force refresh */
    costslblMonthly.click();
    if (!costslblMonthly.classList.contains("active")) {
        costslblMonthly.click();
    }
    costslblDaily.click();
    if (costslblDaily.classList.contains("active")) {
        costslblDaily.click();
    }
}

const getPriceDiffClass = (diff) => diff < 0 ? 'diff-price-good' : 'diff-price-bad';

function getDaysForMonth(index, leapyear) {
    if (index == 1 || index == 3 || index == 5 || index == 7 || index == 8 || index == 10 || index == 12) {
        return 31;
    } else if (index == 2) {
        return leapyear ? 29 : 28;
    } else {
        return 30;
    }
}

function drawTableTframe(includeMonthlyFee, tframe, tframeKwh, h0NormPrice, h0NormKwh, tframeFmt1, tframeFmt2, providers, feedin) {
    let content = "<tbody>";
    var tframeArray = Object.keys(tframe);
    for (var idx = 0; idx < tframeArray.length; idx++) {

        var e = tframeArray[idx];
        const timeframePrice = tframe[e].dividedBy(tframeKwh[e]).toFixed(2);
        const currentDate = format(parse(e, tframeFmt1, new Date()), tframeFmt2);
        content += "<tr>";
        content += "<td><b>" + currentDate + "<b></td>";
        content += "<td>" + tframeKwh[e].toFixed(2) + " kWh</td>";
        content += "<td>" + timeframePrice + " ct/kWh</td>";
        if (!feedin) {
            const h0Norm = h0NormPrice[e].dividedBy(h0NormKwh[e]).toFixed(2);
            const h0NormDiff = (timeframePrice - h0Norm);
            content += "<td>" + h0Norm + " ct/kWh <span class=" + getPriceDiffClass(h0NormDiff) + ">(" + h0NormDiff.toFixed(2) + ")</span></td>";
        }
        if (!feedin) {
            content += "<td>" + tframe[e].dividedBy(100).toFixed(2) + " &euro;</td>";
            content += "<td class=\"tablethickborderright\">" + tframe[e].times(1.2).dividedBy(100).toFixed(2) + " &euro;</td>";
        } else {
            content += "<td class=\"tablethickborderright\">" + tframe[e].dividedBy(100).toFixed(2) + " &euro;</td>";
        }

        const currentYear = parseInt(currentDate.slice(0, 4), 10);
        const currentMonth = parseInt(currentDate.slice(-2), 10);
        const daysForYear = ((currentYear % 4) == 0 && !((currentYear % 100) == 0)) || (currentYear % 400) == 0 ? 366 : 365;
        const daysForMonth = getDaysForMonth(currentMonth, daysForYear == 366);
        const monthlyFeeFactor = 12 * daysForMonth / daysForYear;

        var best_price = providers[0].calculate(tframe[e], tframeKwh[e], includeMonthlyFee, monthlyFeeFactor);
        var i_best_price = 0;
        for (var i in providers) {
            let price = providers[i].calculate(tframe[e], tframeKwh[e], includeMonthlyFee, monthlyFeeFactor);
            console.log(typeof(best_price));
            if (feedin) {
                if (price.greaterThanOrEqualTo(best_price)) {
                    best_price = price;
                    i_best_price = i;
                }
            } else {
                if (best_price.greaterThanOrEqualTo(price)) {
                    best_price = price;
                    i_best_price = i;
                }
            }
        }
        for (var i in providers) {
            let price = providers[i].calculate(tframe[e], tframeKwh[e], includeMonthlyFee, monthlyFeeFactor);
            content += "<td>";
            if (i == i_best_price) {
                content += "<b>";
            }
            content += price.dividedBy(100).toFixed(2);
            content += " &euro; (&rArr; ";
            content += price.dividedBy(tframeKwh[e]).toFixed(2);
            content += " ct/kWh)";
            if (i == i_best_price) {
                content += "</b>";
            }
            content += "</td>";
        }
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
                label: 'Verbrauch/Einspeisung in kWh',
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

function displayWarning(warning) {
    console.log("Fehler: ", warning);
    warningHolder.innerHTML = warning;
    warningHolder.style.visibility = 'visible';
}

function selectBetreiber(sample) {
    for (var idx = 0; idx < listOfNetzbetreiber.length; idx++) {
        var betreiber = listOfNetzbetreiber[idx];
        if (betreiber.probe(sample)) {
            return betreiber;
        }
    }

    displayWarning("Netzbetreiber fuer Upload unbekannt, check console");
    console.log("sample: ", sample);
    return null;
}

function bufferToString(buf) {
    return new Uint8Array(buf)
        .reduce((data, byte) => data + String.fromCharCode(byte), '');
}
function decodeUTF16LE(buf) {
    return new TextDecoder('utf-16le').decode(buf);
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
    //
    // v1:
    // > Kundennummer;XXXXXX
    // > Kundenname;YYYYYYYY
    // > ZP-Nummer;ATXXXXX00XXXX0000XX0XXX0XXXXXXXXX
    // > Beginn;01.01.2020
    // > Ende;29.03.2023
    // > Energierichtung;Netzbezug
    // >
    // >
    // > Datum;Zeit;kWh;Status
    //
    //
    // v2:
    // > Kundennummer;12345678;;
    // > Kundenname;Mustermann Max;;
    // > ZP-Nummer;AT0070000XXXX10000000000000XXXXXX;;
    // > Beginn;27.03.2024;;
    // > Ende;01.05.2024;;
    // > Energierichtung;Verbrauch gemessen;;
    // > ;;;
    // > ;;;
    // > Datum;Zeit;kWh;Status
    //
    if (input.includes("Kundennummer") && input.includes("Kundenname") && input.includes("ZP-Nummer") && input.includes("Energierichtung")) {
        if (!input.includes("Netzbezug") && !input.includes("Verbrauch gemessen")) {
            displayWarning("Falsche Daten (Einspeisepunkt?). Bitte Bezug waehlen");
            return null;
        }
        return stringToBuffer(input.split("\n").slice(8).join("\n"));
    }

    // VorarlbergNetz
    // > Vertragskonto;XXXXXXXXXXXX
    // > Zählpunkt;ATXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    var input16le = decodeUTF16LE(buf);
    if (input16le.includes("Vertragskonto;") && input16le.includes("Zählpunkt;")) {
        return stringToBuffer(input16le.split("\n").slice(3).join("\n"));
    }

    // Stromnetz Graz v2
    if (input.includes("Lieferrichtung: Bezug;;;;;;;;;") && input.includes("Verbrauch Hochtarif - 1.8.1") && input.includes("Verbrauch Niedertarif - 1.8.2")) {
        return stringToBuffer(input.split("\n").slice(1).join("\n"));
    }

    // NetzBurgenland V2
    // > Zählpunktbezeichnung;Kennzahl;Zählernummer;Exportiere ab;Exportiere bis;Exportiere ab;Exportiere bis
    // > AT0090000000000000000000000049656;1-1:1.9.0 P.01;;01.08.2023;31.08.2023;00:00;00:00
    // [.. data for bezug ..]
    // > Zählpunktbezeichnung;Kennzahl;Zählernummer;Exportiere ab;Exportiere bis;Exportiere ab;Exportiere bis
    // > AT0090000000000000000000000049656;1-1:1.9.0 P.01;;01.08.2023;31.08.2023;00:00;00:00
    // [.. data for einspeisung ..]
    function isBurgenlandv2Header(s) {
        if (!s.includes("hlpunktbezeichnung")) {
            return false;
        }
        if (!s.includes("Kennzahl")) {
            return false;
        }
        if (!s.includes("hlernummer")) {
            return false;
        }
        if (!s.includes("Exportiere ab")) {
            return false;
        }
        return s.includes("Exportiere bis");
    }

    if (isBurgenlandv2Header(input)) {
        var result = [];

        // drop first two lines
        input = input.split("\n").slice(2);

        for (let i = 0; i < input.length; i++) {
            var line = input[i];
            if (isBurgenlandv2Header(line)) {
                // second header found, drop lines from here on.
                return stringToBuffer(result.join("\n"));
            }
            result.push(line);
        }

        // v3, yet another format discovered in the wild
        return stringToBuffer(result.join("\n"));
    }

    // > PLZ Ort, Adresse [Zählpunktnummer];;;PLZ Ort, Adresse [Zählpunktnummer];;
    // > Zählpunktnummer;;;Zählpunktnummer;;
    // > Strom - Wirkenergie (kWh);;;Strom - Wirkenergie (kWh);;
    // > kWh;;;kWh;;
    // > DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE
    function isTinetz(s) {
        return s.includes("DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE");
    }

    if (isTinetz(input)) {
        var lines = input.split("\n");
        var s = lines.slice(4).join("\n");
        var lastLine = lines.slice(-2)[0];

        /* check if 15min values are on the left or right side (the CSV export also contains daily usages) */
        if (lastLine.startsWith(";;;")) {
            s = s.replace("DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE", "DATE_FROM;DATE_TO;VALUE;DATE_FROM2;DATE_TO2;VALUE2");
        } else {
            s = s.replace("DATE_FROM;DATE_TO;VALUE;DATE_FROM;DATE_TO;VALUE", "DATE_FROM2;DATE_TO2;VALUE2;DATE_FROM;DATE_TO;VALUE");
            if (!lastLine.endsWith(";;;")) {
                displayWarning("why tho TINETZ?!? Please report...");
            }
        }

        /* normalize date format (= remove seconds) */
        var t = s.replace(/ (\d\d:\d\d):00;/gm, " $1;");

        return stringToBuffer(t);
    }

    // everything else
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
