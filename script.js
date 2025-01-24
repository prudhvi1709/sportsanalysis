import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";

let excelData = [];
const marked = new Marked();

// System prompt for the LLM
const SYSTEM_PROMPT = `You are a helpful assistant that analyzes Excel data and answers questions about it.
Please provide clear and concise answers based on the data provided. ALWAYS respond in markdown tables`;

const SPINNER_HTML = `
    <div class="spinner-border text-primary" role="status">
        <span class="d-none">Loading...</span>
    </div>`;

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

// Update the DOMContentLoaded event listener
document.addEventListener('DOMContentLoaded', async () => {
    const submitButton = document.getElementById('submitButton');
    if (submitButton) {
        submitButton.addEventListener('click', handleSubmit);
    }

    // Add event listener for dataset cards
    document.querySelectorAll('[data-dataset]').forEach(card => {
        card.addEventListener('click', async (e) => {
            e.preventDefault();
            handleDatasetClick(e);
        });
    });

    // Make sure the sidebar is hidden initially
    const sidebarContainer = document.getElementById('sidebarContainer');
    if (sidebarContainer) {
        sidebarContainer.classList.add('d-none');
    }
});

// Handle form submission
async function handleSubmit() {
    const question = document.getElementById('question').value.trim();
    const responseDiv = document.getElementById('response');
    const responseContainer = document.getElementById('responseContainer');

    if (excelData.length === 0) {
        alert('Please click on a Event!');
        return;
    }

    if (!question) {
        alert('Please enter a question');
        return;
    }

    if (responseContainer) {
        responseContainer.classList.remove('d-none');
    } else {
        console.error('Response container not found');
    }

    // Use the constant
    responseDiv.innerHTML = SPINNER_HTML;

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
        responseDiv.innerHTML = `<div class="alert alert-danger">
            <strong>Error:</strong> ${error.message || 'Failed to get response from LLM'}
        </div>`;
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

// Add a variable to track the selected dataset
let selectedDataset = null;

// Update handleDatasetClick function
async function handleDatasetClick(event) {
    const card = event.target.closest('[data-dataset]');
    if (!card) return;

    // Show the sidebar
    const sidebarContainer = document.getElementById('sidebarContainer');
    const mainContent = document.getElementById('mainContent');

    if (sidebarContainer && mainContent) {
        // Show sidebar
        sidebarContainer.classList.remove('d-none');

        // Adjust main content width
        mainContent.classList.remove('col-12');
        mainContent.classList.add('col-md-9', 'col-lg-10');
    }

    // Set the selected dataset
    selectedDataset = card.getAttribute('data-dataset');

    // Add active state to the clicked card and remove from others
    document.querySelectorAll('[data-dataset]').forEach(card => {
        card.classList.remove('active');
    });
    card.classList.add('active');

    const datasetMapping = {
        mlb: {
            dataFile: 'data/Copy_of_reddit_output_MLB_World_Series_2.xlsx',
            introFile: 'questions/MLB/intro.md'
        },
        nba_christmas: {
            dataFile: 'data/Copy_of_reddit_output_NBA_Christmas_1.xlsx',
            introFile: 'questions/NBA/nba_christmas_intro.md'
        },
        nfl_playoffs: {
            dataFile: 'data/Copy_of_reddit_output_NFL_Playoffs_1.xlsx',
            introFile: 'questions/NLF/nfl_playoffs_intro.md'
        }
    };

    try {
        // First, display the intro content if containers exist
        const introContainer = document.getElementById('introContainer');
        const introContent = document.getElementById('introContent');

        if (introContainer && introContent && datasetMapping[selectedDataset]?.introFile) {
            introContainer.classList.remove('d-none');
            introContent.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';

            try {
                const introResponse = await fetch(datasetMapping[selectedDataset].introFile);
                if (introResponse.ok) {
                    const introText = await introResponse.text();
                    introContent.innerHTML = marked.parse(introText);
                } else {
                    introContent.innerHTML = '<div class="alert alert-warning">Introduction content not available.</div>';
                }
            } catch (introError) {
                console.warn('Error loading intro:', introError);
                introContent.innerHTML = '<div class="alert alert-warning">Introduction content not available.</div>';
            }
        }

        // Then load the Excel file
        const response = await fetch(datasetMapping[selectedDataset].dataFile);
        const blob = await response.blob();
        const file = new File([blob], `${selectedDataset}.xlsx`);
        const data = await processExcelFile(file);
        excelData = [{
            filename: file.name,
            data: data
        }];

        // Load and process the config file
        const configResponse = await fetch('config.json');
        const config = await configResponse.json();

        // Get questions for the selected dataset
        const questions = config[selectedDataset];
        if (questions) {
            // Show and update the sidebar
            const sidebar = document.getElementById('predefinedQuestions');
            if (sidebar) {
                updateQuestionsWithMarkdown(questions);
                // Show the sidebar after updating the content
                sidebar.classList.remove('d-none');
            }
        }
    } catch (error) {
        console.error('Error loading dataset, intro, or config:', error);
        const errorContainer = document.getElementById('introContent') || document.getElementById('response');
        if (errorContainer) {
            errorContainer.innerHTML = `<div class="alert alert-danger">Error loading content: ${error.message}</div>`;
        }
    }
}

function updateQuestionsWithMarkdown(questions) {
    // Map category names to their accordion IDs
    const categoryMapping = {
        'topic_analysis': 'topics',
        'sentiment_analysis': 'sentiment',
        'volume_analysis': 'volume',
        'predictions_and outcomes': 'predictions'
    };

    Object.entries(questions).forEach(([category, questionList]) => {
        // Get the base category name by removing '_analysis' and converting to proper case
        const baseCategory = category.toLowerCase()
            .replace('_analysis', '')
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        // Get the correct accordion ID from the mapping
        const accordionId = categoryMapping[category.toLowerCase()];
        const accordionSection = document.getElementById(accordionId);

        if (accordionSection) {
            const linksContainer = accordionSection.querySelector('.d-grid');
            if (linksContainer) {
                // Clear existing links in this category
                linksContainer.innerHTML = '';

                // Add new links
                questionList.forEach(item => {
                    const link = document.createElement('a');
                    link.href = '#';
                    link.className = 'question-link btn btn-outline-primary text-start';
                    link.textContent = item.question;
                    link.setAttribute('data-answer-file', item.answer);

                    link.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await handleMarkdownQuestion(e);
                    });

                    linksContainer.appendChild(link);
                });
            }
        }
    });
}

