// 各モジュールから必要な関数をインポート
import { loadState } from './state.js';
import { populateForm, renderPreview } from './ui.js';
import {
    handleGenericInput,
    handleDeleteRow,
    handleAddRow,
    handleSaveButton,
    handleClearButton,
    handleLoadTemplate,
    handleSaveTemplate,
    handleDeleteTemplate
} from './handlers.js';

// DOMの読み込みが完了したらアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    populateForm();
    renderPreview();
    initializeEventListeners();
    console.log('計画書ジェネレーターが初期化されました。');
});

// イベントリスナーをまとめて設定する関数
function initializeEventListeners() {
    const editorPane = document.querySelector('.editor-pane');
    
    // 入力と削除はイベント委任で効率化
    editorPane.addEventListener('input', handleGenericInput);
    editorPane.addEventListener('click', handleDeleteRow);

    // 追加ボタン
    document.getElementById('add-schedule-row').addEventListener('click', () => handleAddRow('schedule', 
        { time: '', item: '', details: '', cast: '', materials: '', notes: '' }
    ));
    document.getElementById('add-income-row').addEventListener('click', () => handleAddRow('budget.income', 
        { item: '', description: '', amount: '' }
    ));
    document.getElementById('add-expense-row').addEventListener('click', () => handleAddRow('budget.expense', 
        { item: '', description: '', amount: '' }
    ));

    // ヘッダーのコントロールボタン
    document.getElementById('save-button').addEventListener('click', handleSaveButton);
    document.getElementById('clear-button').addEventListener('click', handleClearButton);
    document.getElementById('print-button').addEventListener('click', () => window.print());

    // テンプレート機能のボタン
    document.getElementById('load-template-button').addEventListener('click', handleLoadTemplate);
    document.getElementById('save-template-button').addEventListener('click', handleSaveTemplate);
    document.getElementById('delete-template-button').addEventListener('click', handleDeleteTemplate);

    // 動的テーブルにデータタイプを設定（イベント委任で識別するため）
    document.getElementById('schedule-table').dataset.type = 'schedule';
    document.getElementById('income-table').dataset.type = 'budget.income';
    document.getElementById('expense-table').dataset.type = 'budget.expense';
}
