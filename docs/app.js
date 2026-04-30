import { format, parse } from "date-fns";
import Decimal from "decimal.js";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import {
    awattar_neu,
    smartcontrol_neu,
    steirerstrom,
    spotty_direkt,
    naturstrom_spot_stunde_ii,
    oekostrom_spot,
    smartcontrol_sunny,
    awattar_sunny_spot_60,
    naturstrom_marktpreis_spot_25,
    wels_strom_sonnenstrom_spot,
    energie_steiermark_sonnenstrom_spot} from "./tariffs.js";
import {
    listOfNetzbetreiber,
} from "./netzbetreiber.js";
import {
    Marketdata,
} from "./marketdata.js";
import {
    stripPlain,
    stripXls,
} from "./calc/preprocess.js";
import { Tracker } from "./calc/tracker.js";
import { computeH0Day } from "./calc/h0.js";


function loadAwattarCache() {
    var a = new Marketdata();
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
var marketdata= null;
var usageavg = null;

const prevBtn = document.getElementById('prevBtn');
const graphDescr = document.getElementById('graphDescr');
const nextBtn = document.getElementById('nextBtn');
const costsMonthly = document.getElementById('costsMonthly');
const costsDaily = document.getElementById('costsDaily');
const costslblMonthly = document.getElementById('costslblMonthly');
const costslblDaily= document.getElementById('costslblDaily');
const warningholder = document.getElementById('warningHolder');
// Get new download buttons
const downloadMonthlyBtn = document.getElementById('downloadMonthlyBtn');
const downloadDailyBtn = document.getElementById('downloadDailyBtn');

prevBtn.style.visibility = 'hidden';
graphDescr.style.visibility = 'hidden';
nextBtn.style.visibility = 'hidden';
costsMonthly.style.visibility = 'hidden';
costsDaily.style.visibility = 'hidden';
costslblMonthly.style.visibility = 'hidden';
costslblDaily.style.visibility = 'hidden';
warningHolder.style.visibility = 'hidden';
// Hide download buttons initially
downloadMonthlyBtn.style.visibility = 'hidden';
downloadDailyBtn.style.visibility = 'hidden';

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
        content += "<td>Gesamt<br/>Netto</td>";
        content += "<td class=\"tablethickborderright\">Gesamt<br/>+20% MwSt</td>";
    } else {
        content += "<td class=\"tablethickborderright\">Gesamt<br/>Netto</td>";
    }
    tariffs.forEach (t => {
        let description = (datefmt == "Monat") ? t.description : t.description_day;
        content += "<th colspan=2>"+ description + "</br>(<a href=\"" + t.tarifflink + "\">" + t.name + "</a>)</th>";
    })
    return content + "</tr></thead>";
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

