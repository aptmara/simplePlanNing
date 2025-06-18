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
        days: [], // { date, isoDate, activities: [] } -> このactivitiesは不要になる
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
        saveStatus: 'idle', // idle, saving, saved
    },
    // undo/redo用の補助情報
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
        ui: initialState.ui, // UI stateは永続化しない
    };

    // plan.daysがなければ再生成
    if (appState.plan.startDate && appState.plan.numberOfDays > 0 && appState.plan.days.length === 0) {
        appState.plan.days = createPlanDays(appState.plan.startDate, appState.plan.numberOfDays);
    }
    
    pushHistory(appState);
}

function setState(newState, options = { pushHistory: true }) {
    if (JSON.stringify(appState) === JSON.stringify(newState)) {
        return; // 変更がなければ何もしない
    }
    appState = newState;
    if (options.pushHistory && !isRestoringFromHistory) {
        pushHistory(appState);
    }
    saveStateToLocalStorage();
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
    const existingActivities = appState.plan.activities;
    const newDays = createPlanDays(startDate, numberOfDays);

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
     // カテゴリは維持する
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
    newActivities[activityData.id] = activityData;
    
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
    activityIds.forEach(id => {
        delete newActivities[id];
    });

    const newState = {
        ...appState,
        plan: {
            ...appState.plan,
            activities: newActivities,
        },
        ui: {
            ...appState.ui,
            selectedActivityIds: new Set(),
        }
    };
    setState(newState);
}


// --- UI State Mutations ---

export function setCurrentEditingItemId(itemId) {
    const newState = {
        ...appState,
        ui: { ...appState.ui, currentEditingItemId: itemId }
    };
    setState(newState, { pushHistory: false }); // UIの変更は履歴に残さない
}

export function selectActivity(itemId, { ctrlKey, shiftKey }) {
    const newSelection = new Set(appState.ui.selectedActivityIds);
    const allActivities = Object.values(appState.plan.activities).sort((a,b) => dayjs.utc(a.startUtc).diff(dayjs.utc(b.startUtc)));
    const allIds = allActivities.map(a => a.id);
    let lastSelectedItem = appState.ui.lastSelectedItem;

    if (shiftKey && lastSelectedItem) {
        if (!ctrlKey) {
            newSelection.clear();
        }
        const startIdx = allIds.indexOf(lastSelectedItem);
        const endIdx = allIds.indexOf(itemId);
        const [min, max] = [Math.min(startIdx, endIdx), Math.max(startIdx, endIdx)];
        for (let i = min; i <= max; i++) {
            newSelection.add(allIds[i]);
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
        newSelection.add(itemId);
        lastSelectedItem = itemId;
    }

     const newState = {
        ...appState,
        ui: { 
            ...appState.ui,
            selectedActivityIds: newSelection,
            lastSelectedItem: lastSelectedItem,
        }
    };
    setState(newState, { pushHistory: false });
}

export function clearSelection() {
    const newState = {
        ...appState,
        ui: {
            ...appState.ui,
            selectedActivityIds: new Set(),
            lastSelectedItem: null,
        }
    };
    setState(newState, { pushHistory: false });
}


export function setDraggingState(dragState) {
    const newState = {
        ...appState,
        ui: { ...appState.ui, draggingState: { ...appState.ui.draggingState, ...dragState } }
    };
    setState(newState, { pushHistory: false });
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
        return; // データに変更がなければ履歴に追加しない
    }

    if (historyIndex < history.length - 1) {
        history = history.slice(0, historyIndex + 1);
    }
    history.push(JSON.parse(JSON.stringify(stateToPush))); // Deep copy

    if (history.length > MAX_HISTORY) {
        history.shift();
    }
    historyIndex = history.length - 1;
    updateHistoryState();
}

export function undo() {
    if (historyIndex > 0) {
        isRestoringFromHistory = true;
        historyIndex--;
        const restoredState = JSON.parse(JSON.stringify(history[historyIndex]));
        // UI state は元に戻さない
        restoredState.ui = appState.ui;
        setState(restoredState, { pushHistory: false });
        isRestoringFromHistory = false;
        updateHistoryState();
        return true;
    }
    return false;
}

export function redo() {
    if (historyIndex < history.length - 1) {
        isRestoringFromHistory = true;
        historyIndex++;
        const restoredState = JSON.parse(JSON.stringify(history[historyIndex]));
        restoredState.ui = appState.ui;
        setState(restoredState, { pushHistory: false });
        isRestoringFromHistory = false;
        updateHistoryState();
        return true;
    }
    return false;
}

function updateHistoryState() {
     const canUndo = historyIndex > 0;
     const canRedo = historyIndex < history.length - 1;
     const newState = {
        ...appState,
        history: { canUndo, canRedo }
    };
    // このstate変更は履歴にも残さず、再描画もトリガーしない
    // UI側で直接ボタンのdisabledを切り替える
    appState = newState;
}

export function getHistoryStatus() {
    return {
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1,
    }
}