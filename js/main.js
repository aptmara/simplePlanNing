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
export const exportCsvButton = document.getElementById('exportCsvButton');
export const exportPdfButton = document.getElementById('exportPdfButton');
export const undoButton = document.getElementById('undoButton');
export const redoButton = document.getElementById('redoButton');
export const dropZoneOverlay = document.getElementById('dropZoneOverlay');
export const bodyElement = document.body;

export const editModal = document.getElementById('editModal');
export const closeModalButton = document.getElementById('closeModalButton');
export const saveModalButton = document.getElementById('saveModalButton');
export const deleteModalButton = document.getElementById('deleteModalButton');
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
    // Day.jsの初期設定
    dayjs.extend(window.dayjs_plugin_customParseFormat);
    dayjs.extend(window.dayjs_plugin_utc);
    dayjs.extend(window.dayjs_plugin_timezone);
    
    initializeTheme();
    state.initializeState(); // Stateを初期化 (localStorageから復元)
    ui.render(state.getAppState()); // 初期描画
    setupEventListeners();
});


function setupEventListeners() {
    planForm.addEventListener('submit', handlers.handleFormSubmit);
    clearPlanButton.addEventListener('click', handlers.clearPlan);
    copyPlanButton.addEventListener('click', handlers.copyPlanAsText);
    printPlanButton.addEventListener('click', () => window.print());
    exportJsonButton.addEventListener('click', handlers.exportPlanAsJson);
    exportCsvButton.addEventListener('click', handlers.exportPlanAsCsv);
    exportPdfButton.addEventListener('click', handlers.exportPdfButtonClickHandler);

    undoButton.addEventListener('click', handlers.handleUndo);
    redoButton.addEventListener('click', handlers.handleRedo);

    bodyElement.addEventListener('dragover', handlers.handleDragOverFile);
    bodyElement.addEventListener('dragleave', handlers.handleDragLeaveFile);
    bodyElement.addEventListener('drop', handlers.handleDropFile);

    // キーボードショートカット
    bodyElement.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }

        if ((e.key === 'Delete' || e.key === 'Backspace') && state.getAppState().ui.selectedActivityIds.size > 0) {
            e.preventDefault();
            handlers.deleteSelectedItems();
        }

        if (e.ctrlKey || e.metaKey) {
            if (e.key === 'z') {
                e.preventDefault();
                handlers.handleUndo();
            } else if (e.key === 'y') {
                e.preventDefault();
                handlers.handleRedo();
            }
        }
    });

    // モーダル関連
    deleteModalButton.addEventListener('click', handlers.handleDeleteFromModal);
    closeModalButton.addEventListener('click', ui.closeModal);
    saveModalButton.addEventListener('click', handlers.saveModalChanges);
    editModal.addEventListener('click', (e) => {
        if (e.target === editModal) ui.closeModal();
    });

    // カテゴリモーダル関連
    categorySettingsButton.addEventListener('click', ui.openCategoryModal);
    closeCategoryModalButton.addEventListener('click', ui.closeCategoryModal);
    categoryModal.addEventListener('click', (e) => {
        if (e.target === categoryModal) ui.closeCategoryModal();
    });
    addCategoryButton.addEventListener('click', handlers.handleAddNewCategory);
    saveCategoriesButton.addEventListener('click', handlers.handleSaveCategories);
}