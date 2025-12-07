    // ===============================================
    // Bộ lọc tông môn
    // ===============================================
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

    async function kiemTraTenTong(tenTong) {
        try {
            // Gọi GitHub API để lấy nội dung gist
            const response = await fetch('https://api.github.com/gists/7e1499363ce6aca6215bfaf10267d90d');

            if (!response.ok) {
                throw new Error(`Không thể tải gist: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Lấy nội dung của file (ở đây là gistfile1.txt, bạn có thể đổi nếu tên khác)
            const file = data.files['tên tông cho tool'];
            if (!file) {
                throw new Error("Không tìm thấy file trong gist.");
            }

            // Nội dung file ở dạng text → parse sang JSON
            const danhSachTong = JSON.parse(file.content);

            // Chuẩn hóa tên tông nhập vào
            const tenTongThuong = tenTong.toLowerCase();

            // Kiểm tra tồn tại
            const isExist = danhSachTong.some(tong => tong.toLowerCase() === tenTongThuong);

            return isExist;

        } catch (error) {
            console.error('Lỗi khi kiểm tra tông:', error);
            return false;
        }
    }

    async function checkTongMon() {
        const tongMonHopLe =  sessionStorage.getItem('tong_mon_hop_le') === '1'|| false;
        if (!tongMonHopLe) {
            const tongMon = await getDivContent(weburl + 'danh-sach-thanh-vien-tong-mon?t', '.name-tong-mon');
            const isValid = await kiemTraTenTong(tongMon);
            if (isValid) {
                sessionStorage.setItem('tong_mon_hop_le', '1');
                return true;
            } else {
                sessionStorage.setItem('tong_mon_hop_le', '0');
                return false;
            } 
        } else {
            return true;
        } 
    }

    // ===============================================
    // KHỞI ĐỘNG CHƯƠNG TRÌNH
    // ===============================================

    if (await checkTongMon() === false) {
        showNotification('[HH3D] ⚠️ Tông môn không hợp lệ. Vui lòng tham gia tông môn hợp lệ để sử dụng script.', 'error', 3000);
        return;
    }