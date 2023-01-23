document.addEventListener("DOMContentLoaded", function() {
  fetch('https://api.awattar.at/v1/marketdata?start=1561932000000')
    .then((response) => response.json())
    .then((data) => console.log(data));
});

const form = document.getElementById('file-form');
form.addEventListener('submit', (event) => {
  // ??
  event.preventDefault();

  const fileInput = document.getElementById('file-input');
  const file = fileInput.files[0];

  const reader = new FileReader();
  reader.onload = (event) => {
    const fileContent = event.target.result;
    Papa.parse(fileContent, {
      header: true,
      complete: (results) => {
        console.log(results.data);
      }
    });
  };
  reader.readAsText(file);
});
