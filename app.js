 // Global variables
let stockData = [];
let dataTable;

// DOM elements
const loadingSpinner = document.getElementById('loadingSpinner');
const errorMessage = document.getElementById('errorMessage');
const tableContainer = document.querySelector('.table-container');
const sectorFilter = document.getElementById('sectorFilter');
const recommendationFilter = document.getElementById('recommendationFilter');
const confidenceRange = document.getElementById('confidenceRange');
const confidenceValue = document.getElementById('confidenceValue');
const clearFiltersBtn = document.getElementById('clearFilters');

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    loadStockData();
    setupEventListeners();
});

// Load stock data from CSV
async function loadStockData() {
    try {
        showLoading();
        
        // Try to load the CSV file
        const response = await fetch('stock_recommendations.csv');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const csvData = await response.text();
        
        // Parse CSV using PapaParse
        Papa.parse(csvData, {
            header: true,
            skipEmptyLines: true,
            complete: async function(results) {
                if (results.errors.length > 0) {
                    console.error('CSV parsing errors:', results.errors);
                }
                
                stockData = results.data.filter(row => 
                    row['Stock Symbol'] && row['Stock Symbol'].trim() !== ''
                );
                
                if (stockData.length === 0) {
                    throw new Error('No valid stock data found in CSV');
                }
                
                hideLoading();
                initializeTable();
                populateFilters();
                updateStatistics();
                await updateLastUpdated();
            },
            error: function(error) {
                throw new Error('Failed to parse CSV: ' + error.message);
            }
        });
        
    } catch (error) {
        console.error('Error loading stock data:', error);
        showError('Failed to load stock data. Please ensure stock_recommendations.csv exists and is properly formatted.');
    }
}

// Show loading state
function showLoading() {
    loadingSpinner.classList.remove('d-none');
    tableContainer.style.display = 'none';
    errorMessage.classList.add('d-none');
}

// Hide loading state
function hideLoading() {
    loadingSpinner.classList.add('d-none');
    tableContainer.style.display = 'block';
}

// Show error message
function showError(message) {
    loadingSpinner.classList.add('d-none');
    tableContainer.style.display = 'none';
    errorMessage.textContent = message;
    errorMessage.classList.remove('d-none');
}

