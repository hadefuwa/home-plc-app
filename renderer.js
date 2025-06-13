const { ipcRenderer } = require('electron');

// Declare tables in global scope
let controlsTable, digitalInputsTable, digitalOutputsTable, analogTable, statsTable;

// Add status to global scope - change to let
let statusElement;

// Move editValue function to global scope
function editValue(tag) {
    const modal = document.getElementById('editModal');
    const input = document.getElementById('editInput');
    const label = document.getElementById('editLabel');
    const saveBtn = document.getElementById('editSave');
    const cancelBtn = document.getElementById('editCancel');

    label.textContent = `Enter new value for ${tag.description}:`;
    input.value = tag.value;
    modal.classList.add('show');

    const handleSave = () => {
        const newValue = input.value;
        modal.classList.remove('show');
        
        ipcRenderer.invoke('write-plc', tag.address, newValue)
            .then(() => {
                statusElement.textContent = 'Value written successfully';
                statusElement.style.backgroundColor = '#dff0d8';
            })
            .catch(error => {
                statusElement.textContent = `Error: ${error}`;
                statusElement.style.backgroundColor = '#f2dede';
            });
        
        cleanup();
    };

    const handleCancel = () => {
        modal.classList.remove('show');
        cleanup();
    };

    const cleanup = () => {
        saveBtn.removeEventListener('click', handleSave);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', handleCancel);
}

// Wait for DOM to be fully loaded before running any code
document.addEventListener('DOMContentLoaded', () => {
    // Get all DOM elements we need
    statusElement = document.getElementById('status');  // Assign to our global variable
    const toggleSettings = document.getElementById('toggleSettings');
    const settingsModal = document.getElementById('settingsModal');
    const ipInput = document.getElementById('plcIpAddress');
    const connectBtn = document.getElementById('connectBtn');
    const editModal = document.getElementById('editModal');
    const editInput = document.getElementById('editInput');

    // Initialize draggable modals
    const settingsDragHandler = makeDraggable(settingsModal);
    const editDragHandler = makeDraggable(editModal);

    // Initialize tables
    controlsTable = new Tabulator("#controlsGrid", {
        height: "auto",
        layout: "fitColumns",
        columns: getControlsColumns(),
        data: [],
        placeholder: "No Controls Available",
        headerVisible: true,
        columnHeaderVertAlign: "middle",
        columnHeaderSortMulti: false
    });

    digitalInputsTable = new Tabulator("#digitalInputsGrid", {
        height: "auto",
        layout: "fitColumns",
        columns: getIOColumns(),
        data: [],
        placeholder: "No Digital Inputs Available",
        headerVisible: true,
        columnHeaderVertAlign: "middle",
        columnHeaderSortMulti: false
    });

    digitalOutputsTable = new Tabulator("#digitalOutputsGrid", {
        height: "auto",
        layout: "fitColumns",
        columns: getIOColumns(),
        data: [],
        placeholder: "No Digital Outputs Available",
        headerVisible: true,
        columnHeaderVertAlign: "middle",
        columnHeaderSortMulti: false
    });

    analogTable = new Tabulator("#analogGrid", {
        height: "auto",
        layout: "fitColumns",
        columns: getAnalogColumns(),
        data: [],
        placeholder: "No Analog I/O Available",
        headerVisible: true,
        columnHeaderVertAlign: "middle",
        columnHeaderSortMulti: false
    });

    statsTable = new Tabulator("#statsGrid", {
        height: "auto",
        layout: "fitColumns",
        columns: getStatsColumns(),
        data: [],
        placeholder: "No Statistics Available",
        headerVisible: true,
        columnHeaderVertAlign: "middle",
        columnHeaderSortMulti: false
    });

    // Event listeners
    ipcRenderer.on('plc-values-updated', (event, tags) => {
        updateTables(tags);
    });

    // Add listener for connection status updates
    ipcRenderer.on('connection-status', (event, data) => {
        console.log('Connection status update:', data);
        if (data.connected) {
            lastKnownGoodIp = ipInput.value; // Save successful IP
            statusElement.textContent = 'Connected to PLC';
            statusElement.className = '';
            statusElement.style.backgroundColor = '#dff0d8';
            statusElement.style.color = 'var(--text-primary)';
            statusElement.style.border = '1px solid rgba(40, 167, 69, 0.3)';
            connectBtn.disabled = true;
        } else {
            statusElement.textContent = data.error;
            statusElement.className = '';
            statusElement.style.backgroundColor = 'rgba(220, 53, 69, 0.2)';
            statusElement.style.color = 'var(--text-primary)';
            statusElement.style.border = '1px solid rgba(220, 53, 69, 0.3)';
            connectBtn.disabled = false;
        }
    });

    // Add listener for auto-connect results
    ipcRenderer.on('auto-connect-result', (event, data) => {
        if (data.success) {
            statusElement.textContent = data.message;
            statusElement.style.backgroundColor = '#dff0d8';
            connectBtn.disabled = true;
            ipInput.value = '192.168.0.99';
            lastKnownGoodIp = '192.168.0.99';
        } else {
            statusElement.textContent = data.message;
            statusElement.style.backgroundColor = '#f2dede';
            connectBtn.disabled = false;
        }
    });

    // Add this timeout helper function at the top
    function timeout(ms) {
        return new Promise((_, reject) => setTimeout(() => reject(new Error('Connection timeout')), ms));
    }

    // Update the connect button handler
    connectBtn.addEventListener('click', async () => {
        const ipAddress = ipInput.value;
        if (!ipAddress) {
            statusElement.textContent = 'Please enter an IP address';
            statusElement.className = '';
            statusElement.style.backgroundColor = 'rgba(220, 53, 69, 0.2)';
            statusElement.style.color = 'var(--text-primary)';
            statusElement.style.border = '1px solid rgba(220, 53, 69, 0.3)';
            return;
        }
        
        connectBtn.disabled = true;
        statusElement.textContent = 'Connecting...';
        statusElement.className = '';
        statusElement.style.backgroundColor = '#fff3cd'; // Yellow while connecting
        statusElement.style.color = 'var(--text-primary)';
        statusElement.style.border = '1px solid #ffeeba';
        
        try {
            // Race between connection attempt and timeout
            const result = await Promise.race([
                ipcRenderer.invoke('connect-plc', ipAddress),
                timeout(5000) // 5 second timeout
            ]);

            statusElement.textContent = result;
            statusElement.className = '';
            statusElement.style.backgroundColor = '#dff0d8';
            statusElement.style.color = 'var(--text-primary)';
            statusElement.style.border = '1px solid rgba(40, 167, 69, 0.3)';
            settingsModal.classList.remove('show');
            const modalContent = settingsModal.querySelector('.modal-content');
            modalContent.style.transform = 'translate(-50%, -50%)';
            
            // Only try to refresh tags if connection was successful
            const tags = await ipcRenderer.invoke('get-plc-tags');
            updateTables(tags);
        } catch (error) {
            let errorMessage = error.message;
            if (error.message === 'Connection timeout') {
                errorMessage = `Failed to connect to ${ipAddress} (timeout)`;
            }
            statusElement.textContent = `Error: ${errorMessage}`;
            statusElement.className = '';
            statusElement.style.backgroundColor = 'rgba(220, 53, 69, 0.2)';
            statusElement.style.color = 'var(--text-primary)';
            statusElement.style.border = '1px solid rgba(220, 53, 69, 0.3)';
            connectBtn.disabled = false;
            
            // Clear any existing connection
            try {
                await ipcRenderer.invoke('disconnect-plc');
            } catch (disconnectError) {
                console.error('Error during disconnect:', disconnectError);
            }
        }
    });

    // Add a disconnect handler
    ipcRenderer.on('disconnect-complete', () => {
        statusElement.textContent = 'Disconnected from PLC';
        statusElement.style.backgroundColor = '#f8d7da';
        connectBtn.disabled = false;
    });

    // Update the settings toggle handler
    toggleSettings.addEventListener('click', async () => {
        settingsModal.classList.add('show');
        const modalContent = settingsModal.querySelector('.modal-content');
        modalContent.style.transform = 'translate(-50%, -50%)';
        connectBtn.disabled = false;
        
        // Try to disconnect existing connection
        try {
            await ipcRenderer.invoke('disconnect-plc');
        } catch (error) {
            console.error('Error during disconnect:', error);
        }
        
        setTimeout(() => {
            ipInput.focus();
        }, 100);
    });

    // Add click handlers for modal close buttons
    document.getElementById('settingsCancel').addEventListener('click', () => {
        settingsModal.classList.remove('show');
        const modalContent = settingsModal.querySelector('.modal-content');
        modalContent.style.transform = 'translate(-50%, -50%)';
    });

    document.getElementById('editCancel').addEventListener('click', () => {
        editModal.classList.remove('show');
        const modalContent = editModal.querySelector('.modal-content');
        modalContent.style.transform = 'translate(-50%, -50%)';
    });

    // Close modals when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('show');
            const modalContent = settingsModal.querySelector('.modal-content');
            modalContent.style.transform = 'translate(-50%, -50%)';
        }
        if (e.target === editModal) {
            editModal.classList.remove('show');
            const modalContent = editModal.querySelector('.modal-content');
            modalContent.style.transform = 'translate(-50%, -50%)';
        }
    });

    // Edit modal handlers
    document.getElementById('editSave').addEventListener('click', () => {
        editModal.classList.remove('show');
        const modalContent = editModal.querySelector('.modal-content');
        modalContent.style.transform = 'translate(-50%, -50%)';
    });

    // Setup numeric keypads
    const ipKeypad = document.querySelector('#settingsModal .numeric-keypad');
    const editKeypad = document.querySelector('#editModal .numeric-keypad');
    
    setupNumericKeypad(ipKeypad, ipInput);
    setupNumericKeypad(editKeypad, editInput);

    // Initial load of PLC tags
    ipcRenderer.invoke('get-plc-tags').then(tags => {
        updateTables(tags);
    });
});

