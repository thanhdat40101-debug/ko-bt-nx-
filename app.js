import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    onSnapshot, 
    addDoc, 
    updateDoc, 
    deleteDoc, 
    query, 
    orderBy, 
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    // --- FIREBASE INITIALIZATION ---
    const firebaseConfig = {
        apiKey: "AIzaSyDpJMzePjlYtHJY_Us51AgNAM6INdTVjYU",
        authDomain: "ko-bt-nx.firebaseapp.com",
        projectId: "ko-bt-nx",
        storageBucket: "ko-bt-nx.firebasestorage.app",
        messagingSenderId: "967446026907",
        appId: "1:967446026907:web:19a5e37a82f4e65c6b843e",
        measurementId: "G-6MEFN5GGRR"
    };

    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    // --- CORE DATA ---
    let currentCart = [];
    let tableOrders = {}; 
    let selectedTableForBill = null;
    let targetTableId = null; 
    let orderHistory = [];
    let menuItems = [];
    let currentCategory = 'Tất cả';

    let stats = {
        totalRevenue: 0,
        totalOrders: 0,
        guestCount: 0,
        cashTotal: 0,
        transferTotal: 0
    };

    let printSettings = {
        paperSize: 58,
        showLogo: true,
        showQR: true,
        showWiFi: false,
        showTax: false,
        showNote: true,
        headerText: '',
        footerText: ''
    };

    // --- AUTHENTICATION STATE ---
    let currentRole = 'staff';
    let enteredPin = '';

    // --- CHARTS STATE ---
    let revenueChart = null;
    let paymentChart = null;

    // --- INITIALIZATION ---
    window.initApp = function() {
        console.log("⚡ Đang khởi tạo ứng dụng (Firebase Firestore Realtime Mode)...");
        
        // 1. Kiểm tra trạng thái đăng nhập từ sessionStorage
        const savedRole = sessionStorage.getItem('goat_user_role');
        const loginOverlay = document.getElementById('login-overlay');
        
        if (!savedRole) {
            if (loginOverlay) loginOverlay.style.display = 'flex';
        } else {
            if (loginOverlay) loginOverlay.style.display = 'none';
            applyRoleSettings();
        }

        updateHeaderDate();

        // 2. Lắng nghe cấu hình in realtime từ Firestore
        onSnapshot(doc(db, 'settings', 'print'), (docSnap) => {
            if (docSnap.exists()) {
                printSettings = docSnap.data();
            } else {
                // Khởi tạo mặc định nếu chưa tồn tại
                setDoc(doc(db, 'settings', 'print'), printSettings);
            }
            syncPrintSettingsToUI();
        });

        // 3. Lắng nghe mã QR ngân hàng realtime từ Firestore
        onSnapshot(doc(db, 'settings', 'payment'), (docSnap) => {
            const previewImg = document.getElementById('qr-preview-img');
            const placeholder = document.getElementById('qr-preview-placeholder');
            const billQRImg = document.getElementById('bill-qr-code-img');
            const missingMsg = document.getElementById('qr-missing-msg');
            
            if (docSnap.exists() && docSnap.data().qrCode) {
                const qrData = docSnap.data().qrCode;
                if (previewImg) { previewImg.src = qrData; previewImg.style.display = 'block'; }
                if (placeholder) placeholder.style.display = 'none';
                if (billQRImg) { billQRImg.src = qrData; billQRImg.style.display = 'block'; }
                if (missingMsg) missingMsg.style.display = 'none';
            } else {
                if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
                if (placeholder) placeholder.style.display = 'block';
                if (billQRImg) { billQRImg.src = ''; billQRImg.style.display = 'none'; }
                if (missingMsg) missingMsg.style.display = 'block';
            }
        });

        // 4. Lắng nghe danh sách bàn có đơn realtime từ Firestore
        onSnapshot(collection(db, 'tables'), (querySnapshot) => {
            tableOrders = {};
            querySnapshot.forEach((doc) => {
                const tableId = parseInt(doc.id.replace('table_', ''));
                tableOrders[tableId] = doc.data();
            });
            renderTables();
            
            // Cập nhật lại Modal hóa đơn chi tiết nếu đang mở
            if (selectedTableForBill) {
                if (tableOrders[selectedTableForBill]) {
                    window.viewTableBill(selectedTableForBill);
                } else {
                    window.closeAllModals();
                }
            }
        });

        // 5. Lắng nghe danh mục món ăn tùy chỉnh realtime từ Firestore
        onSnapshot(collection(db, 'menu'), (querySnapshot) => {
            menuItems = [];
            querySnapshot.forEach((doc) => {
                menuItems.push(doc.data());
            });
            renderProducts(currentCategory);
        });

        // 6. Lắng nghe lịch sử đơn hàng realtime từ Firestore (sắp xếp thời gian mới nhất)
        const historyQuery = query(collection(db, 'history'), orderBy('createdAt', 'desc'));
        onSnapshot(historyQuery, (querySnapshot) => {
            orderHistory = [];
            querySnapshot.forEach((doc) => {
                orderHistory.push(doc.data());
            });
            
            // Tính toán động các chỉ số thống kê
            recalculateStats();
            
            renderHistory();
            updateDashboardUI();
            updateTopSelling();
        });
    };

    // --- RECALCULATE STATS FROM HISTORY ---
    function recalculateStats() {
        stats = {
            totalRevenue: 0,
            totalOrders: 0,
            guestCount: 0,
            cashTotal: 0,
            transferTotal: 0
        };
        
        orderHistory.forEach(order => {
            stats.totalRevenue += order.total;
            stats.totalOrders += 1;
            stats.guestCount += 1; // Số khách mới được tính dựa trên số đơn hàng
            if (order.paymentMethod === 'Tiền mặt') {
                stats.cashTotal += order.total;
            } else {
                stats.transferTotal += order.total;
            }
        });
    }

    // --- ROLE MANAGEMENT FUNCTIONS ---
    window.selectRole = function(role) {
        currentRole = role;
        const btnStaff = document.getElementById('btn-role-staff');
        const btnAdmin = document.getElementById('btn-role-admin');
        const pinField = document.getElementById('pin-field-container');
        const submitBtn = document.getElementById('btn-submit-login');
        
        if (role === 'staff') {
            if (btnStaff) btnStaff.style.background = 'white';
            if (btnStaff) btnStaff.style.color = '#0284c7';
            if (btnAdmin) btnAdmin.style.background = 'transparent';
            if (btnAdmin) btnAdmin.style.color = '#475569';
            if (pinField) pinField.style.display = 'none';
            if (submitBtn) submitBtn.innerText = 'Đăng nhập Nhân viên ➔';
            enteredPin = '';
            updatePinDots();
        } else {
            if (btnAdmin) btnAdmin.style.background = 'white';
            if (btnAdmin) btnAdmin.style.color = '#0284c7';
            if (btnStaff) btnStaff.style.background = 'transparent';
            if (btnStaff) btnStaff.style.color = '#475569';
            if (pinField) pinField.style.display = 'flex';
            if (submitBtn) submitBtn.innerText = 'Đăng nhập Admin ➔';
            enteredPin = '';
            updatePinDots();
        }
    };

    window.pressNum = function(num) {
        if (enteredPin.length < 4) {
            enteredPin += num;
            updatePinDots();
            
            if (enteredPin.length === 4) {
                // Tự động gửi đăng nhập
                setTimeout(() => {
                    window.submitLogin();
                }, 150);
            }
        }
    };

    window.clearPin = function() {
        enteredPin = '';
        updatePinDots();
    };

    window.backspacePin = function() {
        if (enteredPin.length > 0) {
            enteredPin = enteredPin.slice(0, -1);
            updatePinDots();
        }
    };

    function updatePinDots() {
        const dots = document.querySelectorAll('.pin-dot');
        dots.forEach((dot, index) => {
            if (index < enteredPin.length) {
                dot.classList.add('filled');
            } else {
                dot.classList.remove('filled');
            }
        });
    }

    window.submitLogin = function() {
        const errorMsg = document.getElementById('login-error-msg');
        if (errorMsg) errorMsg.style.display = 'none';
        
        if (currentRole === 'staff') {
            sessionStorage.setItem('goat_user_role', 'staff');
            applyRoleSettings();
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) loginOverlay.style.display = 'none';
        } else {
            if (enteredPin === '6666') {
                sessionStorage.setItem('goat_user_role', 'admin');
                applyRoleSettings();
                const loginOverlay = document.getElementById('login-overlay');
                if (loginOverlay) loginOverlay.style.display = 'none';
                enteredPin = '';
                updatePinDots();
            } else {
                if (errorMsg) {
                    errorMsg.innerText = '❌ Mã PIN Admin không chính xác!';
                    errorMsg.style.display = 'block';
                }
                enteredPin = '';
                updatePinDots();
            }
        }
    };

    window.logout = function() {
        if (confirm("Bạn có muốn đăng xuất không?")) {
            sessionStorage.removeItem('goat_user_role');
            enteredPin = '';
            currentRole = 'staff';
            window.selectRole('staff');
            
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) loginOverlay.style.display = 'flex';
        }
    };

    function applyRoleSettings() {
        const role = sessionStorage.getItem('goat_user_role') || 'staff';
        const badge = document.getElementById('user-badge');
        if (badge) {
            badge.innerText = role === 'admin' ? 'Admin' : 'Nhân viên';
            badge.className = 'user-badge' + (role === 'admin' ? ' admin' : '');
        }
        
        const dashboardNavBtn = document.getElementById('nav-dashboard');
        const clearHistoryBtn = document.querySelector('.btn-clear-history');
        
        // Cấu hình menu tương ứng
        const menuSection = document.getElementById('menu-section');
        if (menuSection) {
            const items = menuSection.querySelectorAll('.menu-item');
            items.forEach(item => {
                const label = item.querySelector('.menu-label')?.innerText || '';
                if (label.includes('Cấu hình in') || label.includes('Cấu hình Thanh toán')) {
                    item.style.display = role === 'admin' ? 'flex' : 'none';
                }
            });
        }

        if (role === 'admin') {
            if (dashboardNavBtn) dashboardNavBtn.style.display = 'flex';
            if (clearHistoryBtn) clearHistoryBtn.style.display = 'block';
            
            const quickAddBtn = document.querySelector('.btn-toggle-add');
            if (quickAddBtn) quickAddBtn.style.display = 'flex';
            
            window.switchTab('dashboard-section');
        } else {
            if (dashboardNavBtn) dashboardNavBtn.style.display = 'none';
            if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
            
            const quickAddBtn = document.querySelector('.btn-toggle-add');
            if (quickAddBtn) quickAddBtn.style.display = 'none';
            
            const quickAddForm = document.getElementById('quick-add-form');
            if (quickAddForm) quickAddForm.style.display = 'none';

            window.switchTab('pos-section');
        }
    }

    // --- POS LOGIC ---
    window.addToCart = function(itemName, price) {
        const existingItem = currentCart.find(item => item.name === itemName);
        if (existingItem) {
            existingItem.qty += 1;
        } else {
            currentCart.push({ name: itemName, price: price, qty: 1 });
        }
        renderCart();
    };

    function renderCart() {
        const cartList = document.getElementById('cart-items-list');
        const bottomCount = document.getElementById('bottom-cart-count');
        const bottomTotal = document.getElementById('bottom-cart-total');
        if (!cartList) return;

        if (currentCart.length === 0) {
            cartList.innerHTML = '<p class="empty-cart-msg">Chưa có món nào được chọn</p>';
            bottomCount.innerText = '0 món';
            bottomTotal.innerText = '0 đ';
            return;
        }

        let html = '';
        let totalAmount = 0;
        let totalItems = 0;
        currentCart.forEach((item, index) => {
            const itemTotal = item.price * item.qty;
            totalAmount += itemTotal;
            totalItems += item.qty;
            html += `
                <div class="cart-item-row">
                    <div class="cart-item-info">
                        <span class="cart-item-name">${item.name}</span>
                        <div class="qty-controller">
                            <button class="qty-btn dec" onclick="decreaseQuantity(${index})">−</button>
                            <span class="qty-num">${item.qty}</span>
                            <button class="qty-btn inc" onclick="increaseQuantity(${index})">+</button>
                        </div>
                    </div>
                    <span class="cart-item-price">${(itemTotal).toLocaleString()} đ</span>
                </div>
            `;
        });
        cartList.innerHTML = html;
        bottomCount.innerText = `${totalItems} món`;
        bottomTotal.innerText = `${totalAmount.toLocaleString()} đ`;
    }

    window.increaseQuantity = (index) => { if (currentCart[index]) { currentCart[index].qty += 1; renderCart(); } };
    window.decreaseQuantity = (index) => {
        if (currentCart[index]) {
            if (currentCart[index].qty > 1) {
                currentCart[index].qty -= 1;
                renderCart();
            } else if (confirm(`Xóa món "${currentCart[index].name}" khỏi giỏ?`)) {
                currentCart.splice(index, 1);
                renderCart();
            }
        }
    };

    window.confirmSelection = async function(num) {
        const cartTotal = currentCart.reduce((sum, item) => sum + (item.price * item.qty), 0);
        let finalItems = [];
        let finalTotal = 0;
        
        if (tableOrders[num]) {
            // Gộp thêm món trực tiếp trên Firestore
            finalItems = JSON.parse(JSON.stringify(tableOrders[num].items));
            currentCart.forEach(newItem => {
                const sameItem = finalItems.find(i => i.name === newItem.name);
                if (sameItem) sameItem.qty += newItem.qty;
                else finalItems.push(JSON.parse(JSON.stringify(newItem)));
            });
            finalTotal = tableOrders[num].total + cartTotal;
        } else {
            finalItems = JSON.parse(JSON.stringify(currentCart));
            finalTotal = cartTotal;
        }

        try {
            await setDoc(doc(db, 'tables', `table_${num}`), {
                items: finalItems,
                total: finalTotal,
                updatedAt: new Date()
            });
            console.log(`Đồng bộ bàn ${num} lên Firestore thành công!`);
        } catch (err) {
            console.error("Lỗi khi lưu bàn lên Firestore:", err);
            alert("Lỗi kết nối database online!");
        }

        currentCart = [];
        targetTableId = null;
        const noticeBar = document.getElementById('pos-notice-bar');
        if (noticeBar) noticeBar.style.display = 'none';
        
        renderCart();
        window.closeAllModals();
        renderTables();
        window.switchTab('tables-section');
    };

    // --- PAYMENT LOGIC ---
    window.payWithCash = () => { if (confirm(`Xác nhận thanh toán TIỀN MẶT cho Bàn ${selectedTableForBill}?`)) finishPayment('Tiền mặt'); };
    window.confirmPayment = () => { if (confirm(`Đã nhận đủ tiền CHUYỂN KHOẢN cho Bàn ${selectedTableForBill}?`)) finishPayment('Chuyển khoản'); };

    async function finishPayment(method) {
        const id = selectedTableForBill;
        const orderData = tableOrders[id];
        if (!orderData) return;

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} ${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

        const orderId = 'ORD-' + Date.now().toString().slice(-6);
        const archiveOrder = {
            id: orderId,
            time: timeStr,
            items: orderData.items,
            total: orderData.total,
            tableId: id,
            paymentMethod: method,
            createdAt: now
        };

        try {
            // Xóa bàn đang phục vụ trên Firestore & thêm đơn vào Lịch sử đơn hàng
            await deleteDoc(doc(db, 'tables', `table_${id}`));
            await setDoc(doc(db, 'history', orderId), archiveOrder);
            
            console.log("Thanh toán thành công!");
            selectedTableForBill = null;
            window.closeAllModals();
            alert('🎉 Thanh toán thành công!');
        } catch (err) {
            console.error("Lỗi khi xử lý thanh toán:", err);
            alert("Lỗi kết nối cơ sở dữ liệu online!");
        }
    }

    // --- HISTORY LOGIC ---
    window.renderHistory = function(filterData = orderHistory) {
        const container = document.getElementById('history-list-container');
        if (!container) return;
        if (filterData.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:40px; color:#94a3b8;">Chưa có đơn hàng nào.</p>';
            return;
        }
        container.innerHTML = filterData.map(order => {
            const methodColor = order.paymentMethod === 'Tiền mặt' ? '#16a34a' : '#0284c7';
            const methodBg = order.paymentMethod === 'Tiền mặt' ? '#dcfce7' : '#e0f2fe';
            return `
                <div class="order-card" onclick="showOrderDetail('${order.id}')" style="cursor:pointer; display:flex; justify-content:space-between; align-items:center; padding:16px; background:white; border-radius:12px; margin-bottom:10px; box-shadow:0 2px 4px rgba(0,0,0,0.02); border:1px solid #f1f5f9;">
                    <div class="order-info-left">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="order-id" style="font-weight:800; color:#1e293b; font-size:14px;">${order.id} (Bàn ${order.tableId})</span>
                            <span style="font-size:10px; padding:2px 6px; border-radius:4px; background:${methodBg}; color:${methodColor}; font-weight:700;">${order.paymentMethod}</span>
                        </div>
                        <span class="order-time" style="font-size:12px; color:#94a3b8;">${order.time}</span>
                    </div>
                    <span class="order-amount" style="font-weight:800; color:var(--primary); font-size:15px;">${order.total.toLocaleString()} đ</span>
                </div>
            `;
        }).join('');
    };

    window.filterHistory = function() {
        const queryStr = document.getElementById('history-search').value.toLowerCase();
        const dateFilter = document.getElementById('history-date-filter').value;
        const methodFilter = document.getElementById('history-method-filter').value;

        const filtered = orderHistory.filter(o => {
            const matchesQuery = o.id.toLowerCase().includes(queryStr) || o.tableId.toString().includes(queryStr);
            let matchesDate = true;
            if (dateFilter) {
                const parts = o.time.split(' ');
                if (parts.length > 1) {
                    const [d, m, y] = parts[1].split('/');
                    const orderDateFormatted = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                    matchesDate = orderDateFormatted === dateFilter;
                }
            }
            let matchesMethod = methodFilter === 'all' || o.paymentMethod === methodFilter;
            return matchesQuery && matchesDate && matchesMethod;
        });
        renderHistory(filtered);
    };

    window.confirmClearHistory = async function() {
        const role = sessionStorage.getItem('goat_user_role') || 'staff';
        if (role !== 'admin') {
            alert("❌ Bạn không có quyền thực hiện chức năng này!");
            return;
        }

        const password = prompt("🔐 Nhập mật khẩu (6666) để xóa sạch lịch sử:");
        if (password === "6666") {
            if (confirm("⚠️ Bạn có chắc chắn muốn xóa vĩnh viễn toàn bộ lịch sử đơn hàng trên hệ thống?")) {
                try {
                    const batch = writeBatch(db);
                    orderHistory.forEach(order => {
                        batch.delete(doc(db, 'history', order.id));
                    });
                    await batch.commit();
                    alert("✅ Đã xóa sạch dữ liệu lịch sử đơn hàng trên hệ thống!");
                } catch (err) {
                    console.error("Lỗi khi xóa lịch sử:", err);
                    alert("Không thể kết nối để xóa dữ liệu!");
                }
            }
        } else if (password !== null) {
            alert("❌ Sai mật khẩu!");
        }
    };

    // --- UI HELPERS ---
    window.switchTab = function(tabId) {
        const role = sessionStorage.getItem('goat_user_role') || 'staff';
        if (role === 'staff' && tabId === 'dashboard-section') {
            return; // Khóa màn hình Dashboard với Nhân viên
        }

        const sections = ['dashboard-section', 'pos-section', 'tables-section', 'menu-section', 'print-config-section', 'payment-config-section', 'order-history-section', 'shift-management-section'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const target = document.getElementById(tabId);
        if (target) target.style.display = 'block';

        if (tabId === 'order-history-section') renderHistory();

        const navItems = document.querySelectorAll('.bottom-nav-item');
        navItems.forEach(item => item.classList.remove('active'));
        let searchId = tabId;
        if (['print-config-section', 'payment-config-section', 'order-history-section', 'shift-management-section'].includes(tabId)) searchId = 'menu-section';
        const activeBtn = document.querySelector(`.bottom-nav-item[onclick*="${searchId}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    };

    window.renderTables = function() {
        const container = document.getElementById('table-grid-container');
        if (!container) return;
        let html = '';
        for (let i = 1; i <= 40; i++) {
            const hasOrder = tableOrders[i];
            html += `<div id="table-${i}" class="table-item ${hasOrder ? 'table-active' : 'table-empty'}" onclick="${hasOrder ? `viewTableBill(${i})` : `selectEmptyTable(${i})`}">Bàn ${i}</div>`;
        }
        container.innerHTML = html;
        const occupied = Object.keys(tableOrders).length;
        const statsEl = document.getElementById('table-stats');
        if (statsEl) statsEl.innerText = `Tổng: 40 bàn | Đang phục vụ: ${occupied}`;
    };

    window.selectEmptyTable = function(i) {
        // Hỗ trợ click nhanh vào bàn trống để bắt đầu gọi món
        window.switchTab('pos-section');
        targetTableId = i;
        const noticeBar = document.getElementById('pos-notice-bar');
        if (noticeBar) {
            noticeBar.style.display = 'block';
            const nameSpan = document.getElementById('pos-target-table-name');
            if (nameSpan) nameSpan.innerText = `Bàn ${i}`;
        }
    };

    window.updateDashboardUI = function() {
        if (document.getElementById('stat-revenue')) document.getElementById('stat-revenue').innerText = `${stats.totalRevenue.toLocaleString()} đ`;
        if (document.getElementById('stat-orders')) document.getElementById('stat-orders').innerText = stats.totalOrders;
        
        const avg = stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0;
        if (document.getElementById('stat-avg')) document.getElementById('stat-avg').innerText = `${avg.toLocaleString()} đ`;
        if (document.getElementById('stat-guests')) document.getElementById('stat-guests').innerText = stats.guestCount;
        
        updateCharts();
    };

    // --- CHART CREATION & UPDATE ---
    function updateCharts() {
        const revCanvas = document.getElementById('revenueChart');
        const payCanvas = document.getElementById('paymentChart');
        if (!revCanvas || !payCanvas) return;
        
        const paymentData = [stats.cashTotal, stats.transferTotal];
        
        if (paymentChart) {
            paymentChart.data.datasets[0].data = paymentData;
            paymentChart.update();
        } else {
            paymentChart = new Chart(payCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Tiền mặt', 'Chuyển khoản'],
                    datasets: [{
                        data: paymentData,
                        backgroundColor: ['#10b981', '#0ea5e9'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                font: { family: 'Inter', size: 11, weight: '600' },
                                boxWidth: 12
                            }
                        }
                    }
                }
            });
        }
        
        // Tính toán doanh số 7 ngày trước động
        const dateMap = {};
        const last7DaysLabels = [];
        const last7DaysData = [];
        
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr = d.getDate().toString().padStart(2, '0') + '/' + (d.getMonth() + 1).toString().padStart(2, '0');
            last7DaysLabels.push(dayStr);
            dateMap[dayStr] = 0;
        }
        
        orderHistory.forEach(order => {
            const timeParts = order.time.split(' ');
            if (timeParts.length > 1) {
                const dateParts = timeParts[1].split('/');
                if (dateParts.length >= 2) {
                    const dayMonth = `${dateParts[0]}/${dateParts[1]}`;
                    if (dateMap[dayMonth] !== undefined) {
                        dateMap[dayMonth] += order.total;
                    }
                }
            }
        });
        
        last7DaysLabels.forEach(label => {
            last7DaysData.push(dateMap[label]);
        });
        
        if (revenueChart) {
            revenueChart.data.labels = last7DaysLabels;
            revenueChart.data.datasets[0].data = last7DaysData;
            revenueChart.update();
        } else {
            revenueChart = new Chart(revCanvas, {
                type: 'line',
                data: {
                    labels: last7DaysLabels,
                    datasets: [{
                        label: 'Doanh thu',
                        data: last7DaysData,
                        borderColor: '#0284c7',
                        backgroundColor: 'rgba(2, 132, 199, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: '#0284c7',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                font: { family: 'Inter', size: 10 },
                                callback: function(value) { return value.toLocaleString() + ' đ'; }
                            },
                            grid: { color: '#f1f5f9' }
                        },
                        x: {
                            ticks: { font: { family: 'Inter', size: 10 } },
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }

    window.renderProducts = function(filter = 'Tất cả') {
        const container = document.getElementById('pos-products-grid');
        if (!container) return;
        
        let items = [
            { name: 'Phê La', price: 45000, category: 'Cà Phê' },
            { name: 'Nâu Đá', price: 35000, category: 'Cà Phê' },
            { name: 'Đen Đá', price: 30000, category: 'Cà Phê' },
            { name: 'Bạc Xỉu', price: 40000, category: 'Cà Phê' },
            { name: 'Trà Đào Cam Sả', price: 45000, category: 'Trà Trái Cây' },
            { name: 'Trà Vải', price: 45000, category: 'Trà Trái Cây' },
            { name: 'Matcha Đá Xay', price: 55000, category: 'Đá Xay' },
            { name: 'Cookie Đá Xay', price: 55000, category: 'Đá Xay' }
        ];
        
        items = [...items, ...menuItems];
        
        const queryStr = document.getElementById('pos-search-input')?.value.toLowerCase() || '';
        
        let filtered = filter === 'Tất cả' ? items : items.filter(i => i.category === filter);
        if (queryStr) {
            filtered = filtered.filter(it => it.name.toLowerCase().includes(queryStr));
        }

        container.innerHTML = filtered.map(it => `
            <div class="product-card" onclick="addToCart('${it.name}', ${it.price})">
                <div class="product-name">${it.name}</div>
                <div class="product-price">${it.price.toLocaleString()} đ</div>
            </div>
        `).join('');
    };

    window.filterProducts = function() {
        window.renderProducts(currentCategory);
    };

    window.viewTableBill = function(id) {
        const order = tableOrders[id]; if (!order) return;
        selectedTableForBill = id;
        document.getElementById('bill-sheet-title').innerText = `Chi tiết Bàn ${id}`;
        document.getElementById('bill-items-list').innerHTML = order.items.map(it => `
            <div class="cart-item-row"><div class="cart-item-info"><span>${it.name}</span><span>x${it.qty}</span></div><span>${(it.price*it.qty).toLocaleString()} đ</span></div>
        `).join('');
        document.getElementById('bill-total-amount').innerText = `${order.total.toLocaleString()} đ`;
        document.getElementById('modal-overlay').style.display = 'block';
        const sheet = document.getElementById('bill-detail-sheet');
        sheet.style.display = 'block'; setTimeout(() => sheet.classList.add('active'), 10);
    };

    window.openShiftManagement = () => {
        window.switchTab('shift-management-section');
        const m = document.getElementById('update-modal');
        if (m) { m.style.display = 'flex'; setTimeout(() => m.querySelector('.update-popup').style.transform = 'scale(1)', 50); }
    };

    window.closeUpdateModal = () => {
        const m = document.getElementById('update-modal');
        if (m) { m.querySelector('.update-popup').style.transform = 'scale(0.9)'; setTimeout(() => m.style.display = 'none', 200); }
    };

    window.closeAllModals = function() {
        document.getElementById('modal-overlay').style.display = 'none';
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
        setTimeout(() => document.querySelectorAll('.bottom-sheet').forEach(s => s.style.display = 'none'), 300);
    };

    // --- OTHER HELPERS ---
    function syncPrintSettingsToUI() {
        const fields = ['p-show-logo', 'p-show-qr', 'p-show-wifi', 'p-show-tax', 'p-show-note'];
        fields.forEach(id => {
            const prop = id.replace('p-', '').replace(/-(.)/g, (_, c) => c.toUpperCase());
            const el = document.getElementById(id);
            if (el) el.checked = !!printSettings[prop];
        });
        if (document.getElementById('p-header')) document.getElementById('p-header').value = printSettings.headerText || '';
        if (document.getElementById('p-footer')) document.getElementById('p-footer').value = printSettings.footerText || '';
        window.selectPaper(printSettings.paperSize || 58);
    }

    window.selectPaper = async function(size) {
        printSettings.paperSize = size;
        document.getElementById('paper-58')?.classList.toggle('active', size === 58);
        document.getElementById('paper-80')?.classList.toggle('active', size === 80);
        const bill = document.querySelector('.thermal-bill');
        if (bill) { bill.classList.remove('size-58', 'size-80'); bill.classList.add(`size-${size}`); }
        
        try {
            await setDoc(doc(db, 'settings', 'print'), printSettings);
        } catch (err) {
            console.error("Lỗi khi lưu khổ giấy lên Firestore:", err);
        }
    };

    window.syncPrint = async function() {
        printSettings.headerText = document.getElementById('p-header').value;
        printSettings.footerText = document.getElementById('p-footer').value;
        printSettings.showLogo = document.getElementById('p-show-logo').checked;
        printSettings.showQR = document.getElementById('p-show-qr').checked;
        printSettings.showWiFi = document.getElementById('p-show-wifi').checked;
        printSettings.showTax = document.getElementById('p-show-tax').checked;
        printSettings.showNote = document.getElementById('p-show-note').checked;
        
        try {
            await setDoc(doc(db, 'settings', 'print'), printSettings);
        } catch (err) {
            console.error("Lỗi khi lưu cấu hình in lên Firestore:", err);
        }
        
        document.getElementById('v-header').innerText = printSettings.headerText;
        document.getElementById('v-footer').innerText = printSettings.footerText;
        document.getElementById('v-logo').classList.toggle('hidden', !printSettings.showLogo);
        document.getElementById('v-qr').classList.toggle('hidden', !printSettings.showQR);
        document.getElementById('v-wifi').classList.toggle('hidden', !printSettings.showWiFi);
        document.getElementById('v-tax').classList.toggle('hidden', !printSettings.showTax);
        document.getElementById('v-note').classList.toggle('hidden', !printSettings.showNote);
    };

    window.handleQRUpload = (input) => {
        if (input.files?.[0]) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const qrBase64 = e.target.result;
                try {
                    await setDoc(doc(db, 'settings', 'payment'), { qrCode: qrBase64 });
                    alert("Đã lưu QR đồng bộ trực tuyến!");
                } catch (err) {
                    console.error("Lỗi khi lưu QR lên Firestore:", err);
                    alert("Không thể lưu ảnh QR lên cơ sở dữ liệu online!");
                }
            };
            reader.readAsDataURL(input.files[0]);
        }
    };

    function updateHeaderDate() {
        const el = document.getElementById('header-date');
        if (el) el.innerText = new Date().toLocaleDateString('vi-VN', { day:'numeric', month:'long', year:'numeric' });
    }

    window.updateTopSelling = function() {
        const counts = {};
        orderHistory.forEach(o => o.items.forEach(it => counts[it.name] = (counts[it.name]||0) + it.qty));
        const sorted = Object.keys(counts).map(k => ({name:k, count:counts[k]})).sort((a,b)=>b.count-a.count).slice(0,3);
        const container = document.getElementById('top-selling-list');
        if (!container) return;
        
        if (sorted.length === 0) {
            container.innerHTML = `
                <div class="no-data-view">
                    <span class="coffee-icon">☕</span>
                    <p>Chưa có dữ liệu bán chạy</p>
                </div>
            `;
            return;
        }

        const medals = ['🥇', '🥈', '🥉'];
        container.innerHTML = sorted.map((it, i) => `
            <div class="top-selling-item" style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8fafc; border-radius:10px; margin-bottom:6px;">
                <div class="item-name-medal" style="display:flex; align-items:center; gap:8px; font-weight:500;">
                    <span>${medals[i]}</span>
                    <span>${it.name}</span>
                </div>
                <span class="stat-value" style="font-size:14px; margin-top:0; font-weight:700; color:var(--text-dark);">${it.count} ly</span>
            </div>
        `).join('');
    };

    window.filterCategory = (cat) => {
        currentCategory = cat;
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
        event.currentTarget.classList.add('active');
        window.renderProducts(cat);
    };

    window.handleQuickAdd = async () => {
        const role = sessionStorage.getItem('goat_user_role') || 'staff';
        if (role !== 'admin') {
            alert("❌ Chỉ Admin mới được chỉnh sửa thực đơn!");
            return;
        }
        
        const n = document.getElementById('qa-name').value.trim();
        const p = parseInt(document.getElementById('qa-price').value);
        if (n && !isNaN(p)) {
            try {
                await setDoc(doc(db, 'menu', n), {
                    name: n,
                    price: p,
                    category: 'Tất cả',
                    createdAt: new Date()
                });
                document.getElementById('qa-name').value = '';
                document.getElementById('qa-price').value = '';
                alert(`Đã thêm món "${n}" vào thực đơn đồng bộ!`);
            } catch (err) {
                console.error("Lỗi khi thêm nhanh món:", err);
            }
        } else {
            alert("Vui lòng nhập đầy đủ tên và giá món đồ uống!");
        }
    };

    window.handleSaveOrder = () => { if (currentCart.length > 0) window.openTableSelector(); else alert("Giỏ hàng trống!"); };
    
    window.openTableSelector = () => {
        // Nếu đang trong chế độ gọi thêm món thì lưu thẳng vào bàn đó
        if (targetTableId) {
            window.confirmSelection(targetTableId);
            return;
        }
        
        const grid = document.getElementById('select-table-grid');
        grid.innerHTML = Array.from({length:40}, (_,i)=>i+1).map(i => `<button class="select-table-btn ${tableOrders[i]?'occupied':''}" onclick="confirmSelection(${i})">${i}</button>`).join('');
        document.getElementById('modal-overlay').style.display = 'block';
        const s = document.getElementById('tableSelectorSheet'); s.style.display = 'block'; setTimeout(() => s.classList.add('active'), 10);
    };

    window.showOrderDetail = (id) => {
        const order = orderHistory.find(o => o.id === id); if (!order) return;
        const html = `
            <div style="margin-bottom:20px;"><p style="font-weight:700;">Mã đơn: ${order.id}</p><p style="font-size:13px; color:#64748b;">Thời gian: ${order.time}</p></div>
            <div class="detail-items-list">${order.items.map(it => `<div class="detail-item" style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #f1f5f9; font-size:14px;"><span>${it.qty} x ${it.name}</span><span>${(it.price*it.qty).toLocaleString()} đ</span></div>`).join('')}</div>
            <div class="detail-total-row" style="display:flex; justify-content:space-between; margin-top:15px; padding-top:15px; border-top:2px solid #f1f5f9; font-weight:800; font-size:16px;"><span>TỔNG CỘNG:</span><span>${order.total.toLocaleString()} đ</span></div>
            <div class="detail-meta-row" style="display:flex; justify-content:space-between; margin-top:8px; font-size:13px; color:#64748b;"><span>Phương thức:</span><span style="font-weight:700;">${order.paymentMethod}</span></div>
        `;
        document.getElementById('order-detail-content').innerHTML = html;
        document.getElementById('order-detail-modal').style.display = 'block';
    };

    window.closeOrderModal = () => document.getElementById('order-detail-modal').style.display = 'none';
    window.showQRTransfer = () => { document.getElementById('bill-sheet-content').style.display = 'none'; document.getElementById('qr-transfer-view').style.display = 'block'; };
    window.showBillDetail = () => { document.getElementById('bill-sheet-content').style.display = 'block'; document.getElementById('qr-transfer-view').style.display = 'none'; };

    // --- ADD MORE ITEMS LOGIC ---
    window.addMoreItems = function() {
        if (!selectedTableForBill) return;
        targetTableId = selectedTableForBill;
        
        const noticeBar = document.getElementById('pos-notice-bar');
        if (noticeBar) {
            noticeBar.style.display = 'block';
            const nameSpan = document.getElementById('pos-target-table-name');
            if (nameSpan) nameSpan.innerText = `Bàn ${targetTableId}`;
        }
        
        window.closeAllModals();
        window.switchTab('pos-section');
    };

    window.cancelAddMore = function() {
        targetTableId = null;
        const noticeBar = document.getElementById('pos-notice-bar');
        if (noticeBar) noticeBar.style.display = 'none';
        currentCart = [];
        renderCart();
    };

    // --- TABLE TRANSFER / MERGE LOGIC ---
    window.moveTable = function() {
        if (!selectedTableForBill) return;
        const grid = document.getElementById('transfer-table-grid');
        if (!grid) return;
        
        grid.innerHTML = Array.from({length: 40}, (_, i) => i + 1)
            .map(i => {
                if (i === selectedTableForBill) return ''; // Không tự chuyển sang chính mình
                const occupied = tableOrders[i] !== undefined;
                return `<button class="select-table-btn ${occupied ? 'occupied' : ''}" onclick="confirmMoveTable(${selectedTableForBill}, ${i})">${i}</button>`;
            }).join('');
            
        window.closeAllModals();
        document.getElementById('modal-overlay').style.display = 'block';
        const s = document.getElementById('transferTableSheet');
        s.style.display = 'block';
        setTimeout(() => s.classList.add('active'), 10);
    };

    window.confirmMoveTable = async function(fromTable, toTable) {
        if (!tableOrders[fromTable]) return;
        
        try {
            if (tableOrders[toTable]) {
                // Gộp bàn
                if (confirm(`Bàn ${toTable} đang có khách. Bạn có gộp Bàn ${fromTable} vào Bàn ${toTable}?`)) {
                    const fromOrder = tableOrders[fromTable];
                    const toOrder = tableOrders[toTable];
                    
                    const mergedItems = JSON.parse(JSON.stringify(toOrder.items));
                    fromOrder.items.forEach(newItem => {
                        const sameItem = mergedItems.find(i => i.name === newItem.name);
                        if (sameItem) sameItem.qty += newItem.qty;
                        else mergedItems.push(newItem);
                    });
                    
                    await setDoc(doc(db, 'tables', `table_${toTable}`), {
                        items: mergedItems,
                        total: toOrder.total + fromOrder.total,
                        updatedAt: new Date()
                    });
                    
                    await deleteDoc(doc(db, 'tables', `table_${fromTable}`));
                    alert(`Đã gộp Bàn ${fromTable} vào Bàn ${toTable} trực tuyến!`);
                } else {
                    return;
                }
            } else {
                // Chuyển bàn
                await setDoc(doc(db, 'tables', `table_${toTable}`), {
                    items: tableOrders[fromTable].items,
                    total: tableOrders[fromTable].total,
                    updatedAt: new Date()
                });
                
                await deleteDoc(doc(db, 'tables', `table_${fromTable}`));
                alert(`Đã chuyển Bàn ${fromTable} sang Bàn ${toTable} trực tuyến!`);
            }
        } catch (err) {
            console.error("Lỗi khi chuyển bàn:", err);
            alert("Lỗi kết nối cơ sở dữ liệu khi chuyển bàn!");
        }
        
        window.closeAllModals();
        renderTables();
    };

    // --- QUICK ADD MANUAL ITEM FOR ADMIN ---
    window.addNewItem = async function() {
        const role = sessionStorage.getItem('goat_user_role') || 'staff';
        if (role !== 'admin') {
            alert("❌ Chỉ Admin mới được chỉnh sửa thực đơn!");
            return;
        }

        const name = document.getElementById('new-item-name').value.trim();
        const price = parseInt(document.getElementById('new-item-price').value);

        if (name && !isNaN(price)) {
            try {
                await setDoc(doc(db, 'menu', name), {
                    name: name,
                    price: price,
                    category: 'Tất cả',
                    createdAt: new Date()
                });
                
                document.getElementById('new-item-name').value = '';
                document.getElementById('new-item-price').value = '';
                window.closeAllModals();
                alert("Đã thêm món mới vào thực đơn online!");
            } catch (err) {
                console.error("Lỗi thêm món mới:", err);
                alert("Lỗi khi kết nối để thêm món!");
            }
        } else {
            alert("Vui lòng nhập tên và giá món hợp lệ!");
        }
    };

    window.toggleQuickAdd = function() {
        const form = document.getElementById('quick-add-form');
        if (form) {
            form.style.display = form.style.display === 'none' ? 'block' : 'none';
        }
    };

    window.testPrint = function() {
        alert("🖨️ Đang in thử hóa đơn khổ " + printSettings.paperSize + "mm ra máy in...");
        window.print();
    };

    // Khởi chạy ứng dụng
    window.initApp();
});