// Initialize DataTable
function initializeTable() {
    // Prepare data for DataTable
    const tableData = stockData.map(row => {
        const currentPrice = parseFloat(row['Current Price (AU$)']) || 0;
        const highPrice = parseFloat(row['Predicted High Price in a Year']) || 0;
        const lowPrice = parseFloat(row['Predicted Low Price in a Year']) || 0;
        
        // Calculate average target price
        let avgTargetPrice = 0;
        if (highPrice > 0 && lowPrice > 0) {
            avgTargetPrice = (highPrice + lowPrice) / 2;
        } else if (highPrice > 0) {
            avgTargetPrice = highPrice;
        } else if (lowPrice > 0) {
            avgTargetPrice = lowPrice;
        }
        
        // Calculate price potential (delta)
        let pricePotential = 0;
        let pricePotentialPercent = 0;
        if (currentPrice > 0 && avgTargetPrice > 0) {
            pricePotential = avgTargetPrice - currentPrice;
            pricePotentialPercent = (pricePotential / currentPrice) * 100;
        }
        
        return [
            row['Stock Symbol'] || '',
            row['Sector'] || '',
            row['Recommendation'] || '',
            parseFloat(row['Confidence Level (%)']) || 0,
            currentPrice,
            avgTargetPrice,
            pricePotentialPercent, // Store the percentage for sorting
            '' // Actions column
        ];
    });

    // Initialize DataTable
    dataTable = $('#stockTable').DataTable({
        data: tableData,
        pageLength: 25,
        order: [[3, 'desc']], // Sort by confidence by default
        responsive: true,
        language: {
            search: "Search stocks:",
            lengthMenu: "Show _MENU_ stocks per page",
            info: "Showing _START_ to _END_ of _TOTAL_ stocks",
            paginate: {
                first: "First",
                last: "Last",
                next: "Next",
                previous: "Previous"
            }
        },
        columnDefs: [
            {
                targets: 0, // Symbol column
                render: function(data, type, row) {
                    if (type === 'display') {
                        return `<strong class="text-primary">${data}</strong>`;
                    }
                    return data;
                }
            },
            {
                targets: 1, // Sector column
                render: function(data, type, row) {
                    if (type === 'display') {
                        const icon = getSectorIcon(data);
                        return `${icon} ${data}`;
                    }
                    return data;
                }
            },
            {
                targets: 2, // Recommendation column
                render: function(data, type, row) {
                    if (type === 'display') {
                        return getRecommendationBadge(data);
                    }
                    return data;
                }
            },
            {
                targets: 3, // Confidence column
                render: function(data, type, row) {
                    if (type === 'display') {
                        return getConfidenceBar(data);
                    }
                    return data;
                }
            },
            {
                targets: 4, // Current Price column
                render: function(data, type, row) {
                    if (type === 'display') {
                        if (data && data > 0) {
                            return `<span class="price-current">$${data.toFixed(2)}</span>`;
                        }
                        return '<span class="text-muted">N/A</span>';
                    }
                    return data;
                }
            },
            {
                targets: 5, // Average Target Price column
                render: function(data, type, row) {
                    if (type === 'display') {
                        if (data && data > 0) {
                            return `<span class="price-target price-avg">$${data.toFixed(2)}</span>`;
                        }
                        return '<span class="text-muted">N/A</span>';
                    }
                    return data;
                }
            },
            {
                targets: 6, // Price Potential column
                render: function(data, type, row) {
                    if (type === 'display') {
                        if (data !== 0) {
                            const isPositive = data > 0;
                            const colorClass = isPositive ? 'text-success' : 'text-danger';
                            const icon = isPositive ? '<i class="fas fa-arrow-up me-1"></i>' : '<i class="fas fa-arrow-down me-1"></i>';
                            return `<span class="${colorClass} fw-bold">${icon}${Math.abs(data).toFixed(1)}%</span>`;
                        }
                        return '<span class="text-muted">N/A</span>';
                    }
                    return data;
                }
            },
            {
                targets: 7, // Actions column
                orderable: false,
                render: function(data, type, row) {
                    if (type === 'display') {
                        return `
                            <button class="btn btn-primary-gradient btn-action" onclick="showStockDetails('${row[0]}')">
                                <i class="fas fa-info-circle me-1"></i>Details
                            </button>
                        `;
                    }
                    return '';
                }
            }
        ],
        drawCallback: function() {
            // Add fade-in animation to new rows
            $(this.api().table().body()).find('tr').addClass('fade-in');
        }
    });

    // Custom filtering
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        return applyCustomFilters(data);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Filter change events
    sectorFilter.addEventListener('change', applyFilters);
    recommendationFilter.addEventListener('change', applyFilters);
    confidenceRange.addEventListener('input', updateConfidenceValue);
    confidenceRange.addEventListener('change', applyFilters);
    
    // Clear filters button
    clearFiltersBtn.addEventListener('click', clearAllFilters);
}

// Apply custom filters
function applyCustomFilters(data) {
    const sector = sectorFilter.value;
    const recommendation = recommendationFilter.value;
    const minConfidence = parseInt(confidenceRange.value);
    
    // Check sector filter
    if (sector && data[1] !== sector) {
        return false;
    }
    
    // Check recommendation filter
    if (recommendation && data[2] !== recommendation) {
        return false;
    }
    
    // Check confidence filter
    const confidence = parseFloat(data[3]);
    if (confidence < minConfidence) {
        return false;
    }
    
    return true;
}

// Apply all filters
function applyFilters() {
    if (dataTable) {
        dataTable.draw();
    }
}

// Update confidence value display
function updateConfidenceValue() {
    confidenceValue.textContent = confidenceRange.value + '%';
}

// Clear all filters
function clearAllFilters() {
    sectorFilter.value = '';
    recommendationFilter.value = '';
    confidenceRange.value = 0;
    confidenceValue.textContent = '0%';
    applyFilters();
}

// Populate filter dropdowns
function populateFilters() {
    // Populate sector filter
    const sectors = [...new Set(stockData.map(row => row['Sector']).filter(s => s))].sort();
    sectors.forEach(sector => {
        const option = document.createElement('option');
        option.value = sector;
        option.textContent = sector;
        sectorFilter.appendChild(option);
    });
}

// Update statistics
function updateStatistics() {
    const totalStocks = stockData.length;
    const strongBuys = stockData.filter(row => row['Recommendation'] === 'Strong Buy').length;
    const confidenceValues = stockData
        .map(row => parseFloat(row['Confidence Level (%)']))
        .filter(val => !isNaN(val));
    
    const avgConfidence = confidenceValues.length > 0 
        ? (confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length).toFixed(1)
        : 0;

    // Update DOM elements with animation
    animateNumber('total-stocks', totalStocks);
    animateNumber('strong-buys', strongBuys);
    animateNumber('avg-confidence', avgConfidence, '%');
}