// New function to handle complex table export to Excel
function exportTableToExcel(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) {
        console.error(`Table with id ${tableId} not found.`);
        return;
    }

    const ws_data = [];
    const merges = [];
    // Check all header cells, not just the first one
    const headerCells = table.querySelectorAll('thead tr td');
    let feedin = true;
    headerCells.forEach(cell => {
        if (cell.innerHTML.includes('H0 Lastprofil')) {
            feedin = false;
        }
    });
    
    console.log(`Exporting table ${tableId}, feedin mode: ${feedin}`);

    // 1. Process header
    const headerRows = table.querySelectorAll('thead tr');
    let headerRowIndex = 0;
    let deltaColumnInserted = false;
    let deltaInsertPosition = -1;
    
    headerRows.forEach(headerRow => {
        const rowData = [];
        const headerCells = headerRow.querySelectorAll('th, td');
        let colIndex = 0;
        let h0ColumnIndex = -1;
        
        // First pass: collect all headers
        headerCells.forEach((cell, cellIdx) => {
            // Extract text more carefully, preserving structure
            let cellHTML = cell.innerHTML;
            // Replace <br> with newlines
            cellHTML = cellHTML.replace(/<br\s*\/?>/gi, '\n');
            // Remove sup tags but keep their content
            cellHTML = cellHTML.replace(/<sup[^>]*>/g, '').replace(/<\/sup>/g, '');
            // Remove anchor tags but keep their content
            cellHTML = cellHTML.replace(/<a[^>]*>/g, '').replace(/<\/a>/g, '');
            // Remove any remaining HTML tags
            cellHTML = cellHTML.replace(/<[^>]+>/g, ' ');
            // Clean up whitespace
            const text = cellHTML.replace(/\s+/g, ' ').trim();
            
            const colspan = parseInt(cell.getAttribute('colspan') || 1);
            
            // Track where H0 column is
            if (!feedin && text.includes('H0 Lastprofil')) {
                h0ColumnIndex = rowData.length;
            }
            
            rowData.push(text);
            
            // Debug logging for merged cells
            if (colspan > 1 && text.length > 20) {
                console.log(`Found merged header at col ${colIndex}: "${text.substring(0, 50)}..." (colspan=${colspan})`);
            }
            
            if (colspan > 1) {
                merges.push({ 
                    s: { r: headerRowIndex, c: colIndex }, 
                    e: { r: headerRowIndex, c: colIndex + colspan - 1 },
                    rowIndex: headerRowIndex,
                    startCol: colIndex
                });
                // Fill null values for merged cells
                for (let i = 1; i < colspan; i++) rowData.push(null);
            }
            colIndex += colspan;
        });
        
        //Insert delta header after H0 column
        if (!feedin && h0ColumnIndex >= 0) {
            rowData.splice(h0ColumnIndex + 1, 0, 'Δ H0 Lastprofil');
            deltaColumnInserted = true;
            deltaInsertPosition = h0ColumnIndex + 1;
        }
        
        ws_data.push(rowData);
        headerRowIndex++;
    });
    
    // Adjust merge ranges if delta column was inserted
    if (deltaColumnInserted && deltaInsertPosition >= 0) {
        merges.forEach(merge => {
            // If the merge starts after or at the delta position, shift it right
            if (merge.startCol >= deltaInsertPosition) {
                merge.s.c += 1;
                merge.e.c += 1;
            }
            // If the merge ends after the delta position but starts before, extend it
            else if (merge.e.c >= deltaInsertPosition) {
                merge.e.c += 1;
            }
        });
    }
    
    // Clean up merge objects (remove temporary properties)
    const finalMerges = merges.map(m => ({ s: m.s, e: m.e }));

    // 2. Process body
    const bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(bodyRow => {
        const rowData = [];
        const bodyCells = bodyRow.querySelectorAll('td');
        let deltaValue = null;

        // First pass: collect all cell data
        bodyCells.forEach((cell, cellIndex) => {
            let cellText = cell.innerText.trim();
            
            // Date formatting
            if (cellIndex === 0) {
                // Parse the date string and create proper Date object
                const dateStr = cellText;
                let dateObj;
                
                if (dateStr.includes('-')) {
                    // Already formatted date (yyyy-MM-dd or yyyy-MM)
                    const parts = dateStr.split('-');
                    if (parts.length === 2) {
                        // Monthly view: yyyy-MM -> first day of month
                        dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
                    } else if (parts.length === 3) {
                        // Daily view: yyyy-MM-dd
                        dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    }
                } else {
                    // Fallback if date format is unexpected
                    dateObj = new Date(cellText);
                }
                
                rowData.push(dateObj);
            } else {
                // Handle other cells
                let cleanedText = cellText;
                
                // Special handling for H0 column which contains both value and delta span
                if (!feedin && cellIndex === 3) {
                    // Extract delta value for later insertion
                    const deltaSpan = cell.querySelector('span.diff-price-good, span.diff-price-bad');
                    if (deltaSpan) {
                        // Extract value from span, remove parentheses and convert to number
                        let deltaText = deltaSpan.innerText.replace('(', '').replace(')', '').replace(',', '.');
                        deltaValue = parseFloat(deltaText);
                    }
                    
                    // Extract only the first part before the span element
                    const spanElement = cell.querySelector('span');
                    if (spanElement) {
                        // Get the text content before the span
                        const textNode = cell.childNodes[0];
                        if (textNode && textNode.nodeType === Node.TEXT_NODE) {
                            cleanedText = textNode.textContent.trim();
                        }
                    }
                }
                
                // Clean and parse the text
                cleanedText = cleanedText.replace('kWh', '').replace('ct/kWh', '').replace('€', '').trim().replace(',', '.');
                let numericValue = parseFloat(cleanedText);

                if (!isNaN(numericValue)) {
                    rowData.push(numericValue);
                } else {
                    rowData.push(cellText); // Fallback for non-numeric values
                }
            }
        });

        // Insert delta column after H0 column (position 4) if not feedin
        if (!feedin) {
            // Insert delta value at position 4 (after Date, Energie, Erzielter Ø, H0)
            rowData.splice(4, 0, deltaValue);
            //console.log('Inserted delta value:', deltaValue, 'at position 4. Row length:', rowData.length);
        }
        
        ws_data.push(rowData);
    });

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    if (finalMerges.length > 0) ws['!merges'] = finalMerges;

    // 3. Apply formatting
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = range.s.r; R <= range.e.r; ++R) {
        // Skip header rows
        if (R < headerRows.length) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cell_ref = XLSX.utils.encode_cell({c:C, r:R});
                if(!ws[cell_ref]) continue;
                ws[cell_ref].s = { 
                    font: { bold: true }, 
                    alignment: { wrapText: true, vertical: 'center', horizontal: 'center' } 
                };
            }
            continue;
        }

        // Format data rows
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cell_ref = XLSX.utils.encode_cell({c:C, r:R});
            if(!ws[cell_ref] || ws[cell_ref].t !== 'n') continue;

            let format_string = null;
            if (feedin) {
                // Feedin format strings
                const feedin_formats = [
                    'yyyy-mm-dd',           // A: Date
                    '0.00 "kWh"',          // B: Energie
                    '0.00 "ct/kWh"',       // C: Erzielter Ø Preis
                    '#,##0.00 "€"',        // D: Gesamt Netto
                ];
                if (C < feedin_formats.length) {
                    format_string = feedin_formats[C];
                } else {
                    // For tariff columns
                    format_string = (C - 4) % 2 === 0 ? '#,##0.00 "€"' : '0.00 "ct/kWh"';
                }
            } else {
                // CHANGE (1): Define formats for all columns including the new Delta column
                const formats = [
                    'yyyy-mm-dd',           // A: Date
                    '0.00 "kWh"',          // B: Energie
                    '0.00 "ct/kWh"',       // C: Erzielter Ø Preis
                    '0.00 "ct/kWh"',       // D: H0 Lastprofil Ø
                    '[Green][<0]-0.00" ct/kWh";[Red][>0]+0.00" ct/kWh";0.00" ct/kWh"', // E: Δ H0 Lastprofil
                    '#,##0.00 "€"',        // F: Gesamt Netto
                    '#,##0.00 "€"',        // G: Gesamt +20% MwSt
                ];
                if (C < formats.length) {
                    format_string = formats[C];
                } else {
                    // For tariff columns after the standard columns
                    format_string = (C - 7) % 2 === 0 ? '#,##0.00 "€"' : '0.00 "ct/kWh"';
                }
            }
            if (format_string) {
                ws[cell_ref].z = format_string;
            }
        }
    }

    // 4. Auto-calculate column widths
    const colWidths = ws_data.reduce((acc, row) => {
        row.forEach((cell, i) => {
            let len;
            if (cell instanceof Date) {
                len = 12; // Fixed width for dates
            } else if (cell === null || cell === undefined) {
                len = 15; // Default width for null cells
            } else {
                len = (cell || '').toString().length + 2;
            }
            if (!acc[i] || len > acc[i].wch) {
                acc[i] = { wch: Math.max(len, 12) }; // Minimum width of 12
            }
        });
        return acc;
    }, []);
    ws['!cols'] = colWidths;
    
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daten');
    XLSX.writeFile(wb, filename);
}


