import {
    state
} from "./state.js";

import {
    zoomToWord,
    updateWordFocus,
    updateWordDetails
} from "./wordFocus.js";
import {
    updateRelations
} from "./relationManager.js";
import {
    draw,
    updateWordNodeTransforms,
    clampOffsetX,
    clampOffsetY,
    updateScaleForNodes
} from "./uni-canvas.js";
import { logEvent, startWordView, endWordView } from "/analytics.js";

// �?menu.js 文件顶部�?import 部分添加
import { showAboutPanel } from "./detail.js";


const numSteps = 5;
const ticksContainer = document.querySelector('.scale-ticks');
const numbersContainer = document.querySelector('.scale-numbers');

ticksContainer.innerHTML = '';
numbersContainer.innerHTML = '';

for (let i = 0; i < numSteps; i++) {
    const percent = (i / (numSteps - 1)) * 100;

    // 刻度�?
    const tick = document.createElement('div');
    tick.style.left = percent + '%';
    ticksContainer.appendChild(tick);

    // 数字
    const num = document.createElement('span');
    num.textContent = (i + 1);
    num.style.left = percent + '%';
    numbersContainer.appendChild(num);
}

const indicator = document.getElementById('indicator');
const container = document.getElementById('scaleContainer');
let isDragging = false;
let containerRect;


// 初始�?indicator 在中�?
if(state.scaleThreshold){
    moveIndicator(state.scaleThreshold);
}

indicator.addEventListener('mousedown', startDrag);
window.addEventListener('mouseup', endDrag);
window.addEventListener('mousemove', onDrag);

function startDrag(e) {
    e.preventDefault();
    isDragging = true;
    containerRect = container.getBoundingClientRect();
    state.focusedNodeId=null;
}

function endDrag(e) {
    if (!isDragging) return;
    isDragging = false;
    logEvent("scale_slider_change", { scaleValue: state.currentScale });
}

function onDrag(e) {
    if (!isDragging) return;
    let x = e.clientX - containerRect.left;
    x = Math.max(0, Math.min(containerRect.width, x));
    const percent = x / containerRect.width * 100;
    indicator.style.left = percent + '%';



    let scale = state.currentScale;
    let newScale = percent * 19 / 100 + 1;

    const mouseX = window.innerWidth / 2;
    const mouseY = window.innerHeight / 2;

    let offsetX = state.panX;
    let offsetY = state.panY;

    offsetX = mouseX - (mouseX - offsetX) * (newScale / scale);
    offsetY = mouseY - (mouseY - offsetY) * (newScale / scale);

    state.panX = clampOffsetX(offsetX);
    state.panY = clampOffsetY(offsetY); // 加边�?
    state.currentScale = percent * 19 / 100 + 1;

    draw();
    updateWordNodeTransforms();
    updateWordFocus();
    updateRelations();
    updateWordDetails();


    updateScaleForNodes(newScale);
}

function snapToStep() {
    const leftPercent = parseFloat(indicator.style.left);
    const stepPercent = 100 / (numSteps - 1);
    const stepIndex = Math.round(leftPercent / stepPercent);
    const snapPercent = stepIndex * stepPercent;
    indicator.style.left = snapPercent + '%';
}

// 可程序化移动 indicator
export function moveIndicator(scaleValue) {
    scaleValue = (scaleValue-1) * 4 / (state.scaleThreshold-1)+1;
    if (scaleValue < 1) scaleValue = 1;
    if (scaleValue > 5) scaleValue = 5;
    const percent = (scaleValue - 1) * 25; // 5 个刻�?
    indicator.style.left = percent + '%';
}


// menu
let dunesIcon = document.getElementById("dunes-icon");
dunesIcon.addEventListener('click', () => {
    endWordView("switch");
    startWordView(17);
    zoomToWord(17, state.scaleThreshold);
    updateWordFocus();
    logEvent("menu_home_click", { toWordId: 17 });
});

window.addEventListener('DOMContentLoaded', () => {
    const shuffleIcon = document.getElementById('shuffle-icon');
    shuffleIcon.addEventListener('click', () => {
        const randomId = window.allWords[Math.floor(Math.random() * window.allWords.length)].id;
        endWordView("switch");
        startWordView(randomId);
        zoomToWord(randomId, state.scaleThreshold);
        updateWordFocus();
        logEvent("shuffle_click", { toWordId: randomId });
    });
});

let searchIcon = document.getElementById("search-icon");



// Year filter configuration
export const yearPeriods = [
    { label: '', year: -2000 },
    { label: '1700', year: 1700 },
    { label: '1800', year: 1800 },
    { label: '1850', year: 1850 },
    { label: '1900', year: 1900 },
    { label: '1950', year: 1950 },
    { label: 'Now', year: 2025 }
];