// Update handleMarkdownQuestion to check for selected dataset
async function handleMarkdownQuestion(event) {
    event.preventDefault();

    if (!selectedDataset) {
        alert('Please select a dataset first by clicking on one of the cards.');
        return;
    }

    const link = event.target;
    const answerFile = link.getAttribute('data-answer-file');

    if (!answerFile) {
        console.error('No answer file path found');
        return;
    }

    const responseDiv = document.getElementById('response');
    const responseContainer = document.getElementById('responseContainer');

    if (responseContainer) {
        responseContainer.classList.remove('d-none');
    }

    if (responseDiv) {
        responseDiv.innerHTML = SPINNER_HTML;

        try {
            const response = await fetch(answerFile);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const markdownContent = await response.text();
            responseDiv.innerHTML = marked.parse(markdownContent);
        } catch (error) {
            console.error('Error loading markdown answer:', error);
            responseDiv.innerHTML = `<div class="alert alert-danger">
                Error loading content: ${error.message}
            </div>`;
        }
    }
}

// Add some CSS for the active card state
const style = document.createElement('style');
document.head.appendChild(style);

async function loadQuestionsFromConfig(dataset) {
    const response = await fetch('config.json');
    const config = await response.json();
    const datasetConfig = config[dataset];

    const accordion = document.getElementById('questionsAccordion');
    accordion.innerHTML = ''; // Clear existing questions

    // Create accordion items for each category
    for (const [category, questions] of Object.entries(datasetConfig)) {
        const categoryId = category.replace(/\s+/g, '');
        // Remove '_analysis' and format the category name
        const formattedCategory = category.toLowerCase()
            .replace('_analysis', '')
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        const accordionItem = `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button"
                            data-bs-toggle="collapse"
                            data-bs-target="#${categoryId}">
                        ${formattedCategory}
                    </button>
                </h2>
                <div id="${categoryId}" class="accordion-collapse collapse"
                     data-bs-parent="#questionsAccordion">
                    <div class="accordion-body">
                        <div class="d-grid gap-2">
                            ${questions.map(q => `
                                <a href="#" class="question-link btn btn-outline-primary text-start"
                                   data-question="${q.question}"
                                   data-answer-file="${q.answer}">
                                    ${q.question}
                                </a>
                            `).join('')}
                        </div>
                    </div>
                </div>
            </div>
        `;

        accordion.innerHTML += accordionItem;
    }

    // Add click event listeners to the newly created question links
    document.querySelectorAll('.question-link').forEach(link => {
        link.addEventListener('click', async (e) => {
            e.preventDefault();
            await handleMarkdownQuestion(e);
        });
    });
}

// Call this function when a dataset is selected
document.querySelectorAll('[data-dataset]').forEach(card => {
    card.addEventListener('click', (e) => {
        e.preventDefault();
        const dataset = e.currentTarget.dataset.dataset;
        loadQuestionsFromConfig(dataset);
        // ... rest of your dataset selection logic
    });
});