// Helper function for numeric keypad
function setupNumericKeypad(keypadElement, inputElement) {
    if (!keypadElement || !inputElement) return;

    keypadElement.addEventListener('click', (e) => {
        if (!e.target.classList.contains('num-key')) return;
        
        const key = e.target.textContent;
        const currentValue = inputElement.value;
        
        if (key === '⌫') {
            inputElement.value = currentValue.slice(0, -1);
        } else {
            // Special handling for IP address input
            if (inputElement.id === 'plcIpAddress') {
                // Allow up to 3 dots in IP address
                if (key === '.') {
                    const dotCount = (currentValue.match(/\./g) || []).length;
                    if (dotCount < 3) {
                        // Only add dot if previous character is a number
                        if (currentValue.length > 0 && !isNaN(currentValue[currentValue.length - 1])) {
                            inputElement.value = currentValue + key;
                        }
                    }
                } else {
                    // For numbers, check if we're in a valid position
                    const parts = currentValue.split('.');
                    const currentPart = parts[parts.length - 1];
                    
                    // Only allow 3 digits per octet
                    if (currentPart.length < 3) {
                        inputElement.value = currentValue + key;
                    }
                }
            } else {
                // Original handling for other numeric inputs
                if (key === '.' && currentValue.includes('.')) {
                    return;
                }
                if (currentValue.length < 15) {
                    inputElement.value = currentValue + key;
                }
            }
        }
    });
}