document.addEventListener("DOMContentLoaded", function() {
    /* <Collapsible support> */
    var coll = document.getElementsByClassName("collapsible");
    var i;

    /* respect potential x-scrollbar in height */
    const resizeObserver = new ResizeObserver((entries) => {
        for (let entry of entries) {
            var content = entry.target;
            if (content.style.maxHeight && !content.resizedByHook) {
                var scrollbarHeight = content.offsetHeight - content.clientHeight;
                if (scrollbarHeight > 0) {
                    content.style.maxHeight = (content.scrollHeight + scrollbarHeight) + "px";
                    content.resizedByHook = true;
                }
            }
        }
    });

    for (i = 0; i < coll.length; i++) {
      // Modified logic to find the content element
      // This handles both the original and the new structure with a wrapper div
      let contentElement;
      if (coll[i].dataset.tableHeader) {
          contentElement = coll[i].parentElement.nextElementSibling;
      } else {
          contentElement = coll[i].nextElementSibling;
      }

      if (contentElement && contentElement.classList.contains('content')) {
        resizeObserver.observe(contentElement);
      }
      
      coll[i].addEventListener("click", function() {
        this.classList.toggle("active");
        
        // Modified logic to find the content element to expand/collapse
        var content;
        if (this.dataset.tableHeader) {
            // New structure: the content is the next sibling of the parent header
            content = this.parentElement.nextElementSibling;
        } else {
            // Original structure: the content is the next sibling
            content = this.nextElementSibling;
        }
        
        if (content && content.style.maxHeight) {
          content.style.maxHeight = null;
        } else if (content) {
          content.style.maxHeight = content.scrollHeight + "px";
          content.resizedByHook = false;
        }
      });
    }
    /* </Collapsible support> */

    // Add event listeners for the new download buttons
    downloadMonthlyBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent the collapsible from triggering
        exportTableToExcel('costsMonthly', 'monatsuebersicht.xlsx');
    });

    downloadDailyBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // Prevent the collapsible from triggering
        exportTableToExcel('costsDaily', 'tagesuebersicht.xlsx');
    });


    const fileInputs = document.getElementById('file-form');

    fileInputs.onchange = () => {
        warningHolder.style.visibility = 'hidden';
        const reader = new FileReader();

        reader.onload = (event) => {
            /* reset state */
            marketdata = loadAwattarCache();
            tracker = new Tracker();

            var fileContent = event.target.result;
            fileContent = stripPlain(fileContent, displayWarning);
            // Add a guard against null return from stripPlain
            if (fileContent === null) {
                return;
            }
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
                    // Add a guard for empty or invalid CSV data
                    if (!d || d.length === 0 || (d.length === 1 && Object.keys(d[0]).length <= 1)) {
                        displayWarning("Die hochgeladene CSV-Datei ist leer oder enthält keine gültigen Daten.");
                        return;
                    }

                    var netzbetreiber = selectBetreiber(d[0]);
                    // Add a guard in case the provider is not identified
                    if (netzbetreiber === null) {
                        // displayWarning is already called inside selectBetreiber
                        return;
                    }

                    var feedin = netzbetreiber.feedin;
                    for (var i = 0; i < d.length; i++) {
                        tracker.addEntry(netzbetreiber, d[i]);
                    }
                    tracker.postProcess();

                    (async () => {
                        const lastprofile_array = await (await fetch('./lastprofile.xls')).arrayBuffer();
                        const lastprofile_sheets = XLSX.read(lastprofile_array);
                        const h0Sheet = lastprofile_sheets.Sheets[lastprofile_sheets.SheetNames[0]];
                        const dayFetches = Array.from(tracker.days).map(d => marketdata.addDay(d));
                        await Promise.all(dayFetches);

                        // Add a guard to check if any valid data was processed
                        if (tracker.days.size === 0) {
                            displayWarning("Keine gültigen 15-Minuten-Verbrauchsdaten in der Datei gefunden. Bitte prüfen Sie die Datei.");
                            return;
                        }

                        hideWarning();
                        storeAwattarCache(marketdata);
                        console.log("final marketdata", marketdata);
                        prevBtn.style.visibility = 'visible';
                        graphDescr.style.visibility = 'visible';
                        nextBtn.style.visibility = 'visible';
                        costslblMonthly.innerHTML = '&Uuml;bersicht ' + (feedin ? 'Einspeisung' : 'Energiekosten') + ' monatlich →';
                        costslblDaily.innerHTML = '&Uuml;bersicht ' + (feedin ? 'Einspeisung' : 'Energiekosten') + ' t&auml;glich →';
                        calculateCosts(h0Sheet, feedin);
                        calculateDailyAvg();
                        // Reset dayIndex to show the first day of the new data
                        dayIndex = 0;
                        displayDay(dayIndex);
                    })();
                }
            });
        };
        for (let file of fileInputs[0].files) {
            reader.readAsArrayBuffer(file)
        }
    };
});


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
        var prices = marketdata.data[day];
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
    var tariffs = [awattar_neu, smartcontrol_neu, steirerstrom, spotty_direkt, naturstrom_spot_stunde_ii, oekostrom_spot];
    if (feedin) {
        tariffs = [smartcontrol_sunny, awattar_sunny_spot_60, naturstrom_marktpreis_spot_25, wels_strom_sonnenstrom_spot/* , energie_steiermark_sonnenstrom_spot */];
    }

    var content = genTableInit("Monat", tariffs, feedin);
    let includeMonthlyFee = true;
    content += drawTableTframe(includeMonthlyFee, months, monthsKwh, monthsH0Norm, monthsH0NormKwh, "yyyyMM", "yyyy-MM", tariffs, feedin);
    costsMonthly.innerHTML = content
    costsMonthly.style.visibility = 'visible';
    costslblMonthly.style.visibility = 'visible';
    downloadMonthlyBtn.style.visibility = 'visible'; // Show download button

    content = genTableInit("Datum", tariffs, feedin);
    includeMonthlyFee = false;
    content += drawTableTframe(includeMonthlyFee, daily, dailyKwh, dailyH0Norm, dailyH0NormKwh, "yyyyMMdd", "yyyy-MM-dd", tariffs, feedin, false);
    costsDaily.innerHTML = content;
    costsDaily.style.visibility = 'visible';
    costslblDaily.style.visibility = 'visible';
    downloadDailyBtn.style.visibility = 'visible'; // Show download button

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

