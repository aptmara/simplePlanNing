import { planData, saveState, clearState, saveTemplate, loadTemplate, deleteTemplate } from './state.js';
import { renderPreview, populateForm, renderTemplateSelector, showView } from './ui.js';
import { rerenderCalendar, updateCalendarSettings } from './calendar.js';

function handleGenericInput(event) {
    const target = event.target;
    const basicInfoKey = target.dataset.target;
    if (basicInfoKey) {
        const keys = basicInfoKey.split('.');
        if (keys[0] === 'basicInfo') {
            planData.basicInfo[keys[1]] = target.value;
            if (keys[1] === 'plan-date' || keys[1] === 'plan-duration') {
                updateCalendarSettings();
            }
        }
    }
    const itemType = target.dataset.itemType;
    if (itemType) {
        planData.items[itemType] = target.value;
    }
    if (target.classList.contains('dynamic-input')) {
        const field = target.dataset.field;
        const row = target.closest('tr');
        const table = target.closest('table');
        if (row && table) {
            const index = row.dataset.index;
            const dataType = table.dataset.type;
            if (dataType === 'budget.income' || dataType === 'budget.expense') {
                const [main, sub] = dataType.split('.');
                planData[main][sub][index][field] = target.value;
            }
        }
    }
    renderPreview();
    saveState();
}

function handleAddRow(dataType, newRowObject) {
    if (dataType === 'budget.income' || dataType === 'budget.expense') {
        const [main, sub] = dataType.split('.');
        if (!planData[main]) planData[main] = {};
        if (!planData[main][sub]) planData[main][sub] = [];
        planData[main][sub].push(newRowObject);
    }
    populateForm();
    saveState();
}

function handleDeleteRow(event) {
    const target = event.target;
    if (!target.classList.contains('delete-row')) return;
    const row = target.closest('tr');
    const table = target.closest('table');
    if (row && table) {
        const index = row.dataset.index;
        const dataType = table.dataset.type;
        if (confirm(`この行(${parseInt(index) + 1}行目)を削除しますか？`)) {
            if (dataType === 'budget.income' || dataType === 'budget.expense') {
                const [main, sub] = dataType.split('.');
                planData[main][sub].splice(index, 1);
            }
            populateForm();
            renderPreview();
            saveState();
        }
    }
}

function handleSaveButton() {
    saveState();
    alert('現在の内容をブラウザに保存しました。');
}

function handleClearButton() {
    if (confirm('警告！\n入力されたすべてのデータ（保存された内容も含む）が消去されます。\n本当によろしいですか？')) {
        clearState();
        alert('データを消去しました。ページをリロードします。');
        location.reload();
    }
}

function handleLoadTemplate() {
    const select = document.getElementById('template-select');
    const templateName = select.value;
    if (loadTemplate(templateName)) {
        location.reload();
    }
}

function handleSaveTemplate() {
    const input = document.getElementById('template-name-input');
    const templateName = input.value.trim();
    if (saveTemplate(templateName)) {
        input.value = '';
        renderTemplateSelector();
    }
}

function handleDeleteTemplate() {
    const select = document.getElementById('template-select');
    const templateName = select.value;
    if (deleteTemplate(templateName)) {
        renderTemplateSelector();
    }
}

export function initializeEventListeners() {
    const editorPane = document.querySelector('.editor-pane');
    editorPane.addEventListener('input', handleGenericInput);
    editorPane.addEventListener('click', handleDeleteRow);

    document.getElementById('add-income-row').addEventListener('click', () => handleAddRow('budget.income', { item: '', description: '', amount: '' }));
    document.getElementById('add-expense-row').addEventListener('click', () => handleAddRow('budget.expense', { item: '', description: '', amount: '' }));

    document.getElementById('save-button').addEventListener('click', handleSaveButton);
    document.getElementById('clear-button').addEventListener('click', handleClearButton);
    document.getElementById('print-button').addEventListener('click', () => window.print());

    document.getElementById('load-template-button').addEventListener('click', handleLoadTemplate);
    document.getElementById('save-template-button').addEventListener('click', handleSaveTemplate);
    document.getElementById('delete-template-button').addEventListener('click', handleDeleteTemplate);
    
    document.getElementById('goto-schedule-button').addEventListener('click', () => {
        showView('view-schedule');
        rerenderCalendar();
    });
    
    document.getElementById('goto-main-button').addEventListener('click', () => {
        showView('view-main');
    });
}