// Add this new function to handle forcing
async function handleForce(address, forceValue) {
    try {
        // Get the base address (remove .0 from the end)
        const baseAddr = address.substring(0, address.lastIndexOf('.'));
        
        // Set ForcedState (X.1) to true
        await ipcRenderer.invoke('write-plc', `${baseAddr}.1`, true);
        
        // Set ForcedStatus (X.2) to the force value
        await ipcRenderer.invoke('write-plc', `${baseAddr}.2`, forceValue);
        
        statusElement.textContent = 'Force applied successfully';
        statusElement.style.backgroundColor = '#dff0d8';
    } catch (error) {
        statusElement.textContent = `Error applying force: ${error}`;
        statusElement.style.backgroundColor = '#f2dede';
    }
}

// Add this new function to handle force reset
async function handleForceReset(address) {
    try {
        // Get the base address (remove .0 from the end)
        const baseAddr = address.substring(0, address.lastIndexOf('.'));
        
        // Reset ForcedState (X.1) to false
        await ipcRenderer.invoke('write-plc', `${baseAddr}.1`, false);
        
        // Reset ForcedStatus (X.2) to false
        await ipcRenderer.invoke('write-plc', `${baseAddr}.2`, false);
        
        statusElement.textContent = 'Force reset successful';
        statusElement.style.backgroundColor = '#dff0d8';
    } catch (error) {
        statusElement.textContent = `Error resetting force: ${error}`;
        statusElement.style.backgroundColor = '#f2dede';
    }
}

