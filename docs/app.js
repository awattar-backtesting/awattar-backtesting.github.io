document.addEventListener("DOMContentLoaded", function() {
  fetch('https://api.awattar.at/v1/marketdata?start=1561932000000')
    .then((response) => response.json())
    .then((data) => console.log(data));
});