function drawTableTframe(includeMonthlyFee, tframe, tframeKwh, h0NormPrice, h0NormKwh, tframeFmt1, tframeFmt2, tariffs, feedin) {
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
            content += `<td class="tablethickborderright">${tframe[e].times(1.2).dividedBy(100).toFixed(2)} &euro;</td>`;
        } else {
            content += `<td class="tablethickborderright">${tframe[e].dividedBy(100).toFixed(2)} &euro;</td>`;
        }

        const currentYear = parseInt(currentDate.slice(0, 4), 10);
        const currentMonth = parseInt(currentDate.slice(-2), 10);
        const daysForYear = ((currentYear % 4) == 0 && !((currentYear % 100) == 0)) || (currentYear % 400) == 0 ? 366 : 365;
        const daysForMonth = getDaysForMonth(currentMonth, daysForYear == 366);
        const monthlyFeeFactor = 12 * daysForMonth / daysForYear;

        var best_price = tariffs[0].calculate(tframe[e], tframeKwh[e], includeMonthlyFee, monthlyFeeFactor);
        var i_best_price = 0;
        for (var i in tariffs) {
            let price = tariffs[i].calculate(tframe[e], tframeKwh[e], includeMonthlyFee, monthlyFeeFactor);
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
        for (var i in tariffs) {
            let isBestPrice = i == i_best_price;
            let price = tariffs[i].calculate(tframe[e], tframeKwh[e], includeMonthlyFee, monthlyFeeFactor);
            content += "<td>";
            if (isBestPrice) {
                content += "<b>";
            }
            content += price.dividedBy(100).toFixed(2) + " &euro;";
            if (isBestPrice) {
                content += "</b>";
            }
            content += "</td>";
            content += `<td class="tablethickborderrightabit">`;
            if (isBestPrice) {
                content += "<b>";
            }

            content += price.dividedBy(tframeKwh[e]).toFixed(2) + " ct/kWh";
            if (isBestPrice) {
                content += "</b>";
            }
            content += "</td>";
        }
        content += "</tr>";
    }
    return content + "</tbody>";
}

