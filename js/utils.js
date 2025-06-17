/**
 * utils.js
 * 汎用的なヘルパー関数
 */

export function timeToMinutes(timeString) {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
    // Day.jsを使って時刻をフォーマット
    return dayjs().startOf('day').add(totalMinutes, 'minute').format('HH:mm');
}

export function darkenColor(hex, percent) {
    if (!hex || hex.length < 7) return '#666';
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    r = Math.floor(r * (100 - percent) / 100);
    g = Math.floor(g * (100 - percent) / 100);
    b = Math.floor(b * (100 - percent) / 100);
    r = (r < 0) ? 0 : r;
    g = (g < 0) ? 0 : g;
    b = (b < 0) ? 0 : b;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function lightenColor(hex, percent) {
    if (!hex || hex.length < 7) return '#aaa';
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    r = Math.floor(r + (255 - r) * (percent / 100));
    g = Math.floor(g + (255 - g) * (percent / 100));
    b = Math.floor(b + (255 - b) * (percent / 100));
    r = (r > 255) ? 255 : r;
    g = (g > 255) ? 255 : g;
    b = (b > 255) ? 255 : b;
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function formatMinutes(minutes) {
    if (minutes === 0) return '0分';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    let result = '';
    if (h > 0) result += `${h}時間`;
    if (m > 0) result += `${m}分`;
    return result;
}

export function validateField(inputElement, errorMessage) {
    const errorElement = document.getElementById(`${inputElement.id}Error`);
    if (inputElement.value.trim() === '') {
        inputElement.classList.add('is-invalid');
        errorElement.textContent = errorMessage;
        return false;
    } else {
        inputElement.classList.remove('is-invalid');
        errorElement.textContent = '';
        return true;
    }
}