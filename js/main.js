import { loadState } from './state.js';
import { populateForm, renderPreview, showView } from './ui.js';
import { initializeEventListeners } from './handlers.js';
import { initializeCalendar } from './calendar.js';

document.addEventListener('DOMContentLoaded', () => {
    loadState();
    populateForm();
    initializeEventListeners();
    initializeCalendar();
    renderPreview();
    showView('view-main');
    console.log('計画書ジェネレーターが初期化されました。');
});