class DailyUsageAvg {
    dailyUsageSum = new Array(24);
    daysIngested = 0;

    constructor() {
        for (let i = 0; i<24; i++) {
            this.dailyUsageSum[i] = new Decimal(0.0);
        }
    }

    addNewFullday(fullday) {
        // Check values exist
        for (let i = 0; i<24; i++) {
            if(!Decimal.isDecimal(fullday[i]))
                // Not ingesting if not all 24 elements are Decimal types to keep avg consistent
                return
        }

        // Add them to our array
        for (let i = 0; i<24; i++) {
            this.dailyUsageSum[i] = Decimal.add(this.dailyUsageSum[i], fullday[i]);
        }

        // Increase number of days ingested
        this.daysIngested++;
    }

    getDailyUsageAvgArray() {
        let dailyUsageAvg = {};
        for (let i = 0; i<24; i++) {
            dailyUsageAvg[i] = this.dailyUsageSum[i].dividedBy(this.daysIngested);
        }
        return dailyUsageAvg;
    }
}

function calculateDailyAvg() {
    usageavg = new DailyUsageAvg();
    for (const [key, value] of Object.entries(tracker.data)) {
        usageavg.addNewFullday(value);
    }
}

function displayDay(index) {
    var fullday = Array.from(tracker.days)[index];
    graphDescr.innerHTML = '' + format(parse(fullday, 'yyyyMMdd', new Date()), 'yyyy-MM-dd');

    if (oldChart != null) {
        oldChart.destroy();
    }
    var ctx = document.getElementById('awattarChart').getContext('2d');

    // console.log("marketdata.data[fullday]: ", marketdata.data[fullday]);
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
                data: marketdata.data[fullday],
                fill: false,
                borderColor: 'rgb(192, 75, 75)',
                yAxisID: 'y2',
                tension: 0.1
            },
            {
                label: 'Durchschnittsverbrauch/Einspeisung in kWh (' + usageavg.daysIngested + ' Tage)',
                data: usageavg.getDailyUsageAvgArray(),
                fill: false,
                borderColor: 'rgb(240, 230, 140))',
                yAxisID: 'y1',
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

function hideWarning() {
    warningHolder.style.visibility = 'hidden';
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

