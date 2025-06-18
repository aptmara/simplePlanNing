/**
 * state.js
 * 状態管理、データ操作、Undo/Redo
 * アプリケーションの唯一の状態(Single Source of Truth)を管理する
 */
import { showNotification } from './ui.js';

// --- State Variables ---
const MAX_HISTORY = 50;
let appState = {};
let history = [];
let historyIndex = -1;
let isRestoringFromHistory = false;

// --- Initial State ---
const getInitialState = () => ({
    plan: {
        name: '',
        startDate: '',
        numberOfDays: 1,
        days: [],
        activities: {}, // { [id]: activityObject }
    },
    categories: [
        { id: 'cat-1', name: '準備', color: '#ffc107' },
        { id: 'cat-2', name: '食事', color: '#dc3545' },
        { id: 'cat-3', name: '移動', color: '#17a2b8' },
        { id: 'cat-4', name: '自由時間', color: '#28a745' },
        { id: 'cat-5', name: 'タスク', color: '#6c757d' },
    ],
    ui: {
        currentEditingItemId: null,
        selectedActivityIds: new Set(),
        lastSelectedItem: null,
        draggingState: {
            isDragging: false,
            draggedItemId: null,
            originalStartUtc: null,
        },
        saveStatus: 'idle',
    },
    history: {
        canUndo: false,
        canRedo: false,
    }
});

// --- State Accessors and Mutators ---
export function initializeState() {
    const savedPlan = localStorage.getItem('planGeneratorPlan');
    const savedCategories = localStorage.getItem('planGeneratorCategories');
    
    const initialState = getInitialState();
    
    let planToLoad = initialState.plan;
    if (savedPlan) {
        try {
            const parsedPlan = JSON.parse(savedPlan);
            if (parsedPlan.name && parsedPlan.activities) {
                planToLoad = parsedPlan;
            }
        } catch (e) {
            console.error("Failed to load plan from localStorage", e);
        }
    }

    if (savedCategories) {
        try {
            initialState.categories = JSON.parse(savedCategories);
        } catch (e) {
            console.error("Failed to load categories from localStorage", e);
        }
    }
    
    appState = {
        ...initialState,
        plan: planToLoad,
        ui: initialState.ui,
    };

    if (appState.plan.startDate && appState.plan.numberOfDays > 0) {
         appState.plan.days = createPlanDays(appState.plan.startDate, appState.plan.numberOfDays);
    }
    
    pushHistory(appState);
}

function setState(newState, options = { pushHistory: true }) {
    const currentStateString = JSON.stringify({ plan: appState.plan, categories: appState.categories });
    const newStateString = JSON.stringify({ plan: newState.plan, categories: newState.categories });

    if (currentStateString === newStateString) {
        return;
    }

    appState = newState;
    if (options.pushHistory && !isRestoringFromHistory) {
        pushHistory(appState);
    }
    saveStateToLocalStorage();
    updateHistoryState();
}

export function getAppState() {
    return appState;
}

function saveStateToLocalStorage() {
    if (appState.plan) {
        localStorage.setItem('planGeneratorPlan', JSON.stringify(appState.plan));
    }
    if (appState.categories) {
        localStorage.setItem('planGeneratorCategories', JSON.stringify(appState.categories));
    }
}

// --- Plan Mutations ---
export function setPlanInfo(name, startDate, numberOfDays) {
    const newDays = createPlanDays(startDate, numberOfDays);
    const existingActivities = { ...appState.plan.activities };

    const newState = {
        ...appState,
        plan: {
            ...appState.plan,
            name,
            startDate,
            numberOfDays,
            days: newDays,
            activities: existingActivities,
        }
    };
    setState(newState);
}

export function clearPlan() {
     const newState = getInitialState();
     newState.categories = appState.categories;
     setState(newState);
     showNotification('計画をクリアしました', 'info');
}

function createPlanDays(startDateString, numberOfDays) {
    const days = [];
    if (!startDateString || numberOfDays <= 0) return [];
    
    const start = dayjs(startDateString);
    for (let i = 0; i < numberOfDays; i++) {
        const currentDate = start.add(i, 'day');
        days.push({
            date: currentDate.format('YYYY年M月D日 (ddd)'),
            isoDate: currentDate.format('YYYY-MM-DD'),
        });
    }
    return days;
}

// --- Activity Mutations ---
export function addOrUpdateActivity(activityData) {
    const newActivities = { ...appState.plan.activities };
    const id = activityData.id || `act-${Date.now()}`;
    newActivities[id] = { ...activityData, id };
    
    const newState = {
        ...appState,
        plan: {
            ...appState.plan,
            activities: newActivities,
        }
    };
    setState(newState);
}

