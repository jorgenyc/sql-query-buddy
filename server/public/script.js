// Global Debug Flag - Set to 'true' when developing, 'false' for production
const IS_DEBUG_MODE = false;

// Logger Utility - Wraps console methods with debug flag check
const Logger = {
    log: (...args) => { if (IS_DEBUG_MODE) console.log(...args); },
    info: (...args) => { if (IS_DEBUG_MODE) console.info(...args); },
    warn: (...args) => { if (IS_DEBUG_MODE) console.warn(...args); },
    error: (...args) => { console.error(...args); } // Always show errors!
};

// Global variable declarations
let currentProvidersData = null;
let isPowerUser = true; // Default to true for backward compatibility
let providerInstruction = document.getElementById('provider-instruction');
let queryInput = document.getElementById('query-input');
let sendButton = document.getElementById('send-button');
let chatContainer = document.getElementById('chat-container');
let queryForm = document.getElementById('query-form');
let clearContextBtn = document.getElementById('clear-context-btn');
let clearHistoryBtn = document.getElementById('clear-history-btn');
let apiKeyInput = document.getElementById('apiKeyInput');
let modalOkBtn = document.getElementById('modalOkBtn');
let modalCancelBtn = document.getElementById('modalCancelBtn');
let apiKeyModal = document.getElementById('apiKeyModal');
let apiKeyForm = document.getElementById('apiKeyForm');
let actionsCancelBtn = document.getElementById('actionsCancelBtn');
let testApiBtn = document.getElementById('testApiBtn');
let enterNewApiBtn = document.getElementById('enterNewApiBtn');
let providerActionsModal = document.getElementById('providerActionsModal');
let currentActionsProviderName = '';
let actionsModalOkHandler = null;
const mainContent = document.querySelector('.main-content');

// Enhancement features: CodeMirror instances for SQL editing
let sqlEditors = new Map(); // Map of messageId -> CodeMirror instance
let currentPage = 1; // For pagination
const ROWS_PER_PAGE = 50; // Pagination constant

// Query Tabs Management
const queryTabsContainer = document.getElementById('query-tabs');
let tabs = [];
let activeTabId = 'main';
let tabCounter = 0;

// Compare Mode State Management
let isCompareMode = false;
let isQueryRunning = false;

// Templates Modal Initialization Flag
let templatesModalInitialized = false;

// AI Settings Drawer Button Positioning Flag
let isPositioningButton = false;

// Provider Panel Collapse/Expand Functionality
const providerPanel = document.getElementById('ai-provider-status');
// Remove collapseBtn reference - minimize action now on ai_settings-min.svg graphic
const apiProviderStatus = document.getElementById('ai-provider-status');
const apiConfigToggleBtn = document.getElementById('api-config-toggle-btn');
// Placeholder for ProgressUIManager class
class ProgressUIManager {
    constructor() {
        this.eventSource = null;
        this.requestId = null;
        this.onCompleteCallback = null;
        this.onErrorCallback = null;

        this.progressContainer = document.getElementById('progress-container');
        this.progressBar = document.getElementById('progress-bar');
        this.progressBarPercentage = document.getElementById('progress-bar-percentage');
        this.progressStatusMessage = document.getElementById('progress-status-message');
        this.processingMessageElement = null;

        this.hideProgressUI();
    }

    start(requestId, onComplete, onError) {
        this.requestId = requestId;
        this.onCompleteCallback = onComplete;
        this.onErrorCallback = onError;

        this.showProcessingMessage();
        this.showProgressUI();
        this.updateProgressUI(0, 100, 'Connecting to server for progress...');

        const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
        const sseUrl = `${protocol}//${window.location.host}/api/query/progress/${this.requestId}`;

        this.eventSource = new EventSource(sseUrl);

        this.eventSource.onopen = () => {
            Logger.log('SSE connection opened for progress updates.');
            this.updateProgressUI(0, 100, 'Connected. Waiting for server updates...');
        };

        this.eventSource.addEventListener('progress', (event) => {
            const message = JSON.parse(event.data);
            Logger.log('Received SSE progress message:', message);
            const { step, totalSteps, message: statusMessage } = message;
            this.updateProgressUI(step, totalSteps, statusMessage);
        });

        this.eventSource.addEventListener('complete', (event) => {
            try {
            const message = JSON.parse(event.data);
                Logger.log('Received SSE complete message:', message);
                
                // Extract result from message (result is nested in the message object)
                const result = message.result || message;
                const totalTime = result.totalTime || result.totalQueryTime || 0;
                
            this.updateProgressUI(100, 100, 'Complete!');
                
                // Ensure callback is called with proper data structure
                if (this.onCompleteCallback) {
                    this.onCompleteCallback({ 
                        ...result, 
                        totalQueryTime: totalTime 
                    });
                } else {
                    console.error('[PROGRESS] onCompleteCallback is null!');
                }
            this.stop();
            } catch (error) {
                console.error('[PROGRESS] Error handling complete event:', error);
                console.error('[PROGRESS] Event data:', event.data);
                if (this.onErrorCallback) {
                    this.onErrorCallback({ 
                        message: 'Failed to parse completion data', 
                        error: error.message 
                    });
                }
                this.stop();
            }
        });

        this.eventSource.addEventListener('error', (event) => {
            const message = event.data ? JSON.parse(event.data) : { error: 'Unknown error', message: 'An unknown error occurred.' };
            console.error('Received SSE error message:', message);
            this.updateProgressUI(0, 100, `Error: ${message.error || message.message}`);
            this.onErrorCallback(message);
            this.stop();
        });

        this.eventSource.onerror = (error) => {
            console.error('EventSource error:', error);
            this.updateProgressUI(0, 100, 'Connection error!');
            if (this.eventSource.readyState === EventSource.CLOSED) {
                Logger.log('EventSource connection closed unexpectedly.');
                this.onErrorCallback({ message: 'Progress connection closed unexpectedly.', errorType: 'sse_closed' });
            } else {
                this.onErrorCallback({ message: 'EventSource connection error.', errorType: 'sse_error' });
            }
            this.stop();
        };
    }

    stop() {
        if (this.eventSource) {
            this.eventSource.close();
            this.eventSource = null;
        }
        this.hideProgressUI();
        this.hideProcessingMessage();
        this.requestId = null;
        this.onCompleteCallback = null;
        this.onErrorCallback = null;
    }

    updateProgressUI(step, totalSteps, message) {
        if (this.progressBar && this.progressStatusMessage) {
            const percentage = totalSteps > 0 ? Math.round((step / totalSteps) * 100) : 0;
            this.progressBar.style.width = `${percentage}%`;
            if (this.progressBarPercentage) {
                this.progressBarPercentage.textContent = `${percentage}%`;
            }
            this.progressStatusMessage.textContent = message;
        }
    }

    showProgressUI() {
        if (this.progressContainer) {
            this.progressContainer.classList.remove('hidden');
        }
    }

    hideProgressUI() {
        if (this.progressContainer) {
            this.progressContainer.classList.add('hidden');
        }
    }

    showProcessingMessage() {
        this.processingMessageElement = document.createElement('div');
        this.processingMessageElement.className = 'chat-message processing-message';
        this.processingMessageElement.innerHTML = '<span class="loading-spinner"></span><span>Processing your query...</span>';
        if (chatContainer) {
            chatContainer.appendChild(this.processingMessageElement);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
        reinitializeIcons();
    }

    hideProcessingMessage() {
        if (this.processingMessageElement && this.processingMessageElement.parentNode) {
            this.processingMessageElement.remove();
            this.processingMessageElement = null;
        }
    }
}

// Function definitions
function updateProviderButtonState(disabled) {
    if (sendButton) {
        sendButton.disabled = disabled;
    }
}

function openProviderConfig() {
    alert('Placeholder: Open provider configuration panel.');
}

function openModal(providerName, replacementMode = false) {
    if (apiKeyModal) {
        const modalProviderNameElement = document.getElementById('modalProviderName');
        if (modalProviderNameElement) {
            modalProviderNameElement.textContent = `for ${providerName}`;
        }
        apiKeyModal.style.display = 'block';
    }
}

function closeModal() {
    if (apiKeyModal) {
        apiKeyModal.style.display = 'none';
        if (apiKeyInput) {
            apiKeyInput.value = '';
        }
        if (modalOkBtn) {
            modalOkBtn.disabled = true;
            modalOkBtn.textContent = 'OK';
        }
    }
}

async function saveApiKey() {
    const providerName = document.getElementById('modalProviderName').textContent.replace('for ', '');
    const apiKey = apiKeyInput.value.trim();

    if (!providerName || !apiKey) {
        alert('Provider name or API key is missing.');
        return;
    }

    // Validate API key length and format
    if (apiKey.length < 10 || apiKey.length > 500) {
        alert('API key must be between 10 and 500 characters.');
        return;
    }

    // Basic format validation
    if (!/^[a-zA-Z0-9._-]+$/.test(apiKey)) {
        alert('API key contains invalid characters. Only letters, numbers, dots, dashes, and underscores are allowed.');
        return;
    }

    // Disable OK button during testing
    if (modalOkBtn) {
        modalOkBtn.disabled = true;
        modalOkBtn.textContent = 'Testing...';
    }

    try {
        // First, test the API key before saving
        const testResponse = await fetch('/api/providers/test-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ provider: providerName, apiKey: apiKey })
        });

        const testData = await testResponse.json();

        if (!testData.success) {
            // API key test failed - prompt user to retry or cancel
            if (modalOkBtn) {
                modalOkBtn.disabled = false;
                modalOkBtn.textContent = 'OK';
            }

            const errorMessage = testData.error || 'API key validation failed';
            const shouldRetry = confirm(`API Key Test Failed:\n\n${errorMessage}\n\nWould you like to try entering the API key again?\n\nClick OK to retry, or Cancel to close.`);

            if (!shouldRetry) {
                // User chose to cancel - close the modal
                closeModal();
            } else {
                // User chose to retry - clear the input and let them try again
                if (apiKeyInput) {
                    apiKeyInput.value = '';
                    apiKeyInput.focus();
                }
            }
            return;
        }

        // API key test passed - now save it
        if (modalOkBtn) {
            modalOkBtn.textContent = 'Saving...';
        }

        const response = await fetch('/api/providers/configure', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ provider: providerName, apiKey: apiKey })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('API Key tested and saved successfully!');
            closeModal();
            await updateProviderUI();
        } else {
            if (modalOkBtn) {
                modalOkBtn.disabled = false;
                modalOkBtn.textContent = 'OK';
            }
            showError(`Failed to save API Key: ${data.error}`);
        }
    } catch (error) {
        // Error already handled in catch block
        if (modalOkBtn) {
            modalOkBtn.disabled = false;
            modalOkBtn.textContent = 'OK';
        }
        showError('Error communicating with server to save API Key.');
    }
}

let currentActionsProviderIndex = -1;

async function deleteApiKeyForProvider(providerName) {
    if (!providerName) {
        showError('No provider selected for deletion.');
        return;
    }

    try {
        const response = await fetch('/api/providers/delete-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ provider: providerName })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('API Key deleted successfully!');
            await updateProviderUI();
        } else {
            showError(`Failed to delete API Key: ${data.error}`);
        }
    } catch (error) {
        console.error('Error deleting API Key:', error);
        showError('Error communicating with server to delete API Key.');
    }
}

async function deleteApiKey() {
    
    if (!currentActionsProviderName) {
        showError('No provider selected for deletion.');
        return;
    }

    // Confirm deletion
    const confirmed = confirm(`Are you sure you want to delete the API key for ${currentActionsProviderName}?\n\nThis action cannot be undone.`);
    
    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch('/api/providers/delete-key', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ provider: currentActionsProviderName })
        });

        const data = await response.json();

        if (data.success) {
            showSuccess('API Key deleted successfully!');
            closeProviderActionsModal();
            await updateProviderUI();
        } else {
            showError(`Failed to delete API Key: ${data.error}`);
        }
    } catch (error) {
        console.error('Error deleting API Key:', error);
        showError('Error communicating with server to delete API Key.');
    }
}

function openProviderActionsModal(index, providerName) {
    currentActionsProviderName = providerName;
    currentActionsProviderIndex = index;
    if (providerActionsModal) {
        const actionsModalProviderNameElement = document.getElementById('actionsModalProviderName');
        if (actionsModalProviderNameElement) {
            actionsModalProviderNameElement.textContent = `Provider: ${providerName}`;
        }
        providerActionsModal.style.display = 'block';
    }
}

function closeProviderActionsModal() {
    if (providerActionsModal) {
        providerActionsModal.style.display = 'none';

        const actionsModalButtons = document.getElementById('actionsModalButtons');
        const actionsModalResult = document.getElementById('actionsModalResult');
        const actionsModalConfirm = document.getElementById('actionsModalConfirm');
        const actionsModalResultMessage = document.getElementById('actionsModalResultMessage');

        if (actionsModalButtons) actionsModalButtons.style.display = 'flex';
        if (actionsModalResult) actionsModalResult.style.display = 'none';
        if (actionsModalConfirm) actionsModalConfirm.style.display = 'none';
        if (actionsModalResultMessage) actionsModalResultMessage.textContent = '';
    }
}

async function testCurrentProviderApi() {
    if (currentActionsProviderIndex === -1) {
        showError('No provider selected for testing.');
        return;
    }

    const actionsModalButtons = document.getElementById('actionsModalButtons');
    const actionsModalResult = document.getElementById('actionsModalResult');
    const actionsModalResultMessage = document.getElementById('actionsModalResultMessage');
    const actionsModalOkBtn = document.getElementById('actionsModalOkBtn');
    const actionsModalCancelBtn = document.getElementById('actionsModalCancelBtn');

    if (actionsModalButtons) actionsModalButtons.style.display = 'none';
    if (actionsModalResult) actionsModalResult.style.display = 'block';
    if (actionsModalResultMessage) actionsModalResultMessage.textContent = 'Testing API...';
    if (actionsModalOkBtn) actionsModalOkBtn.style.display = 'none';
    if (actionsModalCancelBtn) actionsModalCancelBtn.style.display = 'none';

    try {
        const response = await fetch('/api/providers/test-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: currentActionsProviderIndex })
        });
        const result = await response.json();

        if (actionsModalResultMessage) {
            if (result.success) {
                actionsModalResultMessage.innerHTML = '✅ API Test Successful!';
                actionsModalResultMessage.style.backgroundColor = '#e6ffe6';
                actionsModalResultMessage.style.color = '#006600';
            } else {
                actionsModalResultMessage.innerHTML = `❌ API Test Failed: ${result.error}`;
                actionsModalResultMessage.style.backgroundColor = '#ffe6e6';
                actionsModalResultMessage.style.color = '#cc0000';
            }
        }
    } catch (error) {
        // Error already handled
        if (actionsModalResultMessage) {
            actionsModalResultMessage.innerHTML = `❌ Error testing API: ${error.message}`;
            actionsModalResultMessage.style.backgroundColor = '#ffe6e6';
            actionsModalResultMessage.style.color = '#cc0000';
        }
    } finally {
        if (actionsModalOkBtn) actionsModalOkBtn.style.display = 'block';
        actionsModalOkHandler = () => {
            closeProviderActionsModal();
            if (actionsModalButtons) actionsModalButtons.style.display = 'flex';
            if (actionsModalResult) actionsModalResult.style.display = 'none';
            if (actionsModalResultMessage) actionsModalResultMessage.textContent = '';
            if (actionsModalOkBtn) actionsModalOkBtn.style.display = 'block';
            if (actionsModalCancelBtn) actionsModalCancelBtn.style.display = 'none';
            actionsModalOkHandler = null;
        };
    }
}

function showModalConfirmation() {
    const actionsModalButtons = document.getElementById('actionsModalButtons');
    const actionsModalConfirm = document.getElementById('actionsModalConfirm');

    if (actionsModalButtons) actionsModalButtons.style.display = 'none';
    if (actionsModalConfirm) actionsModalConfirm.style.display = 'block';
}

async function testAllProviders() {
    try {
        if (providerInstruction) {
            providerInstruction.textContent = 'Testing all providers...';
            providerInstruction.style.color = '#007bff';
        }

        const response = await fetch('/api/providers/test-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const data = await response.json();

        if (data.success) {
            showSuccess(`Tested ${data.summary.total} providers: ${data.summary.working} working, ${data.summary.failed} failed.`);
        } else {
            showError(`Failed to test all providers: ${data.error}`);
        }
    } catch (error) {
        // Error already handled
        showError('Error communicating with server to test all providers.');
    } finally {
        await updateProviderUI();
        if (providerInstruction) {
            providerInstruction.textContent = 'Update provider with click or model with dropdown';
            providerInstruction.style.color = '#888';
        }
    }
}

function updateProviderPanelState() {
}

function showError(message) {
    alert(`Error: ${message}`);
}

async function showConfirmDialog(title, message) {
    return confirm(`${title}\n${message}`);
}

function showSuccess(message) {
    alert(`Success: ${message}`);
}

let lastQuery = '';
function retryLastQuery() {
    if (queryInput && queryForm) {
        queryInput.value = lastQuery;
        queryForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }
}

function showConfigurationGuide() {
    alert('Please configure a working provider in the settings.');
}

async function updateProviderUI() {
    try {
        const [providersResponse, healthResponse] = await Promise.all([
            fetch('/api/providers'),
            fetch('/api/health')
        ]);

        // Check if providers response is ok
        if (!providersResponse.ok) {
            const errorData = await providersResponse.json().catch(() => ({ error: 'Unknown error' }));
            Logger.error('Failed to load providers:', errorData);
            throw new Error(errorData.error || `HTTP ${providersResponse.status}: ${providersResponse.statusText}`);
        }

        const providersData = await providersResponse.json();
        const healthData = await healthResponse.json().catch(() => ({})); // Health endpoint might fail, but continue

        if (!providersData || !providersData.providers) {
            Logger.error('Invalid providers data:', providersData);
            throw new Error('Invalid response from server');
        }

        currentProvidersData = providersData;
        
        // Store power_user flag from API response
        isPowerUser = providersData.power_user !== false; // Default to true if not specified

        renderProvidersTable(providersData.providers, providersData.currentIndex, healthData, providersData.testResults || {});

        updateHeaderStatus();
        updateCurrentProviderStats();
        
        // Update UI based on power_user setting
        updatePowerUserUI();
    } catch (error) {
        Logger.error('Error loading providers:', error);
        alert(`Failed to load AI providers: ${error.message}. Please check server connection and console for details.`);
    }
}

function updateHeaderStatus() {
    if (currentProvidersData && currentProvidersData.providers && currentProvidersData.providers.length > 0) {
        const currentProvider = currentProvidersData.providers[currentProvidersData.currentIndex];
        if (currentProvider) {
            const headerProvider = document.getElementById('header-provider');
            const headerModel = document.getElementById('header-model');

            if (headerProvider) {
                headerProvider.textContent = currentProvider.name;
            }
            if (headerModel) {
                headerModel.textContent = currentProvider.selectedModel;
            }
        }
    }
}

function updateHeaderStatusFromTab(tab) {
    const headerProvider = document.getElementById('header-provider');
    const headerModel = document.getElementById('header-model');

    if (headerProvider && headerModel) {
        if (tab.provider && tab.provider !== 'N/A') {
            headerProvider.textContent = tab.provider;
            headerModel.textContent = tab.model || 'Unknown';
        } else {
            if (currentProvidersData && currentProvidersData.providers && currentProvidersData.providers.length > 0) {
                const currentProvider = currentProvidersData.providers[currentProvidersData.currentIndex];
                if (currentProvider) {
                    headerProvider.textContent = currentProvider.name;
                    headerModel.textContent = currentProvider.selectedModel;
                }
            }
        }
    }
}

function updateClearContextVisibility() {
    return;
}

async function handleModelChange(providerName, modelName) {
    try {

        if (providerInstruction) {
            providerInstruction.textContent = `Updating Model on provider ${providerName}`;
            providerInstruction.style.color = '#007bff';
        }

        const response = await fetch('/api/providers/select-model', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ providerName, modelName })
        });

        const data = await response.json();

        if (data.success) {
            await updateProviderUI();

            if (providerInstruction) {
                providerInstruction.textContent = 'Update provider with click or model with dropdown';
                providerInstruction.style.color = '#888';
            }
        } else {
            // Error message displayed to user
            alert('Failed to change model. Please try again.');
            await updateProviderUI();

            if (providerInstruction) {
                providerInstruction.textContent = 'Update provider with click or model with dropdown';
                providerInstruction.style.color = '#888';
            }
        }
    } catch (error) {
        // Error already handled
        alert('Error communicating with server to change model.');
        await updateProviderUI();

        if (providerInstruction) {
            providerInstruction.textContent = 'Update provider with click or model with dropdown';
            providerInstruction.style.color = '#888';
        }
    }
}

