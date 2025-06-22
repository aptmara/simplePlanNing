// 必要なモジュールをインポート
import { planData, saveState, clearState, saveTemplate, loadTemplate, deleteTemplate } from './state.js';
import { renderPreview, populateForm, renderTemplateSelector } from './ui.js';

// 各関数を`export`する
export function handleGenericInput(event) {
    const target = event.target;
    const basicInfoKey = target.dataset.target;
    if (basicInfoKey) {
        const keys = basicInfoKey.split('.');
        if (keys[0] === 'basicInfo') planData.basicInfo[keys[1]] = target.value;
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
            } else if (dataType) {
                planData[dataType][index][field] = target.value;
            }
        }
    }
    renderPreview();
    saveState();
}

export function handleAddRow(dataType, newRowObject) {
    if (dataType === 'budget.income' || dataType === 'budget.expense') {
        const [main, sub] = dataType.split('.');
        if (!planData[main]) planData[main] = {}; // 安全対策
        if (!planData[main][sub]) planData[main][sub] = [];
        planData[main][sub].push(newRowObject);
    } else {
        if (!planData[dataType]) planData[dataType] = [];
        planData[dataType].push(newRowObject);
    }
    populateForm();
    saveState();
}

export function handleDeleteRow(event) {
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
            } else if (dataType) {
                planData[dataType].splice(index, 1);
            }
            populateForm();
            renderPreview();
            saveState();
        }
    }
}

export function handleSaveButton() {
    saveState();
    alert('現在の内容をブラウザに保存しました。');
}

export function handleClearButton() {
    if (confirm('警告！\n入力されたすべてのデータ（保存された内容も含む）が消去されます。\n本当によろしいですか？')) {
        clearState();
        alert('データを消去しました。ページをリロードします。');
        location.reload();
    }
}

export function handleLoadTemplate() {
    const select = document.getElementById('template-select');
    const templateName = select.value;
    if (loadTemplate(templateName)) {
        populateForm();
        renderPreview();
    }
}

export function handleSaveTemplate() {
    const input = document.getElementById('template-name-input');
    const templateName = input.value.trim();
    if (saveTemplate(templateName)) {
        input.value = '';
        renderTemplateSelector();
    }
}

export function handleDeleteTemplate() {
    const select = document.getElementById('template-select');
    const templateName = select.value;
    if (deleteTemplate(templateName)) {
        renderTemplateSelector();
    }
}