export function updateMultipleActivities(updatedActivities) {
    const newActivities = { ...appState.plan.activities };
    updatedActivities.forEach(act => {
        newActivities[act.id] = act;
    });
     const newState = {
        ...appState,
        plan: {
            ...appState.plan,
            activities: newActivities,
        }
    };
    setState(newState);
}

export function deleteActivities(activityIds) {
    const newActivities = { ...appState.plan.activities };
    const newSelectedIds = new Set(appState.ui.selectedActivityIds);
    
    activityIds.forEach(id => {
        delete newActivities[id];
        newSelectedIds.delete(id);
    });

    const newState = {
        ...appState,
        plan: {
            ...appState.plan,
            activities: newActivities,
        },
        ui: {
            ...appState.ui,
            selectedActivityIds: newSelectedIds,
        }
    };
    setState(newState);
}

// --- UI State Mutations ---
export function setCurrentEditingItemId(itemId) {
    appState.ui.currentEditingItemId = itemId;
}

export function selectActivity(itemId, { ctrlKey, shiftKey }) {
    const newSelection = new Set(appState.ui.selectedActivityIds);
    const allActivities = Object.values(appState.plan.activities).sort((a,b) => dayjs(`${a.startDate} ${a.startTime}`).diff(dayjs(`${b.startDate} ${b.startTime}`)));
    const allIds = allActivities.map(a => a.id);
    let lastSelectedItem = appState.ui.lastSelectedItem;

    if (shiftKey && lastSelectedItem) {
        if (!ctrlKey) {
            newSelection.clear();
        }
        const startIdx = allIds.indexOf(lastSelectedItem);
        const endIdx = allIds.indexOf(itemId);
        if(startIdx !== -1 && endIdx !== -1) {
            const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
            for (let i = min; i <= max; i++) {
                newSelection.add(allIds[i]);
            }
        }
    } else if (ctrlKey) {
        if (newSelection.has(itemId)) {
            newSelection.delete(itemId);
        } else {
            newSelection.add(itemId);
            lastSelectedItem = itemId;
        }
    } else {
        newSelection.clear();
        if(itemId) newSelection.add(itemId);
        lastSelectedItem = itemId;
    }
    appState.ui.selectedActivityIds = newSelection;
    appState.ui.lastSelectedItem = lastSelectedItem;
}

export function clearSelection() {
    appState.ui.selectedActivityIds.clear();
    appState.ui.lastSelectedItem = null;
}

export function setDraggingState(dragState) {
    appState.ui.draggingState = { ...appState.ui.draggingState, ...dragState };
}

// --- Categories Mutations ---
export function setCategories(categories) {
     const newState = { ...appState, categories };
     setState(newState);
     showNotification('カテゴリ設定を保存しました', 'success');
}

// --- History (Undo/Redo) ---
function pushHistory(stateToPush) {
    if (isRestoringFromHistory) return;

    const lastStateInHistory = history[historyIndex];
    if (lastStateInHistory && JSON.stringify(lastStateInHistory.plan) === JSON.stringify(stateToPush.plan) && JSON.stringify(lastStateInHistory.categories) === JSON.stringify(stateToPush.categories)) {
        return;
    }

    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }
    history.push(JSON.parse(JSON.stringify(stateToPush)));

    if (history.length > MAX_HISTORY) {
        history.shift();
    }
    historyIndex = history.length - 1;
}

export function undo() {
    if (historyIndex > 0) {
        isRestoringFromHistory = true;
        historyIndex--;
        const restoredState = JSON.parse(JSON.stringify(history[historyIndex]));
        appState = { ...restoredState, ui: appState.ui }; // UI stateは維持
        saveStateToLocalStorage();
        updateHistoryState();
        isRestoringFromHistory = false;
        return true;
    }
    return false;
}

export function redo() {
    if (historyIndex < history.length - 1) {
        isRestoringFromHistory = true;
        historyIndex++;
        const restoredState = JSON.parse(JSON.stringify(history[historyIndex]));
        appState = { ...restoredState, ui: appState.ui }; // UI stateは維持
        saveStateToLocalStorage();
        updateHistoryState();
        isRestoringFromHistory = false;
        return true;
    }
    return false;
}

function updateHistoryState() {
     appState.history.canUndo = historyIndex > 0;
     appState.history.canRedo = historyIndex < history.length - 1;
}

export function getCurrentPlanObject() {
    if (!appState || !appState.plan || !appState.plan.days) {
        return { planData: [], allActivities: [] };
    }
    const allActivities = Object.values(appState.plan.activities);
    const planData = appState.plan.days.map(day => ({
        ...day,
        activities: allActivities.filter(act => {
            const actStart = dayjs(act.startDate);
            const actEnd = dayjs(act.endDate);
            const dayStart = dayjs(day.isoDate);
            return dayStart.isBetween(actStart, actEnd, 'day', '[]');
        })
    }));

    return { planData, allActivities };
}