async function testAndSwitchToProvider(providerIndex) {
    try {
        const provider = currentProvidersData.providers[providerIndex];
        if (!provider) return;

        if (providerInstruction) {
            providerInstruction.textContent = `Testing ${provider.name}...`;
            providerInstruction.style.color = '#007bff';
        }

        const testResponse = await fetch('/api/providers/test-single', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: providerIndex })
        });

        const testResult = await testResponse.json();

        if (!testResult.success) {
            if (providerInstruction) {
                providerInstruction.textContent = 'API key validation failed';
                providerInstruction.style.color = '#dc3545';
            }

            setTimeout(() => {
                if (confirm(`API key is not valid for the provider selected.\n\nError: ${testResult.error}\n\nWould you like to try a different API key?`)) {
                    openModal(provider.name);
                } else {
                    if (providerInstruction) {
                        providerInstruction.textContent = 'Update provider with click or model with dropdown';
                        providerInstruction.style.color = '#888';
                    }
                }
            }, 500);
            return;
        }

        if (providerInstruction) {
            providerInstruction.textContent = 'Updating provider';
            providerInstruction.style.color = '#007bff';
        }

        const switchResponse = await fetch('/api/providers/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ index: providerIndex })
        });

        const switchData = await switchResponse.json();

        if (!switchResponse.ok || switchData.error) {
            throw new Error(switchData.error || 'Failed to switch provider');
        }

        await updateProviderUI();

        if (providerInstruction) {
            providerInstruction.textContent = 'Update provider with click or model with dropdown';
            providerInstruction.style.color = '#888';
        }
    } catch (error) {
        // Error already handled
        if (providerInstruction) {
            providerInstruction.textContent = 'Error... Update the model or provider to continue';
            providerInstruction.style.color = '#dc3545';
        }

        setTimeout(() => {
            if (providerInstruction) {
                providerInstruction.textContent = 'Update provider with click or model with dropdown';
                providerInstruction.style.color = '#888';
            }
        }, 3000);
    }
}

async function switchToProvider(providerIndex) {
    try {
        if (providerInstruction) {
            providerInstruction.textContent = 'Updating provider';
            providerInstruction.style.color = '#007bff';
        }

        const response = await fetch('/api/providers/switch', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ index: providerIndex })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || 'Failed to switch provider');
        }

        await updateProviderUI();

        if (providerInstruction) {
            providerInstruction.textContent = 'Update provider with click or model with dropdown';
            providerInstruction.style.color = '#888';
        }
    } catch (error) {
        // Error already handled

        if (providerInstruction) {
            providerInstruction.textContent = 'Error... Update the model or provider to continue';
            providerInstruction.style.color = '#dc3545';
        }
    }
}

function renderProvidersTable(providers, currentIndex, healthData, testResults = {}) {
    const providerTableBody = document.getElementById('provider-table-body');
    if (!providerTableBody) {
        // Element not found - handled gracefully
        return;
    }
    providerTableBody.innerHTML = '';

    providers.forEach((provider, index) => {
        const tableRow = document.createElement('tr');
        const isCurrentProvider = index === currentIndex;

        if (isCurrentProvider) {
            tableRow.classList.add('active-provider');
        }

        // Determine health status
        const isApiKeyValid = provider.apiKey &&
            !provider.apiKey.startsWith('YOUR_') &&
            !provider.apiKey.startsWith('${process.env') &&
            !provider.apiKey.includes('your-') &&
            provider.apiKey !== 'N/A (uses AWS IAM roles)';

        let isHealthy = false;
        const testResult = testResults[provider.name];

        if (provider.enabled && isApiKeyValid) {
            if (testResult && testResult.tested) {
                isHealthy = testResult.success;
            } else if (isCurrentProvider) {
                isHealthy = healthData.apiTested && healthData.apiWorking;
                } else {
                // Not tested - consider as potentially healthy if key is valid
                isHealthy = true; // Optimistic: valid key but not tested
            }
        }

        // Create provider cell with radio button
        const providerNameCell = document.createElement('td');
        const radioContainer = document.createElement('div');
        radioContainer.className = 'provider-radio-container';
        radioContainer.setAttribute('role', 'radio');
        radioContainer.setAttribute('aria-checked', isCurrentProvider ? 'true' : 'false');
        radioContainer.setAttribute('tabindex', '0');
        radioContainer.setAttribute('aria-label', `${provider.name} provider, ${isHealthy ? 'healthy' : 'unhealthy'}`);
        radioContainer.setAttribute('data-provider-index', index);
        radioContainer.setAttribute('data-provider-name', provider.name);

        const radioButton = document.createElement('div');
        radioButton.className = 'provider-radio-button';
        if (isHealthy) {
            radioButton.classList.add('healthy');
            } else {
            radioButton.classList.add('unhealthy');
        }
        if (isCurrentProvider) {
            radioButton.classList.add('selected');
        }

        const providerNameSpan = document.createElement('span');
        providerNameSpan.className = 'provider-radio-name';
        providerNameSpan.textContent = provider.name;
        providerNameSpan.title = provider.name; // Show full name on hover

        radioContainer.appendChild(radioButton);
        radioContainer.appendChild(providerNameSpan);
        providerNameCell.appendChild(radioContainer);

        // Implement click behavior (disabled if not power user)
        radioContainer.onclick = (e) => {
            e.stopPropagation(); // Prevent row click
            
            if (!isPowerUser) {
                return; // Block provider switching if not power user
            }
            
            if (isCurrentProvider) {
                // Already selected - show Test API dialog
                showTestApiDialog(index, provider.name);
            } else if (isHealthy) {
                // Unselected + Healthy - switch to this provider
                testAndSwitchToProvider(index);
            } else {
                // Unselected + Unhealthy - show Enter API Key dialog
                showEnterApiKeyDialog(provider.name);
            }
        };

        // Keyboard accessibility
        radioContainer.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                radioContainer.onclick(e);
            }
        };

        tableRow.appendChild(providerNameCell);

        const modelCell = document.createElement('td');
        modelCell.className = 'model-cell';
        const modelSelect = document.createElement('select');
        modelSelect.className = 'model-select';
        modelSelect.name = `model-select-${provider.name}`;
        modelSelect.id = `model-select-${provider.name}-${index}`;
        modelSelect.dataset.provider = provider.name;
        modelSelect.style.width = '100%';
        modelSelect.style.maxWidth = '100px';
        modelSelect.style.textAlign = 'left';
        // Truncate displayed text but show full in dropdown
        modelSelect.style.textOverflow = 'ellipsis';
        modelSelect.style.overflow = 'hidden';
        modelSelect.title = provider.selectedModel; // Show full model name on hover

        provider.models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.name;
            option.textContent = model.name;
            if (model.name === provider.selectedModel) {
                option.selected = true;
            }
            modelSelect.appendChild(option);
        });

        // Disable model selection if not power user
        if (!isPowerUser) {
            modelSelect.disabled = true;
            modelSelect.style.cursor = 'not-allowed';
            modelSelect.style.opacity = '0.6';
        }

        modelSelect.addEventListener('change', async (e) => {
            if (!isPowerUser) {
                e.preventDefault();
                return;
            }
            await handleModelChange(provider.name, e.target.value);
        });

        modelCell.appendChild(modelSelect);
        tableRow.appendChild(modelCell);

        const costCell = document.createElement('td');
        costCell.className = 'cost-cell';
        const selectedModelObj = provider.models.find(m => m.name === provider.selectedModel);
        if (selectedModelObj && typeof selectedModelObj.price_per_million_tokens_input !== 'undefined' && typeof selectedModelObj.price_per_million_tokens_output !== 'undefined') {
            // Improved cost display with denser vertical spacing and no bold
            const inputCost = selectedModelObj.price_per_million_tokens_input.toFixed(2);
            const outputCost = selectedModelObj.price_per_million_tokens_output.toFixed(2);
            costCell.innerHTML = `<div style="line-height: 1.1; display: flex; flex-direction: column; align-items: center; gap: 1px;"><div style="display: flex; align-items: center; gap: 3px;"><span style="color: #28a745; font-size: 1rem;">↓</span> <span style="font-weight: normal;">$${inputCost}</span></div><div style="display: flex; align-items: center; gap: 3px;"><span style="color: #dc3545; font-size: 1rem;">↑</span> <span style="font-weight: normal;">$${outputCost}</span></div></div>`;
            costCell.title = `Input: $${inputCost} per million tokens, Output: $${outputCost} per million tokens`;
        } else {
            costCell.textContent = 'N/A';
            costCell.title = 'Cost data not available in vendor_config.json for this model.';
        }
        tableRow.appendChild(costCell);

        providerTableBody.appendChild(tableRow);
    });
}

// Helper function to show Enter API Key dialog
function showEnterApiKeyDialog(providerName) {
    openModal(providerName);
}

// Helper function to show Test API dialog
function showTestApiDialog(providerIndex, providerName) {
    openProviderActionsModal(providerIndex, providerName);
}

async function clearContext() {
    try {
        if (clearContextBtn) clearContextBtn.disabled = true;
        
        // Get active tab ID to clear context for the correct tab
        const activeTab = tabs.find(t => t.id === activeTabId);
        const tabId = activeTab ? activeTab.id : 'default';
        
        const response = await fetch('/api/clear-context', { 
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tabId })
        });
        const data = await response.json();
        if (data.success) {

            tabCounter++;
            const newTabId = `tab-${tabCounter}`;
            const newTab = {
                id: newTabId,
                title: 'New Query',
                messages: [],
                chatHTML: '',
                queryCount: 0,
                contextReset: true, // Flag to indicate context was reset
                provider: 'N/A'
            };

            tabs.unshift(newTab);
            saveTabsToStorage();

            activeTabId = newTabId;
            if (chatContainer) chatContainer.innerHTML = '';

            document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));

            const resetMessage = document.getElementById('reset-message');
            if (resetMessage) resetMessage.classList.remove('hidden');

            renderTabs();

            updateClearContextVisibility();
        } else {
            // Error message displayed to user
            alert('Failed to clear conversation context.');
        }
    } catch (error) {
        // Error already handled
        alert('Error communicating with server to clear context.');
    } finally {
        if (clearContextBtn) clearContextBtn.disabled = false;
    }
}

function getEmptyStateMessage(field) {
    const messages = {
        provider: 'Not selected',
        model: 'Not selected',
        tokens: 'No queries yet',
        latency: 'No queries yet',
        status: 'Waiting for query',
        lastrun: 'No queries yet'
    };
    return messages[field] || '—';
}

function setEmptyState(element, message) {
    if (element) {
        element.textContent = message;
        element.classList.add('empty-state');
    }
}

function setStatValue(element, value, isEmpty = false) {
    if (element) {
        element.textContent = value;
        if (isEmpty) {
            element.classList.add('empty-state');
        } else {
            element.classList.remove('empty-state');
        }
    }
}

function updateQueryStats(stats) {
    // Query Stats section removed - function kept for compatibility but does nothing
    // Stats are now shown in the stats bubble next to query results
    if (!stats) return;
}

function updatePowerUserUI() {
    const drawerToggleBtn = document.getElementById('api-config-toggle-btn');
    const settingsDrawer = document.getElementById('ai-provider-status');
    const headerSubtitle = document.getElementById('header-subtitle');
    
    if (!isPowerUser) {
        // Hide API settings drawer and toggle button
        if (drawerToggleBtn) {
            drawerToggleBtn.style.display = 'none';
        }
        if (settingsDrawer) {
            settingsDrawer.classList.remove('open');
            settingsDrawer.style.display = 'none';
        }
        // Hide subtitle text about provider/model selection
        if (headerSubtitle) {
            headerSubtitle.style.display = 'none';
        }
    } else {
        // Show API settings drawer and toggle button
        if (drawerToggleBtn) {
            drawerToggleBtn.style.display = 'flex';
        }
        if (settingsDrawer) {
            settingsDrawer.style.display = ''; // Reset to default
        }
        // Show full subtitle text
        if (headerSubtitle) {
            headerSubtitle.style.display = '';
        }
    }
}

function updateCurrentProviderStats() {
    // Query Stats section removed - function kept for compatibility but does nothing
    // Stats are now shown in the stats bubble next to query results
}

function displayQueryResults(data, userQuery) {
    Logger.log('[DISPLAY] displayQueryResults called with:', { 
        hasData: !!data, 
        hasResults: !!(data && data.results), 
        resultsLength: data?.results?.length,
        userQuery: userQuery?.substring(0, 50) 
    });
    
    if (!chatContainer) {
        console.error('[DISPLAY] chatContainer not found!');
        // Element not found - handled gracefully
        return;
    }
    
    if (!data) {
        console.error('[DISPLAY] No data provided to displayQueryResults!');
        return;
    }
    
    // Remove any processing messages before displaying results
    const processingMessages = chatContainer.querySelectorAll('.processing-message');
    processingMessages.forEach(msg => msg.remove());
    
    // Create wrapper for result and stats bubbles
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    const aiMessage = document.createElement('div');
    aiMessage.className = 'chat-message ai-message';

    let aiContent = '';

    // Performance metrics removed - now displayed in horizontal Tron HUD stats bar below AI response
    // Stats are shown via createStatsBubble() function which creates the query-stats-bar

    if (data.irrelevant) {
        aiContent += parseMarkdown(data.explanation);
    } else {
        if (data.explanation) {
            aiContent += `<h3>🧑‍🏫 Explainable SQL Explanation</h3><div class="markdown-content">${parseMarkdown(data.explanation)}</div>`;
        }
        if (data.sqlQuery) {
            const sqlId = `sql-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const sqlCopyId = `sql-copy-${sqlId}`;
            aiContent += `<h3>Query <button class="copy-btn" id="${sqlCopyId}" data-sql="${escapeHtml(data.sqlQuery)}" title="Copy SQL"><i data-feather="copy"></i></button></h3><div id="${sqlId}" class="sql-editor-container"></div>`;
            // Store SQL for CodeMirror initialization and copy button
            aiMessage.dataset.sqlQuery = data.sqlQuery;
            setTimeout(() => {
                // Initialize copy button
                const copyBtn = document.getElementById(sqlCopyId);
                if (copyBtn) {
                    copyBtn.addEventListener('click', () => {
                        copyToClipboard(data.sqlQuery, 'SQL Query');
                    });
                }
                // Initialize CodeMirror
                if (typeof CodeMirror !== 'undefined') {
                    const editor = CodeMirror(document.getElementById(sqlId), {
                        value: data.sqlQuery,
                        mode: 'sql',
                        theme: 'dracula', // Cyberpunk dark theme
                        readOnly: true,
                        lineNumbers: true,
                        lineWrapping: true,
                        scrollbarStyle: 'null' // Hide default scrollbars
                    });
                    
                    // Auto-size to fit content
                    editor.setSize(null, 'auto');
                    
                    // Refresh after a brief delay to ensure proper rendering
                    setTimeout(() => {
                        editor.refresh();
                        // Force recalculation of scrollbars
                        const scrollElement = editor.getScrollerElement();
                        if (scrollElement.scrollHeight <= scrollElement.clientHeight) {
                            scrollElement.style.overflowY = 'hidden';
                        }
                    }, 100);
                    
                    sqlEditors.set(sqlId, editor);
                } else {
                    // Fallback to pre/code if CodeMirror not loaded
                    const container = document.getElementById(sqlId);
                    if (container) {
                        container.innerHTML = `<pre><code>${escapeHtml(data.sqlQuery)}</code></pre>`;
                    }
                }
            }, 100);
        }
        if (data.optimizations) {
            aiContent += `<h3>⚡ Query Optimization</h3><div class="markdown-content">${parseMarkdown(data.optimizations)}</div>`;
        }
        if (data.insights) {
            aiContent += `<h3>💡 AI-Driven Insights</h3><div class="markdown-content">${parseMarkdown(data.insights)}</div>`;
            // Generate insights chart right after insights section
            const insightsChartHTML = generateChartFromInsights(data.insights);
            if (insightsChartHTML) {
                aiContent += insightsChartHTML;
            }
        }
        if (data.results && data.results.length > 0) {
            const resultsId = `results-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const resultsCopyId = `results-copy-${resultsId}`;
            
            // Check if chart can be generated first (chart takes priority over map)
            const resultsChartHTML = generateChart(data.results);
            const canGenerateChart = !!resultsChartHTML;
            
            // Only generate map if chart cannot be generated (map is fallback for geographic data)
            if (!canGenerateChart) {
                const resultsMapHTML = generateMap(data.results);
                if (resultsMapHTML) {
                    aiContent += resultsMapHTML;
                }
            }
            
            // Generate analysis tools
            const statsSummaryHTML = generateStatisticalSummary(data.results);
            const correlationMatrixHTML = generateCorrelationMatrix(data.results);
            const trendAnalysisHTML = generateTrendAnalysis(data.results);
            
            // Add analysis sections before results table
            if (statsSummaryHTML) {
                aiContent += statsSummaryHTML;
            }
            if (correlationMatrixHTML) {
                aiContent += correlationMatrixHTML;
            }
            if (trendAnalysisHTML) {
                aiContent += trendAnalysisHTML;
            }
            
            aiContent += `<h3>Results (${data.results.length} rows) 
                <button class="copy-btn" id="${resultsCopyId}" title="Copy Results"><i data-feather="copy"></i></button>
            </h3>`;
            aiContent += `<div id="${resultsId}">${generateResultsTable(data.results, 1, resultsId)}</div>`;
            // Store results data for pagination
            aiMessage.dataset.resultsData = JSON.stringify(data.results);
            // Add chart if it was generated
            if (resultsChartHTML) {
                aiContent += resultsChartHTML;
            }
        } else if (data.results && data.results.length === 0) {
            aiContent += '<p><em>No results found.</em></p>';
        }
    }

    aiMessage.innerHTML = aiContent;
    
    // Get activeTab before creating stats bubble
    let activeTab = tabs.find(t => t.id === activeTabId);
    
    // If active tab not found, create a default tab or use the first available tab
    if (!activeTab) {
        if (tabs.length > 0) {
            // Use the first available tab
            activeTab = tabs[0];
            activeTabId = activeTab.id;
            Logger.warn('[TAB] Active tab not found, using first available tab:', activeTabId);
        } else {
            // Create a default tab
            tabCounter++;
            const newTabId = `tab-${tabCounter}`;
            activeTab = {
                id: newTabId,
                title: 'New Query',
                messages: [],
                chatHTML: '',
                queryCount: 0,
                provider: 'N/A'
            };
            tabs.push(activeTab);
            activeTabId = newTabId;
            saveTabsToStorage();
            Logger.warn('[TAB] No tabs found, created default tab:', activeTabId);
        }
    }
    
    // Ensure activeTab exists and has queryCount initialized
    if (!activeTab) {
        console.error('[TAB RENAME] Failed to create or find active tab');
        return;
    }
    
    // Handle context reset flag from backend
    if (data.contextReset === true) {
        Logger.log('[CONTEXT] Backend signaled context reset - resetting tab state');
        activeTab.contextReset = true;
        activeTab.queryCount = 1; // Reset to 1 for the first query after reset
        Logger.log('[CONTEXT] Tab context reset, queryCount set to 1');
    } else {
        // Initialize queryCount if not set
        if (activeTab.queryCount === undefined || activeTab.queryCount === null) {
            activeTab.queryCount = 0;
        }
        
        // Increment queryCount BEFORE creating stats bubble so it shows the correct iteration
        activeTab.queryCount++;
        // Clear contextReset flag after first query (so subsequent queries show normal iteration 2, 3, etc.)
        if (activeTab.contextReset && activeTab.queryCount > 1) {
            activeTab.contextReset = false;
        }
        Logger.log('[TAB RENAME] Incremented queryCount to:', activeTab.queryCount);
    }
    // Save immediately so queryCount persists
    saveTabsToStorage();
    
    // Add AI message first
    messageWrapper.appendChild(aiMessage);
    
    // Create horizontal Tron HUD stats bar and add it after the AI message
    const statsBar = createStatsBubble(data, activeTabId);
    if (statsBar) {
        messageWrapper.appendChild(statsBar);
    } else {
        Logger.warn('Stats bar was not created. Data:', data, 'TabId:', activeTabId);
    }
    
    chatContainer.appendChild(messageWrapper);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Attach event listeners for action buttons
    setTimeout(() => {
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
        // Results copy button
        const resultsCopyBtn = aiMessage.querySelector(`[id^="results-copy-"]`);
        
        if (resultsCopyBtn && aiMessage.dataset.resultsData) {
            resultsCopyBtn.addEventListener('click', () => {
                const results = JSON.parse(aiMessage.dataset.resultsData);
                // Format as tab-separated values for easy pasting into spreadsheets
                if (results && results.length > 0) {
                    const keys = Object.keys(results[0]);
                    // Header row
                    let text = keys.join('\t') + '\n';
                    // Data rows
                    results.forEach(row => {
                        text += keys.map(key => {
                            const value = row[key];
                            // Handle null/undefined
                            if (value === null || value === undefined) return '';
                            // Convert to string and escape tabs/newlines
                            return String(value).replace(/\t/g, ' ').replace(/\n/g, ' ');
                        }).join('\t') + '\n';
                    });
                    copyToClipboard(text.trim(), 'Results');
                } else {
                    copyToClipboard('', 'Results');
                }
            });
        }
        
        // Add favorite and share buttons
        addActionButtonsToMessage(aiMessage, userQuery, activeTab);
    }, 200);

    // activeTab is guaranteed to exist here (we return early if it doesn't)
        activeTab.messages.push({
            role: 'user',
            content: userQuery
        });
        activeTab.messages.push({
            role: 'assistant',
            content: data
        });
        activeTab.chatHTML = chatContainer.innerHTML;

        if (data.stats && data.stats.provider) {
            activeTab.provider = data.stats.provider;
        }
        if (data.stats && data.stats.model) {
            activeTab.model = data.stats.model;
        }

        if (data.stats) {
            activeTab.stats = data.stats;
        }

        updateHeaderStatusFromTab(activeTab);

        updateClearContextVisibility();

    // Rename tab and create new "New Query" tab after first query
    const isNewQueryTab = activeTab.title === 'New Query' || activeTab.title.endsWith('...');
    const shouldRename = activeTab.queryCount === 1 && isNewQueryTab;
        
        Logger.log('[TAB RENAME] Checking rename conditions:', {
            tabId: activeTab.id,
            title: activeTab.title,
            queryCount: activeTab.queryCount,
            isNewQueryTab: isNewQueryTab,
            shouldRename: shouldRename
        });
        
        if (shouldRename) {
            Logger.log('[TAB RENAME] Starting tab rename process...');
            // Remove the hide flag before renaming
            delete activeTab._shouldHide;
            // Don't render tabs yet - wait for rename to complete
            generateAndUpdateTabTitle(activeTab.id, userQuery).then(() => {
                Logger.log('[TAB RENAME] Tab rename completed successfully');
                // After tab is renamed and new tab is created, render and ensure we're still on the renamed tab
                renderTabs();
                const renamedTab = tabs.find(t => t.id === activeTabId);
                if (renamedTab && renamedTab.title !== 'New Query') {
                    switchToTab(activeTabId);
                }
            }).catch((error) => {
                console.error('[TAB RENAME] Error in generateAndUpdateTabTitle promise:', error);
                // If rename fails, still render tabs
                renderTabs();
            });
        } else {
            Logger.log('[TAB RENAME] Skipping rename - conditions not met');
            // If not renaming, render tabs normally
            // Remove any hide flags
            tabs.forEach(t => delete t._shouldHide);
            renderTabs();
        }
        
        // Save tabs after all updates (messages, chatHTML, queryCount, etc.)
        saveTabsToStorage();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Create horizontal Tron HUD stats bar for query results
function createStatsBubble(data, tabId) {
    const activeTab = tabs.find(t => t.id === tabId);
    
    const statsBar = document.createElement('div');
    statsBar.className = 'query-stats-bar';
    
    // Provider
    const provider = data.stats?.provider || activeTab?.provider || 'N/A';
    
    // Model
    const model = data.stats?.model || activeTab?.model || 'N/A';
    
    // Time of Query
    const queryTime = new Date().toLocaleString();
    
    // Context Iteration (query count)
    // If context was reset and this is the first query, show "reset"
    // Otherwise show the query count (which will be 2, 3, etc. for continuations)
    let contextIteration;
    if (activeTab?.contextReset && activeTab?.queryCount === 1) {
        contextIteration = 'reset';
    } else {
        contextIteration = activeTab?.queryCount || 1;
    }
    
    // Tokens Used
    const tokensUsed = data.stats?.tokensUsed ? data.stats.tokensUsed.toLocaleString() : 'N/A';
    
    // Latency
    let latencyDisplay = 'N/A';
    if (data.stats?.latencyMs) {
        const latencyMs = data.stats.latencyMs;
        if (latencyMs >= 60000) {
            const minutes = (latencyMs / 60000).toFixed(2);
            latencyDisplay = `${minutes} min`;
        } else {
            const seconds = (latencyMs / 1000).toFixed(2);
            latencyDisplay = `${seconds} s`;
        }
    }
    
    // Estimated Cost
    let costEstimate = 'N/A';
    if (data.stats?.tokensUsed) {
        const currentProvider = currentProvidersData?.providers[currentProvidersData?.currentIndex];
        const cost = currentProvider 
            ? estimateQueryCost(data.stats.tokensUsed, currentProvider.name, currentProvider.selectedModel)
            : null;
        if (cost) {
            costEstimate = cost;
        }
    }
    
    // Build the stats bar HTML
    let statsContent = '';
    
    // Provider
    statsContent += `<div class="stat-item">
        <span class="stat-label">Provider</span>
        <span class="stat-value">${escapeHtml(provider)}</span>
    </div>`;
    
    // Model
    statsContent += `<div class="stat-item">
        <span class="stat-label">Model</span>
        <span class="stat-value">${escapeHtml(model)}</span>
    </div>`;
    
    // Time of Query (hidden on small screens)
    statsContent += `<div class="stat-item stat-item-time">
        <span class="stat-label">Time</span>
        <span class="stat-value">${escapeHtml(queryTime)}</span>
    </div>`;
    
    // Context Iteration (hidden on small screens)
    statsContent += `<div class="stat-item stat-item-iteration">
        <span class="stat-label">Iteration</span>
        <span class="stat-value">${contextIteration}</span>
    </div>`;
    
    // Tokens Used
    statsContent += `<div class="stat-item">
        <span class="stat-label">Tokens</span>
        <span class="stat-value">${tokensUsed}</span>
    </div>`;
    
    // Latency
    statsContent += `<div class="stat-item">
        <span class="stat-label">Latency</span>
        <span class="stat-value">${latencyDisplay}</span>
    </div>`;
    
    // Est. Cost
    statsContent += `<div class="stat-item">
        <span class="stat-label">Est. Cost</span>
        <span class="stat-value">${costEstimate}</span>
    </div>`;
    
    statsBar.innerHTML = statsContent;
    
    return statsBar;
}

// ============================================
// ENHANCEMENT FEATURES - FOUNDATION
// ============================================

// Toast Notification System
function showToast(message, type = 'info', duration = 3000) {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    toastContainer.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after duration
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Copy to Clipboard Function
async function copyToClipboard(text, label = 'Text') {
    try {
        await navigator.clipboard.writeText(text);
        showToast(`${label} copied to clipboard!`, 'success');
        return true;
    } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showToast(`${label} copied to clipboard!`, 'success');
            document.body.removeChild(textArea);
            return true;
        } catch (err) {
            document.body.removeChild(textArea);
            showToast(`Failed to copy ${label}`, 'error');
            return false;
        }
    }
}