const yearTicksContainer = document.querySelector('.year-ticks');
const yearNumbersContainer = document.querySelector('.year-numbers');
const yearIndicator = document.getElementById('yearIndicator');
const yearContainer = document.getElementById('yearContainer');
const yearSegments = document.querySelectorAll('.year-segment');
const yearNumbers = document.querySelector('.year-numbers');

let isYearDragging = false;
let yearContainerRect;
let currentYearIndex = yearPeriods.length - 1; // Start at 'now' (show all words)

// Initialize year filter ticks and numbers
function initializeYearFilter() {
    yearTicksContainer.innerHTML = '';
    yearNumbersContainer.innerHTML = '';

    for (let i = 0; i < yearPeriods.length; i++) {
        const percent = (i / (yearPeriods.length - 1)) * 100;

        // Vertical tick lines
        const tick = document.createElement('div');
        tick.style.left = percent + '%';
        yearTicksContainer.appendChild(tick);

        // Year labels
        const num = document.createElement('span');
        num.textContent = yearPeriods[i].label;
        num.style.left = percent + '%';
        yearNumbersContainer.appendChild(num);
    }

    // Position indicator at the rightmost position initially (show all)
    moveYearIndicator(yearPeriods.length - 1);
}

// Move year indicator to specific index
function moveYearIndicator(index) {
    if (index < 0) index = 0;
    if (index >= yearPeriods.length) index = yearPeriods.length - 1;
    
    const percent = (index / (yearPeriods.length - 1)) * 100;
    yearIndicator.style.left = percent + '%';
    currentYearIndex = index;
    
    updateYearDisplay();
    filterWordsByYear();
}

// Update visual state of segments and numbers
function updateYearDisplay() {
    // Update segments - fade out segments after current position
    // yearSegments.forEach((segment, index) => {
    //     if (index > currentYearIndex) {
    //         segment.classList.add('faded');
    //     } else {
    //         segment.classList.remove('faded');
    //     }
    // });
    
    // Update year numbers - fade out years after current position
    const yearNumberSpans = yearNumbersContainer.querySelectorAll('span');
    yearNumberSpans.forEach((span, index) => {
        if (index > currentYearIndex) {
            span.classList.add('faded');
        } else {
            span.classList.remove('faded');
        }
    });
}

// Filter words based on selected year period
function filterWordsByYear() {
    const selectedPeriod = yearPeriods[currentYearIndex];
    const cutoffYear = selectedPeriod.year;
    
    document.querySelectorAll('.word-node').forEach(node => {
        const wordId = node.id;
        const word = window.allWords.find(w => w.id == wordId);
        
        if (!word) {
            node.style.display = 'none';
            return;
        }
        
        // Extract year from proposing_time
        const wordYear = parseInt(word.proposing_time);
        
        // Show word if:
        // - No cutoff year (空白 period) - show all
        // - Word year is less than or equal to cutoff year
        // - Word year is invalid/missing and we're not in 空白 period
        if (cutoffYear === null || 
            (!isNaN(wordYear) && wordYear <= cutoffYear) ||
            (isNaN(wordYear) && cutoffYear !== null)) {
            node.style.display = 'block';
            node.style.opacity = node.classList.contains('focused') ? '1' : 
                                 (state.focusedNodeId && !node.classList.contains('focused') ? '0.5' : '1');
        } else {
            node.style.display = 'none';
        }
    });
}

// Year indicator drag handlers
function startYearDrag(e) {
    e.preventDefault();
    isYearDragging = true;
    yearContainerRect = yearContainer.getBoundingClientRect();
    yearIndicator.classList.add('dragging');
}

function endYearDrag(e) {
    if (!isYearDragging) return;
    isYearDragging = false;
    yearIndicator.classList.remove('dragging');
    
    // Snap to nearest step
    snapYearToStep();
    const label = yearPeriods[currentYearIndex]?.label || "";
    logEvent("year_filter_change", { yearIndex: currentYearIndex, yearLabel: label });
}

function onYearDrag(e) {
    if (!isYearDragging) return;
    
    let x = e.clientX - yearContainerRect.left;
    x = Math.max(0, Math.min(yearContainerRect.width, x));
    const percent = (x / yearContainerRect.width) * 100;
    
    // Calculate which year period this corresponds to
    const floatIndex = (percent / 100) * (yearPeriods.length - 1);
    const nearestIndex = Math.round(floatIndex);
    
    // Update indicator position and filter
    moveYearIndicator(nearestIndex);
}

