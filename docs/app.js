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
                    console.log(results.data);
                }
            });
        };

        for (let file of fileInputs[0].files) {
            reader.readAsText(file)
        }
    };
});


// const submitButton = 
// $('#submit').click(
//     function() {
//         console.log("sup click");
//     }
// );
