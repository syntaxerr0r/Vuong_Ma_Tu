// ==UserScript==
// @name         HH3D Khoang Mach
// @namespace    Dr. Trune
// @version      1.3
// @description  Thêm Tu Vi và tỷ lệ thắng ngay dưới nút Tấn Công
// @author       Dr. Trune
// @match        https://hoathinh3d.lol/khoang-mach*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(async function() {
    'use strict';

    console.log("HH3D Tu Vi Info đã khởi động");

    const weburl = 'https://hoathinh3d.lol';

    // HÀM XỬ LÝ CAN THIỆP THỜI GIAN
    const NEW_DELAY = 500;
    const originalSetInterval = window.setInterval;
    window.setInterval = function(callback, delay, ...args) {
        let actualDelay = delay;
        if (typeof callback === 'function' && callback.toString().includes('countdown--') && callback.toString().includes('clearInterval(countdownInterval)')) {
            actualDelay = NEW_DELAY;
            console.log(`%c[USERSCRIPT] Rút ngắn countdown từ ${delay}ms xuống ${actualDelay}ms.`, 'color: #32CD32;');
        }
        return originalSetInterval(callback, actualDelay, ...args);
    };

    // lấy nonce
    async function getNonce() {
        if (typeof customRestNonce !== 'undefined' && customRestNonce) {
            return customRestNonce;
        }
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
            const match = script.innerHTML.match(/customRestNonce\s*=\s*'([a-f0-9]+)'/);
            if (match) return match[1];
        }
        try {
            const html = await fetch(weburl + '?t').then(r => r.text());
            return html.match(/customRestNonce\s*=\s*'([a-f0-9]+)'/)?.[1] ?? null;
        } catch { return null; }
    }

    // lấy tu vi đối thủ
    async function getTuVi(userId) {
        const nonce = await getNonce();
        if (!nonce) return null;
        try {
            const res = await fetch(`${weburl}/wp-json/luan-vo/v1/search-users`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-WP-Nonce": nonce },
                body: JSON.stringify({ query: String(userId), page: 1 }),
                credentials: "include",
                mode: "cors"
            });
            return res.ok ? (await res.json())?.data?.users?.[0]?.points ?? null : null;
        } catch { return null; }
    }

    // tu vi bản thân
    let selfTuViCache = null;
    async function getSelfTuVi() {
        if (selfTuViCache !== null) return selfTuViCache;
        const el = document.querySelector('#head_manage_acc');
        const text = el?.textContent || "";
        const num = text.match(/\d+/);
        if (num) {
            selfTuViCache = parseInt(num[0]);
            return selfTuViCache;
        }
        return null;
    }

    // Đợi element xuất hiện (MutationObserver + timeout)
    function waitForElement(selector, timeout = 15000) {
        const found = document.querySelector(selector);
        if (found) return Promise.resolve(found);
        return new Promise((resolve) => {
            const obs = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    obs.disconnect();
                    clearTimeout(timer);
                    resolve(el);
                }
            });
            obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
            const timer = setTimeout(() => {
                obs.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    // DANH SÁCH CÁC MỐC TUVI (từ yếu -> mạnh)
    const TIERS_GROUPS = {
        "TuTiên": ["Luyện Khí Kỳ","Trúc Cơ","Kết Đan","Nguyên Anh","Hóa Thần","Luyện Hư","Hợp Thể","Đại Thừa","Độ Kiếp Kỳ","Chân Tiên","Kim Tiên"],
        "ĐấuKhí": ["Đấu Khí","Đấu Giả","Đấu Sư","Đấu Linh","Đấu Vương","Đấu Hoàng","Đấu Tông","Đấu Tôn","Đấu Thánh","Đấu Đế","Thiên Chí Tôn"],
        "TGHM": ["Bàn Huyết","Động Thiên","Hóa Linh","Minh Văn","Liệt Trận","Tôn Giả Cảnh","Thần Hỏa","Chân Nhất","Thánh Tế","Thiên Thần","Hư Đạo"],
        "TPTK": ["Học Đồ","Hành Tinh","Hằng Tinh Đại","Vũ Trụ","Vực Chủ","Giới Chủ","Bất Hủ","Vũ Trụ Tôn Giả","Vũ Trụ Chi Chủ","Chân Thần","Hư Không Chân Thần"],
        "ĐLĐL": ["Hồn Sĩ","Hồn Sư","Đại Hồn Sư","Hồn Tôn","Hồn Tông","Hồn Vương","Hồn Đế","Hồn Thánh","Hồn Đấu La","Phong Hào Đấu La","Thần Quan"],
        "TN": ["Luyện Khí Kỳ","Trúc Cơ","Kết Đan","Nguyên Anh","Hóa Thần","Anh Biến","Vấn Đỉnh","Âm Hư Dương Thực","Khuy Niết","Tịnh Niết","Toái Niết"],
        "Labels": ["PNTT","ĐPTK","TGHM","TPTK","ĐLĐL","TN"]
    };


    // Lấy profile và parse tier (ví dụ: <h4>...<b>Đấu Đế 《9★》</b></h4>)
    async function getProfileTier(userId) {
        if (!userId) return null;
        try {
            const res = await fetch(`${weburl}/profile/${userId}/`);
            if (!res.ok) return null;

            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');
            const h4 = doc.querySelector('h4');
            if (!h4) return null;

            const raw = (h4.querySelector('b')?.textContent || h4.textContent || "").trim();
            if (!raw) return null;

            // Lấy số sao gốc nếu có
            let star = null;
            const starMatch = raw.match(/《\s*(\d+)\s*★\s*》/);
            if (starMatch) {
                const num = parseInt(starMatch[1], 10);
                star = mapStar(num);
            }

            // Nếu chưa có star, thử từ nhãn phụ
            if (star === null) {
                const labelMatch = raw.match(/sơ kỳ|trung kỳ|hậu kỳ/ig);
                if (labelMatch) {
                    const label = labelMatch[0].toLowerCase();
                    star = label.includes('sơ') ? 3 : label.includes('trung') ? 6 : 9;
                }
            }

            // Chuẩn hóa tên mốc
            const tierName = raw
                .replace(/《.*?》/g, '')                  // bỏ phần trong 《...》
                .replace(/[《》]/g, '')                   // bỏ ký tự 《 hoặc 》
                .replace(/\d+\s*★/g, '')                 
                .replace(/sơ kỳ|trung kỳ|hậu kỳ/ig, '')  
                .trim();

            return { raw, name: tierName, star };
        } catch (e) {
            console.error('[HH3D] getProfileTier error', e);
            return null;
        }
    }

    function mapStar(num) {
        if (typeof num !== 'number') return null;
        const lastDigit = num % 10;
        if (lastDigit === 1) return 3;
        if (lastDigit === 0) return 3;
        if (lastDigit === 5) return 6;
        if (lastDigit === 6) return 6;
        if (lastDigit === 9) return 9;
        // có thể thêm logic khác nếu cần map 0 hoặc các số lẻ đặc biệt
        return null;
}


    // tìm id tài khoản hiện tại từ header (nếu có)
    async function getSelfProfileId() {
        const regexList = [/"user_id"\s*:\s*"(\d+)"/, /current_user_id\s*:\s*'(\d+)'/];
        const html = document.documentElement.innerHTML;
        for (const r of regexList) {
            const m = html.match(r);
            if (m) return m[1];
        }
        try {
            const t = await (fetch(weburl + '?t=' + Date.now())).text();
            for (const r of regexList) {
            const m = t.match(r);
            if (m) return m[1];
            }
        } catch {}
        return null;
        }


    // Lấy tier của tài khoản hiện tại (nếu có) bằng fetch profile
    let selfTierCache = null;
    async function getSelfTier() {
        if (selfTierCache !== null) return selfTierCache;
        const selfId = await getSelfProfileId();
        if (!selfId) return null;
        const t = await getProfileTier(selfId);
        selfTierCache = t;
        console.log('Self tier:', t);
        return t;
    }

    // so sánh hai tier theo TIERS_ORDER, trả về -1 nếu a < b (yếu hơn), 0 nếu bằng, 1 nếu a > b (mạnh hơn)
function compareTiers(a, b) {
    if (!a || !b) return 0;

    const findIndexInGroup = (name) => {
        for (const list of Object.values(TIERS_GROUPS)) {
            const idx = list.findIndex(x => x === name || x.startsWith(name) || x.includes(name) || name.includes(x));
            if (idx !== -1) return idx;
        }
        return -1;
    };

    const aIdx = findIndexInGroup(a.name);
    const bIdx = findIndexInGroup(b.name);

    if (aIdx !== -1 && bIdx !== -1) {
        if (aIdx < bIdx) return -1;
        if (aIdx > bIdx) return 1;
    } else if (aIdx !== -1) {
        return 1; // a có trong danh sách, b không có
    } else if (bIdx !== -1) {
        return -1; // b có trong danh sách, a không có
    }

    // cùng vị trí hoặc không tìm thấy → so star
    if ((a.star ?? 0) < (b.star ?? 0)) return -1;
    if ((a.star ?? 0) > (b.star ?? 0)) return 1;

    return 0;
}





    // helper: khi không có điểm numeric, dùng tier từ profile để quyết định winrate
    async function estimateWinrateByProfile(myTierObj, oppTierObj) {
        if (!oppTierObj) return null;
        // nếu không có myTierObj, cố gắng lấy
        if (!myTierObj) myTierObj = await getSelfTier();
        if (!myTierObj) return null;

        const cmp = compareTiers(myTierObj, oppTierObj);
        if (cmp < 0) return 0;     // opponent stronger -> 0%
        if (cmp > 0) return 100;   // opponent weaker -> 100%
        // nếu vẫn bằng, fallback 50%
        return 'Không rõ';
    }

    // công thức winrate
    function winRate(selfTuVi, opponentTuVi) {
        if (!selfTuVi || !opponentTuVi) return 0;
        let winChance = 50;
        const diff = selfTuVi - opponentTuVi;
        const ratio = diff > 0 ? selfTuVi / opponentTuVi : opponentTuVi / selfTuVi;
        const factor = ratio >= 8 ? 1 : ratio >= 7 ? 0.9 : ratio >= 6 ? 0.8 :
                       ratio >= 5 ? 0.7 : ratio >= 4 ? 0.6 : ratio >= 3 ? 0.5 :
                       ratio >= 2 ? 0.4 : 0.3;
        winChance += (diff / 1000) * factor;
        return Math.max(0, Math.min(100, winChance));
    }

    // tạo/cập nhật info
    function upsertTuViInfo(btn, userId, opponentTuVi, rate) {
        const cls = 'hh3d-tuvi-info';
        const next = btn.nextElementSibling;

        if (next && next.classList.contains(cls) && next.dataset.userId === String(userId)) {
            next.innerHTML = `Tu Vi: ${opponentTuVi}<br>Winrate: ${rate}%`;
            return;
        }
        document.querySelectorAll(`.${cls}[data-user-id="${userId}"]`).forEach(el => {
            if (el !== next) el.remove();
        });

        const info = document.createElement('div');
        info.className = cls;
        info.dataset.userId = String(userId);
        info.style.fontSize = '12px';
        info.style.color = '#0f0';
        info.style.marginTop = '4px';
        // nếu opponentTuVi là object (tier info), hiển thị phù hợp
        if (typeof opponentTuVi === 'object' && opponentTuVi !== null) {
            const stars = opponentTuVi.star ? ` ${opponentTuVi.star}★` : '';
            info.innerHTML = `Tier: ${opponentTuVi.name || opponentTuVi.raw || ''}${stars}<br>Winrate: ${rate}%`;
        } else {
            info.innerHTML = `Tu Vi: ${opponentTuVi}<br>Winrate: ${rate}%`;
        }

        btn.insertAdjacentElement('afterend', info);
    }

    // hiển thị cho các nút attack
    async function showTuVi(myTuVi) {
        if (!myTuVi) return;

        const buttons = document.querySelectorAll('.attack-btn');
        for (const btn of buttons) {
            if (btn.dataset.tuviAttached === '1') continue;
            btn.dataset.tuviAttached = '1';

            const userId = btn.getAttribute('data-user-id');
            if (!userId) continue;

            try {
                const opponentTuVi = await getTuVi(userId);
                if (opponentTuVi) {
                    const rate = winRate(myTuVi, opponentTuVi).toFixed(2);
                    upsertTuViInfo(btn, userId, opponentTuVi, rate);
                } else {
                    // không có điểm numeric -> thử fetch profile để lấy tier và estimate winrate
                    const oppTier = await getProfileTier(userId);
                    const myTier = await getSelfTier();
                    const estimated = await estimateWinrateByProfile(myTier, oppTier);
                    if (estimated !== null) {
                        upsertTuViInfo(btn, userId, oppTier || 'Unknown', `${estimated}`);
                    } else {
                        // fallback: nếu không lấy được thông tin nào -> giữ trạng thái 0% (người quá mạnh)
                        upsertTuViInfo(btn, userId, 'Unknown', '0');
                    }
                }
            } catch (e) {
                console.error('getTuVi error', e);
            }

            // nghỉ 300ms tránh spam
            await new Promise(r => setTimeout(r, 300));
        }
    }

    // Khởi tạo khi DOM đã sẵn sàng và phần tử #head_manage_acc có mặt (hoặc timeout)
    async function startUp() {
        if (document.readyState === 'loading') {
            await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
        }

        // Đợi #head_manage_acc để getSelfTuVi chắc chắn tìm được giá trị; nếu không có trong 15s thì vẫn tiếp tục
        await waitForElement('#head_manage_acc', 15000);

        const myTuVi = await getSelfTuVi();
        if (myTuVi) {
            await showTuVi(myTuVi);
        }

        // quan sát DOM để cập nhật khi các nút attack xuất hiện hoặc nội dung thay đổi
        let __timeout = null;
        const observer = new MutationObserver(() => {
            clearTimeout(__timeout);
            __timeout = setTimeout(async () => {
                const myTuVi2 = await getSelfTuVi();
                await showTuVi(myTuVi2);
            }, 200);
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    startUp();

})();