// Export to CSV
function exportToCSV(data, filename = 'query-results') {
    if (!data || data.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const keys = Object.keys(data[0]);
    const csvContent = [
        keys.join(','),
        ...data.map(row => keys.map(key => {
            const value = row[key];
            // Escape commas and quotes in CSV
            if (value === null || value === undefined) return '';
            const stringValue = String(value).replace(/"/g, '""');
            return `"${stringValue}"`;
        }).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${Date.now()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Results exported to CSV', 'success');
}

// Export to JSON
function exportToJSON(data, filename = 'query-results') {
    const jsonContent = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}-${Date.now()}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Results exported to JSON', 'success');
}

// Export conversation as Markdown
function exportConversationAsMarkdown(tab) {
    if (!tab || !tab.messages || tab.messages.length === 0) {
        showToast('No conversation to export', 'error');
        return;
    }

    let markdown = `# ${tab.title || 'Query Conversation'}\n\n`;
    markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;
    if (tab.provider) markdown += `**Provider:** ${tab.provider}\n`;
    if (tab.model) markdown += `**Model:** ${tab.model}\n\n`;
    markdown += `---\n\n`;

    tab.messages.forEach((msg, index) => {
        if (msg.role === 'user') {
            markdown += `## Query ${Math.floor(index / 2) + 1}\n\n`;
            markdown += `**User:** ${msg.content}\n\n`;
        } else if (msg.role === 'assistant' && msg.content) {
            if (msg.content.sqlQuery) {
                markdown += `### SQL Query\n\n\`\`\`sql\n${msg.content.sqlQuery}\n\`\`\`\n\n`;
            }
            if (msg.content.explanation) {
                markdown += `### Explanation\n\n${msg.content.explanation}\n\n`;
            }
            if (msg.content.insights) {
                markdown += `### Insights\n\n${msg.content.insights}\n\n`;
            }
            if (msg.content.results && msg.content.results.length > 0) {
                markdown += `### Results (${msg.content.results.length} rows)\n\n`;
                // Add table in markdown format
                const keys = Object.keys(msg.content.results[0]);
                markdown += `| ${keys.join(' | ')} |\n`;
                markdown += `| ${keys.map(() => '---').join(' | ')} |\n`;
                msg.content.results.slice(0, 10).forEach(row => {
                    markdown += `| ${keys.map(k => String(row[k] || '')).join(' | ')} |\n`;
                });
                if (msg.content.results.length > 10) {
                    markdown += `\n*... and ${msg.content.results.length - 10} more rows*\n\n`;
                }
            }
            markdown += `---\n\n`;
        }
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${tab.title || 'conversation'}-${Date.now()}.md`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Conversation exported as Markdown', 'success');
}

// Query Templates
const QUERY_TEMPLATES = [
    {
        id: 1,
        category: "Sales Performance",
        title: "2024 Revenue Trends",
        description: "Analyze monthly revenue fluctuations for the most recent full year of data.",
        query: "Show me a breakdown of total revenue by month for the year 2024, ordered chronologically."
    },
    {
        id: 2,
        category: "Geo-Spatial",
        title: "Top US Markets",
        description: "Identify the top performing states based on order volume.",
        query: "Which top 5 US states generated the highest number of orders between Jan 1, 2022 and Dec 31, 2024?"
    },
    {
        id: 3,
        category: "Product Inventory",
        title: "Category Leaders",
        description: "Determine which product categories drive the most revenue.",
        query: "List the top 3 product categories by total sales revenue for Q4 of 2023."
    },
    {
        id: 4,
        category: "Customer Analysis",
        title: "New Customer Signups",
        description: "Track customer acquisition trends by month.",
        query: "Show me the number of new customer signups grouped by month for 2024, ordered by month."
    },
    {
        id: 5,
        category: "Customer Analysis",
        title: "Top Customers by Value",
        description: "Identify your most valuable customers based on total order value.",
        query: "Show me the top 10 customers by total order amount, including their name and total spent."
    },
    {
        id: 6,
        category: "Customer Analysis",
        title: "Customer Distribution by Region",
        description: "Understand where your customers are located geographically.",
        query: "How many customers do we have in each region? Show the count grouped by region."
    },
    {
        id: 7,
        category: "Product Analysis",
        title: "Product Price Analysis",
        description: "Analyze product pricing across different categories.",
        query: "What is the average price and price range for each product category?"
    },
    {
        id: 8,
        category: "Product Analysis",
        title: "Best Selling Products",
        description: "Identify which products have the highest sales volume.",
        query: "Show me the top 5 products by total quantity sold, including product name and total quantity."
    },
    {
        id: 9,
        category: "Order Analysis",
        title: "Average Order Value",
        description: "Calculate the average value of customer orders.",
        query: "What is the average order value across all orders?"
    },
    {
        id: 10,
        category: "Order Analysis",
        title: "Monthly Order Trends",
        description: "Track order volume trends over time.",
        query: "Show me the total number of orders grouped by month for 2024, ordered chronologically."
    },
    {
        id: 11,
        category: "Order Analysis",
        title: "Repeat Customers",
        description: "Identify customers who have placed multiple orders.",
        query: "Which customers have placed more than one order? Show customer name and order count."
    },
    {
        id: 12,
        category: "Cross-Table Analysis",
        title: "Region Revenue Analysis",
        description: "Analyze revenue performance by customer region.",
        query: "What is the total revenue generated from each customer region? Show region and total revenue."
    },
    {
        id: 13,
        category: "Cross-Table Analysis",
        title: "Customer-Product Combinations",
        description: "Understand which products are popular with which customers.",
        query: "Show me the top 10 customer-product combinations by quantity ordered, including customer name and product name."
    }
];


// Query Suggestions

// SQL Validation (for generated SQL)
function validateSQLSyntax(sql) {
    if (!sql || typeof sql !== 'string') return { valid: false, error: 'Invalid SQL' };
    
    const trimmed = sql.trim().toUpperCase();
    
    // Basic checks
    if (!trimmed.startsWith('SELECT')) {
        return { valid: false, error: 'Only SELECT queries are allowed' };
    }
    
    // Check for dangerous keywords (already done server-side, but client-side check too)
    const dangerous = ['DROP', 'DELETE', 'INSERT', 'UPDATE', 'ALTER', 'CREATE', 'TRUNCATE'];
    for (const keyword of dangerous) {
        if (trimmed.includes(keyword)) {
            return { valid: false, error: `Dangerous keyword detected: ${keyword}` };
        }
    }
    
    // Check for basic structure
    if (!trimmed.includes('FROM')) {
        return { valid: false, error: 'Missing FROM clause' };
    }
    
    return { valid: true };
}

// Query Validation (for natural language queries)
function validateQuery(query) {
    if (!query || typeof query !== 'string') {
        return { valid: false, error: 'Invalid query' };
    }
    
    const lower = query.toLowerCase();
    const warnings = [];
    
    // Check for potentially slow queries
    if (lower.includes('all') && (lower.includes('records') || lower.includes('rows') || lower.includes('data'))) {
        warnings.push('Query may return a large number of results. Consider adding filters.');
    }
    
    // Check for vague queries
    if (query.length < 10) {
        warnings.push('Query is very short. Be more specific for better results.');
    }
    
    // Check for SQL injection attempts (basic)
    const sqlKeywords = ['select', 'from', 'where', 'union', 'drop', 'delete', 'insert', 'update'];
    const hasSqlKeywords = sqlKeywords.some(keyword => lower.includes(keyword));
    if (hasSqlKeywords && !lower.includes('show me') && !lower.includes('what') && !lower.includes('how')) {
        warnings.push('Your query contains SQL keywords. SQL Query Buddy will generate SQL for you - just ask in plain English.');
    }
    
    return {
        valid: true,
        warning: warnings.length > 0 ? warnings.join(' ') : null
    };
}

// Cost Estimation (rough calculation)
function estimateQueryCost(tokensUsed, provider, model) {
    if (!tokensUsed || !provider) return null;
    
    // Rough estimates per million tokens (these are approximate)
    const costPerMillion = {
        'openai': {
            'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
            'gpt-4': { input: 30, output: 60 }
        },
        'cohere': {
            'command': { input: 1, output: 2 }
        },
        'ai21': {
            'j2-ultra': { input: 10, output: 10 }
        }
    };
    
    const providerCosts = costPerMillion[provider.toLowerCase()];
    if (!providerCosts) return null;
    
    const modelCosts = providerCosts[model] || providerCosts[Object.keys(providerCosts)[0]];
    if (!modelCosts) return null;
    
    // Assume 80% input, 20% output (rough estimate)
    const inputTokens = tokensUsed * 0.8;
    const outputTokens = tokensUsed * 0.2;
    
    const cost = (inputTokens / 1000000 * modelCosts.input) + (outputTokens / 1000000 * modelCosts.output);
    
    return cost < 0.001 ? '< $0.001' : `$${cost.toFixed(4)}`;
}

function parseMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        const dirty = marked.parse(text);
        return DOMPurify.sanitize(dirty);
    }
    return `<p>${escapeHtml(text)}</p>`;
}

// Helper function to detect date columns - used by multiple functions
function isDateColumn(columnName, value) {
    const name = columnName.toLowerCase();
    const valueStr = String(value || '').trim();
    
    // Check for date/time column names
    if (name.includes('year') ||
        name.includes('month') ||
        name.includes('day') ||
        name.includes('date') ||
        name.includes('quarter') ||
        name.includes('qtr') ||
        name.includes('week') ||
        name.includes('time') ||
        name.includes('period')) {
        return true;
    }
    
    // Check if value looks like a year (4-digit number between 1900-2100)
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && Number.isInteger(numValue)) {
        if (numValue >= 1900 && numValue <= 2100 && numValue.toString().length === 4) {
            return true;
        }
    }
    
    // Check for date patterns in values
    // YYYY-MM format (e.g., "2024-01", "2024-12")
    if (/^\d{4}-\d{1,2}$/.test(valueStr)) {
        return true;
    }
    
    // Month name patterns (e.g., "January", "Jan", "2024-01-01")
    if (/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)/i.test(valueStr)) {
        return true;
    }
    
    // Date formats (YYYY-MM-DD, MM/DD/YYYY, etc.)
    if (/^\d{4}-\d{2}-\d{2}$/.test(valueStr) || 
        /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(valueStr) ||
        /^\d{4}\/\d{2}\/\d{2}$/.test(valueStr)) {
        return true;
    }
    
    // Quarter patterns (Q1, Q2, Q3, Q4, Quarter 1, etc.)
    if (/^Q[1-4]|Quarter\s*[1-4]/i.test(valueStr)) {
        return true;
    }
    
    return false;
}

function generateResultsTable(results, page = 1, resultsId = '') {
    if (!results || results.length === 0) return '';

    const keys = Object.keys(results[0]);
    const totalRows = results.length;
    const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
    const startIdx = (page - 1) * ROWS_PER_PAGE;
    const endIdx = Math.min(startIdx + ROWS_PER_PAGE, totalRows);
    const pageResults = results.slice(startIdx, endIdx);

    let table = '<table class="results-table"><thead><tr>';

    keys.forEach(key => {
        table += `<th>${escapeHtml(key)}</th>`;
    });

    table += '</tr></thead><tbody>';

    const isCountColumn = (columnName, value) => {
        const name = columnName.toLowerCase();
        // Exclude date columns first
        if (isDateColumn(columnName, value)) return false;
        
        // Check column name patterns for count indicators
        if (name.includes('count') ||
            name.includes('number') ||
            name.includes('num') ||
            name.includes('quantity') ||
            name.includes('qty')) {
            return true;
        }
        
        // Check for patterns like "number_of_sales", "sales_count", "total_number", etc.
        if (name.includes('number_of') ||
            name.includes('_count') ||
            name.includes('count_') ||
            name.includes('num_') ||
            name.includes('_num')) {
            return true;
        }
        
        // If column is just "total" and value is an integer, likely a count
        if (name === 'total' || name === 'total_count') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue) && Number.isInteger(numValue) && numValue < 1000000) {
                return true;
            }
        }
        
        return false;
    };

    const isCurrencyColumn = (columnName, value) => {
        const name = columnName.toLowerCase();
        // Exclude if it's a date column (check this first!)
        if (isDateColumn(columnName, value)) return false;
        // Exclude if it's a count column
        if (isCountColumn(columnName, value)) return false;
        
        // If value is an integer and column name suggests count, don't treat as currency
        const numValue = parseFloat(value);
        if (!isNaN(numValue) && Number.isInteger(numValue)) {
            // If column name contains "number", "count", or "num", it's a count, not currency
            if (name.includes('number') || name.includes('count') || name.includes('num')) {
                return false;
            }
            // If column name is just "sales" or "total_sales" and value is integer, likely a count
            if ((name === 'sales' || name === 'total_sales') && numValue < 1000000) {
                return false;
            }
        }
        
        // Only treat as currency if column name clearly indicates money
        // "sales" alone is ambiguous - only treat as currency when combined with revenue/amount indicators
        return name.includes('revenue') ||
            (name.includes('sales') && (name.includes('revenue') || name.includes('amount') || name.includes('value') || name.includes('dollar'))) ||
            name.includes('total_amount') ||
            name.includes('total_revenue') ||
            (name.includes('total_sales') && !name.includes('count') && !name.includes('number') && (!Number.isInteger(numValue) || numValue >= 1000000)) ||
            name.includes('total_price') ||
            name.includes('total_cost') ||
            (name.includes('amount') && !name.includes('count')) ||
            name.includes('price') ||
            name.includes('cost') ||
            name.includes('subtotal') ||
            (name.includes('value') && !name.includes('count')) ||
            name.includes('dollar');
    };

    const formatCurrency = (value) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return value;
        return '$' + numValue.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    };

    const formatNumber = (value) => {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) return value;
        // If it's an integer, format without decimals
        if (Number.isInteger(numValue)) {
            return numValue.toLocaleString('en-US');
        }
        // Otherwise format with appropriate decimals
        return numValue.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    };

    pageResults.forEach(row => {
        table += '<tr>';
        keys.forEach(key => {
            let cellValue = row[key];
            const numValue = parseFloat(cellValue);

            // Only format if it's a number
            if (!isNaN(numValue)) {
                if (isDateColumn(key, cellValue)) {
                    // Date columns (year, month, etc.) - display as-is without formatting
                    cellValue = String(cellValue);
                } else if (isCountColumn(key, cellValue)) {
                    // Format counts as plain numbers (no currency, no decimals)
                    cellValue = formatNumber(cellValue);
                } else if (isCurrencyColumn(key, cellValue)) {
                    // Format currency values
                cellValue = formatCurrency(cellValue);
                } else {
                    // Format other numbers nicely (with commas, appropriate decimals)
                    cellValue = formatNumber(cellValue);
                }
            }

            table += `<td>${escapeHtml(String(cellValue))}</td>`;
        });
        table += '</tr>';
    });

    table += '</tbody></table>';
    
    // Add pagination controls if needed
    if (totalPages > 1) {
        const paginationId = `pagination-${resultsId}`;
        const prevId = `pagination-prev-${resultsId}`;
        const nextId = `pagination-next-${resultsId}`;
        table += `<div class="pagination-controls" id="${paginationId}">
            <button id="${prevId}" class="pagination-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''}>Previous</button>
            <span>Page ${page} of ${totalPages} (${totalRows} total rows)</span>
            <button id="${nextId}" class="pagination-btn" data-page="${page + 1}" ${page === totalPages ? 'disabled' : ''}>Next</button>
        </div>`;
    }
    
    return table;
}

// Pagination helper
function changeResultsPage(resultsId, newPage, totalPages) {
    if (newPage < 1 || newPage > totalPages) return;
    const messageElement = document.getElementById(resultsId)?.closest('.chat-message');
    if (messageElement && messageElement.dataset.resultsData) {
        const results = JSON.parse(messageElement.dataset.resultsData);
        const container = document.getElementById(resultsId);
        if (container) {
            container.innerHTML = generateResultsTable(results, newPage, resultsId);
            // Re-attach pagination event listeners
            setTimeout(() => {
                attachPaginationListeners(resultsId, results, totalPages);
            }, 50);
        }
    }
}

// Attach pagination event listeners
function attachPaginationListeners(resultsId, results, totalPages) {
    const prevBtn = document.getElementById(`pagination-prev-${resultsId}`);
    const nextBtn = document.getElementById(`pagination-next-${resultsId}`);
    
    if (prevBtn) {
        prevBtn.onclick = () => {
            const currentPage = parseInt(prevBtn.dataset.page) + 1;
            changeResultsPage(resultsId, currentPage - 1, totalPages);
        };
    }
    
    if (nextBtn) {
        nextBtn.onclick = () => {
            const currentPage = parseInt(nextBtn.dataset.page) - 1;
            changeResultsPage(resultsId, currentPage + 1, totalPages);
        };
    }
}

// Add action buttons to message
function addActionButtonsToMessage(messageElement, userQuery, tab) {
    if (!messageElement || !userQuery) return;
    
    const actionBar = document.createElement('div');
    actionBar.className = 'message-actions';
    actionBar.innerHTML = `
        <button class="action-btn export-conversation-btn" data-tab-id="${tab?.id || ''}" title="Export Conversation">
            <i data-feather="download"></i> Export
        </button>
    `;
    
    messageElement.appendChild(actionBar);
    
    // Attach event listeners
    setTimeout(() => {
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
        
        const exportBtn = actionBar.querySelector('.export-conversation-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const tabId = exportBtn.dataset.tabId;
                const tab = tabs.find(t => t.id === tabId);
                if (tab) {
                    exportConversationAsMarkdown(tab);
                }
            });
        }
    }, 100);
}

// Extract chart data from insights text when results aren't suitable for charting
function generateChartFromInsights(insights) {
    if (!insights || typeof Chart === 'undefined') {
        return null;
    }
    
    try {
        // Parse insights to extract numeric data and categories
        const insightsText = typeof insights === 'string' ? insights : JSON.stringify(insights);
        
        // Extract percentage values with labels: "23% growth", "California shows 23%"
        const percentagePattern = /([A-Za-z\s]+?)\s+(\d+(?:\.\d+)?)%/gi;
        // Extract currency values: "$2.4M", "$1,234"
        const currencyPattern = /\$([\d,]+(?:\.\d+)?[KMB]?)/gi;
        // Extract time series data: "Q1: $X, Q2: $Y", "January: $X"
        const timeSeriesPattern = /(Q[1-4]|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s*:?\s*\$?([\d,]+(?:\.\d+)?[KMB]?)/gi;
        
        const labels = [];
        const data = [];
        
        // Try time series pattern first (most structured)
        let match;
        const timeSeriesMatches = [];
        while ((match = timeSeriesPattern.exec(insightsText)) !== null && timeSeriesMatches.length < 20) {
            const label = match[1];
            let value = match[2].replace(/,/g, '');
            // Convert K, M, B to numbers
            if (value.endsWith('K')) {
                value = parseFloat(value) * 1000;
            } else if (value.endsWith('M')) {
                value = parseFloat(value) * 1000000;
            } else if (value.endsWith('B')) {
                value = parseFloat(value) * 1000000000;
            } else {
                value = parseFloat(value);
            }
            if (!isNaN(value)) {
                timeSeriesMatches.push({ label, value });
            }
        }
        
        if (timeSeriesMatches.length >= 2) {
            timeSeriesMatches.forEach(item => {
                labels.push(item.label);
                data.push(item.value);
            });
        } else {
            // Try percentage pattern
            const percentageMatches = [];
            while ((match = percentagePattern.exec(insightsText)) !== null && percentageMatches.length < 10) {
                const label = match[1].trim();
                const value = parseFloat(match[2]);
                if (!isNaN(value) && label.length > 0 && label.length < 50) {
                    percentageMatches.push({ label, value });
                }
            }
            
            if (percentageMatches.length >= 2) {
                percentageMatches.forEach(item => {
                    labels.push(item.label);
                    data.push(item.value);
                });
            } else {
                // Try currency pattern
                const currencyMatches = [];
                let currencyIndex = 0;
                const currencyLabels = ['Value 1', 'Value 2', 'Value 3', 'Value 4', 'Value 5'];
                while ((match = currencyPattern.exec(insightsText)) !== null && currencyMatches.length < 10) {
                    let value = match[1].replace(/,/g, '');
                    if (value.endsWith('K')) {
                        value = parseFloat(value) * 1000;
                    } else if (value.endsWith('M')) {
                        value = parseFloat(value) * 1000000;
                    } else if (value.endsWith('B')) {
                        value = parseFloat(value) * 1000000000;
                    } else {
                        value = parseFloat(value);
                    }
                    if (!isNaN(value)) {
                        currencyMatches.push({ 
                            label: currencyLabels[currencyIndex] || `Value ${currencyIndex + 1}`, 
                            value 
                        });
                        currencyIndex++;
                    }
                }
                
                if (currencyMatches.length >= 2) {
                    currencyMatches.forEach(item => {
                        labels.push(item.label);
                        data.push(item.value);
                    });
                }
            }
        }
        
        // Need at least 2 data points to create a chart
        if (labels.length < 2 || data.length < 2) {
            return null;
        }
        
        // Create chart HTML
        const chartId = 'chart-insights-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        const chartType = labels.length <= 10 ? 'bar' : 'line';
        const isDark = document.body.classList.contains('dark-mode');
        
        const chartHTML = `
            <div class="chart-container">
                <div class="chart-controls">
                    <label for="chart-type-${chartId}">Chart Type:</label>
                    <select id="chart-type-${chartId}" class="chart-type-select">
                        <option value="bar" ${chartType === 'bar' ? 'selected' : ''}>Bar</option>
                        <option value="line" ${chartType === 'line' ? 'selected' : ''}>Line</option>
                        <option value="pie">Pie</option>
                    </select>
                    <button class="chart-download-btn" data-chart-id="${chartId}" title="Download Chart">
                        <i data-feather="download"></i> Download
                    </button>
                </div>
                <canvas id="${chartId}"></canvas>
            </div>
        `;
        
        // Initialize chart after HTML is inserted
        requestAnimationFrame(() => {
            setTimeout(() => {
                const canvas = document.getElementById(chartId);
                if (canvas) {
                    try {
                        const ctx = canvas.getContext('2d');
                        const chart = new Chart(ctx, {
                            type: chartType,
                            data: {
                                labels: labels.slice(0, 20),
                                datasets: [{
                                    label: 'Insights Data',
                                    data: data.slice(0, 20),
                                    backgroundColor: isDark ? 'rgba(93, 173, 226, 0.6)' : 'rgba(0, 123, 255, 0.6)',
                                    borderColor: isDark ? 'rgba(93, 173, 226, 1)' : 'rgba(0, 123, 255, 1)',
                                    borderWidth: 2
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: {
                                        display: true,
                                        labels: {
                                            color: '#e2e8f0' // Always light text for dark background
                                        }
                                    }
                                },
                                scales: chartType === 'pie' ? {} : {
                                    y: {
                                        beginAtZero: true,
                                        ticks: { color: '#e2e8f0' }, // Always light text for dark background
                                        grid: { color: 'rgba(226, 232, 240, 0.1)' } // Light grid lines
                                    },
                                    x: {
                                        ticks: { color: '#e2e8f0' }, // Always light text for dark background
                                        grid: { color: 'rgba(226, 232, 240, 0.1)' } // Light grid lines
                                    }
                                }
                            }
                        });
                        
                        // Store chart instance
                        if (!window.chartInstances) window.chartInstances = {};
                        window.chartInstances[chartId] = chart;
                        
                        // Add event listeners for chart controls
                        setTimeout(() => {
                            const typeSelect = document.getElementById(`chart-type-${chartId}`);
                            const downloadBtn = document.querySelector(`[data-chart-id="${chartId}"]`);
                            
                            if (typeSelect) {
                                typeSelect.addEventListener('change', (e) => {
                                    const newType = e.target.value;
                                    chart.config.type = newType;
                                    if (newType === 'pie') {
                                        chart.options.scales = {};
                                    } else {
                                        chart.options.scales = {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { color: '#e2e8f0' }, // Always light text for dark background
                                                grid: { color: 'rgba(226, 232, 240, 0.1)' } // Light grid lines
                                            },
                                            x: {
                                                ticks: { color: '#e2e8f0' }, // Always light text for dark background
                                                grid: { color: 'rgba(226, 232, 240, 0.1)' } // Light grid lines
                                            }
                                        };
                                    }
                                    chart.update();
                                    if (typeof feather !== 'undefined') feather.replace();
                                });
                            }
                            
                            if (downloadBtn) {
                                downloadBtn.addEventListener('click', () => {
                                    const url = canvas.toDataURL('image/png');
                                    const link = document.createElement('a');
                                    link.download = `chart-${chartId}-${Date.now()}.png`;
                                    link.href = url;
                                    link.click();
                                    showToast('Chart downloaded', 'success');
                                });
                            }
                            
                            if (typeof feather !== 'undefined') feather.replace();
                        }, 200);
                    } catch (chartError) {
                        // Chart creation error - handled gracefully
                    }
                }
            }, 100);
        });
        
        return chartHTML;
    } catch (error) {
        return null;
    }
}

// Generate Chart.js visualization from query results
function generateChart(results) {
    if (!results || results.length === 0 || typeof Chart === 'undefined') {
        return null;
    }

    try {
        // Get column names
        const keys = Object.keys(results[0]);
        if (keys.length < 2) {
            return null; // Need at least 2 columns for a chart
        }

        // Try to identify numeric and categorical columns
        // Exclude date/year columns from numeric columns (they should be labels only)
        const numericColumns = [];
        const categoricalColumns = [];
        const dateColumns = [];

        keys.forEach(key => {
            const sampleValue = results[0][key];
            // Check if this is a date column first
            if (isDateColumn(key, sampleValue)) {
                dateColumns.push(key);
                categoricalColumns.push(key); // Date columns are categorical (labels)
            } else {
                const numValue = parseFloat(sampleValue);
                if (!isNaN(numValue) && isFinite(numValue)) {
                    numericColumns.push(key);
                } else {
                    categoricalColumns.push(key);
                }
            }
        });

        // Determine chart type and data
        let chartType = 'bar';
        let labels = [];
        let datasets = [];
        let chartId = 'chart-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);

        // PRIORITY: If we have date/time columns, ALWAYS create a chart (chronological data)
        // Check for chronological patterns: month, year, date, time, quarter, etc.
        const hasChronologicalData = dateColumns.length > 0 || 
            keys.some(k => {
                const lowerKey = k.toLowerCase();
                return lowerKey.includes('month') || 
                       lowerKey.includes('year') || 
                       lowerKey.includes('date') || 
                       lowerKey.includes('time') ||
                       lowerKey.includes('quarter') ||
                       lowerKey.includes('week') ||
                       /^\d{4}-\d{2}$/.test(String(results[0][k])) || // YYYY-MM format
                       /^\d{4}$/.test(String(results[0][k])) || // YYYY format
                       /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(String(results[0][k])); // Month names
            });

        // If we have one categorical and one numeric column, create a simple chart
        // Prefer date columns for labels, but exclude date columns from data columns
        if (categoricalColumns.length >= 1 && numericColumns.length >= 1) {
            // Prefer date columns for labels if available
            let labelColumn = null;
            if (dateColumns.length > 0) {
                labelColumn = dateColumns[0];
            } else if (hasChronologicalData) {
                // Find the chronological column
                labelColumn = keys.find(k => {
                    const lowerKey = k.toLowerCase();
                    const value = String(results[0][k]);
                    return lowerKey.includes('month') || 
                           lowerKey.includes('year') || 
                           lowerKey.includes('date') || 
                           lowerKey.includes('time') ||
                           lowerKey.includes('quarter') ||
                           /^\d{4}-\d{2}$/.test(value) ||
                           /^\d{4}$/.test(value) ||
                           /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(value);
                }) || (categoricalColumns.length > 0 ? categoricalColumns[0] : keys[0]);
            } else {
                labelColumn = categoricalColumns[0];
            }
            
            // Use first numeric column that is NOT a date column
            const validNumericColumns = numericColumns.filter(col => !isDateColumn(col, results[0][col]));
            
            // For chronological data, be more lenient - try to find ANY numeric value
            let dataColumn = null;
            if (validNumericColumns.length === 0 && hasChronologicalData) {
                // If we have chronological data but no "valid" numeric columns,
                // check if any column has numeric values (even if column name suggests date)
                const allNumericCols = keys.filter(k => {
                    const val = results[0][k];
                    const numVal = parseFloat(val);
                    // Exclude years (4-digit numbers 1900-2100) but allow other numbers
                    if (!isNaN(numVal) && isFinite(numVal)) {
                        if (Number.isInteger(numVal) && numVal >= 1900 && numVal <= 2100 && String(numVal).length === 4) {
                            return false; // Skip years
                        }
                        return true;
                    }
                    return false;
                });
                
                if (allNumericCols.length > 0) {
                    dataColumn = allNumericCols[0];
                    Logger.log('📊 Using numeric column for chronological chart:', dataColumn);
                } else {
                    Logger.warn('⚠️ Chronological data detected but no numeric values found');
                    return null;
                }
            } else if (validNumericColumns.length === 0) {
                return null; // No valid numeric columns to chart
            } else {
                dataColumn = validNumericColumns[0];
            }

            labels = results.map(row => String(row[labelColumn])).slice(0, 50); // Increased limit for chronological data
            const data = results.map(row => {
                const val = parseFloat(row[dataColumn]);
                return isNaN(val) ? 0 : val;
            }).slice(0, 50);

            // Determine best chart type based on data
            // For chronological data, ALWAYS use line charts
            if (hasChronologicalData) {
                chartType = 'line'; // Line charts are better for time series
            } else if (results.length <= 10) {
                chartType = 'bar';
            } else if (results.length > 10 && numericColumns.length === 1) {
                chartType = 'line';
            }

            const isDark = document.body.classList.contains('dark-mode');
            datasets = [{
                label: dataColumn,
                data: data,
                backgroundColor: isDark ? 'rgba(93, 173, 226, 0.6)' : 'rgba(0, 123, 255, 0.6)',
                borderColor: isDark ? 'rgba(93, 173, 226, 1)' : 'rgba(0, 123, 255, 1)',
                borderWidth: 2
            }];
        } else if (numericColumns.length >= 2) {
            // Multiple numeric columns - use first categorical/date column as labels, numeric columns as datasets
            // Prefer date columns for labels if available
            let labelColumn = null;
            if (dateColumns.length > 0) {
                labelColumn = dateColumns[0];
            } else if (hasChronologicalData) {
                // Find the chronological column
                labelColumn = keys.find(k => {
                    const lowerKey = k.toLowerCase();
                    const value = String(results[0][k]);
                    return lowerKey.includes('month') || 
                           lowerKey.includes('year') || 
                           lowerKey.includes('date') || 
                           lowerKey.includes('time') ||
                           lowerKey.includes('quarter') ||
                           /^\d{4}-\d{2}$/.test(value) ||
                           /^\d{4}$/.test(value) ||
                           /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(value);
                }) || (categoricalColumns.length > 0 ? categoricalColumns[0] : keys[0]);
            } else if (categoricalColumns.length > 0) {
                labelColumn = categoricalColumns[0];
            } else {
                // Fallback: use first column as label
                labelColumn = keys[0];
            }
            
            labels = results.map(row => String(row[labelColumn])).slice(0, 50); // Increased for chronological
            
            const isDarkMode = document.body.classList.contains('dark-mode');
            // For chronological data, ALWAYS use line chart
            if (hasChronologicalData) {
                chartType = 'line';
            }
            
            // Only use numeric columns that are NOT date columns for datasets
            const validNumericForMulti = numericColumns.filter(col => !isDateColumn(col, results[0][col]));
            if (validNumericForMulti.length === 0 && hasChronologicalData) {
                // For chronological data, be more lenient
                validNumericForMulti.push(...numericColumns.filter(col => {
                    const val = results[0][col];
                    const numVal = parseFloat(val);
                    if (!isNaN(numVal) && isFinite(numVal)) {
                        // Exclude years but allow other numbers
                        if (Number.isInteger(numVal) && numVal >= 1900 && numVal <= 2100 && String(numVal).length === 4) {
                            return false;
                        }
                        return true;
                    }
                    return false;
                }));
            }
            
            validNumericForMulti.slice(0, 3).forEach((col, idx) => {
                const data = results.map(row => {
                    const val = parseFloat(row[col]);
                    return isNaN(val) ? 0 : val;
                }).slice(0, 50);
                
                const colors = isDarkMode 
                    ? ['rgba(93, 173, 226, 0.6)', 'rgba(46, 204, 113, 0.6)', 'rgba(241, 196, 15, 0.6)']
                    : ['rgba(0, 123, 255, 0.6)', 'rgba(40, 167, 69, 0.6)', 'rgba(255, 193, 7, 0.6)'];
                
                datasets.push({
                    label: col,
                    data: data,
                    backgroundColor: colors[idx % colors.length],
                    borderColor: colors[idx % colors.length].replace('0.6', '1'),
                    borderWidth: 2
                });
            });
            
            // If no valid datasets after filtering, return null
            if (datasets.length === 0) {
                return null;
            }
        } else {
            return null; // Not suitable for charting
        }

        // Create chart HTML with controls
        const chartHTML = `
            <div class="chart-container">
                <div class="chart-controls">
                    <label for="chart-type-${chartId}">Chart Type:</label>
                    <select id="chart-type-${chartId}" class="chart-type-select">
                        <option value="bar" ${chartType === 'bar' ? 'selected' : ''}>Bar</option>
                        <option value="line" ${chartType === 'line' ? 'selected' : ''}>Line</option>
                        <option value="pie">Pie</option>
                    </select>
                    <button class="chart-download-btn" data-chart-id="${chartId}" title="Download Chart">
                        <i data-feather="download"></i> Download
                    </button>
                </div>
                <canvas id="${chartId}"></canvas>
            </div>
        `;

        // Render chart after DOM update - use requestAnimationFrame for better timing
        requestAnimationFrame(() => {
            setTimeout(() => {
                const canvas = document.getElementById(chartId);
                if (canvas) {
                    const isDark = document.body.classList.contains('dark-mode');
                    const ctx = canvas.getContext('2d');
                    try {
                        const chart = new Chart(ctx, {
                            type: chartType,
                            data: {
                                labels: labels,
                                datasets: datasets
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                aspectRatio: 2,
                                plugins: {
                                    legend: {
                                        display: true,
                                        position: 'top',
                                        labels: {
                                            color: '#e2e8f0', // Always light text for dark background
                                            boxWidth: 12,
                                            padding: 8,
                                            font: {
                                                size: 12
                                            }
                                        }
                                    },
                                    title: {
                                        display: true,
                                        text: 'Data Visualization',
                                        color: '#e2e8f0', // Always light text for dark background
                                        font: {
                                            size: 14
                                        },
                                        padding: {
                                            top: 10,
                                            bottom: 15
                                        }
                                    }
                                },
                                scales: chartType !== 'pie' ? {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            color: '#e2e8f0' // Always light text for dark background
                                        },
                                        grid: {
                                            color: 'rgba(226, 232, 240, 0.1)' // Light grid lines
                                        }
                                    },
                                    x: {
                                        ticks: {
                                            color: '#e2e8f0' // Always light text for dark background
                                        },
                                        grid: {
                                            color: 'rgba(226, 232, 240, 0.1)' // Light grid lines
                                        }
                                    }
                                } : {}
                            }
                        });
                        
                        // Store chart instance
                        if (!window.chartInstances) window.chartInstances = {};
                        window.chartInstances[chartId] = chart;
                        
                        // Add event listeners for chart controls
                        setTimeout(() => {
                            const typeSelect = document.getElementById(`chart-type-${chartId}`);
                            const downloadBtn = document.querySelector(`[data-chart-id="${chartId}"]`);
                            
                            if (typeSelect) {
                                typeSelect.addEventListener('change', (e) => {
                                    const newType = e.target.value;
                                    chart.config.type = newType;
                                    if (newType === 'pie') {
                                        chart.options.scales = {};
                                    } else {
                                        chart.options.scales = {
                                            y: {
                                                beginAtZero: true,
                                                ticks: { color: '#e2e8f0' }, // Always light text for dark background
                                                grid: { color: 'rgba(226, 232, 240, 0.1)' } // Light grid lines
                                            },
                                            x: {
                                                ticks: { color: '#e2e8f0' }, // Always light text for dark background
                                                grid: { color: 'rgba(226, 232, 240, 0.1)' } // Light grid lines
                                            }
                                        };
                                    }
                                    chart.update();
                                    if (typeof feather !== 'undefined') feather.replace();
                                });
                            }
                            
                            if (downloadBtn) {
                                downloadBtn.addEventListener('click', () => {
                                    const url = canvas.toDataURL('image/png');
                                    const link = document.createElement('a');
                                    link.download = `chart-${chartId}-${Date.now()}.png`;
                                    link.href = url;
                                    link.click();
                                    showToast('Chart downloaded', 'success');
                                });
                            }
                            
                            if (typeof feather !== 'undefined') feather.replace();
                        }, 200);
                    } catch (chartError) {
                        // Chart creation error - handled gracefully
                    }
                } else {
                    Logger.warn('Chart canvas not found:', chartId);
                }
            }, 100);
        });

        return chartHTML;
    } catch (error) {
        // Chart generation error - handled gracefully
        return null;
    }
}

// Generate Map from Results (if geographic data detected)
function generateMap(results) {
    if (!results || !Array.isArray(results) || results.length === 0) {
        return null;
    }

    // Check if results contain geographic data (state/region columns)
    const firstRow = results[0];
    if (!firstRow || typeof firstRow !== 'object') {
        return null;
    }

    const keys = Object.keys(firstRow);
    
    // Check for specific column names: "State", "Province", or "region" (case-insensitive)
    const stateColumnKey = keys.find(k => {
        const lowerKey = k.toLowerCase();
        return lowerKey === 'state' || 
               lowerKey === 'province' || 
               lowerKey === 'region';
    });

    if (!stateColumnKey) {
        return null; // No matching geographic column found
    }

    // Check if there are more than 1 distinct states
    const distinctStates = new Set();
    results.forEach(row => {
        const stateValue = row[stateColumnKey];
        if (stateValue !== null && stateValue !== undefined && stateValue !== '') {
            distinctStates.add(String(stateValue).trim());
        }
    });

    if (distinctStates.size <= 1) {
        return null; // Need more than 1 distinct state to show a map
    }

    // Check for numeric column for mapping values
    const hasNumericColumn = keys.some(k => {
        if (k === stateColumnKey) return false; // Skip the state column itself
        const val = firstRow[k];
        return typeof val === 'number' || (!isNaN(parseFloat(val)) && isFinite(val));
    });

    // Only generate map if we have both state/region and numeric data
    if (!hasNumericColumn) {
        return null;
    }

    // Use SimpleUSMap (no React dependencies needed)
    if (!window.SimpleUSMap) {
        Logger.warn('SimpleUSMap not available');
        return null;
    }
    
    Logger.log('🗺️ Generating map for geographic data:', {
        stateColumn: stateColumnKey,
        distinctStates: distinctStates.size,
        hasNumericColumn: hasNumericColumn
    });

    const mapId = `map-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Create map container HTML - Glass Card style
    const mapHTML = `
        <div class="map-container" id="${mapId}">
            <h3>🗺️ Geographic Visualization</h3>
        </div>
    `;

    // Store the state column key for the map component to use
    const mapData = {
        results: results,
        stateColumnKey: stateColumnKey
    };

    // Render map using SimpleUSMap (no React needed)
    setTimeout(() => {
        if (window.SimpleUSMap && window.SimpleUSMap.render) {
            try {
                Logger.log('🗺️ Rendering map with SimpleUSMap...', { mapId, dataSize: results.length });
                window.SimpleUSMap.render(mapId, mapData);
                Logger.log('✅ Map rendered successfully');
            } catch (error) {
                console.error('❌ Error rendering map:', error);
                const mapContainer = document.getElementById(mapId);
                if (mapContainer) {
                    mapContainer.innerHTML = `
                        <h3>🗺️ Geographic Data Detected</h3>
                        <p style="color: #dc3545; padding: 20px; text-align: center;">
                            Error rendering map: ${error.message}<br>
                            <small>Found ${distinctStates.size} states with geographic data. Check browser console for details.</small>
                        </p>
                    `;
                }
            }
        } else {
            Logger.warn('⚠️ SimpleUSMap not available');
            const mapContainer = document.getElementById(mapId);
            if (mapContainer) {
                mapContainer.innerHTML = `
                    <h3>🗺️ Geographic Data Detected</h3>
                    <p style="color: #94a3b8; padding: 20px; text-align: center;">
                        Map visualization is currently unavailable.<br>
                        <small>Found ${distinctStates.size} states: ${Array.from(distinctStates).slice(0, 5).join(', ')}${distinctStates.size > 5 ? '...' : ''}</small>
                    </p>
                `;
            }
        }
    }, 100);

    return mapHTML;
}

// Generate Statistical Summary Dashboard
function generateStatisticalSummary(results) {
    if (!results || results.length === 0) {
        return null;
    }

    try {
        const keys = Object.keys(results[0]);
        const numericColumns = [];

        // Identify numeric columns (exclude date columns)
        keys.forEach(key => {
            const sampleValue = results[0][key];
            if (!isDateColumn(key, sampleValue)) {
                const numValue = parseFloat(sampleValue);
                if (!isNaN(numValue) && isFinite(numValue)) {
                    numericColumns.push(key);
                }
            }
        });

        if (numericColumns.length === 0) {
            return null; // No numeric columns to analyze
        }

        let summaryHTML = '<div class="analysis-section statistical-summary">';
        summaryHTML += '<h3>📊 Statistical Summary</h3>';
        summaryHTML += '<div class="stats-grid">';

        numericColumns.forEach(column => {
            const values = results
                .map(row => parseFloat(row[column]))
                .filter(val => !isNaN(val) && isFinite(val))
                .sort((a, b) => a - b);

            if (values.length === 0) return;

            const mean = values.reduce((a, b) => a + b, 0) / values.length;
            const median = values.length % 2 === 0
                ? (values[values.length / 2 - 1] + values[values.length / 2]) / 2
                : values[Math.floor(values.length / 2)];
            
            const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
            const stdDev = Math.sqrt(variance);
            
            const min = values[0];
            const max = values[values.length - 1];
            const range = max - min;
            
            const q1Index = Math.floor(values.length * 0.25);
            const q3Index = Math.floor(values.length * 0.75);
            const q1 = values[q1Index];
            const q3 = values[q3Index];
            const iqr = q3 - q1;

            // Calculate mode (most frequent value, rounded to 2 decimals)
            const roundedValues = values.map(v => Math.round(v * 100) / 100);
            const frequency = {};
            roundedValues.forEach(v => {
                frequency[v] = (frequency[v] || 0) + 1;
            });
            const mode = Object.keys(frequency).reduce((a, b) => 
                frequency[a] > frequency[b] ? a : b
            );

            const formatValue = (val) => {
                if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2) + 'M';
                if (Math.abs(val) >= 1000) return (val / 1000).toFixed(2) + 'K';
                return val.toFixed(2);
            };

            summaryHTML += `<div class="stat-card">
                <h4>${escapeHtml(column)}</h4>
                <div class="stat-row">
                    <span class="stat-label">Count:</span>
                    <span class="stat-value">${values.length}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Mean:</span>
                    <span class="stat-value">${formatValue(mean)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Median:</span>
                    <span class="stat-value">${formatValue(median)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Mode:</span>
                    <span class="stat-value">${formatValue(parseFloat(mode))}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Std Dev:</span>
                    <span class="stat-value">${formatValue(stdDev)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Min:</span>
                    <span class="stat-value">${formatValue(min)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Max:</span>
                    <span class="stat-value">${formatValue(max)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Range:</span>
                    <span class="stat-value">${formatValue(range)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Q1:</span>
                    <span class="stat-value">${formatValue(q1)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Q3:</span>
                    <span class="stat-value">${formatValue(q3)}</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">IQR:</span>
                    <span class="stat-value">${formatValue(iqr)}</span>
                </div>
            </div>`;
        });

        summaryHTML += '</div></div>';
        return summaryHTML;
    } catch (error) {
        console.error('Error generating statistical summary:', error);
        return null;
    }
}

// Generate Correlation Matrix
function generateCorrelationMatrix(results) {
    if (!results || results.length < 2) {
        return null;
    }

    try {
        const keys = Object.keys(results[0]);
        const numericColumns = [];

        // Identify numeric columns (exclude date columns)
        keys.forEach(key => {
            const sampleValue = results[0][key];
            if (!isDateColumn(key, sampleValue)) {
                const numValue = parseFloat(sampleValue);
                if (!isNaN(numValue) && isFinite(numValue)) {
                    numericColumns.push(key);
                }
            }
        });

        // Need at least 2 numeric columns for correlation
        if (numericColumns.length < 2) {
            return null;
        }

        // Calculate correlation matrix
        const correlations = {};
        for (let i = 0; i < numericColumns.length; i++) {
            for (let j = i; j < numericColumns.length; j++) {
                const col1 = numericColumns[i];
                const col2 = numericColumns[j];
                
                const values1 = results.map(row => parseFloat(row[col1])).filter(v => !isNaN(v) && isFinite(v));
                const values2 = results.map(row => parseFloat(row[col2])).filter(v => !isNaN(v) && isFinite(v));
                
                // Ensure same length
                const minLength = Math.min(values1.length, values2.length);
                const v1 = values1.slice(0, minLength);
                const v2 = values2.slice(0, minLength);
                
                if (v1.length < 2) continue;
                
                const mean1 = v1.reduce((a, b) => a + b, 0) / v1.length;
                const mean2 = v2.reduce((a, b) => a + b, 0) / v2.length;
                
                let numerator = 0;
                let sumSq1 = 0;
                let sumSq2 = 0;
                
                for (let k = 0; k < v1.length; k++) {
                    const diff1 = v1[k] - mean1;
                    const diff2 = v2[k] - mean2;
                    numerator += diff1 * diff2;
                    sumSq1 += diff1 * diff1;
                    sumSq2 += diff2 * diff2;
                }
                
                const denominator = Math.sqrt(sumSq1 * sumSq2);
                const correlation = denominator === 0 ? 0 : numerator / denominator;
                
                if (!correlations[col1]) correlations[col1] = {};
                if (!correlations[col2]) correlations[col2] = {};
                correlations[col1][col2] = correlation;
                correlations[col2][col1] = correlation;
            }
        }

        // Generate HTML
        let matrixHTML = '<div class="analysis-section correlation-matrix">';
        matrixHTML += '<h3>🔗 Correlation Matrix</h3>';
        matrixHTML += '<div class="correlation-table-wrapper">';
        matrixHTML += '<table class="correlation-table">';
        
        // Header row
        matrixHTML += '<thead><tr><th></th>';
        numericColumns.forEach(col => {
            matrixHTML += `<th>${escapeHtml(col)}</th>`;
        });
        matrixHTML += '</tr></thead><tbody>';
        
        // Data rows
        numericColumns.forEach(col1 => {
            matrixHTML += '<tr>';
            matrixHTML += `<th>${escapeHtml(col1)}</th>`;
            numericColumns.forEach(col2 => {
                const corr = correlations[col1] && correlations[col1][col2] !== undefined
                    ? correlations[col1][col2]
                    : (col1 === col2 ? 1 : 0);
                const corrValue = corr.toFixed(3);
                const absCorr = Math.abs(corr);
                
                // Color coding: strong (|r| > 0.7), moderate (0.3-0.7), weak (< 0.3)
                let intensity = 'weak';
                if (absCorr > 0.7) intensity = 'strong';
                else if (absCorr > 0.3) intensity = 'moderate';
                
                const sign = corr >= 0 ? 'positive' : 'negative';
                matrixHTML += `<td class="corr-cell ${intensity} ${sign}" title="${col1} vs ${col2}: ${corrValue}">
                    ${corrValue}
                </td>`;
            });
            matrixHTML += '</tr>';
        });
        
        matrixHTML += '</tbody></table></div>';
        matrixHTML += '<div class="correlation-legend">';
        matrixHTML += '<span class="legend-item"><span class="legend-color strong positive"></span> Strong (|r| > 0.7)</span>';
        matrixHTML += '<span class="legend-item"><span class="legend-color moderate positive"></span> Moderate (0.3-0.7)</span>';
        matrixHTML += '<span class="legend-item"><span class="legend-color weak positive"></span> Weak (< 0.3)</span>';
        matrixHTML += '</div></div>';
        
        return matrixHTML;
    } catch (error) {
        console.error('Error generating correlation matrix:', error);
        return null;
    }
}

// Generate Trend Analysis with Growth Rates
function generateTrendAnalysis(results) {
    if (!results || results.length < 2) {
        return null;
    }

    try {
        const keys = Object.keys(results[0]);
        let timeColumn = null;
        const numericColumns = [];

        // Find time/date column
        keys.forEach(key => {
            const sampleValue = results[0][key];
            if (isDateColumn(key, sampleValue)) {
                if (!timeColumn) timeColumn = key;
            } else {
                const numValue = parseFloat(sampleValue);
                if (!isNaN(numValue) && isFinite(numValue)) {
                    numericColumns.push(key);
                }
            }
        });

        // Need at least one time column and one numeric column
        if (!timeColumn || numericColumns.length === 0) {
            return null;
        }

        // Sort results by time column
        const sortedResults = [...results].sort((a, b) => {
            const valA = String(a[timeColumn]);
            const valB = String(b[timeColumn]);
            return valA.localeCompare(valB);
        });

        if (sortedResults.length < 2) {
            return null;
        }

        let trendHTML = '<div class="analysis-section trend-analysis">';
        trendHTML += '<h3>📈 Trend Analysis</h3>';
        trendHTML += '<div class="trend-grid">';

        numericColumns.forEach(column => {
            const values = sortedResults.map(row => ({
                time: String(row[timeColumn]),
                value: parseFloat(row[column])
            })).filter(item => !isNaN(item.value) && isFinite(item.value));

            if (values.length < 2) return;

            // Calculate growth rates
            const growthRates = [];
            for (let i = 1; i < values.length; i++) {
                const prev = values[i - 1].value;
                const curr = values[i].value;
                if (prev !== 0) {
                    const growthRate = ((curr - prev) / prev) * 100;
                    growthRates.push({
                        period: `${values[i - 1].time} → ${values[i].time}`,
                        rate: growthRate,
                        change: curr - prev
                    });
                }
            }

            if (growthRates.length === 0) return;

            // Calculate overall statistics
            const firstValue = values[0].value;
            const lastValue = values[values.length - 1].value;
            const totalChange = lastValue - firstValue;
            const totalGrowthRate = firstValue !== 0 ? ((lastValue - firstValue) / firstValue) * 100 : 0;
            
            const avgGrowthRate = growthRates.reduce((sum, gr) => sum + gr.rate, 0) / growthRates.length;
            
            // Calculate CAGR if we have multiple periods
            let cagr = 0;
            if (values.length > 1 && firstValue > 0 && lastValue > 0) {
                const periods = values.length - 1;
                cagr = (Math.pow(lastValue / firstValue, 1 / periods) - 1) * 100;
            }

            // Identify trend direction
            const positiveGrowths = growthRates.filter(gr => gr.rate > 0).length;
            const negativeGrowths = growthRates.filter(gr => gr.rate < 0).length;
            const trendDirection = positiveGrowths > negativeGrowths ? 'upward' : 
                                  negativeGrowths > positiveGrowths ? 'downward' : 'mixed';

            const formatValue = (val) => {
                if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(2) + 'M';
                if (Math.abs(val) >= 1000) return (val / 1000).toFixed(2) + 'K';
                return val.toFixed(2);
            };

            const formatPercent = (val) => {
                const sign = val >= 0 ? '+' : '';
                return `${sign}${val.toFixed(2)}%`;
            };

            trendHTML += `<div class="trend-card">
                <h4>${escapeHtml(column)}</h4>
                <div class="trend-summary">
                    <div class="trend-stat">
                        <span class="trend-label">First Value:</span>
                        <span class="trend-value">${formatValue(firstValue)}</span>
                    </div>
                    <div class="trend-stat">
                        <span class="trend-label">Last Value:</span>
                        <span class="trend-value">${formatValue(lastValue)}</span>
                    </div>
                    <div class="trend-stat">
                        <span class="trend-label">Total Change:</span>
                        <span class="trend-value ${totalChange >= 0 ? 'positive' : 'negative'}">${formatValue(totalChange)}</span>
                    </div>
                    <div class="trend-stat">
                        <span class="trend-label">Total Growth:</span>
                        <span class="trend-value ${totalGrowthRate >= 0 ? 'positive' : 'negative'}">${formatPercent(totalGrowthRate)}</span>
                    </div>
                    <div class="trend-stat">
                        <span class="trend-label">Avg Growth Rate:</span>
                        <span class="trend-value ${avgGrowthRate >= 0 ? 'positive' : 'negative'}">${formatPercent(avgGrowthRate)}</span>
                    </div>
                    ${cagr !== 0 ? `<div class="trend-stat">
                        <span class="trend-label">CAGR:</span>
                        <span class="trend-value ${cagr >= 0 ? 'positive' : 'negative'}">${formatPercent(cagr)}</span>
                    </div>` : ''}
                    <div class="trend-stat">
                        <span class="trend-label">Trend:</span>
                        <span class="trend-value trend-${trendDirection}">${trendDirection.charAt(0).toUpperCase() + trendDirection.slice(1)}</span>
                    </div>
                </div>
                <div class="growth-rates">
                    <h5>Period-over-Period Growth:</h5>
                    <div class="growth-list">
                        ${growthRates.slice(0, 10).map(gr => `
                            <div class="growth-item">
                                <span class="growth-period">${escapeHtml(gr.period)}</span>
                                <span class="growth-rate ${gr.rate >= 0 ? 'positive' : 'negative'}">${formatPercent(gr.rate)}</span>
                            </div>
                        `).join('')}
                        ${growthRates.length > 10 ? `<div class="growth-more">... and ${growthRates.length - 10} more periods</div>` : ''}
                    </div>
                </div>
            </div>`;
        });

        trendHTML += '</div></div>';
        return trendHTML;
    } catch (error) {
        console.error('Error generating trend analysis:', error);
        return null;
    }
}

// Restore charts from tab messages when loading from localStorage
function restoreChartsFromTab(tab) {
    if (!tab || !tab.messages || typeof Chart === 'undefined') {
        return;
    }

    // Find all assistant messages with results data
    const assistantMessages = tab.messages.filter(msg => 
        msg.role === 'assistant' && 
        msg.content && 
        msg.content.results && 
        Array.isArray(msg.content.results) && 
        msg.content.results.length > 0
    );

    if (assistantMessages.length === 0) {
        return;
    }

    // Find all canvas elements - check both normal chat container and compare mode panels
    // Use multiple requestAnimationFrame calls to ensure container is visible and rendered
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setTimeout(() => {
                // Check normal chat container
                const chatContainer = document.getElementById('chat-container');
                // Check compare mode panels for this specific tab
                const comparePanel = document.querySelector(`.compare-panel[data-tab-id="${tab.id}"]`);
                const contentContainer = comparePanel 
                    ? comparePanel.querySelector('.compare-panel-content')
                    : (chatContainer || null);
                
                if (!contentContainer) {
                    Logger.warn('Content container not found for chart restoration');
                    return;
                }
                
                // Check if container is visible before creating charts
                const isVisible = contentContainer.offsetWidth > 0 && contentContainer.offsetHeight > 0;
                if (!isVisible) {
                    // Container not visible yet, try again after a delay
                    Logger.log('Container not visible, retrying chart restoration...');
                    setTimeout(() => restoreChartsFromTab(tab), 200);
                    return;
                }

                // Find all canvas elements in chart containers
                const canvasElements = contentContainer.querySelectorAll('.chart-container canvas');
                Logger.log(`Found ${canvasElements.length} canvas elements for chart restoration`);
                
                if (canvasElements.length === 0) {
                    Logger.warn('No canvas elements found for chart restoration');
                    return;
                }
                
                let chartIndex = 0;

            canvasElements.forEach((canvas, index) => {
                // Always destroy any existing Chart.js instance before recreating
                // This ensures clean state when restoring from tab HTML
                const chartInstance = Chart.getChart(canvas);
                if (chartInstance) {
                    try {
                        chartInstance.destroy();
                        Logger.log(`Destroyed existing chart instance ${index} before recreation`);
                    } catch (error) {
                        Logger.warn(`Error destroying chart ${index}:`, error);
                    }
                }

                // Find the corresponding message with results for this chart
                // Try to find the message that corresponds to this canvas by looking at the canvas's parent
                let message = null;
                let results = null;
                
                // First, try to find message by index
                if (chartIndex < assistantMessages.length) {
                    message = assistantMessages[chartIndex];
                    results = message?.content?.results;
                }
                
                // If no results found by index, try to find by looking at the canvas's parent container
                if (!results || !Array.isArray(results) || results.length === 0) {
                    // Look for the AI message container that contains this canvas
                    const aiMessageContainer = canvas.closest('.ai-message');
                    if (aiMessageContainer) {
                        // Try to find results data stored in the message
                        const resultsDataAttr = aiMessageContainer.dataset.resultsData;
                        if (resultsDataAttr) {
                            try {
                                results = JSON.parse(resultsDataAttr);
                                Logger.log('Found results from data attribute for chart restoration');
                            } catch (e) {
                                Logger.warn('Failed to parse resultsData attribute:', e);
                            }
                        }
                    }
                }
                
                // If still no results, try to find any message with results
                if (!results || !Array.isArray(results) || results.length === 0) {
                    const messageWithResults = assistantMessages.find(msg => 
                        msg.content && 
                        msg.content.results && 
                        Array.isArray(msg.content.results) && 
                        msg.content.results.length > 0
                    );
                    if (messageWithResults) {
                        results = messageWithResults.content.results;
                        Logger.log('Using first available message with results for chart restoration');
                    }
                }

                if (!results || !Array.isArray(results) || results.length === 0) {
                    Logger.warn('No results found for chart restoration, skipping canvas');
                    chartIndex++;
                    return;
                }

                // Re-render the chart
                try {
                    const isDark = document.body.classList.contains('dark-mode');
                    const ctx = canvas.getContext('2d');

                    // Use the same chart generation logic
                    const keys = Object.keys(results[0]);
                    if (keys.length < 2) {
                        chartIndex++;
                        return;
                    }

                    const numericColumns = [];
                    const categoricalColumns = [];

                    keys.forEach(key => {
                        const sampleValue = results[0][key];
                        const numValue = parseFloat(sampleValue);
                        if (!isNaN(numValue) && isFinite(numValue)) {
                            numericColumns.push(key);
                        } else {
                            categoricalColumns.push(key);
                        }
                    });

                    let chartType = 'bar';
                    let labels = [];
                    let datasets = [];

                    if (categoricalColumns.length >= 1 && numericColumns.length >= 1) {
                        const labelColumn = categoricalColumns[0];
                        const dataColumn = numericColumns[0];

                        labels = results.map(row => String(row[labelColumn])).slice(0, 20);
                        const data = results.map(row => {
                            const val = parseFloat(row[dataColumn]);
                            return isNaN(val) ? 0 : val;
                        }).slice(0, 20);

                        if (results.length <= 10) {
                            chartType = 'bar';
                        } else if (results.length > 10 && numericColumns.length === 1) {
                            chartType = 'line';
                        }

                        datasets = [{
                            label: dataColumn,
                            data: data,
                            backgroundColor: isDark ? 'rgba(93, 173, 226, 0.6)' : 'rgba(0, 123, 255, 0.6)',
                            borderColor: isDark ? 'rgba(93, 173, 226, 1)' : 'rgba(0, 123, 255, 1)',
                            borderWidth: 2
                        }];
                    } else if (numericColumns.length >= 2) {
                        const labelColumn = keys[0];
                        labels = results.map(row => String(row[labelColumn])).slice(0, 20);
                        
                        numericColumns.slice(0, 3).forEach((col, idx) => {
                            const data = results.map(row => {
                                const val = parseFloat(row[col]);
                                return isNaN(val) ? 0 : val;
                            }).slice(0, 20);
                            
                            const colors = isDark 
                                ? ['rgba(93, 173, 226, 0.6)', 'rgba(46, 204, 113, 0.6)', 'rgba(241, 196, 15, 0.6)']
                                : ['rgba(0, 123, 255, 0.6)', 'rgba(40, 167, 69, 0.6)', 'rgba(255, 193, 7, 0.6)'];
                            
                            datasets.push({
                                label: col,
                                data: data,
                                backgroundColor: colors[idx % colors.length],
                                borderColor: colors[idx % colors.length].replace('0.6', '1'),
                                borderWidth: 2
                            });
                        });
                    } else {
                        chartIndex++;
                        return; // Not suitable for charting
                    }

                    // Ensure canvas has dimensions before creating chart
                    if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
                        // Canvas has no dimensions, skip this chart
                        Logger.warn('Canvas has no dimensions, skipping chart creation');
                        chartIndex++;
                        return;
                    }
                    
                    // Create the chart
                    const chart = new Chart(ctx, {
                        type: chartType,
                        data: {
                            labels: labels,
                            datasets: datasets
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            aspectRatio: 2,
                            animation: false, // Disable animation for faster rendering
                            plugins: {
                                legend: {
                                    display: true,
                                    position: 'top',
                                    labels: {
                                        color: '#e2e8f0', // Always light text for dark background
                                        boxWidth: 12,
                                        padding: 8,
                                        font: {
                                            size: 12
                                        }
                                    }
                                },
                                title: {
                                    display: true,
                                    text: 'Data Visualization',
                                    color: '#e2e8f0', // Always light text for dark background
                                    font: {
                                        size: 14
                                    },
                                    padding: {
                                        top: 10,
                                        bottom: 15
                                    }
                                }
                            },
                            scales: chartType !== 'pie' ? {
                                y: {
                                    beginAtZero: true,
                                    ticks: {
                                        color: '#e2e8f0' // Always light text for dark background
                                    },
                                    grid: {
                                        color: 'rgba(226, 232, 240, 0.1)' // Light grid lines
                                    }
                                },
                                x: {
                                    ticks: {
                                        color: '#e2e8f0' // Always light text for dark background
                                    },
                                    grid: {
                                        color: 'rgba(226, 232, 240, 0.1)' // Light grid lines
                                    }
                                }
                            } : {}
                        }
                    });
                    
                    // Force a resize after creation to ensure proper rendering
                    setTimeout(() => {
                        if (Chart.getChart(canvas)) {
                            Chart.getChart(canvas).resize();
                        }
                    }, 50);

                    chartIndex++;
                } catch (error) {
                    Logger.warn('Chart restoration error:', error);
                    chartIndex++;
                }
            });
            }, 150); // Increased delay to ensure container is fully visible
        });
    });
}

