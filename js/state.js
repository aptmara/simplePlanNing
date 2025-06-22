const PLAN_DATA_KEY = 'planData-v1';
const TEMPLATES_KEY = 'planTemplates-v1';

export let planData = {
    basicInfo: { 'plan-name': '（計画名）', 'plan-date': '', 'plan-location': '', 'plan-manager': '', 'plan-purpose': '', 'plan-goals': '' },
    schedule: [],
    items: { personal: '', group: '' },
    budget: { income: [], expense: [] }
};

export function saveState() {
    try {
        localStorage.setItem(PLAN_DATA_KEY, JSON.stringify(planData));
    } catch (e) { console.error('データの保存に失敗しました。', e); }
}

export function loadState() {
    try {
        const json = localStorage.getItem(PLAN_DATA_KEY);
        if (json) {
            const loadedData = JSON.parse(json);
            planData = { ...planData, ...loadedData };
        }
    } catch (e) { console.error('データの読み込みに失敗しました。', e); }
}

export function clearState() {
    localStorage.removeItem(PLAN_DATA_KEY);
}

export function getTemplates() {
    try {
        const json = localStorage.getItem(TEMPLATES_KEY);
        return json ? JSON.parse(json) : {};
    } catch (e) {
        console.error('テンプレートの取得に失敗', e);
        return {};
    }
}

export function saveTemplate(templateName) {
    if (!templateName) {
        alert('テンプレート名を入力してください。');
        return false;
    }
    const templates = getTemplates();
    templates[templateName] = { ...planData };
    try {
        localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
        alert(`「${templateName}」をテンプレートとして保存しました。`);
        return true;
    } catch (e) {
        console.error('テンプレートの保存に失敗', e);
        alert('テンプレートの保存に失敗しました。');
        return false;
    }
}

export function loadTemplate(templateName) {
    if (!templateName) return false;
    const templates = getTemplates();
    if (templates[templateName]) {
        if (confirm(`「${templateName}」を読み込みますか？\n現在の編集内容は上書きされます。`)) {
            planData = templates[templateName];
            saveState();
            return true;
        }
    } else {
        alert('テンプレートが見つかりません。');
    }
    return false;
}

export function deleteTemplate(templateName) {
    if (!templateName) return false;
    const templates = getTemplates();
    if (templates[templateName]) {
        if (confirm(`テンプレート「${templateName}」を削除しますか？\nこの操作は元に戻せません。`)) {
            delete templates[templateName];
            try {
                localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
                alert(`「${templateName}」を削除しました。`);
                return true;
            } catch (e) {
                console.error('テンプレートの削除に失敗', e);
                alert('テンプレートの削除に失敗しました。');
            }
        }
    } else {
        alert('削除するテンプレートが見つかりません。');
    }
    return false;
}