// Animate number changes
function animateNumber(elementId, targetValue, suffix = '') {
    const element = document.getElementById(elementId);
    const startValue = 0;
    const duration = 1500;
    const increment = (targetValue - startValue) / (duration / 16);
    let currentValue = startValue;
    
    const timer = setInterval(() => {
        currentValue += increment;
        if (currentValue >= targetValue) {
            currentValue = targetValue;
            clearInterval(timer);
        }
        element.textContent = Math.round(currentValue) + suffix;
    }, 16);
}

// Get recommendation badge HTML
function getRecommendationBadge(recommendation) {
    const classMap = {
        'Strong Buy': 'rec-strong-buy',
        'Moderate Buy': 'rec-moderate-buy',
        'Hold': 'rec-hold',
        'Moderate Sell': 'rec-moderate-sell',
        'Strong Sell': 'rec-strong-sell'
    };
    
    const className = classMap[recommendation] || 'rec-hold';
    return `<span class="recommendation-badge ${className}">${recommendation}</span>`;
}

// Get confidence bar HTML
function getConfidenceBar(confidence) {
    const percentage = Math.round(confidence);
    return `
        <div class="confidence-text">${percentage}%</div>
        <div class="confidence-bar">
            <div class="confidence-fill" style="width: ${percentage}%"></div>
        </div>
    `;
}

// Get sector icon
function getSectorIcon(sector) {
    const iconMap = {
        'Technology': '<i class="fas fa-microchip sector-icon"></i>',
        'Healthcare': '<i class="fas fa-heartbeat sector-icon"></i>',
        'Financial': '<i class="fas fa-university sector-icon"></i>',
        'Energy': '<i class="fas fa-bolt sector-icon"></i>',
        'Materials': '<i class="fas fa-hammer sector-icon"></i>',
        'Industrials': '<i class="fas fa-industry sector-icon"></i>',
        'Consumer': '<i class="fas fa-shopping-cart sector-icon"></i>',
        'Utilities': '<i class="fas fa-plug sector-icon"></i>',
        'Real Estate': '<i class="fas fa-building sector-icon"></i>',
        'Telecommunications': '<i class="fas fa-phone sector-icon"></i>'
    };
    
    // Find matching sector by partial name
    for (const [key, icon] of Object.entries(iconMap)) {
        if (sector && sector.toLowerCase().includes(key.toLowerCase())) {
            return icon;
        }
    }
    
    return '<i class="fas fa-chart-line sector-icon"></i>';
}