function collapseProviderPanel() {
    if (providerPanel) providerPanel.classList.add('collapsed');
    localStorage.setItem('providerPanelCollapsed', 'true');

    const container = document.querySelector('.container');
    if (container) {
        container.style.marginBottom = '1.5rem';
    }
}

function expandProviderPanel() {
    if (providerPanel) providerPanel.classList.remove('collapsed');
    localStorage.setItem('providerPanelCollapsed', 'false');

    const container = document.querySelector('.container');
    if (container) {
        container.style.marginBottom = '15px';
    }
}

function loadProviderPanelState() {
    const storedState = localStorage.getItem('providerPanelCollapsed');
    const isCollapsed = storedState === null ? true : storedState === 'true';
    if (isCollapsed) {
        collapseProviderPanel();
    } else {
        expandProviderPanel();
    }
}

function hideApiConfig() {
    if (apiProviderStatus) apiProviderStatus.classList.remove('open');
    // Remove class from main-content to restore container spacing
    if (mainContent) mainContent.classList.remove('drawer-open');
    if (apiConfigToggleBtn) {
        // Remove drawer-open class - CSS will handle positioning
        apiConfigToggleBtn.classList.remove('drawer-open');
        
        // Switch back to regular AI Settings image
        const iconImg = apiConfigToggleBtn.querySelector('.drawer-toggle-icon');
        if (iconImg) {
            iconImg.src = 'images/ai_settings.svg';
            iconImg.alt = 'Open AI Settings';
        }
        
        // Remove inline style to let CSS handle positioning
        apiConfigToggleBtn.style.right = '';
        
        // Re-enable hover effects when drawer is closed
        apiConfigToggleBtn.classList.remove('no-hover');
        // Restore tooltip when drawer is closed
        apiConfigToggleBtn.title = 'Show API Configuration';
    }
    if (mainContent) mainContent.style.paddingRight = '30px';
    localStorage.setItem('apiConfigVisible', 'false');
}