// Add these formatter functions
function valueFormatter(cell) {
    const data = cell.getRow().getData();
    const value = cell.getValue();
    const type = data.type;
    const element = cell.getElement();
    
    // Clear any existing classes first
    element.classList.remove('bool-true', 'bool-false');
    
    if (type === 'BOOL') {
        element.style.fontWeight = 'bold';
        
        // Create a span to hold the text with proper color
        const valueSpan = document.createElement('span');
        valueSpan.style.fontWeight = 'bold';
        
        // Check if the tag is being forced
        if (data.forcedState?.value === true) {
            const forcedValue = data.forcedStatus?.value;
            valueSpan.classList.add(forcedValue ? 'bool-true' : 'bool-false');
            valueSpan.textContent = `${value ? 'TRUE' : 'FALSE'} (Forced ${forcedValue ? 'ON' : 'OFF'})`;
        } else {
            valueSpan.classList.add(value ? 'bool-true' : 'bool-false');
            valueSpan.textContent = value ? 'TRUE' : 'FALSE';
        }
        
        // Clear the cell and append the span
        element.innerHTML = '';
        element.appendChild(valueSpan);
        
        return "";  // Return empty as we've manually set the content
    } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            element.style.fontWeight = 'bold';
            
            // Create a span for numeric values
            const valueSpan = document.createElement('span');
            valueSpan.classList.add(numValue > 0 ? 'bool-true' : 'bool-false');
            
            // Show integers for Forced Count
            if (data.description.includes('Forced Count')) {
                valueSpan.textContent = Math.round(numValue).toString();
            } else {
                valueSpan.textContent = numValue.toFixed(2);
            }
            
            // Clear the cell and append the span
            element.innerHTML = '';
            element.appendChild(valueSpan);
            
            return "";  // Return empty as we've manually set the content
        }
        return value;
    }
}

function momentaryButtonFormatter(cell) {
    const data = cell.getRow().getData();
    const button = document.createElement('button');
    button.className = 'momentary-btn';
    button.textContent = 'On';
    button.dataset.address = data.address;
    
    // Add event listeners when the button is created
    button.addEventListener('mousedown', async () => {
        button.classList.add('pressed');
        try {
            await ipcRenderer.invoke('write-plc', data.address, true);
            statusElement.textContent = 'Button pressed';
            statusElement.style.backgroundColor = '#dff0d8';
        } catch (error) {
            statusElement.textContent = `Error pressing button: ${error}`;
            statusElement.style.backgroundColor = '#f2dede';
            button.classList.remove('pressed');
        }
    });

    const handleRelease = async () => {
        button.classList.remove('pressed');
        try {
            await ipcRenderer.invoke('write-plc', data.address, false);
        } catch (error) {
            statusElement.textContent = `Error releasing button: ${error}`;
            statusElement.style.backgroundColor = '#f2dede';
        }
    };

    button.addEventListener('mouseup', handleRelease);
    button.addEventListener('mouseleave', handleRelease);
    
    return button;
}

function forceButtonFormatter(cell) {
    return `
        <button class="force-btn force-on">Force On</button>
        <button class="force-btn force-off">Force Off</button>
        <button class="force-btn force-reset">Reset</button>
    `;
}

function editButtonFormatter(cell) {
    return '<button class="edit-btn">Edit</button>';
}

// Simplify handleMomentaryClick since we're handling events in the formatter
function handleMomentaryClick(e, cell) {
    // No need for additional handling as events are set up in formatter
    return;
}

function handleForceClick(e, cell) {
    const data = cell.getRow().getData();
    if (e.target.classList.contains('force-on')) {
        handleForce(data.address, true);
    } else if (e.target.classList.contains('force-off')) {
        handleForce(data.address, false);
    } else if (e.target.classList.contains('force-reset')) {
        handleForceReset(data.address);
    }
}

function handleEditClick(e, cell) {
    if (e.target.classList.contains('edit-btn')) {
        editValue(cell.getRow().getData());
    }
}