// Show stock details modal
function showStockDetails(symbol) {
    const stock = stockData.find(row => row['Stock Symbol'] === symbol);
    if (!stock) return;
    
    const modalContent = document.getElementById('modalContent');
    const confidence = parseFloat(stock['Confidence Level (%)']) || 0;
    const currentPrice = parseFloat(stock['Current Price (AU$)']) || 0;
    const highPrice = parseFloat(stock['Predicted High Price in a Year']) || 0;
    const lowPrice = parseFloat(stock['Predicted Low Price in a Year']) || 0;
    
    // Calculate average target price
    let avgTargetPrice = 0;
    if (highPrice > 0 && lowPrice > 0) {
        avgTargetPrice = (highPrice + lowPrice) / 2;
    } else if (highPrice > 0) {
        avgTargetPrice = highPrice;
    } else if (lowPrice > 0) {
        avgTargetPrice = lowPrice;
    }
    
    // Calculate price potential (delta)
    let pricePotential = 0;
    let pricePotentialPercent = 0;
    if (currentPrice > 0 && avgTargetPrice > 0) {
        pricePotential = avgTargetPrice - currentPrice;
        pricePotentialPercent = (pricePotential / currentPrice) * 100;
    }
    
    // Determine if price potential is positive or negative
    const isPotentialPositive = pricePotentialPercent > 0;
    const potentialColorClass = isPotentialPositive ? 'text-success' : 'text-danger';
    const potentialIcon = isPotentialPositive ? '<i class="fas fa-arrow-up me-1"></i>' : '<i class="fas fa-arrow-down me-1"></i>';
    
    modalContent.innerHTML = `
        <div class="row g-4">
            <div class="col-md-6">
                <h6 class="fw-bold text-primary">
                    <i class="fas fa-building me-2"></i>Company Information
                </h6>
                <table class="table table-sm">
                    <tr><td><strong>Symbol:</strong></td><td>${stock['Stock Symbol']}</td></tr>
                    <tr><td><strong>Sector:</strong></td><td>${stock['Sector'] || 'N/A'}</td></tr>
                </table>
            </div>
            <div class="col-md-6">
                <h6 class="fw-bold text-success">
                    <i class="fas fa-chart-bar me-2"></i>AI Analysis
                </h6>
                <div class="mb-3">
                    <strong>Recommendation:</strong><br>
                    ${getRecommendationBadge(stock['Recommendation'])}
                </div>
                <div class="mb-3">
                    <strong>Confidence Level:</strong>
                    ${getConfidenceBar(confidence)}
                </div>
            </div>
            <div class="col-12">
                <h6 class="fw-bold text-primary">
                    <i class="fas fa-dollar-sign me-2"></i>Price Analysis
                </h6>
                <div class="row g-3 mb-4">
                    <div class="col-md-4">
                        <div class="bg-light p-3 rounded">
                            <div class="text-primary fw-bold">Current Price</div>
                            <div class="h4 mb-0 price-current">
                                ${currentPrice > 0 ? '$' + currentPrice.toFixed(2) : 'N/A'}
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="bg-light p-3 rounded">
                            <div class="text-primary fw-bold">Avg Target Price</div>
                            <div class="h4 mb-0 price-target price-avg">
                                ${avgTargetPrice > 0 ? '$' + avgTargetPrice.toFixed(2) : 'N/A'}
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="bg-light p-3 rounded">
                            <div class="fw-bold">Price Potential</div>
                            <div class="h4 mb-0 ${potentialColorClass}">
                                ${pricePotentialPercent !== 0 ? potentialIcon + Math.abs(pricePotentialPercent).toFixed(1) + '%' : 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-12">
                <h6 class="fw-bold text-warning">
                    <i class="fas fa-target me-2"></i>Price Target Range (12 months)
                </h6>
                <div class="row g-3">
                    <div class="col-md-6">
                        <div class="bg-light p-3 rounded">
                            <div class="text-success fw-bold">Target High</div>
                            <div class="h4 mb-0 price-target price-high">
                                ${highPrice > 0 ? '$' + highPrice.toFixed(2) : 'N/A'}
                            </div>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <div class="bg-light p-3 rounded">
                            <div class="text-danger fw-bold">Target Low</div>
                            <div class="h4 mb-0 price-target price-low">
                                ${lowPrice > 0 ? '$' + lowPrice.toFixed(2) : 'N/A'}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-12">
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    <strong>Disclaimer:</strong> This analysis is generated by AI and should not be considered as financial advice. 
                    Always conduct your own research and consult with financial professionals before making investment decisions.
                </div>
            </div>
        </div>
    `;
    
    // Show the modal
    const modal = new bootstrap.Modal(document.getElementById('stockModal'));
    modal.show();
}

// Update last updated timestamp with CSV file generation time
async function updateLastUpdated() {
    try {
        // First check if any stock data has a Generated Date field
        const generatedDate = stockData.length > 0 && stockData[0]['Generated Date'];
        
        if (generatedDate) {
            // Use the Generated Date field from the CSV
            const fileDate = new Date(generatedDate);
            
            // Format the date
            const formatted = fileDate.toLocaleDateString('en-AU', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            
            document.getElementById('lastUpdated').textContent = formatted;
            return;
        }
        
        // Fallback to the last modified date of the CSV file if no Generated Date field
        const response = await fetch('stock_recommendations.csv', { method: 'HEAD' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Get the last modified date from the response headers
        const lastModified = response.headers.get('last-modified');
        const fileDate = lastModified ? new Date(lastModified) : new Date();
        
        // Format the date
        const formatted = fileDate.toLocaleDateString('en-AU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        document.getElementById('lastUpdated').textContent = formatted;
    } catch (error) {
        console.error('Error getting CSV file date:', error);
        // Fallback to current date if there's an error
        const now = new Date();
        const formatted = now.toLocaleDateString('en-AU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        document.getElementById('lastUpdated').textContent = formatted + ' (estimated)';
    }
}

// Export functions for global access
window.showStockDetails = showStockDetails; 