function showApiConfig() {
    // Only show API config if power_user is enabled
    if (!isPowerUser) {
        return;
    }
    if (apiProviderStatus) apiProviderStatus.classList.add('open');
    
    if (apiConfigToggleBtn) {
        // Add drawer-open class - CSS will handle positioning via var(--drawer-width)
        apiConfigToggleBtn.classList.add('drawer-open');
        
        // Switch to minimize image
        const iconImg = apiConfigToggleBtn.querySelector('.drawer-toggle-icon');
        if (iconImg) {
            iconImg.src = 'images/ai_settings-min.svg';
            iconImg.alt = 'Minimize Settings';
        }
        
        // Remove inline style to let CSS handle positioning
        apiConfigToggleBtn.style.right = '';
        
        // Disable hover effects when drawer is open
        apiConfigToggleBtn.classList.add('no-hover');
        // Update tooltip when drawer is open
        apiConfigToggleBtn.title = 'Minimize Settings';
    }
    
    // These operations happen after button setup to avoid delays
    // Add class to main-content to adjust container spacing
    if (mainContent) mainContent.classList.add('drawer-open');
    if (mainContent) mainContent.style.paddingRight = '0px';
    localStorage.setItem('apiConfigVisible', 'true');
}



function loadApiConfigVisibility() {
    // Only load API config visibility if power_user is enabled
    if (!isPowerUser) {
        return; // Don't show API config if not power user
    }
    const isVisible = localStorage.getItem('apiConfigVisible') === 'true';
    if (isVisible) {
        showApiConfig();
    } else {
        hideApiConfig();
    }
}