function snapYearToStep() {
    const leftPercent = parseFloat(yearIndicator.style.left);
    const stepPercent = 100 / (yearPeriods.length - 1);
    const stepIndex = Math.round(leftPercent / stepPercent);
    moveYearIndicator(stepIndex);
}

// Event listeners for year filter
yearIndicator.addEventListener('mousedown', startYearDrag);
window.addEventListener('mouseup', endYearDrag);
window.addEventListener('mousemove', onYearDrag);

// Initialize when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    // Wait a bit to ensure other elements are ready
    setTimeout(() => {
        initializeYearFilter();
    }, 100);
});

// Export function for external use
export function resetYearFilter() {
    moveYearIndicator(yearPeriods.length - 1);
}



// �?menu.js 文件�?DOMContentLoaded 事件监听器中添加About按钮的事件处�?
window.addEventListener('DOMContentLoaded', () => {
 
    // 新增：About按钮点击事件
    const aboutButton = document.getElementById('about-button');
    if (aboutButton) {
        aboutButton.addEventListener('click', () => {
            showAboutPanel();
        });
    }

    // 新增：Search按钮点击事件
    const searchIcon = document.getElementById('search-icon');
    if (searchIcon) {
        searchIcon.addEventListener('click', () => {
            showSearchModal("icon");
        });
    }
});

// Search Modal functionality
let isSearchModalOpen = false;

function showSearchModal(source = "icon") {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input');
    
    if (!modal || !input) return;
    
    modal.classList.remove('hidden');
    isSearchModalOpen = true;
    
    // Focus the input after a short delay to ensure the modal is visible
    setTimeout(() => {
        input.focus();
    }, 100);
    
    // Initialize with all words
    displaySearchResults(window.allWords || []);
}

function hideSearchModal() {
    const modal = document.getElementById('search-modal');
    const input = document.getElementById('search-input');
    
    if (!modal || !input) return;
    
    modal.classList.add('hidden');
    isSearchModalOpen = false;
    input.value = '';
    logEvent("search_close", {});
    
    // Clear results
    const resultsContainer = document.getElementById('search-results');
    if (resultsContainer) {
        resultsContainer.innerHTML = '';
    }
}

function searchWords(query) {
    if (!window.allWords) return [];
    
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return window.allWords;
    
    return window.allWords.filter(word => {
        const term = (word.term || '').toLowerCase();
        const originalLanguage = (word.original_language || '').toLowerCase();
        const briefDefinition = (word.brief_definition || '').toLowerCase();
        const extendedDefinition = (word.extended_definition || '').toLowerCase();
        const proposer = (word.proposer || '').toLowerCase();
        
        return term.includes(lowerQuery) ||
               originalLanguage.includes(lowerQuery) ||
               briefDefinition.includes(lowerQuery) ||
               extendedDefinition.includes(lowerQuery) ||
               proposer.includes(lowerQuery);
    });
}

function displaySearchResults(words) {
    const resultsContainer = document.getElementById('search-results');
    if (!resultsContainer) return;
    
    if (words.length === 0) {
        resultsContainer.innerHTML = '<div class="search-no-results">No results found</div>';
        return;
    }
    
    resultsContainer.innerHTML = words.map(word => `
        <div class="search-result-item" data-word-id="${word.id}">
            <div>
                <div class="search-result-term">${word.term || 'Unknown Term'}</div>
                ${word.original_language ? `<div class="search-result-original">${word.original_language}</div>` : ''}
                ${word.brief_definition ? `<div class="search-result-definition">${word.brief_definition.substring(0, 100)}${word.brief_definition.length > 100 ? '...' : ''}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    // Add click handlers to result items
    resultsContainer.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const wordId = parseInt(item.dataset.wordId);
            hideSearchModal();
            endWordView("switch");
            startWordView(wordId);
            zoomToWord(wordId, state.scaleThreshold);
            updateWordFocus();
        });
    });
}

// Event listeners for search modal
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const searchModal = document.getElementById('search-modal');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            const results = searchWords(query);
            displaySearchResults(results);
        });
        
        // Handle keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideSearchModal();
            }
        });
    }
    
    if (searchModal) {
        searchModal.addEventListener('click', (e) => {
            // Close modal when clicking on the backdrop (not the content)
            if (e.target === searchModal) {
                hideSearchModal();
            }
        });
    }
});

// Global keyboard shortcut for search (Cmd/Ctrl + K)
document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isSearchModalOpen) {
            hideSearchModal();
        } else {
            showSearchModal("shortcut");
        }
    }
});

