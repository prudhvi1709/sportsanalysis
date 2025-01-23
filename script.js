import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

let excelData = [];
const marked = new Marked();

// System prompt for the LLM
const SYSTEM_PROMPT = `You are a helpful assistant that analyzes Excel data and answers questions about it.
Please provide clear and concise answers based on the data provided. ALWAYS respond in markdown tables`;

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
document.addEventListener('DOMContentLoaded', async () => {
    const submitButton = document.getElementById('submitButton');
    if (submitButton) {
        submitButton.addEventListener('click', handleSubmit);
    }

    // Update event listener for dataset cards
    document.querySelectorAll('[data-dataset]').forEach(card => {
        card.addEventListener('click', async (e) => {
            e.preventDefault(); // Prevent default link behavior
            handleDatasetClick(e);
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

async function handleDatasetClick(event) {
    const card = event.target.closest('[data-dataset]');
    if (!card) return;
    const dataset = card.getAttribute('data-dataset');
    try {
        const response = await fetch('config.json');
        const config = await response.json();
        const questions = config[dataset];

        // Show questions for the selected dataset
        const predefinedQuestions = document.getElementById('predefinedQuestions');
        predefinedQuestions.classList.remove('d-none');

        // Update the questions with markdown links
        updateQuestionsWithMarkdown(questions);
    } catch (error) {
        console.error('Error loading dataset questions:', error);
    }
}

function updateQuestionsWithMarkdown(questions) {
    const container = document.getElementById('predefinedQuestions');
    container.innerHTML = ''; // Clear existing questions
    Object.entries(questions).forEach(([category, questionList]) => {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = category.replace('_', ' ').toUpperCase();
        details.appendChild(summary);

        const div = document.createElement('div');
        div.align = 'center';

        questionList.forEach(item => {
            const link = document.createElement('a');
            link.href = '#';
            link.className = 'question-link-md';
            link.setAttribute('data-answer-file', item.answer);
            link.textContent = item.question;
            // Add click event listener directly to the link
            link.addEventListener('click', handleMarkdownQuestion);
            div.appendChild(link);
            div.appendChild(document.createElement('br'));
        });

        details.appendChild(div);
        container.appendChild(details);
    });
}

async function handleMarkdownQuestion(event) {
    event.preventDefault();
    const answerFile = event.target.getAttribute('data-answer-file');

    try {
        // Show spinner while loading
        const responseDiv = document.getElementById('response');
        const responseContainer = document.getElementById('responseContainer');
        responseContainer.classList.remove('d-none');
        responseDiv.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';

        const response = await fetch(answerFile);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const markdownContent = await response.text();

        // Display the markdown content
        responseDiv.innerHTML = marked.parse(markdownContent);
    } catch (error) {
        console.error('Error loading markdown answer:', error);
        const responseDiv = document.getElementById('response');
        responseDiv.innerHTML = `<div class="alert alert-danger">Error loading content: ${error.message}</div>`;
    }
}