// Save tabs to localStorage
function saveTabsToStorage() {
    try {
        localStorage.setItem('queryTabs', JSON.stringify(tabs));
        localStorage.setItem('activeTabId', activeTabId);
        localStorage.setItem('tabCounter', tabCounter.toString());
    } catch (error) {
        // localStorage error - handled gracefully
    }
}

// Load tabs from localStorage

function loadTabsFromStorage() {
    try {
        // Parse stored tabs safely
        const savedTabs = JSON.parse(localStorage.getItem('queryTabs') || "[]");
        const savedActiveTabId = localStorage.getItem('activeTabId');

        tabs = Array.isArray(savedTabs) ? savedTabs : [];

        // Ensure all tabs have required properties (for backward compatibility)
        tabs.forEach(tab => {
            if (tab.queryCount === undefined || tab.queryCount === null) {
                tab.queryCount = tab.messages ? Math.ceil(tab.messages.filter(m => m.role === 'user').length) : 0;
            }
            if (!tab.provider) tab.provider = 'N/A';
            if (!tab.model) tab.model = 'N/A';
            // Initialize contextReset flag if not present (for backward compatibility)
            if (tab.contextReset === undefined) {
                tab.contextReset = false;
            }
        });

        // Restore active tab or default
        activeTabId = savedActiveTabId || (tabs[0] && tabs[0].id) || "main";

        // Determine next tab counter
        tabCounter = tabs.length > 0
            ? Math.max(...tabs.map(t => parseInt(t.id.replace('tab-', '')) || 0)) + 1
            : 0;

        // If no tabs exist, create the default one
        if (tabs.length === 0) {
            tabs.push({
                id: 'main',
                title: 'New Query',
                messages: [],
                chatHTML: '',
                queryCount: 0,
                contextReset: false, // Default tab is not a reset
                provider: 'N/A',
                model: 'N/A'
            });
            activeTabId = 'main';
            tabCounter = 0;
        }

        renderTabs();

        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab) {
            if (activeTab.chatHTML && chatContainer) {
                chatContainer.innerHTML = activeTab.chatHTML;
                // Restore charts after HTML is loaded - use multiple delays to ensure DOM is ready
                setTimeout(() => {
                    restoreChartsFromTab(activeTab);
                }, 100);
                // Also try again after a longer delay to catch any timing issues
                setTimeout(() => {
                    restoreChartsFromTab(activeTab);
                }, 500);
            }

            // Handle "New Query" tab specially on initial load
            if (activeTab.title === 'New Query') {
                // Query Stats section removed - stats now shown in stats bubble
                // Load current provider and model from API settings
                updateCurrentProviderStats();
            }

            updateProviderPanelState();
            updateHeaderStatusFromTab(activeTab);
            
            // Handle API Settings visibility based on active tab on load
            if (activeTab.title === 'New Query') {
                // Show API Settings for "New Query" tab (only if power_user is enabled)
                if (apiConfigToggleBtn) {
                    if (isPowerUser) {
                        apiConfigToggleBtn.disabled = false;
                        apiConfigToggleBtn.style.opacity = '1';
                        apiConfigToggleBtn.style.cursor = 'pointer';
                        apiConfigToggleBtn.style.display = 'flex';
                        loadApiConfigVisibility();
                    } else {
                        // Hide button if not power user
                        apiConfigToggleBtn.style.display = 'none';
                    }
                }
            } else {
                // Hide API Settings for historical tabs
                hideApiConfig();
                if (apiConfigToggleBtn) {
                    if (isPowerUser) {
                        apiConfigToggleBtn.disabled = true;
                        apiConfigToggleBtn.style.opacity = '0.5';
                        apiConfigToggleBtn.style.cursor = 'not-allowed';
                        apiConfigToggleBtn.classList.add('disabled'); // Add disabled class for styling
                        // Keep button visible but grayed out - don't hide it
                    } else {
                        // Hide button if not power user
                        apiConfigToggleBtn.style.display = 'none';
                    }
                }
            }
        }
        
        return tabs; // Return tabs array for use in search function

    } catch (error) {
        // localStorage error - handled gracefully

        // Safety fallback
        tabs = [{
            id: 'main',
            title: 'New Query',
            messages: [],
            chatHTML: '',
            queryCount: 0,
            provider: 'N/A',
            model: 'N/A'
        }];
        activeTabId = 'main';
        tabCounter = 0;
    }
    
    return tabs; // Return tabs array even on error
}


function createTab(title, query) {
    tabCounter++;
    const tabId = `tab-${tabCounter}`;

    const tab = {
        id: tabId,
        title: title,
        messages: [],
        chatHTML: '',
        query: query,
        queryCount: 0,
        provider: 'N/A'
    };

    tabs.push(tab);
    saveTabsToStorage();
    renderTabs();
    switchToTab(tabId);
    return tab;
}

// Helper function to count historical tabs (excluding "New Query")
function getHistoricalTabsCount() {
    return tabs.filter(tab => tab.title !== 'New Query' && tab.queryCount > 0).length;
}

// Update Compare button visibility
function updateCompareButtonVisibility() {
    const compareBtn = document.getElementById('compare-mode-btn');
    if (!compareBtn) return;
    
    const historicalCount = getHistoricalTabsCount();
    if (historicalCount < 2) {
        compareBtn.style.display = 'none';
    } else {
        compareBtn.style.display = 'flex';
    }
}

// Enable/disable Compare Mode and Templates buttons based on query state
function updateActionButtonsState() {
    const compareBtn = document.getElementById('compare-mode-btn');
    const templatesBtn = document.getElementById('templates-btn');
    const apiConfigToggleBtn = document.getElementById('api-config-toggle-btn');
    
    if (isQueryRunning) {
        // Disable buttons when query is running
        if (compareBtn) {
            compareBtn.disabled = true;
            compareBtn.style.opacity = '0.5';
            compareBtn.style.cursor = 'not-allowed';
            compareBtn.classList.add('disabled');
        }
        if (templatesBtn) {
            templatesBtn.disabled = true;
            templatesBtn.style.opacity = '0.5';
            templatesBtn.style.cursor = 'not-allowed';
            templatesBtn.classList.add('disabled');
        }
        // Disable AI Settings button when query is running (only if power user mode is enabled)
        if (apiConfigToggleBtn && isPowerUser) {
            apiConfigToggleBtn.disabled = true;
            apiConfigToggleBtn.style.opacity = '0.5';
            apiConfigToggleBtn.style.cursor = 'not-allowed';
            apiConfigToggleBtn.classList.add('disabled');
        }
    } else {
        // Re-enable buttons when query completes (unless disabled for other reasons)
        if (compareBtn && !isCompareMode) {
            compareBtn.disabled = false;
            compareBtn.style.opacity = '1';
            compareBtn.style.cursor = 'pointer';
            compareBtn.classList.remove('disabled');
        }
        if (templatesBtn && !isCompareMode) {
            templatesBtn.disabled = false;
            templatesBtn.style.opacity = '1';
            templatesBtn.style.cursor = 'pointer';
            templatesBtn.classList.remove('disabled');
        }
        // Re-enable AI Settings button when query completes (only if power user mode is enabled and not in compare mode)
        if (apiConfigToggleBtn && isPowerUser && !isCompareMode) {
            apiConfigToggleBtn.disabled = false;
            apiConfigToggleBtn.style.opacity = '1';
            apiConfigToggleBtn.style.cursor = 'pointer';
            apiConfigToggleBtn.classList.remove('disabled');
        }
    }
}

function renderTabs() {
    if (!queryTabsContainer) {
        // Element not found - handled gracefully
        return;
    }
    queryTabsContainer.innerHTML = '';

    // Get historical tabs count
    const historicalTabs = tabs.filter(tab => tab.title !== 'New Query' && tab.queryCount > 0);
    const shouldHideNewQuery = isCompareMode && historicalTabs.length >= 4;

    tabs.forEach(tab => {
        // Hide "New Query" tab if in compare mode and we have 4 historical tabs
        if (tab.title === 'New Query' && shouldHideNewQuery) {
            return; // Skip rendering this tab
        }
        
        const tabElement = document.createElement('div');
        let tabClasses = 'tab';
        if (tab.id === activeTabId) tabClasses += ' active';
        if (tab.title === 'New Query') tabClasses += ' no-close';
        if (tab._shouldHide) tabClasses += ' hidden-tab';
        
        // Disable "New Query" tab when in compare mode
        const isNewQueryTab = tab.title === 'New Query';
        const isActiveTab = tab.id === activeTabId;
        
        // Disable ALL tabs when query is running (including active tab)
        if (isQueryRunning) {
            tabClasses += ' disabled';
            tabElement.setAttribute('disabled', 'true');
        }
        
        // Disable ALL tabs when in compare mode (not just New Query)
        if (isCompareMode) {
            tabClasses += ' disabled';
            tabElement.setAttribute('disabled', 'true');
        }
        
        tabElement.className = tabClasses;
        tabElement.dataset.tabId = tab.id;
        if (tab._shouldHide) {
            tabElement.style.display = 'none';
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'tab-title';
        titleSpan.textContent = tab.title;
        titleSpan.title = tab.title;

        tabElement.appendChild(titleSpan);

        if (tab.title !== 'New Query') {
            const closeBtn = document.createElement('button');
            closeBtn.className = 'tab-close';
            closeBtn.innerHTML = '<i data-feather="x"></i>';
            closeBtn.title = 'Close tab';
            // Disable close button when query is running
            if (isQueryRunning) {
                closeBtn.disabled = true;
                closeBtn.style.opacity = '0.5';
                closeBtn.style.cursor = 'not-allowed';
            }
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                if (!isQueryRunning) {
                closeTab(tab.id);
                }
            };
            tabElement.appendChild(closeBtn);
        }

        if (tabs.length === 1 && tab.id === activeTabId) {
            tabElement.style.cursor = 'default';
            // No onclick handler for the single active tab
        } else {
            // Only add click handler if tab is not disabled
            const isDisabled = isQueryRunning || isCompareMode;
            if (!isDisabled) {
            tabElement.onclick = () => switchToTab(tab.id);
            } else {
                tabElement.style.cursor = 'not-allowed';
            }
        }
        queryTabsContainer.appendChild(tabElement);
    });

    reinitializeIcons();
    updateCompareButtonVisibility();
}

async function switchToTab(tabId) {
    // Prevent tab switching while query is running
    if (isQueryRunning) {
        showToast('Please wait for the current query to complete before switching tabs', 'info');
        return;
    }
    
    // Prevent tab switching while in compare mode
    if (isCompareMode) {
        showToast('Please exit Compare Mode before switching tabs', 'info');
        return;
    }
    
    if (tabId === activeTabId) return;

    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab && chatContainer) {
        currentTab.chatHTML = chatContainer.innerHTML;
    }

    activeTabId = tabId;
    const newTab = tabs.find(t => t.id === tabId);

    if (newTab) {
        if (chatContainer) {
            chatContainer.innerHTML = newTab.chatHTML;
            chatContainer.scrollTop = chatContainer.scrollHeight;
            // Restore charts after HTML is loaded - use multiple delays to ensure DOM is ready
            setTimeout(() => {
                restoreChartsFromTab(newTab);
            }, 100);
            // Also try again after a longer delay to catch any timing issues
            setTimeout(() => {
                restoreChartsFromTab(newTab);
            }, 500);
        }

        await restoreTabContext(newTab);

        updateHeaderStatusFromTab(newTab);

        // Handle "New Query" tab specially
        if (newTab.title === 'New Query') {
            // Clear all stats except Provider and Model with helpful messages
            setStatValue(document.getElementById('stat-tokens'), getEmptyStateMessage('tokens'), true);
            setStatValue(document.getElementById('stat-latency'), getEmptyStateMessage('latency'), true);
            const statusElement = document.getElementById('stat-status');
            if (statusElement) {
                setStatValue(statusElement, getEmptyStateMessage('status'), true);
                statusElement.className = 'stat-value';
            }
            setStatValue(document.getElementById('stat-lastrun'), getEmptyStateMessage('lastrun'), true);
            
            // Load current provider and model from API settings
            updateCurrentProviderStats();
            
            // Show API Settings area for "New Query" tab (only if power_user is enabled)
            if (apiConfigToggleBtn) {
                if (isPowerUser) {
                    apiConfigToggleBtn.disabled = false;
                    apiConfigToggleBtn.style.opacity = '1';
                    apiConfigToggleBtn.style.cursor = 'pointer';
                    apiConfigToggleBtn.classList.remove('disabled'); // Remove disabled class
                    apiConfigToggleBtn.style.display = 'flex'; // Ensure it's visible
                } else {
                    apiConfigToggleBtn.style.display = 'none'; // Hide if not power user
                }
            }
            // Load saved API config visibility state
            loadApiConfigVisibility();
            
            // Focus the query input field for immediate typing
            setTimeout(() => {
                if (queryInput) {
                    queryInput.focus();
                }
            }, 100); // Small delay to ensure DOM is ready
            } else {
                // Historical tab - hide API Settings and disable toggle button
                hideApiConfig();
                if (apiConfigToggleBtn) {
                    apiConfigToggleBtn.disabled = true;
                    apiConfigToggleBtn.style.opacity = '0.5';
                    apiConfigToggleBtn.style.cursor = 'not-allowed';
                    apiConfigToggleBtn.classList.add('disabled'); // Add disabled class for styling
                    // Keep button visible but grayed out - don't hide it
                }
        }

        if (newTab.queryCount === 0 || newTab.title === 'New Query') {
            updateProviderButtonState(false);
        } else {
            updateProviderButtonState(true);
        }

        updateProviderPanelState();
    }

    renderTabs();

    const resetMessage = document.getElementById('reset-message');
    if (resetMessage && newTab.messages.length === 0) {
        resetMessage.classList.remove('hidden');
    } else if (resetMessage) {
        resetMessage.classList.add('hidden');
    }

    updateClearContextVisibility();

    updateQueryStatsVisibility(newTab);

    if (newTab.queryCount === 0 && chatContainer) {
        chatContainer.classList.add('empty');
    } else if (chatContainer) {
        chatContainer.classList.remove('empty');
    }
}