// Column definitions
function getControlsColumns() {
    return [
        { title: "Description", field: "description", sorter: "string", widthGrow: 3, headerSort: false, cssClass: "custom-cell" },
        { title: "Address", field: "address", sorter: "string", widthGrow: 2, headerSort: false, cssClass: "custom-cell" },
        { 
            title: "Value", 
            field: "value", 
            widthGrow: 2, 
            headerSort: false,
            cssClass: "custom-cell",
            formatter: function(cell) {
                const value = cell.getValue();
                const type = cell.getRow().getData().type;
                
                if (type === 'BOOL') {
                    const element = document.createElement('span');
                    element.style.fontWeight = 'bold';
                    element.style.color = value ? '#4cd964' : '#ff6b6b';
                    element.textContent = value ? 'TRUE' : 'FALSE';
                    return element;
                }
                
                return value;
            }
        },
        { title: "Type", field: "type", sorter: "string", widthGrow: 1, headerSort: false, cssClass: "custom-cell" },
        {
            title: "Action",
            formatter: momentaryButtonFormatter,
            cellClick: handleMomentaryClick,
            widthGrow: 3,
            minWidth: 100,
            hozAlign: "center",
            headerSort: false,
            cssClass: "custom-cell"
        }
    ];
}

function getIOColumns() {
    return [
        { title: "Description", field: "description", sorter: "string", widthGrow: 3, headerSort: false, cssClass: "custom-cell" },
        { title: "Address", field: "address", sorter: "string", widthGrow: 2, headerSort: false, cssClass: "custom-cell" },
        { 
            title: "Value", 
            field: "value", 
            widthGrow: 2, 
            headerSort: false,
            cssClass: "custom-cell",
            formatter: function(cell) {
                const value = cell.getValue();
                const type = cell.getRow().getData().type;
                
                if (type === 'BOOL') {
                    const element = document.createElement('span');
                    element.style.fontWeight = 'bold';
                    element.style.color = value ? '#4cd964' : '#ff6b6b';
                    element.textContent = value ? 'TRUE' : 'FALSE';
                    return element;
                }
                
                return value;
            }
        },
        { title: "Type", field: "type", sorter: "string", widthGrow: 1, headerSort: false, cssClass: "custom-cell" },
        {
            title: "Action",
            formatter: forceButtonFormatter,
            cellClick: handleForceClick,
            widthGrow: 8,
            minWidth: 300,
            hozAlign: "center",
            headerSort: false,
            cssClass: "custom-cell"
        }
    ];
}

function getAnalogColumns() {
    return [
        { title: "Description", field: "description", sorter: "string", widthGrow: 3, headerSort: false, cssClass: "custom-cell" },
        { title: "Address", field: "address", sorter: "string", widthGrow: 2, headerSort: false, cssClass: "custom-cell" },
        { 
            title: "Value", 
            field: "value", 
            widthGrow: 2, 
            headerSort: false,
            cssClass: "custom-cell",
            formatter: function(cell) {
                const value = cell.getValue();
                const type = cell.getRow().getData().type;
                
                if (type === 'BOOL') {
                    const element = document.createElement('span');
                    element.style.fontWeight = 'bold';
                    element.style.color = value ? '#4cd964' : '#ff6b6b';
                    element.textContent = value ? 'TRUE' : 'FALSE';
                    return element;
                } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        const element = document.createElement('span');
                        element.style.fontWeight = 'bold';
                        element.style.color = numValue > 0 ? '#4cd964' : '#ff6b6b';
                        element.textContent = numValue.toFixed(2);
                        return element;
                    }
                }
                
                return value;
            }
        },
        { title: "Type", field: "type", sorter: "string", widthGrow: 1, headerSort: false, cssClass: "custom-cell" },
        {
            title: "Action",
            formatter: function(cell) {
                const data = cell.getRow().getData();
                // Only show edit button for scalar and offset values
                if (data.description.includes('Scalar') || data.description.includes('Offset')) {
                    return editButtonFormatter(cell);
                }
                return ''; // Return empty string for other rows
            },
            cellClick: handleEditClick,
            widthGrow: 2,
            minWidth: 100,
            hozAlign: "center",
            headerSort: false,
            cssClass: "custom-cell"
        }
    ];
}

function getStatsColumns() {
    return [
        { title: "Description", field: "description", sorter: "string", widthGrow: 3, headerSort: false, cssClass: "custom-cell" },
        { title: "Address", field: "address", sorter: "string", widthGrow: 2, headerSort: false, cssClass: "custom-cell" },
        { 
            title: "Value", 
            field: "value", 
            widthGrow: 2, 
            headerSort: false,
            cssClass: "custom-cell",
            formatter: function(cell) {
                const value = cell.getValue();
                const type = cell.getRow().getData().type;
                
                if (type === 'BOOL') {
                    const element = document.createElement('span');
                    element.style.fontWeight = 'bold';
                    element.style.color = value ? '#4cd964' : '#ff6b6b';
                    element.textContent = value ? 'TRUE' : 'FALSE';
                    return element;
                } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                        const element = document.createElement('span');
                        element.style.fontWeight = 'bold';
                        element.style.color = numValue > 0 ? '#4cd964' : '#ff6b6b';
                        element.textContent = numValue.toFixed(0);
                        return element;
                    }
                }
                
                return value;
            }
        },
        { title: "Type", field: "type", sorter: "string", widthGrow: 1, headerSort: false, cssClass: "custom-cell" }
    ];
}

