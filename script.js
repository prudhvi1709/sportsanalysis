import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

let excelData = [];
const marked = new Marked();

// System prompt for the LLM
const SYSTEM_PROMPT = `You are a helpful assistant that analyzes Excel data and answers questions about it.
Please provide clear and concise answers based on the data provided. ALWAYS respond in markdown`;

// Handle file input
document.getElementById('fileInput').addEventListener('change', async (e) => {
    excelData = [];
    const files = e.target.files;

    for (let file of files) {
        try {
            const data = await processExcelFile(file);
            excelData.push({
                filename: file.name,
                data: data
            });
        } catch (error) {
            console.error('Error reading file:', error);
            alert('Error reading Excel file');
        }
    }

    const fileInput = document.getElementById('fileInput');
    const predefinedQuestions = document.getElementById('predefinedQuestions');

    if (fileInput.files.length > 0) {
        predefinedQuestions.classList.remove('d-none'); // Show questions if files are uploaded
    } else {
        predefinedQuestions.classList.add('d-none'); // Hide questions if no files are uploaded
    }
});

// Read Excel file
function processExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });

            // Process each sheet
            const sheets = {};
            workbook.SheetNames.forEach(sheetName => {
                const worksheet = workbook.Sheets[sheetName];

                // Convert to JSON while removing empty rows
                let jsonData = XLSX.utils.sheet_to_json(worksheet, {
                    defval: '', // Set default value for empty cells
                    header: 1    // Generate array of arrays
                });

                // Remove trailing empty rows
                while (jsonData.length > 0 &&
                       jsonData[jsonData.length - 1].every(cell => cell === '')) {
                    jsonData.pop();
                }

                sheets[sheetName] = jsonData;
            });

            resolve(sheets);
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

// Add event listener when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.getElementById('submitButton');
    if (submitButton) {
        submitButton.addEventListener('click', handleSubmit);
    }

    // Add event listeners to predefined question links
    document.querySelectorAll('.question-link').forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent default link behavior
            const question = event.target.getAttribute('data-question');
            document.getElementById('question').value = question; // Autofill the question
            submitButton.click(); // Trigger form submission
        });
    });
});

// Handle form submission
async function handleSubmit() {
    const question = document.getElementById('question').value.trim();
    const responseDiv = document.getElementById('response');
    const responseContainer = document.getElementById('responseContainer');
    if (excelData.length === 0) {
        alert('Please upload at least one Excel file');
        return;
    }

    if (!question) {
        alert('Please enter a question');
        return;
    }

    // Show the response container
    if (responseContainer) {
        responseContainer.classList.remove('d-none');
    } else {
        console.error('Response container not found');
    }

    // Show the spinner
    const spinner = responseDiv.querySelector('.spinner-border');
    if (spinner) {
        spinner.classList.remove('d-none'); // Show the spinner
    } else {
        console.error('Spinner not found');
    }

    try {
        // Fetch the token
        const { token } = await fetch("https://llmfoundry.straive.com/token", { credentials: "include" }).then((res) => res.json());

        // Prepare the data and question for the LLM
        const prompt = `Here is the data from Excel file(s):\n\n${formatExcelDataForPrompt(excelData)}\n\nQuestion: ${question}`;

        const response = await fetch("https://llmfoundry.straive.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}:sportsanalysis`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: SYSTEM_PROMPT },
                    { role: "user", content: prompt }
                ],
            }),
        });

        const data = await response.json();
        // Use marked.parse to convert Markdown to HTML
        responseDiv.innerHTML = marked.parse(data.choices[0].message.content);
    } catch (error) {
        console.error('Error:', error);
        responseDiv.textContent = 'Error getting response from LLM';
    } finally {
        // Hide the spinner after the response is received
        if (spinner) {
            spinner.classList.add('d-none'); // Hide the spinner
        }
    }
}

// Format Excel data for the prompt
function formatExcelDataForPrompt(excelData) {
    return excelData.map(file => {
        let fileContent = `File: ${file.filename}\n`;

        // Iterate through each sheet
        for (const [sheetName, sheetData] of Object.entries(file.data)) {
            fileContent += `\nSheet: ${sheetName}\n`;
            // Convert each row array to tab-separated string
            fileContent += sheetData.map(row => row.join('\t')).join('\n');
        }

        return fileContent;
    }).join('\n\n');
}