function updateQueryStatsVisibility(tab) {
    // Query Stats section removed - function kept for compatibility but does nothing
    return;

    if (tab.title === 'New Query') {
        queryStats.classList.add('new-query');
        apiConfigToggleBtn.classList.remove('disabled');
        apiConfigToggleBtn.disabled = false;
    } else {
        queryStats.classList.remove('new-query');
        apiConfigToggleBtn.classList.add('disabled');
        apiConfigToggleBtn.disabled = true;
        hideApiConfig();
    }
}

async function restoreTabContext(tab) {
    try {
        // When switching to a tab, ensure its memory exists but don't clear it
        // The memory will be loaded when the next query is made
        // Only clear if this is a "New Query" tab with no previous queries
        if (tab && tab.title === 'New Query' && (!tab.messages || tab.messages.length === 0)) {
            // Clear context for fresh "New Query" tab
            const response = await fetch('/api/clear-context', { 
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ tabId: tab.id })
            });
        }
        // For existing tabs, memory will continue from where it left off
    } catch (error) {
        // Error restoring context - handled gracefully
        Logger.warn('[TAB] Error restoring tab context:', error);
    }
}

function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;
    
    // Exit compare mode if closing a tab while in compare mode
    if (isCompareMode) {
        exitCompareMode();
    }

    tabs.splice(tabIndex, 1);
    saveTabsToStorage();

    if (tabs.length === 0) {
        tabs.push({
            id: 'main',
            title: 'New Query',
            messages: [],
            chatHTML: '',
            queryCount: 0,
            provider: 'N/A',
            model: 'N/A'
        });
        activeTabId = 'main';
        tabCounter = 0;
        saveTabsToStorage();
        renderTabs();
        if (chatContainer) chatContainer.innerHTML = '';
        updateHeaderStatus();
        updateProviderPanelState();
        updateClearContextVisibility();
        updateQueryStatsVisibility(tabs[0]);
        return;
    }

    if (tabId === activeTabId) {
        const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
        switchToTab(newActiveTab.id);
    } else {
        renderTabs();
    }
}

async function generateAndUpdateTabTitle(tabId, query) {
    try {
        Logger.log('[TAB RENAME] generateAndUpdateTabTitle called:', { tabId, query: query.substring(0, 50) + '...' });
        const tab = tabs.find(t => t.id === tabId);
        if (!tab) {
            Logger.warn('[TAB RENAME] Tab not found for title generation:', tabId);
            return;
        }

        const wasNewQueryTab = tab.title === 'New Query' || tab.title.endsWith('...');
        Logger.log('[TAB RENAME] Tab state:', { 
            title: tab.title, 
            wasNewQueryTab, 
            queryCount: tab.queryCount 
        });
        
        Logger.log('[TAB RENAME] Calling /api/generate-title...');
        const response = await fetch('/api/generate-title', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[TAB RENAME] Title generation failed:', response.status, errorText);
            throw new Error(`Title generation failed: ${response.status}`);
        }

        const data = await response.json();
        Logger.log('[TAB RENAME] Title generation response:', data);

        if (data.success && data.title) {
            Logger.log('[TAB RENAME] Updating tab title from', tab.title, 'to', data.title);
                tab.title = data.title;
            // Remove hide flag when tab is renamed
            delete tab._shouldHide;
                saveTabsToStorage();
                renderTabs();

                if (wasNewQueryTab && tab.queryCount === 1) {
                Logger.log('[TAB RENAME] Creating new "New Query" tab...');
                // DO NOT clear context here - the user is still on the renamed tab and may want to ask follow-up questions
                // Context will be cleared only when user explicitly switches to the new tab or clicks "Clear Context"

                    tabCounter++;
                    const newTabId = `tab-${tabCounter}`;
                    const newTab = {
                        id: newTabId,
                        title: 'New Query',
                        messages: [],
                        chatHTML: '',
                        queryCount: 0,
                    provider: 'N/A',
                    model: 'N/A'
                    };

                    tabs.unshift(newTab);
                    saveTabsToStorage();
                Logger.log('[TAB RENAME] New tab created:', newTabId);

                    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('active'));

                    renderTabs();

                // Don't switch to the new tab - stay on the renamed tab
                // The renamed tab should remain active
            }
        } else {
            Logger.warn('[TAB RENAME] Title generation returned unsuccessful response:', data);
            // If title generation fails, still create new tab if needed
            if (wasNewQueryTab && tab.queryCount === 1) {
                Logger.log('[TAB RENAME] Title generation failed, but creating new tab anyway...');
                // DO NOT clear context here - the user is still on the renamed tab and may want to ask follow-up questions
                // Context will be cleared only when user explicitly switches to the new tab or clicks "Clear Context"

                tabCounter++;
                const newTabId = `tab-${tabCounter}`;
                const newTab = {
                    id: newTabId,
                    title: 'New Query',
                    messages: [],
                    chatHTML: '',
                    queryCount: 0,
                    provider: 'N/A',
                    model: 'N/A'
                };

                tabs.unshift(newTab);
                saveTabsToStorage();
                renderTabs();
            }
        }
    } catch (error) {
        console.error('Error generating tab title:', error);
        // Even if title generation fails, create new tab if this was the first query
        const tab = tabs.find(t => t.id === tabId);
        if (tab && (tab.title === 'New Query' || tab.title.endsWith('...')) && tab.queryCount === 1) {
            // Don't clear context here - the new tab will get its own fresh context when first used
            // Context is cleared in restoreTabContext when switching to a "New Query" tab

            tabCounter++;
            const newTabId = `tab-${tabCounter}`;
            const newTab = {
                id: newTabId,
                title: 'New Query',
                messages: [],
                chatHTML: '',
                queryCount: 0,
                provider: 'N/A',
                model: 'N/A'
            };

            tabs.unshift(newTab);
            saveTabsToStorage();
            renderTabs();
        }
    }
}

function initializeModalEventListeners() {
    if (apiKeyInput && modalOkBtn) {
        apiKeyInput.addEventListener('input', () => {
            modalOkBtn.disabled = apiKeyInput.value.trim().length === 0;
        });
    }

    if (modalCancelBtn) {
        modalCancelBtn.addEventListener('click', () => {
            closeModal();
        });
    }

    if (apiKeyModal) {
        apiKeyModal.addEventListener('click', (e) => {
            if (e.target === apiKeyModal) {
                closeModal();
            }
        });
    }

    if (apiKeyForm) {
        apiKeyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await saveApiKey();
        });
    }

    if (actionsCancelBtn) {
        actionsCancelBtn.addEventListener('click', () => {
            closeProviderActionsModal();
        });
    }

    if (testApiBtn) {
        testApiBtn.addEventListener('click', async () => {
            await testCurrentProviderApi();
        });
    }

    if (enterNewApiBtn) {
        enterNewApiBtn.addEventListener('click', () => {
            showModalConfirmation();
        });
    }

    const deleteApiKeyBtn = document.getElementById('deleteApiKeyBtn');
    if (deleteApiKeyBtn) {
        deleteApiKeyBtn.addEventListener('click', async () => {
            await deleteApiKey();
        });
    }

    const actionsModalOkBtn = document.getElementById('actionsModalOkBtn');
    if (actionsModalOkBtn) {
        actionsModalOkBtn.addEventListener('click', () => {
            if (actionsModalOkHandler) {
                actionsModalOkHandler();
            } else {
                closeProviderActionsModal();
            }
        });
    }

    const actionsModalCancelBtn = document.getElementById('actionsModalCancelBtn');
    if (actionsModalCancelBtn) {
        actionsModalCancelBtn.addEventListener('click', () => {
            closeProviderActionsModal();
        });
    }

    const actionsModalYesBtn = document.getElementById('actionsModalYesBtn');
    if (actionsModalYesBtn) {
        actionsModalYesBtn.addEventListener('click', () => {
            const providerName = currentActionsProviderName;
            closeProviderActionsModal();
            if (providerName) {
                openModal(providerName, true);
            }
        });
    }

    const actionsModalNoBtn = document.getElementById('actionsModalNoBtn');
    if (actionsModalNoBtn) {
        actionsModalNoBtn.addEventListener('click', () => {
            closeProviderActionsModal();
        });
    }

    if (providerActionsModal) {
        providerActionsModal.addEventListener('click', (e) => {
            if (e.target === providerActionsModal) {
                closeProviderActionsModal();
            }
        });
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all query history and close all tabs?')) {
                clearAllTabs();
            }
        });
    }
}

function clearAllTabs() {
    tabs = [{
        id: 'main',
        title: 'New Query',
        messages: [],
        chatHTML: '',
        queryCount: 0,
        provider: 'N/A',
        model: 'N/A'
    }];
    activeTabId = 'main';
    tabCounter = 0;
    saveTabsToStorage();
    renderTabs();

    if (chatContainer) chatContainer.innerHTML = '';

    updateHeaderStatus();
    updateProviderPanelState();
    updateClearContextVisibility();
    updateQueryStatsVisibility(tabs[0]);
}

// Initial setup calls
loadTabsFromStorage();
renderTabs();
updateProviderUI();
loadProviderPanelState();
loadApiConfigVisibility();
initializeModalEventListeners();
initTemplatesModal(); // Initialize templates modal
updateQueryStatsVisibility(tabs.find(t => t.id === activeTabId));

// ============================================
// COMPARE MODE FUNCTIONS
// ============================================

// Enter Compare Mode
function enterCompareMode() {
    isCompareMode = true;
    const compareBtn = document.getElementById('compare-mode-btn');
    if (compareBtn) {
        const span = compareBtn.querySelector('span');
        if (span) span.textContent = 'Exit Compare Mode';
    }
    
    // Hide normal view
    if (chatContainer) chatContainer.classList.add('hidden');
    if (queryForm) queryForm.classList.add('hidden');
    
    // Show compare view
    const compareContainer = document.getElementById('compare-view-container');
    if (compareContainer) {
        compareContainer.classList.remove('hidden');
        renderCompareView();
    }
    
    // Disable Templates button
    const templatesBtn = document.getElementById('templates-btn');
    if (templatesBtn) {
        templatesBtn.disabled = true;
        templatesBtn.style.opacity = '0.5';
        templatesBtn.style.cursor = 'not-allowed';
        templatesBtn.classList.add('disabled');
    }
    
    // Disable AI Settings button
    if (apiConfigToggleBtn) {
        apiConfigToggleBtn.disabled = true;
        apiConfigToggleBtn.style.opacity = '0.5';
        apiConfigToggleBtn.style.cursor = 'not-allowed';
        apiConfigToggleBtn.classList.add('disabled');
    }
    
    // Re-render tabs to update disabled state
    renderTabs();
}

// Exit Compare Mode
function exitCompareMode() {
    isCompareMode = false;
    const compareBtn = document.getElementById('compare-mode-btn');
    if (compareBtn) {
        const span = compareBtn.querySelector('span');
        if (span) span.textContent = 'Compare Mode';
    }
    
    // Show normal view
    if (chatContainer) chatContainer.classList.remove('hidden');
    if (queryForm) queryForm.classList.remove('hidden');
    
    // Re-enable Templates button
    const templatesBtn = document.getElementById('templates-btn');
    if (templatesBtn) {
        templatesBtn.disabled = false;
        templatesBtn.style.opacity = '1';
        templatesBtn.style.cursor = 'pointer';
        templatesBtn.classList.remove('disabled');
    }
    
    // Re-enable AI Settings button (but check if it should be enabled based on active tab)
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (apiConfigToggleBtn) {
        if (activeTab && activeTab.title === 'New Query') {
            // Enable for "New Query" tab
            apiConfigToggleBtn.disabled = false;
            apiConfigToggleBtn.style.opacity = '1';
            apiConfigToggleBtn.style.cursor = 'pointer';
            apiConfigToggleBtn.classList.remove('disabled');
        } else {
            // Keep disabled for historical tabs
            apiConfigToggleBtn.disabled = true;
            apiConfigToggleBtn.style.opacity = '0.5';
            apiConfigToggleBtn.style.cursor = 'not-allowed';
            apiConfigToggleBtn.classList.add('disabled');
        }
    }
    
    // Re-render tabs to update disabled state
    renderTabs();
    
    // Hide compare view
    const compareContainer = document.getElementById('compare-view-container');
    if (compareContainer) {
        compareContainer.classList.add('hidden');
        compareContainer.innerHTML = '';
    }
}

// Render Compare View with up to 4 tabs side-by-side
function renderCompareView() {
    const compareContainer = document.getElementById('compare-view-container');
    if (!compareContainer) return;
    
    // Get historical tabs (exclude "New Query" and empty tabs)
    const historicalTabs = tabs.filter(tab => 
        tab.title !== 'New Query' && tab.queryCount > 0
    ).slice(0, 4); // Limit to 4 tabs
    
    if (historicalTabs.length < 2) {
        exitCompareMode();
        return;
    }
    
    compareContainer.innerHTML = '';
    compareContainer.style.gridTemplateColumns = `repeat(${historicalTabs.length}, 1fr)`;
    
    historicalTabs.forEach(tab => {
        const panel = document.createElement('div');
        panel.className = 'compare-panel';
        panel.dataset.tabId = tab.id;
        
        // Panel header with tab title
        const header = document.createElement('div');
        header.className = 'compare-panel-header';
        header.textContent = tab.title;
        panel.appendChild(header);
        
        // Scrollable content area
        const content = document.createElement('div');
        content.className = 'compare-panel-content';
        if (tab.chatHTML) {
            content.innerHTML = tab.chatHTML;
        }
        panel.appendChild(content);
        
        // Query form for this tab
        const formWrapper = document.createElement('div');
        formWrapper.className = 'compare-panel-form';
        const form = document.createElement('form');
        form.className = 'compare-query-form';
        form.dataset.tabId = tab.id;
        
        const textarea = document.createElement('textarea');
        textarea.className = 'compare-query-input';
        textarea.placeholder = 'Ask a question... (Enter to send, Shift+Enter for new line)';
        textarea.required = true;
        
        const submitBtn = document.createElement('button');
        submitBtn.type = 'submit';
        submitBtn.textContent = 'Submit';
        submitBtn.className = 'compare-submit-btn';
        
        form.appendChild(textarea);
        form.appendChild(submitBtn);
        formWrapper.appendChild(form);
        panel.appendChild(formWrapper);
        
        // Add form submit handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleCompareQuery(tab.id, textarea.value.trim(), content, submitBtn);
            textarea.value = '';
        });
        
        compareContainer.appendChild(panel);
    });
    
    // Restore charts in compare view - need to regenerate from results data
    setTimeout(() => {
        historicalTabs.forEach(tab => {
            const comparePanel = document.querySelector(`.compare-panel[data-tab-id="${tab.id}"]`);
            if (comparePanel) {
                const panelContent = comparePanel.querySelector('.compare-panel-content');
                if (panelContent) {
                    // First, try to restore charts from existing canvas elements
                    const originalChatContainer = chatContainer;
                    chatContainer = panelContent;
                    restoreChartsFromTab(tab);
                    chatContainer = originalChatContainer;
                    
                    // Also regenerate charts from results data stored in messages
                    if (tab.messages && tab.messages.length > 0) {
                        tab.messages.forEach(msg => {
                            if (msg.role === 'assistant' && msg.content && msg.content.results && Array.isArray(msg.content.results) && msg.content.results.length > 0) {
                                // Find the AI message element in the panel
                                const aiMessages = panelContent.querySelectorAll('.ai-message');
                                aiMessages.forEach(aiMsg => {
                                    // Check if this message has results data attribute
                                    const resultsDataAttr = aiMsg.dataset.resultsData;
                                    if (resultsDataAttr) {
                                        try {
                                            const results = JSON.parse(resultsDataAttr);
                                            // Check if there's already a chart for this message
                                            const existingChart = aiMsg.querySelector('canvas');
                                            if (!existingChart || !Chart.getChart(existingChart)) {
                                                // Generate chart if it doesn't exist
                                                const chartHTML = generateChart(results);
                                                if (chartHTML) {
                                                    // Insert chart HTML after the results table
                                                    const resultsDiv = aiMsg.querySelector('[id^="results-"]');
                                                    if (resultsDiv && resultsDiv.nextSibling) {
                                                        const tempDiv = document.createElement('div');
                                                        tempDiv.innerHTML = chartHTML;
                                                        resultsDiv.parentNode.insertBefore(tempDiv.firstChild, resultsDiv.nextSibling);
                                                    } else if (resultsDiv) {
                                                        const tempDiv = document.createElement('div');
                                                        tempDiv.innerHTML = chartHTML;
                                                        resultsDiv.parentNode.appendChild(tempDiv.firstChild);
                                                    }
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore parsing errors
                                        }
                                    }
                                });
                            }
                        });
                    }
                }
            }
        });
        if (typeof feather !== 'undefined') feather.replace();
    }, 300);
}

// Handle query submission in compare mode
async function handleCompareQuery(tabId, query, contentContainer, submitBtn) {
    if (!query || isQueryRunning) {
        if (isQueryRunning) {
            showToast('Please wait for the current query to complete', 'info');
        }
        return;
    }
    
    if (query.length > 2000) {
        showToast('Query is too long. Maximum length is 2000 characters.', 'error');
        return;
    }
    
    // Set query running state
    isQueryRunning = true;
    updateCompareSubmitButtons(true);
    renderTabs(); // Disable tabs when query starts
    updateActionButtonsState(); // Disable Compare Mode and Templates buttons
    
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';
    }
    
    // Add user message to panel
    const userMessage = document.createElement('div');
    userMessage.className = 'chat-message user-message';
    userMessage.textContent = query;
    contentContainer.appendChild(userMessage);
    contentContainer.scrollTop = contentContainer.scrollHeight;
    
    // Save user message to tab
    const tab = tabs.find(t => t.id === tabId);
    let providerToUse = null;
    let modelToUse = null;
    
    if (tab) {
        tab.messages.push({
            role: 'user',
            content: query
        });
        
        // Use tab's stored provider/model if available, otherwise use current global
        if (tab.provider && tab.provider !== 'N/A') {
            providerToUse = tab.provider;
        }
        if (tab.model && tab.model !== 'N/A') {
            modelToUse = tab.model;
        }
        
        // Restore context for this specific tab before querying
        await restoreTabContext(tab);
    }
    
    try {
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Build request body with provider/model if specified
        const requestBody = { query, requestId };
        if (providerToUse) {
            requestBody.provider = providerToUse;
        }
        if (modelToUse) {
            requestBody.model = modelToUse;
        }
        
        // Add tabId to request body for per-tab context
        requestBody.tabId = tabId;
        
        const response = await fetch('/api/query', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Query failed');
        }
        
        const progressUI = new ProgressUIManager();
        progressUI.start(
            data.requestId,
            (result) => {
                progressUI.hideProcessingMessage();
                
                // Display results in this panel's container
                displayCompareResults(result, query, tabId, contentContainer);
                
                // Update tab's provider/model if they were used
                if (tab) {
                    if (result.stats && result.stats.provider) {
                        tab.provider = result.stats.provider;
                    }
                    if (result.stats && result.stats.model) {
                        tab.model = result.stats.model;
                    }
                    saveTabsToStorage();
                }
                
                // Re-enable buttons
                isQueryRunning = false;
                updateCompareSubmitButtons(false);
                renderTabs(); // Re-enable tabs
                updateActionButtonsState(); // Re-enable Compare Mode and Templates buttons
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit';
                }
            },
            (error) => {
                const errorMessage = document.createElement('div');
                errorMessage.className = 'chat-message ai-message error-message';
                const sanitizedError = escapeHtml(error.message || 'Query processing failed');
                errorMessage.innerHTML = `<p style="color: #dc3545;"><strong>Error:</strong> ${sanitizedError}</p>`;
                contentContainer.appendChild(errorMessage);
                contentContainer.scrollTop = contentContainer.scrollHeight;
                
                // Save error to tab
                if (tab) {
                    tab.messages.push({
                        role: 'assistant',
                        content: { error: error.message || 'Query processing failed' }
                    });
                    tab.chatHTML = contentContainer.innerHTML;
                    saveTabsToStorage();
                }
                
                // Re-enable buttons
                isQueryRunning = false;
                updateCompareSubmitButtons(false);
                renderTabs(); // Re-enable tabs
                updateActionButtonsState(); // Re-enable Compare Mode and Templates buttons
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit';
                }
            }
        );
    } catch (error) {
        const errorMessage = document.createElement('div');
        errorMessage.className = 'chat-message ai-message error-message';
        const sanitizedError = escapeHtml(error.message || 'An error occurred');
        errorMessage.innerHTML = `<p style="color: #dc3545;"><strong>Error:</strong> ${sanitizedError}</p>`;
        contentContainer.appendChild(errorMessage);
        contentContainer.scrollTop = contentContainer.scrollHeight;
        
        // Re-enable buttons
        isQueryRunning = false;
        updateCompareSubmitButtons(false);
        renderTabs(); // Re-enable tabs
        updateActionButtonsState(); // Re-enable Compare Mode and Templates buttons
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit';
        }
    }
}