// Update function to sort tags into appropriate tables
function updateTables(tags) {
    const controls = tags.filter(tag => 
        tag.description.includes('Clear Forcing') || 
        tag.description.includes('Fault Reset')
    );
    
    const digitalInputs = tags.filter(tag => 
        tag.description.includes('Digital Input') && 
        tag.type === 'BOOL'
    );
    
    const digitalOutputs = tags.filter(tag => 
        tag.description.includes('Digital Output') && 
        tag.type === 'BOOL'
    );
    
    const analogs = tags.filter(tag => 
        (tag.description.includes('AI') || 
        tag.type === 'INT' || 
        tag.type === 'REAL') &&
        !tag.description.includes('Forced Count')  // Exclude Forced Count
    );
    
    const stats = tags.filter(tag => 
        tag.description.includes('Forcing Active') || 
        tag.description.includes('Forced Count')
    );

    controlsTable.replaceData(controls);
    digitalInputsTable.replaceData(digitalInputs);
    digitalOutputsTable.replaceData(digitalOutputs);
    analogTable.replaceData(analogs);
    statsTable.replaceData(stats);
}

// Add after your DOMContentLoaded event listener
function makeDraggable(modalElement) {
    const dragHandle = modalElement.querySelector('.modal-drag-handle');
    const modalContent = modalElement.querySelector('.modal-content');
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    function dragStart(e) {
        if (e.type === "touchstart") {
            initialX = e.touches[0].clientX - xOffset;
            initialY = e.touches[0].clientY - yOffset;
        } else {
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;
        }

        if (e.target === dragHandle) {
            isDragging = true;
            modalContent.classList.add('dragging');
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault();

            if (e.type === "touchmove") {
                currentX = e.touches[0].clientX - initialX;
                currentY = e.touches[0].clientY - initialY;
            } else {
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;
            }

            xOffset = currentX;
            yOffset = currentY;

            setTranslate(currentX, currentY, modalContent);
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        modalContent.classList.remove('dragging');
    }

    function setTranslate(xPos, yPos, el) {
        el.style.transform = `translate3d(${xPos}px, ${yPos}px, 0)`;
    }

    // Add event listeners
    dragHandle.addEventListener("mousedown", dragStart);
    dragHandle.addEventListener("touchstart", dragStart);
    document.addEventListener("mousemove", drag);
    document.addEventListener("touchmove", drag);
    document.addEventListener("mouseup", dragEnd);
    document.addEventListener("touchend", dragEnd);

    // Return cleanup function
    return function cleanup() {
        dragHandle.removeEventListener("mousedown", dragStart);
        dragHandle.removeEventListener("touchstart", dragStart);
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("touchmove", drag);
        document.removeEventListener("mouseup", dragEnd);
        document.removeEventListener("touchend", dragEnd);
    };
}

// Add this at the top with other global variables
let lastKnownGoodIp = '192.168.0.99';

// Dark mode functionality
function initializeDarkMode() {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Check for saved theme preference or use system preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.body.dataset.theme = savedTheme;
        updateDarkModeButton(savedTheme === 'dark');
    } else if (prefersDarkScheme.matches) {
        document.body.dataset.theme = 'dark';
        updateDarkModeButton(true);
    }

    // Toggle dark mode
    darkModeToggle.addEventListener('click', () => {
        const isDark = document.body.dataset.theme === 'dark';
        document.body.dataset.theme = isDark ? 'light' : 'dark';
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
        updateDarkModeButton(!isDark);
    });
}

function updateDarkModeButton(isDark) {
    const darkModeToggle = document.getElementById('darkModeToggle');
    const modeText = darkModeToggle.querySelector('.mode-text');
    modeText.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
}

// Initialize dark mode when the document is ready
document.addEventListener('DOMContentLoaded', initializeDarkMode); 