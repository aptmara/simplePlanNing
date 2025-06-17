/**
 * state.js
 * 状態管理、データ操作、Undo/Redo
 */
import {
    planNameInput, startDateInput, numberOfDaysInput, undoButton, redoButton
} from './main.js';

// --- State Variables ---
export let currentEditingItem = null;
export let draggingItem = null;
export let movePreviewItem = null;
export let isResizing = false;
export let resizingItem = null;
export let resizingDirection = null;
export let categories = [];
export let tempCategories = [];
export let categoryChart = null;
export const selectedItems = new Set();
export let isCreatingWithDrag = false;
export let dragCreateTimeline = null;
export let dragCreateStartY = 0;
export let dragCreatePreviewItem = null;
export let saveStatusTimeout;
export let lastSelectedItem = null;

// --- Undo/Redo State ---
let history = [];
let historyIndex = -1;
const MAX_HISTORY = 50;
export let isRestoringFromHistory = false;


// --- Setters for state variables ---
export function setCurrentEditingItem(item) { currentEditingItem = item; }
export function setDraggingItem(item) { draggingItem = item; }
export function setMovePreviewItem(item) { movePreviewItem = item; }
export function setIsResizing(val) { isResizing = val; }
export function setResizingItem(item) { resizingItem = item; }
export function setResizingDirection(dir) { resizingDirection = dir; }
export function setCategories(cats) { categories = cats; }
export function setTempCategories(cats) { tempCategories = cats; }
export function setCategoryChart(chart) { categoryChart = chart; }
export function setIsCreatingWithDrag(val) { isCreatingWithDrag = val; }
export function setDragCreateTimeline(timeline) { dragCreateTimeline = timeline; }
export function setDragCreateStartY(y) { dragCreateStartY = y; }
export function setDragCreatePreviewItem(item) { dragCreatePreviewItem = item; }
export function setSaveStatusTimeout(timeout) { saveStatusTimeout = timeout; }
export function setLastSelectedItem(item) { lastSelectedItem = item; }
export function setIsRestoringFromHistory(val) { isRestoringFromHistory = val; }


// --- Undo/Redo Functions ---
export function updateHistoryButtons() {
    undoButton.disabled = historyIndex <= 0;
    redoButton.disabled = historyIndex >= history.length - 1;
}

export function pushHistory(planObject) {
    if (isRestoringFromHistory || !planObject) return;
    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }
    if (history.length > 0 && JSON.stringify(planObject) === JSON.stringify(history[historyIndex])) {
        return;
    }
    history.push(planObject);
    if (history.length > MAX_HISTORY) {
        history.shift();
    }
    historyIndex = history.length - 1;
    updateHistoryButtons();
}

export function undo() {
    if (historyIndex > 0) {
        historyIndex--;
        return history[historyIndex];
    }
    return null;
}

export function redo() {
    if (historyIndex < history.length - 1) {
        historyIndex++;
        return history[historyIndex];
    }
    return null;
}

// --- Plan Data Functions ---
export function getCurrentPlanObject() {
    const dayElements = document.querySelectorAll('.day-plan');
    if (dayElements.length === 0 && !planNameInput.value) {
        return null;
    }

    const activitiesById = {};
    dayElements.forEach(dayEl => {
        dayEl.querySelectorAll('.plan-item').forEach(itemEl => {
            const id = itemEl.dataset.activityId;
            if (!id) return;
            if (!activitiesById[id]) {
                activitiesById[id] = {
                    id: id,
                    name: itemEl.dataset.name,
                    startDate: itemEl.dataset.startDate,
                    startTime: itemEl.dataset.startTime,
                    endDate: itemEl.dataset.endDate,
                    endTime: itemEl.dataset.endTime,
                    category: itemEl.dataset.category,
                    notes: itemEl.dataset.notes,
                    allowOverlap: itemEl.dataset.allowOverlap === 'true'
                };
            }
        });
    });

    const planData = Array.from(dayElements).map(dayEl => ({
        date: dayEl.dataset.date,
        isoDate: dayEl.dataset.isoDate,
        activities: []
    }));

    Object.values(activitiesById).forEach(activity => {
        if (!activity.startDate) return;
        const targetDay = planData.find(d => d.isoDate === activity.startDate);
        if (targetDay) {
            targetDay.activities.push(activity);
        }
    });

    return {
        name: planNameInput.value,
        startDate: startDateInput.value,
        numberOfDays: numberOfDaysInput.value,
        planData: planData
    };
}

export function createEmptyPlan(startDateString, numberOfDays) {
    const plan = [];
    if (!startDateString || numberOfDays <= 0) return [];
    const startDate = new Date(startDateString);
    for (let i = 0; i < numberOfDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const formattedDate = currentDate.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
        const isoDate = currentDate.toISOString().slice(0, 10);
        plan.push({ date: formattedDate, isoDate: isoDate, activities: [] });
    }
    return plan;
}