// Display query results in compare mode panel
function displayCompareResults(data, userQuery, tabId, contentContainer) {
    const messageWrapper = document.createElement('div');
    messageWrapper.className = 'message-wrapper';
    
    const aiMessage = document.createElement('div');
    aiMessage.className = 'chat-message ai-message';
    
    let aiContent = '';
    
    // Performance metrics removed - now displayed in horizontal Tron HUD stats bar below AI response
    // Stats are shown via createStatsBubble() function which creates the query-stats-bar
    
    if (data.irrelevant) {
        aiContent += parseMarkdown(data.explanation);
    } else {
        if (data.explanation) {
            aiContent += `<h3>🧑‍🏫 Explainable SQL Explanation</h3><div class="markdown-content">${parseMarkdown(data.explanation)}</div>`;
        }
        if (data.sqlQuery) {
            const sqlId = `sql-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            aiContent += `<h3>Query</h3><div id="${sqlId}" class="sql-editor-container"></div>`;
            aiMessage.dataset.sqlQuery = data.sqlQuery;
            setTimeout(() => {
                if (typeof CodeMirror !== 'undefined') {
                    const editor = CodeMirror(document.getElementById(sqlId), {
                        value: data.sqlQuery,
                        mode: 'sql',
                        theme: 'dracula', // Cyberpunk dark theme
                        readOnly: true,
                        lineNumbers: true,
                        lineWrapping: true,
                        scrollbarStyle: 'null' // Hide default scrollbars
                    });
                    
                    // Auto-size to fit content
                    editor.setSize(null, 'auto');
                    
                    // Refresh after a brief delay to ensure proper rendering
                    setTimeout(() => {
                        editor.refresh();
                        // Force recalculation of scrollbars
                        const scrollElement = editor.getScrollerElement();
                        if (scrollElement.scrollHeight <= scrollElement.clientHeight) {
                            scrollElement.style.overflowY = 'hidden';
                        }
                    }, 100);
                    
                    sqlEditors.set(sqlId, editor);
                } else {
                    const container = document.getElementById(sqlId);
                    if (container) {
                        container.innerHTML = `<pre><code>${escapeHtml(data.sqlQuery)}</code></pre>`;
                    }
                }
            }, 100);
        }
        if (data.optimizations) {
            aiContent += `<h3>⚡ Query Optimization</h3><div class="markdown-content">${parseMarkdown(data.optimizations)}</div>`;
        }
        if (data.insights) {
            aiContent += `<h3>💡 AI-Driven Insights</h3><div class="markdown-content">${parseMarkdown(data.insights)}</div>`;
            // Generate insights chart right after insights section
            const insightsChartHTML = generateChartFromInsights(data.insights);
            if (insightsChartHTML) {
                aiContent += insightsChartHTML;
            }
        }
        if (data.results && data.results.length > 0) {
            const resultsId = `results-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Generate analysis tools
            const statsSummaryHTML = generateStatisticalSummary(data.results);
            const correlationMatrixHTML = generateCorrelationMatrix(data.results);
            const trendAnalysisHTML = generateTrendAnalysis(data.results);
            
            // Add analysis sections before results table
            if (statsSummaryHTML) {
                aiContent += statsSummaryHTML;
            }
            if (correlationMatrixHTML) {
                aiContent += correlationMatrixHTML;
            }
            if (trendAnalysisHTML) {
                aiContent += trendAnalysisHTML;
            }
            
            aiContent += `<h3>Results (${data.results.length} rows)</h3>`;
            aiContent += `<div id="${resultsId}">${generateResultsTable(data.results, 1, resultsId)}</div>`;
            aiMessage.dataset.resultsData = JSON.stringify(data.results);
            // Always try to generate chart from results if results are chartable
            const resultsChartHTML = generateChart(data.results);
            if (resultsChartHTML) {
                aiContent += resultsChartHTML;
            }
        } else if (data.results && data.results.length === 0) {
            aiContent += '<p><em>No results found.</em></p>';
        }
    }
    
    aiMessage.innerHTML = aiContent;
    
    // Add AI message first
    messageWrapper.appendChild(aiMessage);
    
    // Create horizontal Tron HUD stats bar and add it after the AI message
    const statsBar = createStatsBubble(data, tabId);
    if (statsBar) {
        messageWrapper.appendChild(statsBar);
    }
    
    contentContainer.appendChild(messageWrapper);
    contentContainer.scrollTop = contentContainer.scrollHeight;
    
    // Save to tab
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.messages.push({
            role: 'assistant',
            content: data
        });
        tab.chatHTML = contentContainer.innerHTML;
        tab.queryCount++;
        saveTabsToStorage();
    }
    
    setTimeout(() => {
        if (typeof feather !== 'undefined') feather.replace();
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            // Restore charts in compare mode - need to find the panel container
            if (isCompareMode) {
                const comparePanel = document.querySelector(`.compare-panel[data-tab-id="${tabId}"]`);
                if (comparePanel) {
                    const panelContent = comparePanel.querySelector('.compare-panel-content');
                    if (panelContent) {
                        // Temporarily set chatContainer to panelContent for chart restoration
                        const originalChatContainer = chatContainer;
                        chatContainer = panelContent;
                        restoreChartsFromTab(tab);
                        chatContainer = originalChatContainer;
                    }
                }
            } else {
                restoreChartsFromTab(tab);
            }
        }
    }, 200);
}

// Update all compare submit buttons state
function updateCompareSubmitButtons(disabled) {
    const allSubmitBtns = document.querySelectorAll('.compare-submit-btn');
    allSubmitBtns.forEach(btn => {
        btn.disabled = disabled;
        if (disabled) {
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
        } else {
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
        }
    });
}

// Event listeners for query form and API config toggle
if (queryForm) {
    queryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const query = queryInput.value.trim();
        if (!query) {
            showToast('Please enter a query', 'error');
            return;
        }
        
        // Validate query length
        if (query.length > 2000) {
            showToast('Query is too long. Maximum length is 2000 characters.', 'error');
            return;
        }
        
        // Query validation - check for potentially problematic patterns
        const validation = validateQuery(query);
        if (!validation.valid) {
            showToast(validation.warning || validation.error, validation.error ? 'error' : 'info');
            if (validation.error) {
                return; // Block submission on errors
            }
            // Continue with warnings
        }
        
        lastQuery = query;

        if (queryInput) queryInput.value = '';

        const resetMessage = document.getElementById('reset-message');
        if (resetMessage) {
            resetMessage.classList.add('hidden');
        }

        // Check if query is already running (in compare mode)
        if (isQueryRunning) {
            showToast('Please wait for the current query to complete', 'info');
            return;
        }
        
        // Set query running state immediately for ALL queries (not just compare mode)
        isQueryRunning = true;
        renderTabs(); // Disable tabs when query starts
        updateActionButtonsState(); // Disable Compare Mode and Templates buttons
        
        // Disable submit button immediately - get it from the form
        const submitBtn = queryForm.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Processing...';
            submitBtn.style.opacity = '0.6';
            submitBtn.style.cursor = 'not-allowed';
        }
        
        // Hide "New Query" tab immediately if it's the active tab
        const activeTabForHide = tabs.find(t => t.id === activeTabId);
        if (activeTabForHide && (activeTabForHide.title === 'New Query' || activeTabForHide.title.endsWith('...'))) {
            // Mark tab to be hidden (persists until rename completes)
            activeTabForHide._shouldHide = true;
            // Immediately hide the tab element if it exists using both class and style
            const existingTabElement = queryTabsContainer.querySelector(`[data-tab-id="${activeTabId}"]`);
            if (existingTabElement) {
                existingTabElement.classList.add('hidden-tab');
                existingTabElement.style.display = 'none';
            }
        }
        
        // Update compare mode buttons if in compare mode
        if (isCompareMode) {
            updateCompareSubmitButtons(true);
        }
        
        try {

            updateProviderButtonState(true);

            const userMessage = document.createElement('div');
            userMessage.className = 'chat-message user-message';
            userMessage.textContent = query;
            if (chatContainer) {
                chatContainer.appendChild(userMessage);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            
            // Save user message to active tab
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab) {
                activeTab.messages.push({
                    role: 'user',
                    content: query
                });
                activeTab.chatHTML = chatContainer.innerHTML;
                saveTabsToStorage();
            }

            const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Get active tab ID to maintain per-tab context (reuse activeTab from above)
            const tabId = activeTab ? activeTab.id : 'default';

            const response = await fetch('/api/query', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ query, requestId, tabId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Query failed');
            }

            const progressUI = new ProgressUIManager();
            progressUI.start(
                data.requestId,
                (result) => {
                    // Hide processing message before displaying results
                    progressUI.hideProcessingMessage();
                    
                    if (result.stats) {
                        updateQueryStats(result.stats);
                    }

                    displayQueryResults(result, query);

                    // Reset query running state (for all queries, not just compare mode)
                    isQueryRunning = false;
                    if (isCompareMode) {
                        updateCompareSubmitButtons(false);
                    }
                    renderTabs(); // Re-enable tabs
                    updateActionButtonsState(); // Re-enable Compare Mode and Templates buttons
                    
                    // Re-enable submit button - get it from the form
                    const mainSubmitBtn = queryForm ? queryForm.querySelector('button[type="submit"]') : null;
                    if (mainSubmitBtn) {
                        mainSubmitBtn.disabled = false;
                        mainSubmitBtn.textContent = 'Submit';
                        mainSubmitBtn.style.opacity = '1';
                        mainSubmitBtn.style.cursor = 'pointer';
                    }
                    if (queryInput) queryInput.focus();
                },
                (error) => {
                    // Reset query running state (for all queries, not just compare mode)
                    isQueryRunning = false;
                    if (isCompareMode) {
                        updateCompareSubmitButtons(false);
                    }
                    renderTabs(); // Re-enable tabs
                    updateActionButtonsState(); // Re-enable Compare Mode and Templates buttons
                    
                    // Re-enable submit button - get it from the form
                    const errorSubmitBtn = queryForm ? queryForm.querySelector('button[type="submit"]') : null;
                    if (errorSubmitBtn) {
                        errorSubmitBtn.disabled = false;
                        errorSubmitBtn.textContent = 'Submit';
                        errorSubmitBtn.style.opacity = '1';
                        errorSubmitBtn.style.cursor = 'pointer';
                    }
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'chat-message ai-message error-message';
                    // Sanitize error message to prevent XSS
                    const sanitizedError = escapeHtml(error.message || 'Query processing failed');
                    errorMessage.innerHTML = `<p style="color: #dc3545;"><strong>Error:</strong> ${sanitizedError}</p>`;
                    if (chatContainer) {
                        chatContainer.appendChild(errorMessage);
                        chatContainer.scrollTop = chatContainer.scrollHeight;
                    }

                    // Save error message to active tab
                    const activeTab = tabs.find(t => t.id === activeTabId);
                    if (activeTab) {
                        activeTab.messages.push({
                            role: 'assistant',
                            content: { error: error.message || 'Query processing failed' }
                        });
                        activeTab.chatHTML = chatContainer.innerHTML;
                        saveTabsToStorage();
                    }

                    // Reset query running state (for all queries, not just compare mode)
                    isQueryRunning = false;
                    if (isCompareMode) {
                        updateCompareSubmitButtons(false);
                    }
                    renderTabs(); // Re-enable tabs
                    updateActionButtonsState(); // Re-enable Compare Mode and Templates buttons
                    
                    // Re-enable submit button - get it from the form
                    const catchSubmitBtn = queryForm ? queryForm.querySelector('button[type="submit"]') : null;
                    if (catchSubmitBtn) {
                        catchSubmitBtn.disabled = false;
                        catchSubmitBtn.textContent = 'Submit';
                        catchSubmitBtn.style.opacity = '1';
                        catchSubmitBtn.style.cursor = 'pointer';
                    }
                    if (queryInput) queryInput.focus();
                }
            );

        } catch (error) {
            // Error already handled and displayed to user

            const errorMessage = document.createElement('div');
            errorMessage.className = 'chat-message ai-message error-message';
            // Sanitize error message to prevent XSS
            const sanitizedError = escapeHtml(error.message || 'An error occurred');
            errorMessage.innerHTML = `<p style="color: #dc3545;"><strong>Error:</strong> ${sanitizedError}</p>`;
            if (chatContainer) {
                chatContainer.appendChild(errorMessage);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            // Save error message to active tab
            const activeTab = tabs.find(t => t.id === activeTabId);
            if (activeTab) {
                activeTab.messages.push({
                    role: 'assistant',
                    content: { error: error.message }
                });
                activeTab.chatHTML = chatContainer.innerHTML;
                saveTabsToStorage();
            }

            // Re-enable submit button - get it from the form
            const finalSubmitBtn = queryForm ? queryForm.querySelector('button[type="submit"]') : null;
            if (finalSubmitBtn) {
                finalSubmitBtn.disabled = false;
                finalSubmitBtn.textContent = 'Submit';
                finalSubmitBtn.style.opacity = '1';
                finalSubmitBtn.style.cursor = 'pointer';
            }
            if (queryInput) queryInput.focus();

        }
    });
}

if (queryInput) {
    queryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            queryForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
    });
}

if (apiConfigToggleBtn) {
    apiConfigToggleBtn.addEventListener('click', (e) => {
        // Prevent action if not power user, in compare mode, or disabled
        if (!isPowerUser || isCompareMode || apiConfigToggleBtn.disabled || apiConfigToggleBtn.classList.contains('disabled')) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        
        // Check if drawer is currently open
        const isOpen = apiProviderStatus && apiProviderStatus.classList.contains('open');
        const isGraphic = e.target.classList.contains('drawer-toggle-icon');
        
        // If clicking the graphic when drawer is open, the graphic's handler will minimize it
        // (it stops propagation, so this handler won't run)
        // If clicking the graphic when drawer is closed, open it
        if (isGraphic && !isOpen) {
            showApiConfig();
            return;
        }
        
        // If clicking button area (not graphic) when drawer is open, minimize it
        if (!isGraphic && isOpen) {
            hideApiConfig();
            return;
        }
        
        // If clicking button area (not graphic) when drawer is closed, open it
        if (!isGraphic && !isOpen) {
            showApiConfig();
            return;
        }
    });
}

function positionDrawerToggleButton() {
    const header = document.querySelector('.app-header');
    const toggleButton = document.getElementById('api-config-toggle-btn');
    if (header && toggleButton) {
        const headerHeight = header.offsetHeight;
        // Position button at bottom of header
        toggleButton.style.top = `${headerHeight}px`; // Position directly at bottom of header
        
        // Remove inline right style - let CSS handle positioning via drawer-open class
        // CSS will position it correctly based on var(--drawer-width)
        toggleButton.style.right = '';
    }
}

// Initialize Templates Modal
function initTemplatesModal() {
    // Prevent duplicate initialization
    if (templatesModalInitialized) {
        return;
    }
    
    const templatesBtn = document.getElementById('templates-btn');
    const templatesModal = document.getElementById('templatesModal');
    const templatesCloseBtn = document.getElementById('templatesCloseBtn');
    const templatesList = document.getElementById('templates-list');
    
    if (!templatesBtn || !templatesModal) {
        // Elements not found yet, will retry on window load
        Logger.warn('Templates modal elements not found, will retry on window load');
        return;
    }
    
    // Mark as initialized
    templatesModalInitialized = true;
    
    if (templatesBtn && templatesModal) {
        // Remove any existing event listeners by cloning the button
        const newTemplatesBtn = templatesBtn.cloneNode(true);
        templatesBtn.parentNode.replaceChild(newTemplatesBtn, templatesBtn);
        const btn = document.getElementById('templates-btn');
        
        btn.addEventListener('click', (e) => {
            // Prevent action if query is running, in compare mode, or disabled
            if (isQueryRunning) {
                e.preventDefault();
                e.stopPropagation();
                showToast('Please wait for the current query to complete', 'info');
                return;
            }
            if (isCompareMode || btn.disabled || btn.classList.contains('disabled')) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            // Populate templates
            if (templatesList) {
                templatesList.innerHTML = '';
                const categories = {};
                QUERY_TEMPLATES.forEach(template => {
                    if (!categories[template.category]) {
                        categories[template.category] = [];
                    }
                    categories[template.category].push(template);
                });
                
                Object.keys(categories).forEach(category => {
                    const categoryDiv = document.createElement('div');
                    categoryDiv.className = 'template-category';
                    categoryDiv.innerHTML = `<h4>${category}</h4>`;
                    const templatesDiv = document.createElement('div');
                    templatesDiv.className = 'template-items';
                    
                    categories[category].forEach(template => {
                        const templateItem = document.createElement('div');
                        templateItem.className = 'template-item';
                        templateItem.innerHTML = `
                            <div class="template-name">${template.title}</div>
                            <div class="template-description">${template.description}</div>
                            <div class="template-query">${escapeHtml(template.query)}</div>
                            <button class="template-use-btn" data-query="${escapeHtml(template.query)}">Use Template</button>
                        `;
                        templatesDiv.appendChild(templateItem);
                    });
                    
                    categoryDiv.appendChild(templatesDiv);
                    templatesList.appendChild(categoryDiv);
                });
                
                // Attach use template buttons
                templatesList.querySelectorAll('.template-use-btn').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const query = btn.dataset.query;
                        if (!query || !queryInput || !queryForm) {
                            return;
                        }

                        // Check if current tab is "New Query" tab
                        const currentTab = tabs.find(t => t.id === activeTabId);
                        const isNewQueryTab = currentTab && currentTab.title === 'New Query';

                        // If not on "New Query" tab, switch to it first
                        if (!isNewQueryTab) {
                            const newQueryTab = tabs.find(t => t.title === 'New Query');
                            if (newQueryTab) {
                                // Switch to "New Query" tab
                                await switchToTab(newQueryTab.id);
                                // Wait a bit for the tab switch to complete and DOM to update
                                await new Promise(resolve => setTimeout(resolve, 150));
                            }
                        }

                        // Set the query value
                        queryInput.value = query;
                        templatesModal.classList.remove('show');
                        showToast('Template loaded and submitting...', 'success');
                        
                        // Small delay to ensure input is ready, then auto-submit
                        setTimeout(() => {
                            if (queryInput && queryForm) {
                                queryForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
                            }
                        }, 100);
                    });
                });
            }
            templatesModal.classList.add('show');
        });
        
        // Debug: Log that event listener was attached
        Logger.log('Templates button event listener attached');
    } else {
        console.error('Templates button or modal not found');
    }
    
    if (templatesCloseBtn && templatesModal) {
        templatesCloseBtn.addEventListener('click', () => {
            templatesModal.classList.remove('show');
        });
    }
    
    if (templatesModal) {
        templatesModal.addEventListener('click', (e) => {
            if (e.target === templatesModal) {
                templatesModal.classList.remove('show');
            }
        });
    }
}


// Initialize Query Suggestions

window.addEventListener('load', () => {
    positionDrawerToggleButton();
    // Initialize Feather icons
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
    // Re-initialize templates modal in case DOM wasn't ready earlier
    initTemplatesModal();
});

// Auto-hide drawer and disable button on small screens (responsive behavior)
function handleResponsiveDrawer() {
    const breakpoint = 900; // pixels
    const windowWidth = window.innerWidth;
    const isSmallScreen = windowWidth < breakpoint;
    
    // Disable/enable the button based on screen size
    if (apiConfigToggleBtn) {
        if (isSmallScreen) {
            // Disable button on small screens
            apiConfigToggleBtn.disabled = true;
            apiConfigToggleBtn.classList.add('disabled');
            apiConfigToggleBtn.style.opacity = '0.5';
            apiConfigToggleBtn.style.cursor = 'not-allowed';
        } else {
            // Enable button on larger screens
            apiConfigToggleBtn.disabled = false;
            apiConfigToggleBtn.classList.remove('disabled');
            apiConfigToggleBtn.style.opacity = '1';
            apiConfigToggleBtn.style.cursor = 'pointer';
        }
    }
    
    // If window is too narrow and drawer is open, close it
    if (isSmallScreen) {
        const isDrawerOpen = apiProviderStatus && apiProviderStatus.classList.contains('open');
        if (isDrawerOpen) {
            hideApiConfig();
        }
    }
}

// Add resize listener for responsive drawer behavior
window.addEventListener('resize', () => {
    handleResponsiveDrawer();
    positionDrawerToggleButton(); // Also update button position on resize
});

// Check on initial load
handleResponsiveDrawer();
positionDrawerToggleButton(); // Position button on initial load

// Use ResizeObserver to update button position when drawer width changes
// Note: CSS now handles positioning via drawer-open class and var(--drawer-width)
// This observer is kept for potential future dynamic width adjustments
if (typeof ResizeObserver !== 'undefined' && apiProviderStatus) {
    const drawerResizeObserver = new ResizeObserver(() => {
        // CSS handles positioning automatically via drawer-open class
        // No inline style manipulation needed
    });
    drawerResizeObserver.observe(apiProviderStatus);
}

// Collapse button removed - minimize action now on ai_settings-min.svg graphic

// Compare Mode Button Event Listener
const compareModeBtn = document.getElementById('compare-mode-btn');
if (compareModeBtn) {
    compareModeBtn.addEventListener('click', () => {
        // Prevent action if query is running
        if (isQueryRunning) {
            showToast('Please wait for the current query to complete', 'info');
            return;
        }
        if (isCompareMode) {
            exitCompareMode();
        } else {
            enterCompareMode();
        }
    });
}

// Dark Mode Functionality
function initDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    
    // Apply saved theme
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        updateDarkModeIcon(true);
    } else {
        document.body.classList.remove('dark-mode');
        updateDarkModeIcon(false);
    }
    
    // Toggle dark mode
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            const isDark = document.body.classList.toggle('dark-mode');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            updateDarkModeIcon(isDark);
            // Re-initialize icons after theme change
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        });
    }
}

function updateDarkModeIcon(isDark) {
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
        darkModeToggle.innerHTML = isDark ? '<i data-feather="sun"></i>' : '<i data-feather="moon"></i>';
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }
}

// Initialize dark mode on page load
initDarkMode();

// Re-initialize icons after dynamic content changes
function reinitializeIcons() {
    if (typeof feather !== 'undefined') {
        setTimeout(() => feather.replace(), 100);
    }
}

// History Search Functionality - REMOVED (search button removed per user request)