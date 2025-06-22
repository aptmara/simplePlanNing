import { planData, getTemplates } from './state.js';

const previewContent = document.getElementById('preview-content');
const incomeBody = document.getElementById('income-body');
const expenseBody = document.getElementById('expense-body');

export function renderPreview() {
    const { basicInfo, schedule, items, budget } = planData;
    let html = '';
    let formattedDate = '';
    if (basicInfo['plan-date']) { try { const date = new Date(basicInfo['plan-date']); const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); const h = String(date.getHours()).padStart(2, '0'); const min = String(date.getMinutes()).padStart(2, '0'); formattedDate = `${y}年${m}月${d}日 ${h}:${min}`; } catch(e) { formattedDate = '（日付形式エラー）'; } }
    const goalsHtml = (basicInfo.goals || '').split('\n').filter(g => g).map(goal => `<li>${goal}</li>`).join('');
    html += `<h1>${basicInfo['plan-name']}</h1><div class="preview-section"><h2>1. 基本情報</h2><p><strong>開始日時:</strong> ${formattedDate}</p><p><strong>期間:</strong> ${basicInfo['plan-duration'] || 1} 日間</p><p><strong>場所:</strong> ${basicInfo['plan-location']}</p><p><strong>責任者:</strong> ${basicInfo['plan-manager']}</p></div><div class="preview-section"><h2>2. 目的</h2><p>${(basicInfo.purpose || '').replace(/\n/g, '<br>')}</p></div><div class="preview-section"><h2>3. 目標</h2><ul>${goalsHtml}</ul></div>`;
    
    let scheduleTableHtml = `<table class="preview-table"><thead><tr><th>時間</th><th>項目</th><th>内容</th><th>配役</th><th>資材</th><th>留意事項</th></tr></thead><tbody>`;
    const sortedSchedule = [...(schedule || [])].sort((a, b) => new Date(a.start) - new Date(b.start));
    sortedSchedule.forEach(event => {
        if (!event) return;
        const start = new Date(event.start);
        const end = new Date(event.end);
        const timeStr = (start && end && !isNaN(start) && !isNaN(end)) ? `${start.getHours()}:${String(start.getMinutes()).padStart(2, '0')} - ${end.getHours()}:${String(end.getMinutes()).padStart(2, '0')}` : '時間未設定';
        const props = event.extendedProps || {};
        scheduleTableHtml += `<tr><td>${timeStr}</td><td>${event.title || ''}</td><td>${(props.details || '').replace(/\n/g, '<br>')}</td><td>${props.cast || ''}</td><td>${props.materials || ''}</td><td>${(props.notes || '').replace(/\n/g, '<br>')}</td></tr>`;
    });
    scheduleTableHtml += '</tbody></table>';
    html += `<div class="preview-section"><h2>4. 詳細スケジュール</h2>${scheduleTableHtml}</div>`;
    
    const personalItemsHtml = (items.personal || '').split('\n').filter(i => i).map(i => `<li>${i}</li>`).join('');
    const groupItemsHtml = (items.group || '').split('\n').filter(i => i).map(i => `<li>${i}</li>`).join('');
    html += `<div class="preview-section"><h2>5. 持ち物リスト</h2><h3>個人装備</h3><ul>${personalItemsHtml}</ul><h3>班装備</h3><ul>${groupItemsHtml}</ul></div>`;
    
    const totalIncome = (budget.income || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const totalExpense = (budget.expense || []).reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    const balance = totalIncome - totalExpense;
    html += `<div class="preview-section"><h2>6. 会計報告</h2>`;
    html += `<h3>収入の部</h3><table class="preview-table"><thead><tr><th>項目</th><th>摘要</th><th>金額</th></tr></thead><tbody>`;
    (budget.income || []).forEach(row => { html += `<tr><td>${row.item || ''}</td><td>${row.description || ''}</td><td class="amount">${(Number(row.amount) || 0).toLocaleString()} 円</td></tr>`; });
    html += `<tr><td colspan="2"><strong>収入合計</strong></td><td class="amount"><strong>${totalIncome.toLocaleString()} 円</strong></td></tr>`;
    html += `</tbody></table>`;
    html += `<h3 class="mt-1">支出の部</h3><table class="preview-table"><thead><tr><th>項目</th><th>摘要</th><th>金額</th></tr></thead><tbody>`;
    (budget.expense || []).forEach(row => { html += `<tr><td>${row.item || ''}</td><td>${row.description || ''}</td><td class="amount">${(Number(row.amount) || 0).toLocaleString()} 円</td></tr>`; });
    html += `<tr><td colspan="2"><strong>支出合計</strong></td><td class="amount"><strong>${totalExpense.toLocaleString()} 円</strong></td></tr>`;
    html += `</tbody></table>`;
    html += `<div class="budget-summary"><strong>残額: ${balance.toLocaleString()} 円</strong></div></div>`;
    previewContent.innerHTML = html;
}

function renderDynamicTable(tbodyElement, dataArray, fields) {
    tbodyElement.innerHTML = '';
    (dataArray || []).forEach((row, index) => {
        const tr = document.createElement('tr');
        tr.dataset.index = index;
        let innerHtml = '';
        fields.forEach(field => {
            const value = row[field.name] || '';
            if (field.type === 'textarea') {
                innerHtml += `<td><textarea class="dynamic-input" data-field="${field.name}" rows="2">${value}</textarea></td>`;
            } else {
                innerHtml += `<td><input type="${field.type || 'text'}" class="dynamic-input" data-field="${field.name}" value="${value}"></td>`;
            }
        });
        innerHtml += `<td><button class="delete-row">削除</button></td>`;
        tr.innerHTML = innerHtml;
        tbodyElement.appendChild(tr);
    });
}

export function populateForm() {
    for (const key in planData.basicInfo) {
        const element = document.getElementById(key);
        if (element) element.value = planData.basicInfo[key];
    }
    document.getElementById('items-personal').value = planData.items.personal || '';
    document.getElementById('items-group').value = planData.items.group || '';
    const budgetFields = [{ name: 'item' }, { name: 'description' }, { name: 'amount', type: 'number' }];
    renderDynamicTable(incomeBody, planData.budget.income, budgetFields);
    renderDynamicTable(expenseBody, planData.budget.expense, budgetFields);
    renderTemplateSelector();
}

export function renderTemplateSelector() {
    const templates = getTemplates();
    const select = document.getElementById('template-select');
    const selectedValue = select.value;
    select.innerHTML = '<option value="">テンプレートを選択...</option>';
    for (const name in templates) {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    }
    select.value = selectedValue;
}

export function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');
}