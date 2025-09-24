// ==UserScript==
// @name          HH3D - Khoáng mạch
// @namespace     Tông 000
// @version       1.0
// @description   Hiện tu vi khoáng mạch
// @author        Dr. Trune
// @match         https://hoathinh3d.gg/khoang-mach*
// @run-at        document-start
// @grant         GM_xmlhttpRequest
// @connect       raw.githubusercontent.com
// ==/UserScript==
(async function() {
    'use strict';
    const weburl = 'https://hoathinh3d.gg/';
    const ajaxUrl = weburl + 'wp-content/themes/halimmovies-child/hh3d-ajax.php';
    let  isCssInjected = false; // Biến để theo dõi trạng thái chèn CSS

     /**
     * Lấy security nonce một cách chung chung từ một URL.
     *
     * @param {string} url - URL của trang web cần lấy nonce.
     * @param {RegExp} regex - Biểu thức chính quy (regex) để tìm và trích xuất nonce.
     * @returns {Promise<string|null>} Trả về security nonce nếu tìm thấy, ngược lại trả về null.
     */
    async function getSecurityNonce(url, regex) {
        // Sử dụng một tiền tố log cố định cho đơn giản
        const logPrefix = '[HH3D Auto]';

        console.log(`${logPrefix} ▶️ Đang tải trang từ ${url} để lấy security nonce...`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();

            const match = html.match(regex);
            if (match && match[1]) {
                const nonce = match[1];
                console.log(`${logPrefix} ✅ Đã trích xuất thành công security nonce: ${nonce}`);
                return nonce;
            } else {
                console.error(`${logPrefix} ❌ Không tìm thấy security nonce trong mã nguồn.`);
                return null;
            }
        } catch (e) {
            console.error(`${logPrefix} ❌ Lỗi khi tải trang hoặc trích xuất nonce:`, e);
            return null;
        }
    }

    async function getAccountId() {
        const html = document.documentElement.innerHTML;
        const regexList = [
            /"user_id"\s*:\s*"(\d+)"/,       // "user_id":"123"
            /current_user_id\s*:\s*'(\d+)'/  // current_user_id: '123'
        ];

        // --- Thử lấy trực tiếp từ DOM ---
        for (const regex of regexList) {
            const match = html.match(regex);
            if (match) {
                console.log('Lấy account ID trực tiếp từ html');
                return match[1];
            }
        }

        // --- Fallback: thử fetch trang chính với từng regex ---
        for (const regex of regexList) {
            const id = await getSecurityNonce(weburl + '?t', regex);
            if (id) {
                console.log('Lấy account ID qua fetch fallback');
                return id;
            }
        }

        return null;
    }

    async function getDivContent(url, selector) {
        const logPrefix = '[HH3D Auto]';

        console.log(`${logPrefix} ▶️ Đang tải trang từ ${url} để lấy nội dung...`);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const html = await response.text();

            // Sử dụng DOMParser để phân tích mã HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Tìm phần tử bằng selector
            const element = doc.querySelector(selector);
            
            if (element) {
                const content = element.innerHTML;
                console.log(`${logPrefix} ✅ Đã trích xuất thành công nội dung: ${content}`);
                return content;
            } else {
                console.error(`${logPrefix} ❌ Không tìm thấy phần tử với bộ chọn: ${selector}`);
                return null;
            }
        } catch (e) {
            console.error(`${logPrefix} ❌ Lỗi khi tải trang hoặc trích xuất nội dung:`, e);
            return null;
        }
    }

    // Hàm để kiểm tra một tông có tồn tại trong danh sách không
    async function kiemTraTenTong(tenTong) {
        try {
            // Tải file JSON từ server (hoặc một đường dẫn trực tiếp)
            const response = await fetch('https://gist.githubusercontent.com/syntaxerr0r/1f09cda9432b94a671ea968f16dd26c4/raw/a349fefcae7dced131c1c10efc980fa62ae31138/gistfile1.txt');
            
            // Kiểm tra xem phản hồi có thành công không
            if (!response.ok) {
                throw new Error(`Không thể tải file JSON: ${response.statusText}`);
            }
            
            // Phân tích cú pháp JSON
            const danhSachTong = await response.json();
            
            // Chuyển tên tông nhập vào thành chữ thường để so sánh không phân biệt hoa thường
            const tenTongThuong = tenTong.toLowerCase();

            // Kiểm tra xem tên tông có trong danh sách không
            const isExist = danhSachTong.some(tong => tong.toLowerCase() === tenTongThuong);
            
            // Trả về kết quả true/false
            return isExist;

        } catch (error) {
            console.error('Lỗi khi kiểm tra tông:', error);
            return false;
        }
    }

    class hienTuviKhoangMach {
        constructor() {
            this.selfTuViCache = null;
            this.mineImageSelector = '.mine-image';
            this.attackButtonSelector = '.attack-btn';
            this.currentMineUsers = []; // Sẽ lưu dữ liệu người dùng tại đây
            this.tempObserver = null; // Biến để lưu MutationObserver tạm thời
            this.nonce = null;
            this.headers = {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'X-Requested-With': 'XMLHttpRequest'
            };
            this.currentMineId = null;
            this.tempObserverRearrange = null; // Biến để lưu MutationObserver tạm thời khi sắp xếp

        }
        async getNonce() {
            const htmlSource = document.documentElement.innerHTML;
            const regex = /action:\s*'get_users_in_mine',\s*mine_id:\s*mine_id,\s*security:\s*'([a-f0-9]+)'/;
            const match = htmlSource.match(regex);
            return match ? match[1] : null;
        }

        async getSelfTuVi() {
            if (this.selfTuViCache !== null) {
                return this.selfTuViCache;
            }
            const el = document.querySelector('#head_manage_acc');
            const text = el?.textContent || "";
            const num = text.match(/\d+/);
            if (num) {
                this.selfTuViCache = parseInt(num[0]);
                return this.selfTuViCache;
            }
            return null;
        }

        winRate(selfTuVi, opponentTuVi) {
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

        upsertTuViInfo(btn, userId, opponentTuVi, myTuVi) {
            const cls = 'hh3d-tuvi-info';
            const next = btn.nextElementSibling;
            const opponentTuViText = typeof opponentTuVi === 'number' ? opponentTuVi : 'Unknown';
            
            // Tạo nội dung HTML một lần duy nhất
            const rate = this.winRate(myTuVi, opponentTuVi).toFixed(2);
            const rateNumber = parseFloat(rate);
            let rateColor;
            if (rateNumber < 25) {
                rateColor = '#ff5f5f'; // Red
            } else if (rateNumber > 75) {
                rateColor = '#00ff00'; // Green
            } else {
                rateColor = '#ffff00ff'; // White
            }

            let displayRate = rate;
            if (rateNumber === 0.00) {
                displayRate = '0';
            } else if (rateNumber === 100.00) {
                displayRate = '100';
            }
            let innerHTMLContent = '';
            if (myTuVi <= 10 * opponentTuVi) {
            innerHTMLContent = `
                <p><strong>Tu Vi:</strong> <span style="font-weight: bold; color: #ffff00ff;">${opponentTuViText}</span></p>
                <p><strong>Tỷ Lệ Thắng:</strong> <span style="font-weight: bold; color: ${rateColor};">${displayRate}%</span></p>
            `;
            } else {
            innerHTMLContent = `
                <p><strong>Tu Vi:</strong> <span style="font-weight: bold; color: #ffff00ff;">${opponentTuViText}</span></p>
                <p><span style="font-weight: bold; color: #00ff00ff;">Không tốn lượt</span></p>
            `;
            }

            if (next && next.classList.contains(cls) && next.dataset.userId === String(userId)) {
                next.innerHTML = innerHTMLContent;
                return;
            }

            document.querySelectorAll(`.${cls}[data-user-id="${userId}"]`).forEach(el => {
                if (el !== next) el.remove();
            });

            const info = document.createElement('div');
            info.className = cls;
            info.dataset.userId = String(userId);
            info.style.fontSize = '12px';
            info.style.color = '#fff';
            info.style.marginTop = '3px';
            info.style.backgroundColor = 'none';
            info.style.padding = '0px 0px';
            info.style.border = 'none';
            
            // Sử dụng biến đã tạo ở trên
            info.innerHTML = innerHTMLContent;
            
            btn.insertAdjacentElement('afterend', info);
        }

        async getUsersInMine(mineId) {
            const payload = new URLSearchParams({ action: 'get_users_in_mine', mine_id: mineId, security: this.nonce });
            try {
                    const r = await fetch(ajaxUrl, { method: 'POST', headers: this.headers, body: payload, credentials: 'include' });
                    const d = await r.json();
                    return d.success ? d.data : (showNotification(d.message || 'Lỗi lấy thông tin người chơi.', 'error'), null);
            } catch (e) { console.error(`${this.logPrefix} ❌ Lỗi mạng (lấy user):`, e); return null; }
        }

        async showTuViOnAttackButtons() {
            if (!this.currentMineUsers || this.currentMineUsers.length === 0) {
                // Không có dữ liệu, không làm gì cả
                return;
            }

            const myTuVi = await this.getSelfTuVi();
            if (!myTuVi) return;

            const buttons = document.querySelectorAll(this.attackButtonSelector);
            
            for (const btn of buttons) {
                if (btn.dataset.tuviAttached === '1') continue;
                btn.dataset.tuviAttached = '1';

                const userId = btn.getAttribute('data-user-id');
                const opponent = this.currentMineUsers.find(u => String(u.id) === String(userId));
                
                if (opponent && opponent.mycred_points) {
                    const opponentTuVi = opponent.mycred_points;
                    this.upsertTuViInfo(btn, userId, opponentTuVi, myTuVi);
                } else {
                    this.upsertTuViInfo(btn, userId, 'Unknow', myTuVi);
                }
            }
        }

        async showTotalEnemies(data, mineId) {
            const currentMineUsers = data && data.users ? data.users : [];
            let totalEnemies = 0; let totalEnemiesTuVi = 0;
            let totalLienMinh = 0; let totalLienMinhTuVi = 0;
            let totalDongMon = 0; let totalDongMonTuVi = 0;
            const myTuVi = await this.getSelfTuVi();
            let isInMine = currentMineUsers.some(user => user.id.toString() === accountId.toString());
            for (let user of currentMineUsers) {
                if (user.dong_mon) {
                    totalDongMon++;
                    totalDongMonTuVi += user.mycred_points || 0;
                } else if (user.lien_minh) {
                    totalLienMinh++;
                    totalLienMinhTuVi += user.mycred_points || 0;
                } else {
                        totalEnemies++;
                        totalEnemiesTuVi += user.mycred_points || 0;
                }
            }
            

            const bonus_display = document.querySelector('#bonus-display');
            const batquai_section = document.querySelector('#batquai-section');
            const pagination = document.querySelector('.pagination');
            const page_indicator = document.querySelector('#page-indicator');
            if (bonus_display) {
                let existingInfo = document.querySelector('.hh3d-mine-info');
                if (!existingInfo) {
                    existingInfo = document.createElement('div');
                    existingInfo.className = 'hh3d-mine-info';
                    //existingInfo.style.right = '5px';
                    existingInfo.style.fontSize = '11px';
                    existingInfo.style.color = '#fff';
                    existingInfo.style.marginLeft = '-1px';
                    existingInfo.style.backgroundColor = 'none';
                    existingInfo.style.padding = '0px 0px';
                    existingInfo.style.border = 'none';
                    existingInfo.style.textAlign = 'left';
                    existingInfo.style.fontFamily = 'Font Awesome 5 Free';
                    bonus_display.prepend(existingInfo);
                    bonus_display.style.display = 'block';
                    batquai_section.style.display = 'block';
                    const observer = new MutationObserver(() => {
                        bonus_display.style.display = 'block';
                        batquai_section.style.display = 'block';
                        pagination.style.display = 'block';
                        page_indicator.style.display = 'block';
                        });
                    observer.observe(bonus_display, { attributes: true, attributeFilter: ['style'] });
                    observer.observe(batquai_section, { attributes: true, attributeFilter: ['style'] });
                    observer.observe(pagination, { attributes: true, attributeFilter: ['style'] });
                    observer.observe(page_indicator, { attributes: true, attributeFilter: ['style'] });
                }
                const kNum = (num) => {
                    const rounded = Math.round(num / 1000);
                    const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
                    return formatted + 'k';
                };
                existingInfo.innerHTML = `
                    <h style="color: #ff5f5f;">🩸Kẻ địch: <b>${totalEnemies} (${kNum(totalEnemiesTuVi)})</b></h><br>
                    <h style="color: #ffff00;">🤝Liên Minh: <b>${totalLienMinh} (${kNum(totalLienMinhTuVi)})</b></h><br>
                    <h style="color: #9c59bdff;">☯️Đồng Môn: <b>${totalDongMon} (${kNum(totalDongMonTuVi)})</b></h>
                `;
            }
        }

        async handleMineClick(mineId) {
            // Xóa luồng cũ nếu có
            if (this.tempObserver) {
                this.tempObserver.disconnect();
                this.tempObserver = null;
            }

            // Bắt đầu luồng mới
            const data = await this.getUsersInMine(mineId);
            if (data && data.users) {
                this.currentMineUsers = data.users;
            } else {
                this.currentMineUsers = [];
            }
            this.showTotalEnemies(data, mineId);
            const attackButtons = document.querySelectorAll(this.attackButtonSelector);
            if (attackButtons.length > 0) {
                this.showTuViOnAttackButtons();
            }
            this.tempObserver = new MutationObserver(() => {
                const attackButtons = document.querySelectorAll(this.attackButtonSelector);
                if (attackButtons.length > 0) {
                    this.showTuViOnAttackButtons();
                }
            });
            
            this.tempObserver.observe(document.body, { childList: true, subtree: true });
        }

        async addEventListenersToReloadBtn() {
            const reloadBtn = document.querySelector('#reload-btn');
            if (reloadBtn && !reloadBtn.dataset.listenerAdded) {
                reloadBtn.addEventListener('click', async () => {
                    await this.handleMineClick(this.currentMineId);
                });
                reloadBtn.dataset.listenerAdded = 'true';
            }
        }

        async addEventListenersToMines() {
            const mineImages = document.querySelectorAll(this.mineImageSelector);
            mineImages.forEach(image => {
                if (!image.dataset.listenerAdded) {
                    image.addEventListener('click', async (event) => {
                        const mineId = event.currentTarget.getAttribute('data-mine-id');
                        if (mineId) {
                            this.currentMineId = mineId;
                            this.handleMineClick(mineId);
                            this.addEventListenersToReloadBtn();
                        }
                    });
                    image.dataset.listenerAdded = 'true';
                }
            });
        }

        async startUp() {
            if (document.readyState === 'loading') {
                await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
            }
            await this.getSelfTuVi();
            this.nonce = await this.getNonce();
            this.addEventListenersToMines();

            // MutationObserver chính để thêm listener cho các mỏ mới
            const mainObserver = new MutationObserver(() => {
                this.addEventListenersToMines();
            });
            
            mainObserver.observe(document.body, { childList: true, subtree: true });
        }
    }

    function showNotification(message, type = 'success', duration = 3000) {

        // --- Bắt đầu phần chèn CSS tự động ---
        if (!isCssInjected) {
            const style = document.createElement('style');
            style.type = 'text/css';
            style.innerHTML = `
                #hh3d-notification-container {
                  position: fixed;
                  top: 20px;
                  right: 20px;
                  display: flex;
                  flex-direction: column;
                  align-items: flex-end;
                  gap: 10px;
                  z-index: 10000;
                  pointer-events: none;
                }

                .hh3d-notification-item {
                  padding: 10px 20px;
                  border-radius: 5px;
                  color: white;
                  min-width: 250px;
                  max-width: 350px;
                  pointer-events: auto;
                  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
                  transition: all 0.5s ease-in-out;
                  opacity: 0;
                  transform: translateX(100%);
                  background-color: white;
                }

                .hh3d-notification-item.success {
                  background-color: #4CAF50;
                }
                .hh3d-notification-item.warn {
                  background-color: #ff9800;
                }
                .hh3d-notification-item.error {
                  background-color: #f44336;
                }
                .hh3d-notification-item.info {
                  background-color: #0066ffff;
                }
            `;
            document.head.appendChild(style);
            isCssInjected = true;
        }
        // --- Kết thúc phần chèn CSS tự động ---

        // Log console
        const logPrefix = '[HH3D Notification]';
        if (type === 'success') {
            console.log(`${logPrefix} ✅ SUCCESS: ${message}`);
        } else if (type === 'warn') {
            console.warn(`${logPrefix} ⚠️ WARN: ${message}`);
        } else if (type === 'info') {
            console.info(`${logPrefix} ℹ️ INFO: ${message}`);
        } else {
            console.error(`${logPrefix} ❌ ERROR: ${message}`);
        }

        // Tạo container nếu chưa tồn tại
        let container = document.getElementById('hh3d-notification-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'hh3d-notification-container';
            document.body.appendChild(container);
        }

        // Tạo item thông báo
        const notification = document.createElement('div');
        notification.className = `hh3d-notification-item ${type}`;
        if (/<[a-z][\s\S]*>/i.test(message)) {
            notification.innerHTML = message; // có HTML
        } else {
            notification.innerText = message; // chỉ text
        }

        container.appendChild(notification);

        // Hiển thị thông báo với hiệu ứng trượt vào
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });

        // Tự động ẩn và xóa thông báo
        let timeoutId = setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 500);
        }, duration);

        // Cho phép người dùng tương tác
        notification.addEventListener('mouseenter', () => {
            clearTimeout(timeoutId);
        });

        notification.addEventListener('mouseleave', () => {
            timeoutId = setTimeout(() => {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => notification.remove(), 500);
            }, 500);
        });

        notification.addEventListener('click', () => {
            clearTimeout(timeoutId);
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 500);
        });
    };



    const accountId = await getAccountId();
    if (!accountId) {
        showNotification('Không thể lấy account ID. Script dừng lại.', 'error', 5000);
        return;
    }

    const tongMon = await getDivContent(weburl + 'danh-sach-thanh-vien-tong-mon?t', '.name-tong-mon');
    const checkTongMon = await kiemTraTenTong(tongMon);
    if (checkTongMon) {
        const khoangmach = new hienTuviKhoangMach();
        khoangmach.startUp();
    } else {
        showNotification(`Chỉ có tông <b>0 0 0</b> và liên minh được phép dùng`, 'warn', 5000);
    }

})();