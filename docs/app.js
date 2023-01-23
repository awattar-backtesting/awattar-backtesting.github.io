document.addEventListener("DOMContentLoaded", function() {
  fetch('https://api.awattar.at/v1/marketdata?start=1561932000000')
    .then((response) => response.json())
    .then((data) => console.log(data));
});

const fileInputs = document.getElementById('file-form');
fileInputs.onchange = () => {
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

  for (let file of fileInputs.files) {
    reader.readAsText(file)
  }
};
