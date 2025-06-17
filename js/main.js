/**
 * main.js
 * アプリケーションのエントリーポイント
 * DOM要素の取得とイベントリスナーの登録
 */
import { initializeTheme } from './theme.js';
import * as handlers from './handlers.js';
import * as ui from './ui.js';
import * as state from './state.js';

// --- DOM Element References ---
export const planForm = document.getElementById('planForm');
export const planNameInput = document.getElementById('planName');
export const startDateInput = document.getElementById('startDate');
export const numberOfDaysInput = document.getElementById('numberOfDays');
export const planOutput = document.getElementById('planOutput');
export const planOutputTitle = document.getElementById('planOutputTitle');
export const clearPlanButton = document.getElementById('clearPlanButton');
export const copyPlanButton = document.getElementById('copyPlanButton');
export const printPlanButton = document.getElementById('printPlanButton');
export const exportJsonButton = document.getElementById('exportJsonButton');
export const exportPdfButton = document.getElementById('exportPdfButton');
export const undoButton = document.getElementById('undoButton');
export const redoButton = document.getElementById('redoButton');
export const dropZoneOverlay = document.getElementById('dropZoneOverlay');
export const bodyElement = document.body;

export const editModal = document.getElementById('editModal');
export const closeModalButton = document.getElementById('closeModalButton');
export const saveModalButton = document.getElementById('saveModalButton');
export const modalActivityName = document.getElementById('modalActivityName');
export const modalStartDate = document.getElementById('modalStartDate');
export const modalStartTime = document.getElementById('modalStartTime');
export const modalEndDate = document.getElementById('modalEndDate');
export const modalEndTime = document.getElementById('modalEndTime');
export const modalDateTimeError = document.getElementById('modalDateTimeError');
export const modalActivityCategory = document.getElementById('modalActivityCategory');
export const modalActivityNotes = document.getElementById('modalActivityNotes');
export const modalAllowOverlap = document.getElementById('modalAllowOverlap');

export const categoryModal = document.getElementById('categoryModal');
export const categorySettingsButton = document.getElementById('categorySettingsButton');
export const closeCategoryModalButton = document.getElementById('closeCategoryModalButton');
export const saveCategoriesButton = document.getElementById('saveCategoriesButton');
export const categoryListContainer = document.getElementById('categoryListContainer');
export const newCategoryName = document.getElementById('newCategoryName');
export const newCategoryColor = document.getElementById('newCategoryColor');
export const addCategoryButton = document.getElementById('addCategoryButton');

export const summaryArea = document.getElementById('summaryArea');
export const summaryListContainer = document.getElementById('summaryListContainer');
export const summaryTotalTimeContainer = document.getElementById('summaryTotalTimeContainer');

// --- Main Execution ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    loadInitialData();
    setupEventListeners();
});

function loadInitialData() {
    handlers.loadPlanFromLocalStorage();
    state.pushHistory(state.getCurrentPlanObject());
    
    // カテゴリデータの読み込み
    const savedCategories = localStorage.getItem('planGeneratorCategories');
    if (savedCategories) {
        state.setCategories(JSON.parse(savedCategories));
    } else {
        state.setCategories([
            { id: 'cat-1', name: '準備', color: '#ffc107' },
            { id: 'cat-2', name: '食事', color: '#dc3545' },
            { id: 'cat-3', name: '移動', color: '#17a2b8' },
            { id: 'cat-4', name: '自由時間', color: '#28a745' },
            { id: 'cat-5', name: 'タスク', color: '#6c757d' },
        ]);
        localStorage.setItem('planGeneratorCategories', JSON.stringify(state.categories));
    }
    ui.updateActivityCategoryDropdown();
}

function setupEventListeners() {
    planForm.addEventListener('submit', handlers.handleFormSubmit);
    clearPlanButton.addEventListener('click', handlers.clearPlan);
    copyPlanButton.addEventListener('click', handlers.copyPlanAsText);
    printPlanButton.addEventListener('click', () => window.print());
    exportJsonButton.addEventListener('click', handlers.exportPlanAsJson);
    exportPdfButton.addEventListener('click', handlers.exportPdfButtonClickHandler);

    undoButton.addEventListener('click', () => {
        const plan = state.undo();
        if (plan) {
            state.setIsRestoringFromHistory(true);
            handlers.loadPlan(plan);
            state.setIsRestoringFromHistory(false);
            state.updateHistoryButtons();
            ui.showNotification('元に戻しました', 'info');
        }
    });

    redoButton.addEventListener('click', () => {
        const plan = state.redo();
        if (plan) {
            state.setIsRestoringFromHistory(true);
            handlers.loadPlan(plan);
            state.setIsRestoringFromHistory(false);
            state.updateHistoryButtons();
            ui.showNotification('やり直しました', 'info');
        }
    });

    bodyElement.addEventListener('dragover', handlers.handleDragOverFile);
    bodyElement.addEventListener('dragleave', handlers.handleDragLeaveFile);
    bodyElement.addEventListener('drop', handlers.handleDropFile);

    editModal.querySelector('#deleteModalButton').addEventListener('click', () => {
        if (state.currentEditingItem) {
            const activityId = state.currentEditingItem.dataset.activityId;
            const activityName = state.currentEditingItem.dataset.name;
            if (confirm(`アクティビティ「${activityName}」を削除しますか？`)) {
                document.querySelectorAll(`[data-activity-id="${activityId}"]`).forEach(part => part.remove());
                ui.closeModal();
                handlers.savePlanToLocalStorage();
            }
        }
    });
    closeModalButton.addEventListener('click', ui.closeModal);
    saveModalButton.addEventListener('click', handlers.saveModalChanges);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) ui.closeModal();
    });

    categorySettingsButton.addEventListener('click', ui.openCategoryModal);
    closeCategoryModalButton.addEventListener('click', ui.closeCategoryModal);
    categoryModal.addEventListener('click', (e) => {
        if (e.target === categoryModal) ui.closeCategoryModal();
    });
    addCategoryButton.addEventListener('click', handlers.handleAddNewCategory);
    saveCategoriesButton.addEventListener('click', handlers.handleSaveCategories);
}