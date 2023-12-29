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
    data_chart = {}

    /* bump if format changes */
    version = "2023-12-29";

    async addDay(fullday) {
        if (fullday in this.data) {
            // console.log("cache hit for ", fullday);
            return;
        }
        this.data[fullday] = "requesting"
        this.data_chart[fullday] = {};

        var date = parse(fullday, "yyyyMMdd", new Date());
        var unixStamp = date.getTime();

        const response = await fetch('https://api.awattar.at/v1/marketdata?start=' + unixStamp)
        const data = await response.json();
        var i = 0;

        this.data[fullday] = []
        for (i = 0; i < data['data'].length; i++) {
            this.data[fullday][i]       = new Decimal(data['data'][i].marketprice).dividedBy(10);
            this.data_chart[fullday][i] = new Decimal(data['data'][i].marketprice).dividedBy(10).toFixed(3);
        }
        this.first = false;
    }
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
    a.data_chart = cached.data_chart;
    return a;
}

function storeAwattarCache(a) {
    let object = {
        version: a.version,
        data: a.data,
        data_chart: a.data_chart,
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

function genTableInit(datefmt, grundpreis) {
    return "<thead><tr class=\"tablethickborderbottom\"> <td>" + datefmt + "</td> <td>Energie</td> <td>Erzielter Ø Preis</td> <td> B&ouml;rsen Ø <sup>1</sup></td> <td>H0 Ø Preis <sup>2</sup></td> <td>H0 Ø Norm <sup>3</sup></td><td<td>Netto</td> <td class=\"tablethickborderright\">+20% MwSt</td>"
        + "<td>+3% Aufschlag <br />" + grundpreis[0] + "(<a href=\"https://web.archive.org/web/20230316213722/https://api.awattar.at/v1/templates/1126e217-aa97-4d3e-9fdf-93cd73f04d3f/content?accept-override=application/pdf\">aWATTar HOURLY alt</a>)</td>"
        + "<td>+3% + 1.80ct/kWh <br />" + grundpreis[1] + "(<a href=\"https://web.archive.org/web/20230903185216/https://api.awattar.at/v1/templates/bba9e568-777c-43a7-b181-79de2188439f/content?accept-override=application/pdf\">aWATTar HOURLY ab 2023/07</a>)</td>"
        + "<td>+ 1.44ct/kWh <br />" + grundpreis[2] + "(<a href=\"https://web.archive.org/web/20230605223615/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf\">smartCONTROL alt</a>)</td>"
        + "<td>+ 1.44ct/kWh <br />" + grundpreis[3] + "(<a href=\"https://web.archive.org/web/20231103201719/https://www.smartenergy.at/fileadmin/user_upload/downloads/Kundeninformation_und_Preisblatt_-_smartCONTROL.pdf\">smartCONTROL ab 2023/10</a>)</td>"
        + "<td>+ 1.44ct/kWh <br />" + grundpreis[4] + "(<a href=\"https://web.archive.org/web/20231103201559/https://www.e-steiermark.com/fileadmin/user_upload/downloads/E-Steiermark_Tarifblatt_Privatkunden_SteirerStrom_Smart.pdf\">SteirerStrom Smart</a>)</td>"
        + "</tr> </thead>";
}

const initialTableStateMonthly = genTableInit("Monat", new Array(
    "+5,75 EUR Grundpreis<br />inkl. 20% USt.<br />",
    "+5,75 EUR Grundpreis<br />inkl. 20% USt.<br />",
    "+4,99 EUR Grundpreis<br />inkl. 20% USt.<br />",
    "+2,99 EUR Grundpreis<br />inkl. 20% USt.<br />",
    "+3,82 EUR Grundpreis<br />inkl. 20% USt.<br />"
    ));

const initialTableStateDaily= genTableInit("Datum", new Array("", "", "", "", ""));


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
            // console.log("csv: ", fileContent);

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

const weekdayH0Profile = [
    0.0246,
    0.0182,
    0.0165,
    0.0159,
    0.0163,
    0.0196,
    0.0348,
    0.0483,
    0.0512,
    0.0499,
    0.0480,
    0.0487,
    0.0542,
    0.0530,
    0.0463,
    0.0418,
    0.0404,
    0.0457,
    0.0564,
    0.0652,
    0.0625,
    0.0563,
    0.0491,
    0.0369,
]

const weekendH0Profile = [
    0.0280,
    0.0209,
    0.0168,
    0.0156,
    0.0151,
    0.0152,
    0.0174,
    0.0242,
    0.0382,
    0.0524,
    0.0608,
    0.0675,
    0.0697,
    0.0612,
    0.0513,
    0.0457,
    0.0428,
    0.0480,
    0.0571,
    0.0633,
    0.0584,
    0.0503,
    0.0451,
    0.0353,
]


function calculateCosts() {
    console.log("tracker: ", tracker);
    var months = {}
    var monthsKwh = {}
    var monthsFee = {}
    var monthsAvg = {}
    var monthsAvgKwh = {}
    var monthsH0 = {}
    var monthsH0Norm = {}
    var monthsH0NormKwh = {}

    let daily = {}
    let dailyKwh = {}
    let dailyFee = {}
    let dailyAvg = {}
    let dailyAvgKwh = {}
    let dailyH0 = {}
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
        if (!(dayKey in dailyFee)) {
            dailyFee[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyAvg)) {
            dailyAvg[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyAvgKwh)) {
            dailyAvgKwh[dayKey] = new Decimal(0.0);
        }
        if (!(dayKey in dailyH0)) {
            dailyH0[dayKey] = new Decimal(0.0);
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
        if (!(monthKey in monthsFee)) {
            monthsFee[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsAvg)) {
            monthsAvg[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsAvgKwh)) {
            monthsAvgKwh[monthKey] = new Decimal(0.0);
        }
        if (!(monthKey in monthsH0)) {
            monthsH0[monthKey] = new Decimal(0.0);
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
        var sumFee = new Decimal(0.0);
        var sumAvgPrice = new Decimal(0.0);
        var sumAvgKwh = new Decimal(0.0);
        var sumH0Price = new Decimal(0.0);
        var sumH0NormPrice = new Decimal(0.0);
        var sumH0NormKwh = new Decimal(0.0);

        const dayAsDate = new Date(day.substring(0, 4), day.substring(4, 6) - 1, day.substring(6,8), day.substring(8, 10));
        const isWeekend = dayAsDate.getDay() === 0 || dayAsDate.getDay() === 6;
        const h0DayProfile = isWeekend ? weekendH0Profile : weekdayH0Profile;

        Object.keys(tracker.data[day]).forEach(hour => {
            var dUsage = usages[hour];
            var dPrice = prices[hour];

            sumPrice = sumPrice.plus(dUsage.times(dPrice));
            sumFee = sumFee.plus(dPrice.abs().times(0.03));
            sumKwh = sumKwh.plus(dUsage);
            // console.log("dPrice: ", dPrice.toFixed(2));
            // console.log("sumPrice: ", sumPrice.toFixed(2));

            sumAvgPrice = sumAvgPrice.plus(dPrice.times(1.00)); // always 1 kWh
            // console.log("sumAvgPrice: ", sumPrice.toFixed(2));
            sumAvgKwh = sumAvgKwh.plus(1.00);

            const dailyAvgVerbrauch = 10.0;
            const fictionalKwhInHour = new Decimal(h0DayProfile[hour]).times(dailyAvgVerbrauch);
            sumH0NormKwh = sumH0NormKwh.plus(fictionalKwhInHour);
            const fictionalPriceOfHour = fictionalKwhInHour.times(prices[hour]);
            sumH0NormPrice = sumH0NormPrice.plus(fictionalPriceOfHour);
        });

        // second pass over the day to use sumKwh to generate h0 price
        Object.keys(tracker.data[day]).forEach(hour => {
            const fictionalKwhInHour = sumKwh.times(h0DayProfile[hour]);
            const fictionalPriceOfHour = fictionalKwhInHour.times(prices[hour]);
            sumH0Price = sumH0Price.plus(fictionalPriceOfHour);
        });

        daily[dayKey] = daily[dayKey].plus(sumPrice);
        dailyKwh[dayKey] = dailyKwh[dayKey].plus(sumKwh);
        dailyFee[dayKey] = dailyFee[dayKey].plus(sumFee);

        dailyAvg[dayKey] = dailyAvg[dayKey].plus(sumAvgPrice);
        dailyAvgKwh[dayKey] = dailyAvgKwh[dayKey].plus(sumAvgKwh);
        dailyH0[dayKey] = dailyH0[dayKey].plus(sumH0Price);
        dailyH0Norm[dayKey] = dailyH0Norm[dayKey].plus(sumH0NormPrice);
        dailyH0NormKwh[dayKey] = dailyH0NormKwh[dayKey].plus(sumH0NormKwh);

        months[monthKey] = months[monthKey].plus(sumPrice);
        monthsKwh[monthKey] = monthsKwh[monthKey].plus(sumKwh);
        monthsFee[monthKey] = monthsFee[monthKey].plus(sumFee);

        monthsAvg[monthKey] = monthsAvg[monthKey].plus(sumAvgPrice);
        monthsAvgKwh[monthKey] = monthsAvgKwh[monthKey].plus(sumAvgKwh);
        monthsH0[monthKey] = monthsH0[monthKey].plus(sumH0Price);
        monthsH0Norm[monthKey] = monthsH0Norm[monthKey].plus(sumH0NormPrice);
        monthsH0NormKwh[monthKey] = monthsH0NormKwh[monthKey].plus(sumH0NormKwh);
    }

    var content = drawTableTframe(months, monthsKwh, monthsFee, monthsAvg, monthsAvgKwh, monthsH0, monthsH0Norm, monthsH0NormKwh, "yyyyMM", "yyyy-MM",
        new Array(
            575 /* awattar_alt */,
            575 /* awattar_neu (2023/07) */,
            499 /* smartcontrol_alt */,
            299 /* smartcontrol_neu (2023/09) */,
            382 /* SteirerStrom Smart (2023/10) */
        ));
    costsMonthly.innerHTML += content;
    costsMonthly.style.visibility = 'visible';
    costslblMonthly.style.visibility = 'visible';

    content = drawTableTframe(daily, dailyKwh, dailyFee, dailyAvg, dailyAvgKwh, dailyH0, dailyH0Norm, dailyH0NormKwh, "yyyyMMdd", "yyyy-MM-dd", new Array(0, 0, 0, 0, 0));
    costsDaily.innerHTML += content;
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

const getPriceDiffClass = (diff) => diff < 0 ? 'diff-price-good' : 'diff-price-bad'

function drawTableTframe(tframe, tframeKwh, tframeFee, tframeAvg, tframeAvgKwh, h0Price, h0NormPrice, h0NormKwh, tframeFmt1, tframeFmt2, vendorgrundgebuehr) {
    let content = "<tbody>";
    var tframeArray = Object.keys(tframe);
    for (var idx = 0; idx < tframeArray.length; idx++) {

        var e = tframeArray[idx];
        const timeframePrice = tframe[e].dividedBy(tframeKwh[e]).toFixed(2);
        const avgPrice = tframeAvg[e].dividedBy(tframeAvgKwh[e]).toFixed(2);
        const h0 = h0Price[e].dividedBy(tframeKwh[e]).toFixed(2);
        const h0Norm = h0NormPrice[e].dividedBy(h0NormKwh[e]).toFixed(2);
        const diff = (timeframePrice - avgPrice);
        const h0Diff = (timeframePrice - h0);
        const h0NormDiff = (timeframePrice - h0Norm);
        content += "<tr>";
        content += "<td><b>" + format(parse(e, tframeFmt1, new Date()), tframeFmt2) + "<b></td>";
        content += "<td>" + tframeKwh[e].toFixed(2) + " kWh</td>";
        content += "<td>" + timeframePrice + " ct/kWh</td>";
        content += "<td>" + avgPrice + " ct/kWh <span class=" + getPriceDiffClass(diff) + ">(" + diff.toFixed(2) + ")</span></td>";
        content += "<td>" + h0 + " ct/kWh <span class=" + getPriceDiffClass(h0Diff) + ">(" + h0Diff.toFixed(2) + ")</span></td>";
        content += "<td>" + h0Norm + " ct/kWh <span class=" + getPriceDiffClass(h0NormDiff) + ">(" + h0NormDiff.toFixed(2) + ")</span></td>";
        content += "<td>" + tframe[e].dividedBy(100).toFixed(2) + " &euro;</td>";
        content += "<td class=\"tablethickborderright\">" + tframe[e].times(1.2).dividedBy(100).toFixed(2) + " &euro;</td>";

        var awattar_alt = tframe[e].times(1.2).plus(tframeFee[e].plus(vendorgrundgebuehr[0]));
        var awattar_neu = tframe[e].plus(tframeKwh[e].times(1.5)).times(1.2).plus(tframeFee[e].plus(vendorgrundgebuehr[1]));
        var smartcontrol_alt = tframe[e].plus(tframeKwh[e].times(1.2)).times(1.2).plus(vendorgrundgebuehr[2]);
        var smartcontrol_neu = tframe[e].plus(tframeKwh[e].times(1.2)).times(1.2).plus(vendorgrundgebuehr[3]);
        var steirerstrom = tframe[e].plus(tframeKwh[e].times(1.2)).times(1.2).plus(vendorgrundgebuehr[4]); // +1.44ct/kWh inkl. 20% USt. = 1.2 * 1.2

        var providers = [awattar_alt, awattar_neu, smartcontrol_alt, smartcontrol_neu, steirerstrom];
        var minprice = providers[0];
        for (var i in providers) {
            if (minprice.greaterThanOrEqualTo(providers[i])) {
                minprice = providers[i];
            }
        }
        for (var i in providers) {
            var provider = providers[i];
            content += "<td>";
            if (minprice.greaterThanOrEqualTo(provider)) {
                content += "<b>";
            }
            content += provider.dividedBy(100).toFixed(2);
            content += " &euro; (&rArr; ";
            content += provider.dividedBy(tframeKwh[e]).toFixed(2);
            content += " ct/kWh)";
            if (minprice.greaterThanOrEqualTo(provider)) {
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
                label: 'Verbrauch in kWh',
                data: tracker.data[fullday],
                fill: false,
                borderColor: 'rgb(75, 192, 192)',
                yAxisID: 'y1',
                tension: 0.1
            },
            {
                label: 'ct/kWh',
                data: awattar.data_chart[fullday],
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

    constructor(name, descriptorUsage, descriptorTimestamp, descriptorTimeSub, dateFormatString, usageParser, otherFields, shouldSkip, fixupTimestamp) {
        this.name = name;
        this.descriptorUsage = descriptorUsage;
        this.descriptorTimestamp = descriptorTimestamp;
        this.descriptorTimeSub = descriptorTimeSub;
        this.dateFormatString = dateFormatString;
        this.usageParser = usageParser;
        this.otherFields = otherFields;
        this.shouldSkip = shouldSkip;
        this.fixupTimestamp = fixupTimestamp;
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
        if (valueUsage === "" || valueUsage === undefined) {
            return null;
        }
        var parsedUsage = this.usageParser(valueUsage);

        if (this.fixupTimestamp) {
            /* most Netzbetreiber specify the start date, for some it's ambigious and only obvious by looking at the first and last entry of a single day export, e.g.
             * > Messzeitpunkt;Gemessener Verbrauch (kWh);Ersatzwert;
             * > 10.11.2023 00:15;0,228000;;
             * > 10.11.2023 00:30;0,197000;;
             * > [...]
             * > 10.11.2023 23:45;0,214000;;
             * > 11.11.2023 00:00;0,397000;;
            */
            var MS_PER_MINUTE = 60000;
            parsedTimestamp = new Date(parsedTimestamp - 15 * MS_PER_MINUTE);
        }

        return {
            timestamp: parsedTimestamp,
            usage: parsedUsage,
        }
    }
};

const NetzNOEEinspeiser = new Netzbetreiber("NetzNÖ", "Gemessene Menge (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", null, null, null, false);

const NetzNOEVerbrauch = new Netzbetreiber("NetzNÖ", "Gemessener Verbrauch (kWh)", "Messzeitpunkt", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ersatzwert"], null, true);

const NetzOOE = new Netzbetreiber("NetzOÖ", "kWh", "Datum", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["kW", "Status"], null, false);

const NetzBurgenland = new Netzbetreiber("Netz Burgenland", "Verbrauch (kWh) - Gesamtverbrauch", "Start", null, " dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ende"], null, false);

const NetzBurgenlandv2 = new Netzbetreiber("Netz Burgenland V2", "Verbrauch (in kWh)", "Startdatum", "Startuhrzeit", "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), [/*" Status", */"Enddatum", "Enduhrzeit"], null, false);

const KaerntenNetz = new Netzbetreiber("KaerntenNetz", "kWh", "Datum", "Zeit", "dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Status"], null, false);

const EbnerStrom = new Netzbetreiber("EbnerStrom", "Wert (kWh)", "Zeitstempel String", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage);
}), ["Angezeigter Zeitraum"], (function (row) {
    var valueObiscode = row["Obiscode"];
    return valueObiscode !== "1.8.0";
}), true);

const WienerNetze = new Netzbetreiber("WienerNetze", "!Verbrauch [kWh]", "Datum", "Zeit von", "dd.MM.yyyy HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Zeit bis"], null, false);

const SalzburgNetz = new Netzbetreiber("SalzburgNetz", "!kWh)", "Datum und Uhrzeit", null, "yyyy-MM-dd HH:mm:ss", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Status"], null, false);

const LinzAG = new Netzbetreiber("LinzAG", "Energiemenge in kWh", "Datum von", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ersatzwert"], null, false);

const StromnetzGraz = new Netzbetreiber("StromnetzGraz", "Verbrauch Einheitstarif", "Ablesezeitpunkt", null, "parseISO", (function (usage) {
    return parseFloat(usage);
}), ["Zaehlerstand Einheitstarif", "Zaehlerstand Hochtarif", "Zaehlerstand Niedertarif", "Verbrauch Hochtarif", "Verbrauch Niedertarif"], null, false);

const EnergienetzeSteiermark = new Netzbetreiber("EnergieNetzeSteiermark", "Verbrauch", "Verbrauchszeitraum Beginn", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Anlagennummer","Zaehlpunkt","Tarif","Verbrauchszeitraum Ende","Einheit","Messwert: VAL...gemessen, EST...rechnerisch ermittelt"], null, false);


const EnergienetzeSteiermarkLeistung = new Netzbetreiber("EnergienetzeSteiermarkLeistung", "Wert", "Statistikzeitraum Beginn", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Anlagennummer","Zaehlpunkt","Tarif","Statistikzeitraum Ende","Einheit","Messwert: VAL...gemessen, EST...rechnerisch ermittelt"], null, false);

const VorarlbergNetz = new Netzbetreiber("VorarlbergNetz", "Messwert in kWh", "Beginn der Messreihe", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["Ende der Messreihe"], null, false);

const Tinetz = new Netzbetreiber("TINETZ", "VALUE2", "DATE_FROM2", null, "dd.MM.yyyy HH:mm", (function (usage) {
    return parseFloat(usage.replace(",", "."));
}), ["DATE_FROM", "DATE_TO"], null, false);

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
    if (NetzBurgenland.probe(sample)) {
        return NetzBurgenland;
    }
    if (NetzBurgenlandv2.probe(sample)) {
        return NetzBurgenlandv2;
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
    if (VorarlbergNetz.probe(sample)){
       return VorarlbergNetz;
    }
    if (Tinetz.probe(sample)){
       return Tinetz;
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

    // VorarlbergNetz
    // > Vertragskonto;XXXXXXXXXXXX
    // > Zählpunkt;ATXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
    var input16le = decodeUTF16LE(buf);
    if (input16le.includes("Vertragskonto;") && input16le.includes("Zählpunkt;")) {
        return stringToBuffer(input16le.split("\n").slice(3).join("\n"));
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
