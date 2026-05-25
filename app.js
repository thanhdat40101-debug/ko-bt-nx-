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
    let currentPaymentOrderId = '';
    let menuItems = [];
    let currentCategory = 'Tất cả';
    let currentPaymentQR = '';

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

    // Load from localStorage if present
    const cachedSettings = localStorage.getItem('goat_print_settings');
    if (cachedSettings) {
        try {
            printSettings = Object.assign({}, printSettings, JSON.parse(cachedSettings));
        } catch (e) {
            console.error("Lỗi khi load cached print settings", e);
        }
    }

    // --- AUTHENTICATION STATE ---
    let currentRole = 'staff';
    let enteredPin = '';

    // --- KITCHEN NOTIFICATION STATE ---
    let knownActiveItems = new Set();
    let isFirstLoad = true;

    // --- CHARTS STATE ---
    let revenueChart = null;
    let paymentChart = null;

    // --- UTILITIES ---
    window.getTableName = function(id) {
        id = parseInt(id);
        if (isNaN(id)) return 'Bàn ' + id;
        if (id <= 40) {
            return `Bàn ${id}`;
        } else {
            return `B${id - 40}`;
        }
    };

    // --- FULLSCREEN MANAGEMENT UTILITIES ---
    window.enterFullscreen = function() {
        const docEl = document.documentElement;
        try {
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(err => console.log("Rejected standard fullscreen:", err));
            } else if (docEl.webkitRequestFullscreen) { /* Safari / iOS Safari */
                docEl.webkitRequestFullscreen().catch(err => console.log("Rejected webkit fullscreen:", err));
            } else if (docEl.msRequestFullscreen) { /* IE11 / Edge */
                docEl.msRequestFullscreen().catch(err => console.log("Rejected ms fullscreen:", err));
            }
        } catch (err) {
            console.log("Fullscreen request failed:", err);
        }
    };

    window.exitFullscreen = function() {
        try {
            if (document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen().catch(err => console.log("Exit fullscreen rejected:", err));
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen().catch(err => console.log("Exit webkit fullscreen rejected:", err));
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen().catch(err => console.log("Exit ms fullscreen rejected:", err));
                }
            }
        } catch (err) {
            console.log("Exit fullscreen failed:", err);
        }
    };

    // --- HELPER FOR ROLE NORMALIZATION ---
    function getUserRole() {
        let role = sessionStorage.getItem('goat_user_role') || 'staff';
        if (role === 'THU NGÂN' || role === 'Thu ngân' || role === 'NHÂN VIÊN' || role === 'Nhân viên') {
            role = 'staff';
        }
        return role;
    }

    // --- DATABASE SEEDER FOR 80 AHA CAFE ITEMS ---
    async function seedDefaultAhaMenu() {
        console.log("🌱 Thực đơn trống hoặc thiếu. Đang tự động nạp 80 món Aha Cafe lên Firestore...");
        const defaultAhaMenu = [
            { "name": "Cà phê đen", "price": 33000, "category": "Cà Phê" },
            { "name": "Cà phê sữa", "price": 35000, "category": "Cà Phê" },
            { "name": "Bạc xỉu", "price": 40000, "category": "Cà Phê" },
            { "name": "Cà phê cốt dừa (đá)", "price": 45000, "category": "Cà Phê" },
            { "name": "Cà phê kem Aha", "price": 65000, "category": "Cà Phê" },
            { "name": "Cà Phê Đen Pha Máy", "price": 33000, "category": "Cà Phê" },
            { "name": "Cà Phê Sữa Pha Máy", "price": 35000, "category": "Cà Phê" },
            { "name": "Espresso", "price": 33000, "category": "Cà Phê" },
            { "name": "Americano (nóng/đá)", "price": 35000, "category": "Cà Phê" },
            { "name": "Cappuccino (nóng/đá)", "price": 45000, "category": "Cà Phê" },
            { "name": "Latte (nóng/đá)", "price": 45000, "category": "Cà Phê" },
            { "name": "Mocha (nóng/đá)", "price": 50000, "category": "Cà Phê" },
            { "name": "Cà phê muối", "price": 45000, "category": "Cà Phê" },
            { "name": "Cà Phê Hạnh Nhân (Nóng)", "price": 55000, "category": "Cà Phê" },
            { "name": "Cà Phê Hạnh Nhân (Đá)", "price": 55000, "category": "Cà Phê" },
            { "name": "Cà phê đậu xanh", "price": 55000, "category": "Cà Phê" },

            { "name": "Trà xoài ô long", "price": 39000, "category": "Trà" },
            { "name": "Trà sữa ô long đường đen", "price": 45000, "category": "Trà" },
            { "name": "Trà sữa ô long matcha", "price": 45000, "category": "Trà" },
            { "name": "Trà táo bạc hà", "price": 49000, "category": "Trà" },
            { "name": "Trà đào Hibicus", "price": 49000, "category": "Trà" },
            { "name": "Trà cam quế mật ong", "price": 39000, "category": "Trà" },
            { "name": "Trà hoa cúc táo đỏ", "price": 39000, "category": "Trà" },
            { "name": "Trà gừng sen bí đao", "price": 39000, "category": "Trà" },
            { "name": "Trà gừng vải", "price": 39000, "category": "Trà" },
            { "name": "Trà lài lê hoa cúc", "price": 45000, "category": "Trà" },
            { "name": "Trà olong hương mộc", "price": 39000, "category": "Trà" },
            { "name": "Hồng trà (đá / nóng)", "price": 30000, "category": "Trà" },
            { "name": "Hồng trà sữa (đá / nóng)", "price": 35000, "category": "Trà" },
            { "name": "Trà hoa quả nhiệt đới (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà vải Aha (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà sen Aha (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà đào Aha (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà ổi hồng (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà đào cam sả (đá)", "price": 55000, "category": "Trà" },
            { "name": "Trà Ô Long Lài Sữa Trân Châu Hoàng Gia (Đá)", "price": 55000, "category": "Trà" },
            { "name": "Trà Ô Long Lài Sữa (Nóng)", "price": 55000, "category": "Trà" },
            { "name": "Trà lá nếp", "price": 55000, "category": "Trà" },
            { "name": "Trà xoài sữa lắc", "price": 55000, "category": "Trà" },
            { "name": "Trà Ô Long Yến Mạch (Đá)", "price": 55000, "category": "Trà" },

            { "name": "Chocolate đá xay", "price": 50000, "category": "Đá Xay" },
            { "name": "Matcha đá xay", "price": 50000, "category": "Đá Xay" },
            { "name": "Bạc hà sôcôla", "price": 50000, "category": "Đá Xay" },
            { "name": "Cookies choco", "price": 55000, "category": "Đá Xay" },

            { "name": "Hướng dương", "price": 20000, "category": "Đồ Ăn Vặt" },

            { "name": "Bơ Già Dừa Non (Đá)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dừa Non Kem Xoài AHA", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Bơ Già Kem Dừa AHA", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Matcha Xoài", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chocolate Yến Mạch (Nóng)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Matcha Hạnh Nhân (Nóng)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chocolate Yến Mạch (Đá)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Matcha Hạnh Nhân (Đá)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố xoài và kem", "price": 49000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua kem dâu", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Rau má đậu xanh", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Đậu xanh kem dừa", "price": 49000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chanh tươi", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chanh leo", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Ổi ép", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dưa hấu ép", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dứa ép", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dừa xiêm", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Cam vắt", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Táo ép", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Nước bưởi ép", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dâu tây kem xoài", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Phúc bồn tử kem vani", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Hoa quả dầm kem dừa", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố xoài", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố dừa xiêm", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố chanh tuyết", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Hoa quả dầm sữa chua", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua đá", "price": 30000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua cà phê", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua cacao", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua chanh leo", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Cacao (nóng/đá)", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Bia Sài Gòn", "price": 30000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Nước ngọt", "price": 25000, "category": "Sinh Tố & Nước Ép" }
        ];

        try {
            let batch = writeBatch(db);
            let count = 0;
            for (let i = 0; i < defaultAhaMenu.length; i++) {
                const item = defaultAhaMenu[i];
                const docRef = doc(db, 'menu', item.name);
                batch.set(docRef, {
                    name: item.name,
                    price: item.price,
                    category: item.category,
                    createdAt: new Date()
                });
                count++;
                if (count >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                }
            }
            if (count > 0) {
                await batch.commit();
            }
            console.log("🌱 Đã nạp thành công 80 món Aha Cafe lên Firestore!");
        } catch (err) {
            console.error("Lỗi khi seed thực đơn lên Firestore:", err);
        }
    }

    // --- INITIALIZATION ---
    window.initApp = function() {
        console.log("⚡ Đang khởi tạo ứng dụng (Firebase Firestore Realtime Mode)...");
        
        // Kiểm tra reset doanh thu khi sang ngày mới
        checkDailyReset();
        
        // 1. Kiểm tra trạng thái đăng nhập từ sessionStorage
        let savedRole = sessionStorage.getItem('goat_user_role');
        if (savedRole === 'THU NGÂN' || savedRole === 'Thu ngân' || savedRole === 'NHÂN VIÊN' || savedRole === 'Nhân viên') {
            savedRole = 'staff';
        }
        const loginOverlay = document.getElementById('login-overlay');
        
        if (!savedRole) {
            if (loginOverlay) loginOverlay.style.display = 'flex';
        } else {
            if (loginOverlay) loginOverlay.style.display = 'none';
            applyRoleSettings();
        }

        updateHeaderDate();
        
        // Cập nhật ngày giờ trên hóa đơn xem trước thành thời gian thực
        const billDateEl = document.querySelector('.bill-date');
        if (billDateEl) {
            let dateStr = new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
            billDateEl.innerText = dateStr.replace(',', ' -');
        }

        // 2. Lắng nghe cấu hình in realtime từ Firestore
        onSnapshot(doc(db, 'settings', 'print'), (docSnap) => {
            if (docSnap.exists()) {
                printSettings = docSnap.data();
                localStorage.setItem('goat_print_settings', JSON.stringify(printSettings));
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
            const deleteBtn = document.getElementById('btn-delete-qr');
            
            if (docSnap.exists() && docSnap.data().qrCode) {
                const qrData = docSnap.data().qrCode;
                currentPaymentQR = qrData;
                if (previewImg) { previewImg.src = qrData; previewImg.style.display = 'block'; }
                if (placeholder) placeholder.style.display = 'none';
                if (billQRImg) { billQRImg.src = qrData; billQRImg.style.display = 'block'; }
                if (missingMsg) missingMsg.style.display = 'none';
                if (deleteBtn) deleteBtn.style.display = 'flex';
            } else {
                currentPaymentQR = '';
                if (previewImg) { previewImg.src = ''; previewImg.style.display = 'none'; }
                if (placeholder) placeholder.style.display = 'block';
                if (billQRImg) { billQRImg.src = ''; billQRImg.style.display = 'none'; }
                if (missingMsg) missingMsg.style.display = 'block';
                if (deleteBtn) deleteBtn.style.display = 'none';
            }

            // Real-time update for payment modal if open
            if (selectedTableForBill) {
                const qrVisible = document.getElementById('qr-transfer-view')?.style.display === 'block';
                window.updatePaymentModalDetails(selectedTableForBill, qrVisible ? 'transfer' : 'cash');
            }
        });

        // 4. Lắng nghe danh sách bàn có đơn realtime từ Firestore
        onSnapshot(collection(db, 'tables'), (querySnapshot) => {
            tableOrders = {};
            querySnapshot.forEach((doc) => {
                const tableId = parseInt(doc.id.replace('table_', ''));
                tableOrders[tableId] = doc.data();
            });
            
            // Kiểm tra có đơn mới để phát chuông báo bếp
            checkNewOrders(tableOrders);
            
            renderTables();
            
            // Render realtime màn hình Quầy Bar
            renderBarDashboard();
            
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
        onSnapshot(collection(db, 'menu'), async (querySnapshot) => {
            menuItems = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data && data.name) {
                    menuItems.push(data);
                }
            });
            
            // Nếu Firestore trống (hoặc có ít hơn 5 món), tự động nạp 80 món Aha Cafe
            if (menuItems.length < 5) {
                await seedDefaultAhaMenu();
            } else {
                renderProducts(currentCategory);
            }
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

        // 7. Khởi tạo tính năng kéo thả chuyển bàn
        initDragAndDrop();
    };

    // --- DRAG AND DROP ENGINE FOR TABLES ---
    function initDragAndDrop() {
        const container = document.getElementById('table-grid-container');
        if (!container) return;

        let draggedTableId = null;
        let dragHelper = null;
        let lastHoveredTableId = null;
        let isDragging = false;
        
        let startX = 0;
        let startY = 0;
        let dragStartTimer = null;
        let activeTargetEl = null;
        const DRAG_THRESHOLD = 8; // Ngưỡng dịch chuyển (pixels) để kích hoạt kéo lập tức
        const LONG_PRESS_DELAY = 250; // Thời gian nhấn giữ (ms) để bắt đầu kéo



        const startDragAttempt = function(clientX, clientY, targetEl) {
            const tableItem = targetEl.closest('.table-item');
            if (!tableItem || !tableItem.classList.contains('table-active')) return;

            const tableId = parseInt(tableItem.id.replace('table-', ''));
            if (isNaN(tableId)) return;

            draggedTableId = tableId;
            activeTargetEl = tableItem;
            startX = clientX;
            startY = clientY;
            isDragging = false;

            // Xóa bộ đếm cũ nếu có
            if (dragStartTimer) clearTimeout(dragStartTimer);

            // Đặt đếm ngược để xác nhận nhấn giữ (Long press)
            dragStartTimer = setTimeout(() => {
                initiateDrag(clientX, clientY);
            }, LONG_PRESS_DELAY);
        };

        const initiateDrag = function(clientX, clientY) {
            if (isDragging || !activeTargetEl) return;
            isDragging = true;

            // Kích hoạt touch-action: none cho phần tử đang kéo để tránh cuộn trang
            activeTargetEl.style.touchAction = 'none';

            // Tạo một helper drag để hiển thị hiệu ứng kéo theo tay/chuột
            dragHelper = activeTargetEl.cloneNode(true);
            dragHelper.style.position = 'fixed';
            dragHelper.style.width = activeTargetEl.offsetWidth + 'px';
            dragHelper.style.height = activeTargetEl.offsetHeight + 'px';
            dragHelper.style.left = (clientX - activeTargetEl.offsetWidth / 2) + 'px';
            dragHelper.style.top = (clientY - activeTargetEl.offsetHeight / 2) + 'px';
            dragHelper.style.opacity = '0.85';
            dragHelper.style.zIndex = '9999';
            dragHelper.style.pointerEvents = 'none'; // CỰC KỲ QUAN TRỌNG: để document.elementFromPoint đọc được phần tử nằm dưới nó
            dragHelper.style.boxShadow = '0 12px 24px rgba(0,0,0,0.2)';
            dragHelper.style.transform = 'scale(1.05)';
            dragHelper.style.transition = 'none';
            document.body.appendChild(dragHelper);

            // Gán class kéo cho phần tử gốc
            activeTargetEl.classList.add('table-dragging');
        };

        const moveDrag = function(clientX, clientY, isTouch = false) {
            if (!draggedTableId) return;

            if (isDragging) {
                if (dragHelper) {
                    // Di chuyển helper theo con trỏ
                    dragHelper.style.left = (clientX - dragHelper.offsetWidth / 2) + 'px';
                    dragHelper.style.top = (clientY - dragHelper.offsetHeight / 2) + 'px';
                }

                // Tìm phần tử nằm dưới ngón tay / con trỏ chuột
                const elementUnder = document.elementFromPoint(clientX, clientY);
                if (!elementUnder) return;

                const targetTableItem = elementUnder.closest('.table-item');
                
                // Xóa highlight bàn đã rà trước đó
                if (lastHoveredTableId) {
                    const prevEl = document.getElementById(`table-${lastHoveredTableId}`);
                    if (prevEl) {
                        prevEl.classList.remove('table-hovered-target');
                        prevEl.style.borderColor = '';
                        prevEl.style.boxShadow = '';
                    }
                    lastHoveredTableId = null;
                }

                if (targetTableItem && targetTableItem.id !== `table-${draggedTableId}`) {
                    const targetId = parseInt(targetTableItem.id.replace('table-', ''));
                    if (!isNaN(targetId)) {
                        targetTableItem.classList.add('table-hovered-target');
                        if (targetTableItem.classList.contains('table-empty')) {
                            targetTableItem.style.borderColor = '#10b981'; // Xanh lá khi chuyển sang bàn trống
                            targetTableItem.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.4)';
                        } else {
                            targetTableItem.style.borderColor = '#f59e0b'; // Màu vàng cam khi gộp bàn
                            targetTableItem.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.4)';
                        }
                        lastHoveredTableId = targetId;
                    }
                }
            } else {
                // Tính khoảng cách dịch chuyển
                const dx = clientX - startX;
                const dy = clientY - startY;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist > DRAG_THRESHOLD) {
                    if (dragStartTimer) {
                        clearTimeout(dragStartTimer);
                        dragStartTimer = null;
                    }
                    
                    if (isTouch) {
                        // Nếu đang vuốt cảm ứng trên di động và dịch chuyển quá nhanh khi chưa qua 250ms long-press
                        // chứng tỏ người dùng đang CUỘN trang tự nhiên, hủy chế độ kéo để cho trình duyệt cuộn mượt.
                        draggedTableId = null;
                        activeTargetEl = null;
                    } else {
                        // Với chuột (PC), kích hoạt kéo bàn lập tức khi di chuột
                        initiateDrag(clientX, clientY);
                    }
                }
            }
        };

        const endDrag = function() {
            if (!isDragging) return;

            isDragging = false;
            
            // Loại bỏ class kéo của phần tử gốc
            const originEl = document.getElementById(`table-${draggedTableId}`);
            if (originEl) {
                originEl.classList.remove('table-dragging');
                originEl.style.touchAction = ''; // Giải phóng touch-action
            }

            // Làm sạch highlight của bàn mục tiêu
            if (lastHoveredTableId) {
                const targetEl = document.getElementById(`table-${lastHoveredTableId}`);
                if (targetEl) {
                    targetEl.classList.remove('table-hovered-target');
                    targetEl.style.borderColor = '';
                    targetEl.style.boxShadow = '';
                }
            }

            // Xóa helper
            if (dragHelper) {
                dragHelper.remove();
                dragHelper = null;
            }

            const from = draggedTableId;
            const to = lastHoveredTableId;

            draggedTableId = null;
            lastHoveredTableId = null;
            if (activeTargetEl) {
                activeTargetEl.style.touchAction = ''; // Giải phóng touch-action
            }
            activeTargetEl = null;

            if (from && to && from !== to) {
                const isToOccupied = tableOrders[to] !== undefined;
                let confirmMsg = `Bạn có chắc chắn muốn chuyển khách từ ${window.getTableName(from)} sang ${window.getTableName(to)} không?`;
                if (isToOccupied) {
                    confirmMsg = `${window.getTableName(to)} đang có khách. Bạn có chắc chắn muốn gộp đơn của ${window.getTableName(from)} vào ${window.getTableName(to)} không?`;
                }

                if (confirm(confirmMsg)) {
                    window.confirmMoveTable(from, to);
                }
            }
        };

        const cancelDragAttempt = function() {
            if (dragStartTimer) {
                clearTimeout(dragStartTimer);
                dragStartTimer = null;
            }

            if (activeTargetEl) {
                activeTargetEl.style.touchAction = ''; // Giải phóng touch-action
            }

            if (isDragging) {
                endDrag();
            } else {
                // Nhả tay nhanh (Click/Tap), làm sạch biến để cho phép trình duyệt kích hoạt onclick tự nhiên
                draggedTableId = null;
                activeTargetEl = null;
            }
        };

        // Gán các sự kiện Chuột (Mouse)
        container.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return; // Chỉ nhận chuột trái
            startDragAttempt(e.clientX, e.clientY, e.target);
        });

        document.addEventListener('mousemove', function(e) {
            moveDrag(e.clientX, e.clientY, false);
        });

        document.addEventListener('mouseup', function(e) {
            cancelDragAttempt();
        });

        // Gán các sự kiện Cảm ứng (Touch)
        container.addEventListener('touchstart', function(e) {
            if (e.touches.length > 1) return; // Chỉ xử lý 1 ngón tay
            startDragAttempt(e.touches[0].clientX, e.touches[0].clientY, e.target);
        }, { passive: false });

        document.addEventListener('touchmove', function(e) {
            if (isDragging) {
                e.preventDefault(); // Chỉ chặn trình duyệt cuộn khi đã nhấn giữ đủ lâu (thực sự kéo)
            }
            if (draggedTableId) {
                moveDrag(e.touches[0].clientX, e.touches[0].clientY, true);
            }
        }, { passive: false });

        document.addEventListener('touchend', function(e) {
            if (isDragging && e.changedTouches && e.changedTouches.length > 0) {
                let touch = e.changedTouches[0];
                let targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
                if (targetElement) {
                    let targetTableItem = targetElement.closest('.table-item');
                    if (targetTableItem && targetTableItem.id !== `table-${draggedTableId}`) {
                        const targetId = parseInt(targetTableItem.id.replace('table-', ''));
                        if (!isNaN(targetId)) {
                            lastHoveredTableId = targetId;
                        }
                    }
                }
            }
            cancelDragAttempt();
        });

    }

    // --- RECALCULATE STATS FROM HISTORY ---
    function recalculateStats() {
        stats = {
            totalRevenue: 0,
            totalOrders: 0,
            guestCount: 0,
            cashTotal: 0,
            transferTotal: 0
        };
        
        const todayStr = new Date().toLocaleDateString('vi-VN');
        
        orderHistory.forEach(order => {
            let orderDate;
            if (order.createdAt) {
                orderDate = typeof order.createdAt.toDate === 'function' ? order.createdAt.toDate() : new Date(order.createdAt);
            } else if (order.time) {
                const parts = order.time.split(' ');
                const dateParts = parts[parts.length - 1].split('/');
                if (dateParts.length === 3) {
                    orderDate = new Date(parseInt(dateParts[2]), parseInt(dateParts[1]) - 1, parseInt(dateParts[0]));
                } else {
                    orderDate = new Date();
                }
            } else {
                orderDate = new Date();
            }
            const orderDateStr = orderDate.toLocaleDateString('vi-VN');
            
            if (orderDateStr === todayStr) {
                stats.totalRevenue += order.total;
                stats.totalOrders += 1;
                stats.guestCount += 1; // Số khách mới được tính dựa trên số đơn hàng
                if (order.paymentMethod === 'Tiền mặt') {
                    stats.cashTotal += order.total;
                } else {
                    stats.transferTotal += order.total;
                }
            }
        });

        // Đồng bộ dữ liệu doanh thu trong ngày vào localStorage
        localStorage.setItem('daily_revenue', stats.totalRevenue.toString());
        localStorage.setItem('daily_order_count', stats.totalOrders.toString());
        localStorage.setItem('last_daily_revenue_date', todayStr);
    }

    // --- ROLE MANAGEMENT FUNCTIONS ---
    window.selectRole = function(role) {
        currentRole = role;
        const btnStaff = document.getElementById('btn-role-staff');
        const btnBar = document.getElementById('btn-role-bar');
        const btnAdmin = document.getElementById('btn-role-admin');
        const pinField = document.getElementById('pin-field-container');
        const pinLabel = pinField?.querySelector('label');
        const submitBtn = document.getElementById('btn-submit-login');
        
        // Reset styles for all tabs
        const tabs = [btnStaff, btnBar, btnAdmin];
        tabs.forEach(t => {
            if (t) {
                t.style.background = 'transparent';
                t.style.color = '#475569';
                t.classList.remove('active');
            }
        });
        
        const activeBtn = role === 'staff' ? btnStaff : (role === 'bar' ? btnBar : btnAdmin);
        if (activeBtn) {
            activeBtn.style.background = 'white';
            activeBtn.style.color = '#0284c7';
            activeBtn.classList.add('active');
        }
        
        if (role === 'staff') {
            if (pinField) pinField.style.display = 'none';
            if (submitBtn) submitBtn.innerText = 'Đăng nhập Thu ngân ➔';
            enteredPin = '';
            updatePinDots();
        } else if (role === 'bar') {
            if (pinField) pinField.style.display = 'flex';
            if (pinLabel) pinLabel.innerText = 'MÃ PIN QUẦY BAR';
            if (submitBtn) submitBtn.innerText = 'Đăng nhập Quầy Bar ➔';
            enteredPin = '';
            updatePinDots();
        } else {
            if (pinField) pinField.style.display = 'flex';
            if (pinLabel) pinLabel.innerText = 'MÃ PIN ADMIN';
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
        } else if (currentRole === 'bar') {
            if (enteredPin === '5555') {
                sessionStorage.setItem('goat_user_role', 'bar');
                applyRoleSettings();
                const loginOverlay = document.getElementById('login-overlay');
                if (loginOverlay) loginOverlay.style.display = 'none';
                enteredPin = '';
                updatePinDots();
            } else {
                if (errorMsg) {
                    errorMsg.innerText = '❌ Mã PIN Quầy Bar không chính xác!';
                    errorMsg.style.display = 'block';
                }
                enteredPin = '';
                updatePinDots();
            }
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
        const role = getUserRole();
        const badge = document.getElementById('user-badge');
        if (badge) {
            badge.innerText = role === 'admin' ? 'Admin' : (role === 'bar' ? 'Quầy Bar' : 'Thu ngân');
            badge.className = 'user-badge' + (role === 'admin' ? ' admin' : (role === 'bar' ? ' bar' : ''));
        }
        
        // Phân quyền chi tiết trong màn hình Dashboard (Nhân viên được xem đầy đủ 100% doanh thu)
        const cardRevenue = document.getElementById('card-revenue');
        const cardAvg = document.getElementById('card-avg');
        const containerRevenueChart = document.getElementById('container-revenue-chart');
        
        if (cardRevenue) cardRevenue.style.display = 'block';
        if (cardAvg) cardAvg.style.display = 'block';
        if (containerRevenueChart) containerRevenueChart.style.display = 'block';
        
        // Cập nhật lại số liệu hiển thị (tiền thật) dựa vào vai trò hiện tại
        if (typeof window.updateDashboardUI === 'function') {
            window.updateDashboardUI();
        }
        
        const dashboardNavBtn = document.getElementById('nav-dashboard');
        const clearHistoryBtn = document.querySelector('.btn-clear-history');
        
        // Cấu hình menu tương ứng
        const menuSection = document.getElementById('menu-section');
        if (menuSection) {
            const items = menuSection.querySelectorAll('.menu-item');
            items.forEach(item => {
                const label = item.querySelector('.menu-label')?.innerText || '';
                if (label.includes('Cấu hình in') || label.includes('Cấu hình Thanh toán') || label.includes('Quản lý ca')) {
                     item.style.display = role === 'admin' ? 'flex' : 'none';
                }
            });
        }

        // Tự động chuyển đổi giao diện dựa trên vai trò
        if (role === 'bar') {
            document.body.classList.add('role-bar-active');
            
            if (dashboardNavBtn) dashboardNavBtn.style.display = 'none';
            if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
            
            window.switchTab('bar-section');
        } else {
            document.body.classList.remove('role-bar-active');
            
            // Nút "Tổng quan" ở thanh đáy luôn hiển thị cho cả Admin và Nhân viên
            if (dashboardNavBtn) dashboardNavBtn.style.display = 'flex';
            
            window.switchTab('dashboard-section');
            
            const reportBtn = document.getElementById('btn-view-report');
            const importExcelBtn = document.getElementById('btn-import-excel');
            if (role === 'admin') {
                if (clearHistoryBtn) clearHistoryBtn.style.display = 'block';
                if (reportBtn) reportBtn.style.display = 'block';
                
                const quickAddBtn = document.querySelector('.btn-toggle-add');
                if (quickAddBtn) quickAddBtn.style.display = 'flex';
                if (importExcelBtn) importExcelBtn.style.display = 'flex';
            } else {
                if (clearHistoryBtn) clearHistoryBtn.style.display = 'none';
                if (reportBtn) reportBtn.style.display = 'none';
                
                const quickAddBtn = document.querySelector('.btn-toggle-add');
                if (quickAddBtn) quickAddBtn.style.display = 'none';
                if (importExcelBtn) importExcelBtn.style.display = 'none';
                
                const quickAddForm = document.getElementById('quick-add-form');
                if (quickAddForm) quickAddForm.style.display = 'none';
            }
        }
    }

    // --- POS LOGIC ---
    window.addToCart = function(itemName, price) {
        // Chỉ gộp vào món chưa có ghi chú
        const existingItem = currentCart.find(item => item.name === itemName && !item.note);
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
                        <input type="text" class="item-note-input" placeholder="Ghi chú (ít đường, không đá...)..." value="${item.note || ''}" onchange="updateCartItemNote(${index}, this.value)" oninput="updateCartItemNote(${index}, this.value)">
                    </div>
                    <span class="cart-item-price">${(itemTotal).toLocaleString()} đ</span>
                </div>
            `;
        });
        cartList.innerHTML = html;
        bottomCount.innerText = `${totalItems} món`;
        bottomTotal.innerText = `${totalAmount.toLocaleString()} đ`;
    }

    window.updateCartItemNote = function(index, value) {
        if (currentCart[index]) {
            currentCart[index].note = value;
        }
    };

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
                // Chỉ gộp với các món cùng tên, cùng ghi chú và cùng có trạng thái 'pending' để không phá hỏng trạng thái làm món
                const sameItem = finalItems.find(i => i.name === newItem.name && (i.status || 'pending') === 'pending' && (i.note || '') === (newItem.note || ''));
                if (sameItem) {
                    sameItem.qty += newItem.qty;
                } else {
                    const itemCopy = JSON.parse(JSON.stringify(newItem));
                    itemCopy.status = 'pending';
                    itemCopy.orderedAt = new Date();
                    finalItems.push(itemCopy);
                }
            });
            finalTotal = tableOrders[num].total + cartTotal;
        } else {
            finalItems = JSON.parse(JSON.stringify(currentCart));
            finalItems.forEach(it => {
                it.status = 'pending';
                it.orderedAt = new Date();
            });
            finalTotal = cartTotal;
        }

        try {
            const checkInVal = tableOrders[num]?.checkInTime ? tableOrders[num].checkInTime : new Date();
            await setDoc(doc(db, 'tables', `table_${num}`), {
                items: finalItems,
                total: finalTotal,
                updatedAt: new Date(),
                checkInTime: checkInVal
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
    window.payWithCash = () => { if (confirm(`Xác nhận thanh toán TIỀN MẶT cho ${getTableName(selectedTableForBill)}?`)) finishPayment('Tiền mặt'); };
    window.confirmPayment = () => { if (confirm(`Đã nhận đủ tiền CHUYỂN KHOẢN cho ${getTableName(selectedTableForBill)}?`)) finishPayment('Chuyển khoản'); };

    async function finishPayment(method) {
        const id = selectedTableForBill;
        const orderData = tableOrders[id];
        if (!orderData) return;

        // Kiểm tra reset doanh thu khi sang ngày mới trước khi thanh toán
        checkDailyReset();

        const now = new Date();
        const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} ${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getFullYear()}`;

        // Lấy mã đơn hàng ngẫu nhiên ngắn đã tạo khi mở modal
        const orderId = currentPaymentOrderId || generateRandomOrderIdShort();
        const archiveOrder = {
            id: orderId,
            time: timeStr,
            items: orderData.items,
            total: orderData.total,
            tableId: id,
            paymentMethod: method,
            createdAt: now
        };

        // 1. Đọc dữ liệu đã cấu hình từ localStorage
        const storeDetails = getStoreDetailsFromLocalStorage();

        // 2. Đổ dữ liệu cấu hình vào Bill thực tế khi In
        // Header
        const previewBrand = document.querySelector('#bill-preview-box .bill-brand');
        if (previewBrand) {
            previewBrand.innerText = storeDetails.shopName;
        }

        const previewAddress = document.getElementById('bill-print-address');
        if (previewAddress) {
            if (storeDetails.shopAddress) {
                previewAddress.innerText = storeDetails.shopAddress;
                previewAddress.style.display = 'block';
            } else {
                previewAddress.style.display = 'none';
            }
        }

        const previewPhone = document.getElementById('bill-print-phone');
        if (previewPhone) {
            if (storeDetails.shopPhone) {
                previewPhone.innerText = `SĐT: ${storeDetails.shopPhone}`;
                previewPhone.style.display = 'block';
            } else {
                previewPhone.style.display = 'none';
            }
        }

        // Order Info Box (Order ID & Table ID)
        const previewOrderId = document.getElementById('bill-print-order-id');
        if (previewOrderId) previewOrderId.innerText = orderId;

        const previewTableId = document.getElementById('bill-print-table-id');
        if (previewTableId) previewTableId.innerText = getTableName(id);

        // Food Items list
        const previewItemsContainer = document.querySelector('#bill-preview-box .bill-items');
        if (previewItemsContainer) {
            previewItemsContainer.innerHTML = orderData.items.map(it => `
                <div class="b-row">
                    <span>${it.name} x${it.qty}${it.note ? `<br><small style="font-size: 11px; color: #555;">- Ghi chú: ${it.note}</small>` : ''}</span>
                    <span>${(it.price * it.qty).toLocaleString()}</span>
                </div>
            `).join('');
        }
        
        // Total amount
        const previewTotal = document.querySelector('#bill-preview-box .bill-total span:last-child');
        if (previewTotal) previewTotal.innerText = orderData.total.toLocaleString();
        
        // WiFi info
        const previewWifi = document.querySelector('#bill-preview-box #v-wifi');
        if (previewWifi) {
            previewWifi.innerHTML = `<i class="fa-solid fa-wifi"></i> WiFi: ${storeDetails.wifiName} / MK: ${storeDetails.wifiPass}`;
        }

        // Greeting / Note
        const previewNote = document.querySelector('#bill-preview-box #v-note');
        if (previewNote) {
            previewNote.innerText = storeDetails.shopGreeting;
        }

        // Real Date/Time with Seconds
        const previewDate = document.querySelector('#bill-preview-box .bill-date');
        if (previewDate) {
            let dateStr = now.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
            previewDate.innerText = dateStr.replace(',', ' -');
        }

        // Đóng modal và reset trạng thái bàn để dọn sạch màn hình POS
        selectedTableForBill = null;
        currentPaymentOrderId = '';
        window.closeAllModals();

        // 3. Kích hoạt Lệnh In ngay lập tức
        setTimeout(() => {
            window.print();
        }, 150);

        try {
            // Xóa bàn đang phục vụ trên Firestore & thêm đơn vào Lịch sử đơn hàng
            await deleteDoc(doc(db, 'tables', `table_${id}`));
            await setDoc(doc(db, 'history', orderId), archiveOrder);
            
            console.log("Thanh toán thành công!");
            // Hiển thị thông báo sau khi lưu thành công và in
            setTimeout(() => {
                alert('🎉 Thanh toán thành công!');
            }, 300);
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
                            <span class="order-id" style="font-weight:800; color:#1e293b; font-size:14px;">${order.id} (${getTableName(order.tableId)})</span>
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
        const role = getUserRole();
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
        const role = getUserRole();
        
        // Khóa màn hình với từng vai trò cụ thể (Nhân viên được phép xem Dashboard nhưng không xem được số liệu tiền nong)
        if (tabId === 'dashboard-section' && role === 'bar') {
            return; 
        }
        if (role === 'bar' && tabId !== 'bar-section') {
            return; // Quầy Bar chỉ được phép xem màn hình Bar
        }

        const sections = ['dashboard-section', 'pos-section', 'tables-section', 'menu-section', 'print-config-section', 'payment-config-section', 'order-history-section', 'shift-management-section', 'bar-section'];
        sections.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        const target = document.getElementById(tabId);
        if (target) target.style.display = 'block';

        // Tự động kích hoạt/hủy kích hoạt giao diện tối (Dark Mode) cho màn hình Quầy Bar
        if (tabId === 'bar-section') {
            document.body.classList.add('dark-theme');
            
            // Kích hoạt Fullscreen tự động
            window.enterFullscreen();

            // Đăng ký tương tác dự phòng nếu trình duyệt chặn tự động mở
            if (!window.barFullscreenListenerRegistered) {
                window.barFullscreenListenerRegistered = true;
                const barSec = document.getElementById('bar-section');
                if (barSec) {
                    barSec.addEventListener('click', () => {
                        if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
                            window.enterFullscreen();
                        }
                    }, { once: true }); // Kích hoạt ngay khi nhấp chuột/chạm lần đầu
                }
            }
        } else {
            document.body.classList.remove('dark-theme');
            window.exitFullscreen();
        }

        if (tabId === 'order-history-section') renderHistory();

        const navItems = document.querySelectorAll('.bottom-nav-item');
        navItems.forEach(item => item.classList.remove('active'));
        let searchId = tabId;
        if (['print-config-section', 'payment-config-section', 'order-history-section', 'shift-management-section'].includes(tabId)) searchId = 'menu-section';
        const activeBtn = document.querySelector(`.bottom-nav-item[onclick*="${searchId}"]`);
        if (activeBtn) activeBtn.classList.add('active');
    };

    window.currentFloor = 1;
    window.switchFloor = function(floor) {
        window.currentFloor = floor;
        const btn1 = document.getElementById('btn-floor-1');
        const btn2 = document.getElementById('btn-floor-2');
        if (btn1 && btn2) {
            if (floor === 1) {
                btn1.style.background = 'white';
                btn1.style.color = 'var(--primary)';
                btn1.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                btn1.classList.add('active');
                
                btn2.style.background = 'transparent';
                btn2.style.color = '#64748b';
                btn2.style.boxShadow = 'none';
                btn2.classList.remove('active');
            } else {
                btn2.style.background = 'white';
                btn2.style.color = 'var(--primary)';
                btn2.style.boxShadow = '0 2px 4px rgba(0,0,0,0.05)';
                btn2.classList.add('active');
                
                btn1.style.background = 'transparent';
                btn1.style.color = '#64748b';
                btn1.style.boxShadow = 'none';
                btn1.classList.remove('active');
            }
        }
        renderTables();
    };

    window.renderTables = function() {
        const container = document.getElementById('table-grid-container');
        if (!container) return;
        let html = '';
        
        const start = window.currentFloor === 1 ? 1 : 41;
        const end = window.currentFloor === 1 ? 40 : 80;
        
        for (let i = start; i <= end; i++) {
            const hasOrder = tableOrders[i];
            if (hasOrder) {
                let checkInStr = '';
                const timeSource = hasOrder.checkInTime || hasOrder.updatedAt;
                if (timeSource) {
                    const dateObj = timeSource.seconds ? new Date(timeSource.seconds * 1000) : new Date(timeSource);
                    checkInStr = dateObj.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                }
                const checkInHtml = checkInStr ? `<div class="table-checkin-time">${checkInStr}</div>` : '';
                
                let isAllDone = false;
                if (hasOrder.items && hasOrder.items.length > 0) {
                    isAllDone = hasOrder.items.every(item => item.status === 'completed');
                }
                const activeClass = isAllDone ? 'table-item table-active table-all-done' : 'table-item table-active';
                
                html += `
                    <div id="table-${i}" class="${activeClass}" onclick="viewTableBill(${i})">
                        <span style="font-weight: 700;">${getTableName(i)}</span>
                        ${checkInHtml}
                    </div>
                `;
            } else {
                html += `
                    <div id="table-${i}" class="table-item table-empty" onclick="selectEmptyTable(${i})">
                        <span style="font-weight: 700;">${getTableName(i)}</span>
                    </div>
                `;
            }
        }
        container.innerHTML = html;
        const occupied = Object.keys(tableOrders).length;
        const statsEl = document.getElementById('table-stats');
        if (statsEl) statsEl.innerText = `Tổng: 80 bàn | Đang phục vụ: ${occupied}`;
    };

    window.selectEmptyTable = function(i) {
        // Hỗ trợ click nhanh vào bàn trống để bắt đầu gọi món
        window.switchTab('pos-section');
        targetTableId = i;
        const noticeBar = document.getElementById('pos-notice-bar');
        if (noticeBar) {
            noticeBar.style.display = 'block';
            const nameSpan = document.getElementById('pos-target-table-name');
            if (nameSpan) nameSpan.innerText = getTableName(i);
        }
    };

    window.updateDashboardUI = function() {
        if (document.getElementById('stat-revenue')) {
            document.getElementById('stat-revenue').innerText = `${stats.totalRevenue.toLocaleString()} đ`;
            const today = new Date();
            const dateString = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;
            const titleEl = document.getElementById('revenue-title');
            if (titleEl) titleEl.innerText = `DOANH THU HÔM NAY (${dateString})`;
        }
        if (document.getElementById('stat-orders')) {
            document.getElementById('stat-orders').innerText = stats.totalOrders;
        }
        
        const avg = stats.totalOrders > 0 ? Math.round(stats.totalRevenue / stats.totalOrders) : 0;
        if (document.getElementById('stat-avg')) {
            document.getElementById('stat-avg').innerText = `${avg.toLocaleString()} đ`;
        }
        if (document.getElementById('stat-guests')) {
            document.getElementById('stat-guests').innerText = stats.guestCount;
        }
        
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
                            position: 'right',
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
            { "name": "Cà phê đen", "price": 33000, "category": "Cà Phê" },
            { "name": "Cà phê sữa", "price": 35000, "category": "Cà Phê" },
            { "name": "Bạc xỉu", "price": 40000, "category": "Cà Phê" },
            { "name": "Cà phê cốt dừa (đá)", "price": 45000, "category": "Cà Phê" },
            { "name": "Cà phê kem Aha", "price": 65000, "category": "Cà Phê" },
            { "name": "Cà Phê Đen Pha Máy", "price": 33000, "category": "Cà Phê" },
            { "name": "Cà Phê Sữa Pha Máy", "price": 35000, "category": "Cà Phê" },
            { "name": "Espresso", "price": 33000, "category": "Cà Phê" },
            { "name": "Americano (nóng/đá)", "price": 35000, "category": "Cà Phê" },
            { "name": "Cappuccino (nóng/đá)", "price": 45000, "category": "Cà Phê" },
            { "name": "Latte (nóng/đá)", "price": 45000, "category": "Cà Phê" },
            { "name": "Mocha (nóng/đá)", "price": 50000, "category": "Cà Phê" },
            { "name": "Cà phê muối", "price": 45000, "category": "Cà Phê" },
            { "name": "Cà Phê Hạnh Nhân (Nóng)", "price": 55000, "category": "Cà Phê" },
            { "name": "Cà Phê Hạnh Nhân (Đá)", "price": 55000, "category": "Cà Phê" },
            { "name": "Cà phê đậu xanh", "price": 55000, "category": "Cà Phê" },

            { "name": "Trà xoài ô long", "price": 39000, "category": "Trà" },
            { "name": "Trà sữa ô long đường đen", "price": 45000, "category": "Trà" },
            { "name": "Trà sữa ô long matcha", "price": 45000, "category": "Trà" },
            { "name": "Trà táo bạc hà", "price": 49000, "category": "Trà" },
            { "name": "Trà đào Hibicus", "price": 49000, "category": "Trà" },
            { "name": "Trà cam quế mật ong", "price": 39000, "category": "Trà" },
            { "name": "Trà hoa cúc táo đỏ", "price": 39000, "category": "Trà" },
            { "name": "Trà gừng sen bí đao", "price": 39000, "category": "Trà" },
            { "name": "Trà gừng vải", "price": 39000, "category": "Trà" },
            { "name": "Trà lài lê hoa cúc", "price": 45000, "category": "Trà" },
            { "name": "Trà olong hương mộc", "price": 39000, "category": "Trà" },
            { "name": "Hồng trà (đá / nóng)", "price": 30000, "category": "Trà" },
            { "name": "Hồng trà sữa (đá / nóng)", "price": 35000, "category": "Trà" },
            { "name": "Trà hoa quả nhiệt đới (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà vải Aha (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà sen Aha (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà đào Aha (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà ổi hồng (đá)", "price": 45000, "category": "Trà" },
            { "name": "Trà đào cam sả (đá)", "price": 55000, "category": "Trà" },
            { "name": "Trà Ô Long Lài Sữa Trân Châu Hoàng Gia (Đá)", "price": 55000, "category": "Trà" },
            { "name": "Trà Ô Long Lài Sữa (Nóng)", "price": 55000, "category": "Trà" },
            { "name": "Trà lá nếp", "price": 55000, "category": "Trà" },
            { "name": "Trà xoài sữa lắc", "price": 55000, "category": "Trà" },
            { "name": "Trà Ô Long Yến Mạch (Đá)", "price": 55000, "category": "Trà" },

            { "name": "Chocolate đá xay", "price": 50000, "category": "Đá Xay" },
            { "name": "Matcha đá xay", "price": 50000, "category": "Đá Xay" },
            { "name": "Bạc hà sôcôla", "price": 50000, "category": "Đá Xay" },
            { "name": "Cookies choco", "price": 55000, "category": "Đá Xay" },

            { "name": "Hướng dương", "price": 20000, "category": "Đồ Ăn Vặt" },

            { "name": "Bơ Già Dừa Non (Đá)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dừa Non Kem Xoài AHA", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Bơ Già Kem Dừa AHA", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Matcha Xoài", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chocolate Yến Mạch (Nóng)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Matcha Hạnh Nhân (Nóng)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chocolate Yến Mạch (Đá)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Matcha Hạnh Nhân (Đá)", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố xoài và kem", "price": 49000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua kem dâu", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Rau má đậu xanh", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Đậu xanh kem dừa", "price": 49000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chanh tươi", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Chanh leo", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Ổi ép", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dưa hấu ép", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dứa ép", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dừa xiêm", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Cam vắt", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Táo ép", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Nước bưởi ép", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Dâu tây kem xoài", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Phúc bồn tử kem vani", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Hoa quả dầm kem dừa", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố xoài", "price": 50000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố dừa xiêm", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sinh tố chanh tuyết", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Hoa quả dầm sữa chua", "price": 55000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua đá", "price": 30000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua cà phê", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua cacao", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Sữa chua chanh leo", "price": 35000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Cacao (nóng/đá)", "price": 45000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Bia Sài Gòn", "price": 30000, "category": "Sinh Tố & Nước Ép" },
            { "name": "Nước ngọt", "price": 25000, "category": "Sinh Tố & Nước Ép" }
        ];
        
        // Tránh gộp trùng lặp nếu món đã có trong danh sách mặc định
        const dbItems = menuItems.filter(dbIt => {
            if (!dbIt || !dbIt.name) return false;
            const nameLower = dbIt.name.trim().toLowerCase();
            return !items.some(defaultIt => defaultIt.name.trim().toLowerCase() === nameLower);
        });

        items = [...items, ...dbItems];
        
        const queryStr = document.getElementById('pos-search-input')?.value.toLowerCase() || '';
        
        let filtered = filter === 'Tất cả' ? items : items.filter(i => i.category === filter);
        if (queryStr) {
            filtered = filtered.filter(it => it.name.toLowerCase().includes(queryStr));
        }

        container.innerHTML = filtered.map(it => {
            const priceVal = (it.price !== undefined && it.price !== null) ? Number(it.price) : 0;
            const priceStr = isNaN(priceVal) ? '0' : priceVal.toLocaleString();
            return `
                <div class="product-card" onclick="addToCart('${(it.name || '').replace(/'/g, "\\'")}', ${priceVal})">
                    <div class="product-name">${it.name || 'Chưa đặt tên'}</div>
                    <div class="product-price">${priceStr} đ</div>
                </div>
            `;
        }).join('');
    };

    window.filterProducts = function() {
        window.renderProducts(currentCategory);
    };

    window.updatePaymentModalDetails = function(tableIdOrData, currentMethod) {
        // Cập nhật ngày giờ trên hóa đơn xem trước thành thời gian thực
        const billDateEl = document.querySelector('.bill-date');
        if (billDateEl) {
            let dateStr = new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
            billDateEl.innerText = dateStr.replace(',', ' -');
        }

        // 1. Dọn dẹp giao diện cũ trước khi nạp dữ liệu mới
        document.getElementById('bill-sheet-title').innerText = 'Chi tiết...';
        document.getElementById('bill-items-list').innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Đang tải...</div>';
        document.getElementById('bill-total-amount').innerText = '0 đ';
        
        const qrTableId = document.getElementById('qr-table-id');
        const qrAmountVal = document.getElementById('qr-amount-val');
        const qrWifiDisplay = document.getElementById('qr-wifi-display');
        const qrGreetingDisplay = document.getElementById('qr-greeting-display');
        const billQRImg = document.getElementById('bill-qr-code-img');
        const missingMsg = document.getElementById('qr-missing-msg');
        
        if (qrTableId) qrTableId.innerText = '-';
        if (qrAmountVal) qrAmountVal.innerText = '0 đ';
        if (qrWifiDisplay) qrWifiDisplay.style.display = 'none';
        if (qrGreetingDisplay) qrGreetingDisplay.style.display = 'none';
        if (billQRImg) { billQRImg.src = ''; billQRImg.style.display = 'none'; }
        if (missingMsg) missingMsg.style.display = 'none';

        // 2. Lấy dữ liệu đơn hàng
        let order = null;
        let tableId = null;
        if (typeof tableIdOrData === 'object' && tableIdOrData !== null) {
            order = tableIdOrData;
            tableId = selectedTableForBill;
        } else {
            tableId = tableIdOrData;
            order = tableOrders[tableId];
        }

        if (!order) {
            document.getElementById('bill-items-list').innerHTML = '<div style="text-align: center; padding: 20px; color: #64748b;">Không có dữ liệu đơn hàng</div>';
            return;
        }

        const tableName = getTableName(tableId);
        const totalStr = `${order.total.toLocaleString()} đ`;

        // 3. Nạp dữ liệu mới vào giao diện
        document.getElementById('bill-sheet-title').innerText = `Chi tiết ${tableName}`;
        document.getElementById('bill-items-list').innerHTML = order.items.map(it => {
            const status = it.status || 'pending';
            let badgeLabel = '⏳ Đang chờ';
            let badgeClass = 'pending';
            if (status === 'preparing') {
                badgeLabel = '🍹 Đang làm';
                badgeClass = 'preparing';
            } else if (status === 'completed') {
                badgeLabel = '✅ Xong';
                badgeClass = 'completed';
            }
            
            return `
                <div class="cart-item-row" style="align-items: center;">
                    <div class="cart-item-info">
                        <span style="font-weight: 700; color: #1e293b;">${it.name}</span>
                        ${it.note ? `<div style="font-size: 11px; color: #64748b; font-style: italic; margin-top: 2px;">Ghi chú: ${it.note}</div>` : ''}
                        <div style="display: flex; align-items: center; gap: 8px; margin-top: 4px;">
                            <span style="font-size: 12px; color: #64748b; font-weight: 600;">x${it.qty}</span>
                            <span class="waiter-status-badge ${badgeClass}">${badgeLabel}</span>
                        </div>
                    </div>
                    <span style="font-weight: 800; color: #1e293b;">${(it.price * it.qty).toLocaleString()} đ</span>
                </div>
            `;
        }).join('');
        document.getElementById('bill-total-amount').innerText = totalStr;

        // Nạp dữ liệu cho tab Chuyển khoản (QR View)
        if (qrTableId) qrTableId.innerText = tableName;
        if (qrAmountVal) qrAmountVal.innerText = totalStr;

        // Cập nhật cấu hình WiFi hiển thị trong QR View
        if (qrWifiDisplay) {
            if (printSettings && printSettings.showWiFi) {
                qrWifiDisplay.style.display = 'block';
            } else {
                qrWifiDisplay.style.display = 'none';
            }
        }

        // Cập nhật lời chào hiển thị trong QR View
        if (qrGreetingDisplay) {
            const qrGreetingDetail = document.getElementById('qr-greeting-detail');
            if (printSettings && printSettings.showNote) {
                qrGreetingDisplay.style.display = 'block';
                if (qrGreetingDetail) {
                    qrGreetingDetail.innerText = printSettings.footerText || 'Cảm ơn & Hẹn gặp lại!';
                }
            } else {
                qrGreetingDisplay.style.display = 'none';
            }
        }

        // Cập nhật mã QR chuyển khoản ngân hàng
        if (currentPaymentQR) {
            if (billQRImg) { billQRImg.src = currentPaymentQR; billQRImg.style.display = 'block'; }
            if (missingMsg) missingMsg.style.display = 'none';
        } else {
            if (billQRImg) { billQRImg.src = ''; billQRImg.style.display = 'none'; }
            if (missingMsg) missingMsg.style.display = 'block';
        }
    };

    window.viewTableBill = function(id) {
        const order = tableOrders[id]; if (!order) return;
        
        // Reset phương thức thanh toán về "Tiền mặt" nếu đổi sang bàn khác
        const isNewTable = (selectedTableForBill !== id);
        selectedTableForBill = id;
        
        // Mỗi lần mở modal thanh toán của một đơn hàng mới, sinh ra mã random mới (5-6 ký tự)
        currentPaymentOrderId = generateRandomOrderIdShort();
        
        let method = 'cash';
        if (isNewTable) {
            window.showBillDetail();
        } else {
            const qrVisible = document.getElementById('qr-transfer-view')?.style.display === 'block';
            method = qrVisible ? 'transfer' : 'cash';
        }
        
        // Nạp và đồng bộ dữ liệu hóa đơn/chuyển khoản của bàn
        window.updatePaymentModalDetails(id, method);
        
        document.getElementById('modal-overlay').style.display = 'block';
        const sheet = document.getElementById('bill-detail-sheet');
        sheet.style.display = 'block'; setTimeout(() => sheet.classList.add('active'), 10);
    };

    window.openShiftManagement = () => {
        window.switchTab('shift-management-section');
        const m = document.getElementById('update-modal');
        if (m) { m.style.display = 'flex'; setTimeout(() => m.querySelector('.update-popup').style.transform = 'scale(1)', 50); }
        
        // Ẩn thanh Bottom Navigation Menu khi mở modal Quản lý ca
        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) {
            bottomNav.style.display = 'none';
        }
    };

    window.closeUpdateModal = () => {
        const m = document.getElementById('update-modal');
        if (m) { m.querySelector('.update-popup').style.transform = 'scale(0.9)'; setTimeout(() => m.style.display = 'none', 200); }
        
        // Khôi phục thanh Bottom Navigation Menu khi đóng modal Quản lý ca
        const bottomNav = document.querySelector('.bottom-nav');
        if (bottomNav) {
            bottomNav.style.display = 'flex';
        }
    };

    window.closeAllModals = function() {
        document.getElementById('modal-overlay').style.display = 'none';
        document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('active'));
        setTimeout(() => document.querySelectorAll('.bottom-sheet').forEach(s => s.style.display = 'none'), 300);
    };

    function generateRandomOrderIdShort() {
        const chars = '0123456789';
        const length = 5;
        let result = 'ORD';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    function checkDailyReset() {
        const currentDateStr = new Date().toLocaleDateString('vi-VN');
        const lastDate = localStorage.getItem('last_daily_revenue_date');
        
        if (currentDateStr !== lastDate) {
            // Sang ngày mới: đặt lại các giá trị trong localStorage về 0
            localStorage.setItem('daily_revenue', '0');
            localStorage.setItem('daily_order_count', '0');
            localStorage.setItem('last_daily_revenue_date', currentDateStr);
            
            // Cập nhật các biến stats của hệ thống về 0
            stats.totalRevenue = 0;
            stats.totalOrders = 0;
            stats.guestCount = 0;
            stats.cashTotal = 0;
            stats.transferTotal = 0;
            
            // Render lại số liệu hiển thị lên giao diện
            updateDashboardUI();
            console.log("Hệ thống đã reset doanh thu hôm nay về 0 do chuyển sang ngày mới:", currentDateStr);
        }
    }

    function getStoreDetailsFromLocalStorage() {
        let storeInfo = {};
        try {
            const savedInfo = localStorage.getItem('storeInfo') || localStorage.getItem('shopInfo') || localStorage.getItem('store_info') || localStorage.getItem('shop_info');
            if (savedInfo) {
                storeInfo = JSON.parse(savedInfo);
            }
        } catch (e) {
            console.error("Lỗi khi đọc JSON storeInfo từ localStorage:", e);
        }

        const shopName = storeInfo.shopName || storeInfo.storeName || storeInfo.name || 
                         localStorage.getItem('shopName') || localStorage.getItem('storeName') || localStorage.getItem('brandName') || localStorage.getItem('tenCuaHang') || localStorage.getItem('tenQuan') || 
                         'TIỆM GOAT POS';

        const shopAddress = storeInfo.shopAddress || storeInfo.storeAddress || storeInfo.address || 
                            localStorage.getItem('shopAddress') || localStorage.getItem('storeAddress') || localStorage.getItem('address') || localStorage.getItem('diaChi') || 
                            '';

        const shopPhone = storeInfo.shopPhone || storeInfo.storePhone || storeInfo.phone || 
                          localStorage.getItem('shopPhone') || localStorage.getItem('storePhone') || localStorage.getItem('phone') || localStorage.getItem('sdt') || localStorage.getItem('soDienThoai') || 
                          '';

        const wifiName = storeInfo.wifiName || storeInfo.wifi_name || storeInfo.wifiSSID || storeInfo.ssid || 
                         localStorage.getItem('wifiName') || localStorage.getItem('wifi_name') || localStorage.getItem('wifiSSID') || 
                         'GOAT_FREE';
        const wifiPass = storeInfo.wifiPass || storeInfo.wifi_pass || storeInfo.wifiPassword || storeInfo.password || 
                         localStorage.getItem('wifiPass') || localStorage.getItem('wifi_pass') || localStorage.getItem('wifiPassword') || localStorage.getItem('matKhauWifi') || 
                         '88888888';

        const shopGreeting = storeInfo.shopGreeting || storeInfo.storeGreeting || storeInfo.greeting || storeInfo.thanksText || storeInfo.thanks || storeInfo.loiChao ||
                             localStorage.getItem('shopGreeting') || localStorage.getItem('storeGreeting') || localStorage.getItem('greeting') || localStorage.getItem('thanksText') || localStorage.getItem('loiChao') ||
                             'Cảm ơn & Hẹn gặp lại!';

        return { shopName, shopAddress, shopPhone, wifiName, wifiPass, shopGreeting };
    }

    function updateLivePreviewWithStoreDetails() {
        const storeDetails = getStoreDetailsFromLocalStorage();
        
        // Brand Name
        const previewBrand = document.querySelector('#bill-preview-box .bill-brand');
        if (previewBrand) {
            previewBrand.innerText = storeDetails.shopName;
        }
        
        // Address & Phone
        const previewAddress = document.getElementById('bill-print-address');
        if (previewAddress) {
            if (storeDetails.shopAddress) {
                previewAddress.innerText = storeDetails.shopAddress;
                previewAddress.style.display = 'block';
            } else {
                previewAddress.style.display = 'none';
            }
        }
        const previewPhone = document.getElementById('bill-print-phone');
        if (previewPhone) {
            if (storeDetails.shopPhone) {
                previewPhone.innerText = `SĐT: ${storeDetails.shopPhone}`;
                previewPhone.style.display = 'block';
            } else {
                previewPhone.style.display = 'none';
            }
        }

        // WiFi
        const previewWifi = document.querySelector('#bill-preview-box #v-wifi');
        if (previewWifi) {
            previewWifi.innerHTML = `<i class="fa-solid fa-wifi"></i> WiFi: ${storeDetails.wifiName} / MK: ${storeDetails.wifiPass}`;
        }

        // Note / Greeting
        const previewNote = document.querySelector('#bill-preview-box #v-note');
        if (previewNote) {
            previewNote.innerText = storeDetails.shopGreeting;
        }
    }

    function syncPrintSettingsToUI() {
        const fields = ['p-show-logo', 'p-show-qr', 'p-show-wifi', 'p-show-tax', 'p-show-note'];
        fields.forEach(id => {
            let prop = id.replace('p-', '').replace(/-(.)/g, (_, c) => c.toUpperCase());
            if (prop === 'showQr') prop = 'showQR';
            if (prop === 'showWifi') prop = 'showWiFi';
            
            const el = document.getElementById(id);
            if (el) el.checked = !!printSettings[prop];
        });
        if (document.getElementById('p-header')) document.getElementById('p-header').value = printSettings.headerText || '';
        if (document.getElementById('p-footer')) document.getElementById('p-footer').value = printSettings.footerText || '';
        window.selectPaper(printSettings.paperSize || 58);

        // Cập nhật ngay lập tức các lớp ẩn/hiện trên giao diện xem trước hóa đơn
        if (document.getElementById('v-header')) document.getElementById('v-header').innerText = printSettings.headerText || '';
        if (document.getElementById('v-footer')) document.getElementById('v-footer').innerText = printSettings.footerText || '';
        if (document.getElementById('v-logo')) document.getElementById('v-logo').classList.toggle('hidden', !printSettings.showLogo);
        if (document.getElementById('v-qr')) document.getElementById('v-qr').classList.toggle('hidden', !printSettings.showQR);
        if (document.getElementById('v-wifi')) document.getElementById('v-wifi').classList.toggle('hidden', !printSettings.showWiFi);
        if (document.getElementById('v-tax')) document.getElementById('v-tax').classList.toggle('hidden', !printSettings.showTax);
        if (document.getElementById('v-note')) document.getElementById('v-note').classList.toggle('hidden', !printSettings.showNote);

        // Nạp dữ liệu từ localStorage vào các phần tĩnh
        updateLivePreviewWithStoreDetails();
    }

    window.selectPaper = async function(size) {
        printSettings.paperSize = size;
        document.getElementById('paper-58')?.classList.toggle('active', size === 58);
        document.getElementById('paper-80')?.classList.toggle('active', size === 80);
        const bill = document.querySelector('.thermal-bill');
        if (bill) { bill.classList.remove('size-58', 'size-80'); bill.classList.add(`size-${size}`); }
        
        localStorage.setItem('goat_print_settings', JSON.stringify(printSettings));
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
        
        localStorage.setItem('goat_print_settings', JSON.stringify(printSettings));
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

        // Nạp dữ liệu từ localStorage vào các phần tĩnh
        updateLivePreviewWithStoreDetails();
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

    window.handleDeleteQR = async () => {
        if (confirm("⚠️ Bạn có chắc chắn muốn xóa ảnh mã QR Ngân hàng hiện tại?")) {
            try {
                // Xóa trường qrCode khỏi document settings/payment
                await setDoc(doc(db, 'settings', 'payment'), { qrCode: '' });
                
                // Reset input file để có thể chọn lại cùng ảnh
                const uploadInput = document.getElementById('qr-upload');
                if (uploadInput) uploadInput.value = '';
                
                alert("✅ Đã xóa ảnh mã QR thành công!");
            } catch (err) {
                console.error("Lỗi khi xóa ảnh QR:", err);
                alert("❌ Không thể xóa ảnh QR online. Vui lòng kiểm tra lại kết nối!");
            }
        }
    };

    function updateHeaderDate() {
        const el = document.getElementById('header-date');
        if (el) el.innerText = new Date().toLocaleDateString('vi-VN', { day:'numeric', month:'long', year:'numeric' });
    }

    function updateBillDate() {
        const el = document.querySelector('.bill-date');
        if (el) {
            let dateStr = new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
            el.innerText = dateStr.replace(',', ' -');
        }
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
        const role = getUserRole();
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
        grid.innerHTML = Array.from({length:80}, (_,i)=>i+1).map(i => `<button class="select-table-btn ${tableOrders[i]?'occupied':''}" onclick="confirmSelection(${i})">${getTableName(i)}</button>`).join('');
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
    window.showQRTransfer = () => {
        document.getElementById('bill-sheet-content').style.display = 'none';
        document.getElementById('qr-transfer-view').style.display = 'block';
        if (selectedTableForBill) {
            window.updatePaymentModalDetails(selectedTableForBill, 'transfer');
        }
    };
    window.showBillDetail = () => {
        document.getElementById('bill-sheet-content').style.display = 'block';
        document.getElementById('qr-transfer-view').style.display = 'none';
        if (selectedTableForBill) {
            window.updatePaymentModalDetails(selectedTableForBill, 'cash');
        }
    };

    // --- ADD MORE ITEMS LOGIC ---
    window.addMoreItems = function() {
        if (!selectedTableForBill) return;
        targetTableId = selectedTableForBill;
        
        const noticeBar = document.getElementById('pos-notice-bar');
        if (noticeBar) {
            noticeBar.style.display = 'block';
            const nameSpan = document.getElementById('pos-target-table-name');
            if (nameSpan) nameSpan.innerText = getTableName(targetTableId);
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
        
        grid.innerHTML = Array.from({length: 80}, (_, i) => i + 1)
            .map(i => {
                if (i === selectedTableForBill) return ''; // Không tự chuyển sang chính mình
                const occupied = tableOrders[i] !== undefined;
                return `<button class="select-table-btn ${occupied ? 'occupied' : ''}" onclick="confirmMoveTable(${selectedTableForBill}, ${i})">${getTableName(i)}</button>`;
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
                if (confirm(`${getTableName(toTable)} đang có khách. Bạn có gộp ${getTableName(fromTable)} vào ${getTableName(toTable)}?`)) {
                    const fromOrder = tableOrders[fromTable];
                    const toOrder = tableOrders[toTable];
                    
                    const mergedItems = JSON.parse(JSON.stringify(toOrder.items));
                    fromOrder.items.forEach(newItem => {
                        const sameItem = mergedItems.find(i => i.name === newItem.name);
                        if (sameItem) sameItem.qty += newItem.qty;
                        else mergedItems.push(newItem);
                    });
                    
                    const toCheckIn = toOrder.checkInTime || fromOrder.checkInTime || new Date();
                    await setDoc(doc(db, 'tables', `table_${toTable}`), {
                        items: mergedItems,
                        total: toOrder.total + fromOrder.total,
                        updatedAt: new Date(),
                        checkInTime: toCheckIn
                    });
                    
                    await deleteDoc(doc(db, 'tables', `table_${fromTable}`));
                    alert(`Đã gộp ${getTableName(fromTable)} vào ${getTableName(toTable)} trực tuyến!`);
                } else {
                    return;
                }
            } else {
                // Chuyển bàn
                const fromCheckIn = tableOrders[fromTable].checkInTime || new Date();
                await setDoc(doc(db, 'tables', `table_${toTable}`), {
                    items: tableOrders[fromTable].items,
                    total: tableOrders[fromTable].total,
                    updatedAt: new Date(),
                    checkInTime: fromCheckIn
                });
                
                await deleteDoc(doc(db, 'tables', `table_${fromTable}`));
                alert(`Đã chuyển ${getTableName(fromTable)} sang ${getTableName(toTable)} trực tuyến!`);
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
        const role = getUserRole();
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
        // Cập nhật ngày giờ trên hóa đơn xem trước thành thời gian thực trước khi in
        updateBillDate();

        // Đổ dữ liệu store
        updateLivePreviewWithStoreDetails();
        
        // Đặt mã đơn hàng test & số bàn test
        const previewOrderId = document.getElementById('bill-print-order-id');
        if (previewOrderId) previewOrderId.innerText = generateRandomOrderIdShort();

        const previewTableId = document.getElementById('bill-print-table-id');
        if (previewTableId) previewTableId.innerText = 'Bàn Test';

        alert("🖨️ Đang in thử hóa đơn khổ " + printSettings.paperSize + "mm ra máy in...");
        window.print();
    };

    // --- BAR/KITCHEN REALTIME DASHBOARD LOGIC ---
    let barActiveFilter = 'pending';
    
    window.switchBarTab = function(filter) {
        barActiveFilter = filter;
        
        const btnPending = document.getElementById('bar-tab-pending');
        const btnHistory = document.getElementById('bar-tab-history');
        
        if (btnPending) {
            btnPending.classList.toggle('active', filter === 'pending');
            btnPending.style.background = filter === 'pending' ? 'white' : 'transparent';
            btnPending.style.color = filter === 'pending' ? '#0284c7' : '#475569';
        }
        
        if (btnHistory) {
            btnHistory.classList.toggle('active', filter === 'history');
            btnHistory.style.background = filter === 'history' ? 'white' : 'transparent';
            btnHistory.style.color = filter === 'history' ? '#0284c7' : '#475569';
        }
        
        renderBarDashboard();
    };

    window.renderBarDashboard = function() {
        const grid = document.getElementById('bar-grid');
        if (!grid) return;



        let hasAnyItems = false;
        let html = '';
        
        const startOfToday = new Date();
        startOfToday.setHours(0,0,0,0);

        if (barActiveFilter === 'pending') {
            // Sắp xếp các bàn có order theo số bàn tăng dần
            Object.keys(tableOrders).sort((a, b) => parseInt(a) - parseInt(b)).forEach(tableId => {
                const order = tableOrders[tableId];
                if (!order || !order.items) return;
                
                let filteredItems = order.items.filter(it => !it.status || it.status === 'pending' || it.status === 'preparing');
                
                if (filteredItems.length > 0) {
                    hasAnyItems = true;
                    
                    // Tính thời gian trôi qua từ lần cập nhật gần nhất
                    const updateDate = order.updatedAt?.seconds ? new Date(order.updatedAt.seconds * 1000) : new Date();
                    const elapsedMins = Math.round((new Date() - updateDate) / 60000);
                    const timeStr = elapsedMins > 0 ? `${elapsedMins} phút trước` : 'Vừa xong';
                    
                    html += `
                        <div class="bar-order-card">
                            <div class="bar-card-header" style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <span class="bar-table-title">${getTableName(tableId).toUpperCase()}</span>
                                    <button class="bar-action-btn done" onclick="completeAllItemsForTable(${tableId}, this)" style="padding: 3px 6px; font-size: 10px; border-radius: 6px; gap: 3px; display: inline-flex; align-items: center;">
                                        <i class="fa-solid fa-check-double"></i> Xong hết
                                    </button>
                                </div>
                                <span class="bar-time"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                            </div>
                            <div class="bar-items-list">
                                ${filteredItems.map(it => {
                                    const status = it.status || 'pending';
                                    
                                    const orderedAtMs = it.orderedAt?.seconds 
                                        ? it.orderedAt.seconds * 1000 
                                        : (it.orderedAt instanceof Date 
                                            ? it.orderedAt.getTime() 
                                            : (order.updatedAt?.seconds 
                                                ? order.updatedAt.seconds * 1000 
                                                : Date.now()));

                                    return `
                                        <div class="bar-item-row">
                                            <span class="bar-item-name">${it.name}</span>
                                            ${it.note ? `<div class="bar-item-note" style="font-size: 12px; color: #ef4444; font-weight: 600; margin-bottom: 6px;">📝 ${it.note}</div>` : ''}
                                            <div class="bar-item-details" style="gap: 12px;">
                                                <span class="bar-item-qty" style="margin: 0;">SL: ${it.qty}</span>
                                                <span class="bar-item-timer" data-ordered-at="${orderedAtMs}" data-status="${status}">⏳ Đang chờ...</span>
                                                <div style="margin-left: auto; display: flex; align-items: center;">
                                                    <button class="bar-action-btn done" onclick="updateItemBarStatus(${tableId}, '${it.name}', '${(it.note || '').replace(/'/g, "\\'")}', '${status}', 'completed', this)">
                                                        <i class="fa-solid fa-check"></i> Xong
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            });
        } else {
            // Lịch sử xong: Gom tất cả món đã hoàn thành hôm nay (từ cả active tables và orderHistory)
            let completedItemsMap = {};

            // 1. Món đã hoàn thành từ các bàn đang hoạt động
            Object.keys(tableOrders).forEach(tableId => {
                const order = tableOrders[tableId];
                if (!order || !order.items) return;
                
                order.items.forEach(it => {
                    if (it.status === 'completed') {
                        const completedAt = it.completedAt?.seconds 
                            ? new Date(it.completedAt.seconds * 1000) 
                            : (it.completedAt instanceof Date 
                                ? it.completedAt 
                                : (order.updatedAt?.seconds ? new Date(order.updatedAt.seconds * 1000) : new Date()));
                        
                        if (completedAt >= startOfToday) {
                            if (!completedItemsMap[tableId]) {
                                completedItemsMap[tableId] = {
                                    tableName: getTableName(tableId),
                                    maxTimestamp: completedAt,
                                    items: []
                                };
                            }
                            
                            completedItemsMap[tableId].items.push({
                                name: it.name,
                                qty: it.qty,
                                completedAt: completedAt
                            });

                            if (completedAt > completedItemsMap[tableId].maxTimestamp) {
                                completedItemsMap[tableId].maxTimestamp = completedAt;
                            }
                        }
                    }
                });
            });

            // 2. Món đã hoàn thành từ lịch sử thanh toán hôm nay
            orderHistory.forEach(order => {
                const orderDate = order.createdAt?.seconds 
                    ? new Date(order.createdAt.seconds * 1000) 
                    : (order.createdAt instanceof Date ? order.createdAt : new Date());
                
                if (orderDate >= startOfToday && order.items) {
                    const tableId = order.tableId || 999;
                    const tableName = order.tableName || getTableName(tableId);

                    if (!completedItemsMap[tableId]) {
                        completedItemsMap[tableId] = {
                            tableName: tableName,
                            maxTimestamp: orderDate,
                            items: []
                        };
                    }

                    order.items.forEach(it => {
                        completedItemsMap[tableId].items.push({
                            name: it.name,
                            qty: it.qty,
                            completedAt: orderDate
                        });
                    });

                    if (orderDate > completedItemsMap[tableId].maxTimestamp) {
                        completedItemsMap[tableId].maxTimestamp = orderDate;
                    }
                }
            });

            // Sắp xếp các bàn theo thời điểm món làm xong gần nhất nhảy lên đầu
            const sortedTableIds = Object.keys(completedItemsMap).sort((a, b) => {
                return completedItemsMap[b].maxTimestamp - completedItemsMap[a].maxTimestamp;
            });

            sortedTableIds.forEach(tableId => {
                const tableData = completedItemsMap[tableId];
                if (tableData.items.length > 0) {
                    hasAnyItems = true;
                    
                    const timeStr = tableData.maxTimestamp.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
                    
                    html += `
                        <div class="bar-order-card" style="border-left: 4px solid #10b981;">
                            <div class="bar-card-header">
                                <span class="bar-table-title">${tableData.tableName.toUpperCase()}</span>
                                <span class="bar-time" style="color: #10b981;"><i class="fa-solid fa-circle-check"></i> Xong lúc ${timeStr}</span>
                            </div>
                            <div class="bar-items-list">
                                ${tableData.items.map(it => `
                                    <div class="bar-item-row">
                                        <span class="bar-item-name" style="color: #64748b; text-decoration: line-through;">${it.name}</span>
                                        <div class="bar-item-details">
                                            <span class="bar-item-qty" style="margin: 0;">SL: ${it.qty}</span>
                                            <span class="bar-status-badge completed" style="margin: 0;">✅ Xong</span>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }
            });
        }
        
        if (!hasAnyItems) {
            html = `
                <div class="bar-empty-view">
                    <p class="bar-empty-title">Quầy pha chế trống</p>
                    <p class="bar-empty-desc">Không có món nào cần thực hiện lúc này.</p>
                </div>
            `;
        }
        
        grid.innerHTML = html;
    };

    window.updateItemBarStatus = async function(tableId, itemName, itemNote, currentStatus, newStatus, btnElement) {
        // Optimistic UI Update: thay đổi giao diện ngay lập tức để tránh giật hình
        if (btnElement) {
            const itemRow = btnElement.closest('.bar-item-row');
            if (itemRow) {
                itemRow.style.opacity = '0.5';
                itemRow.style.transition = 'opacity 0.2s';
                const timerSpan = itemRow.querySelector('.bar-item-timer');
                if (timerSpan) {
                    timerSpan.innerHTML = '✅ Xong';
                    timerSpan.style.color = '#10b981';
                }
                btnElement.disabled = true;
                btnElement.innerHTML = '<i class="fa-solid fa-check"></i> Đã xong';
            }
        }

        const order = tableOrders[tableId];
        if (!order || !order.items) return;
        
        // Cập nhật trạng thái của món được bấm chọn
        const updatedItems = order.items.map(it => {
            const itStatus = it.status || 'pending';
            if (it.name === itemName && (it.note || '') === itemNote && itStatus === currentStatus) {
                return { 
                    ...it, 
                    status: newStatus,
                    completedAt: newStatus === 'completed' ? new Date() : (it.completedAt || null)
                };
            }
            return it;
        });
        
        try {
            await updateDoc(doc(db, 'tables', `table_${tableId}`), {
                items: updatedItems,
                updatedAt: new Date()
            });
            console.log(`Đã cập nhật Bàn ${tableId} - ${itemName} thành ${newStatus}`);
        } catch (err) {
            console.error("Lỗi khi cập nhật trạng thái pha chế:", err);
            alert("Lỗi kết nối cơ sở dữ liệu online!");
        }
    };

    window.completeAllItemsForTable = async function(tableId, btnElement) {
        // Optimistic UI Update: thay đổi giao diện ngay lập tức để tránh giật hình
        if (btnElement) {
            const card = btnElement.closest('.bar-order-card');
            if (card) {
                card.style.opacity = '0.5';
                card.style.transition = 'opacity 0.2s';
                const timers = card.querySelectorAll('.bar-item-timer');
                timers.forEach(t => {
                    t.innerHTML = '✅ Xong';
                    t.style.color = '#10b981';
                });
                btnElement.disabled = true;
                btnElement.innerHTML = 'Đã xong';
            }
        }

        const order = tableOrders[tableId];
        if (!order || !order.items) return;
        
        // Hoàn thành hàng loạt các món đang chờ/đang làm của riêng bàn này
        const updatedItems = order.items.map(it => {
            const status = it.status || 'pending';
            if (status === 'pending' || status === 'preparing') {
                return { 
                    ...it, 
                    status: 'completed',
                    completedAt: new Date()
                };
            }
            return it;
        });
        
        try {
            await updateDoc(doc(db, 'tables', `table_${tableId}`), {
                items: updatedItems,
                updatedAt: new Date()
            });
            console.log(`Đã hoàn thành toàn bộ món của Bàn ${tableId}`);
        } catch (err) {
            console.error("Lỗi khi hoàn thành toàn bộ món:", err);
            alert("Lỗi kết nối cơ sở dữ liệu online!");
        }
    };



    // --- REPORT MODAL LOGIC ---
    let reportBarChartInstance = null;

    window.openReportModal = function() {
        const modal = document.getElementById('report-modal');
        if (!modal) return;
        
        // Mặc định chọn tháng hiện tại
        const now = new Date();
        const yyyy = now.getFullYear();
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const monthInput = document.getElementById('report-month-select');
        if (monthInput && !monthInput.value) {
            monthInput.value = `${yyyy}-${mm}`;
        }
        
        modal.style.display = 'flex';
        window.updateReportChart();
    };

    window.closeReportModal = function() {
        const modal = document.getElementById('report-modal');
        if (modal) modal.style.display = 'none';
    };

    window.updateReportChart = function() {
        const monthInput = document.getElementById('report-month-select');
        if (!monthInput || !monthInput.value) return;
        
        const [yearStr, monthStr] = monthInput.value.split('-');
        const selectedYear = parseInt(yearStr);
        const selectedMonth = parseInt(monthStr); // 1-indexed (1-12)
        
        // Tính số ngày của tháng được chọn
        const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
        
        // Tạo mảng doanh thu từng ngày và nhãn trục hoành
        const dailyRevenue = Array(daysInMonth).fill(0);
        const labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
        
        // Tính tổng doanh thu theo từng ngày
        orderHistory.forEach(order => {
            if (!order.createdAt) return;
            
            let orderDate;
            if (typeof order.createdAt.toDate === 'function') {
                orderDate = order.createdAt.toDate();
            } else if (order.createdAt instanceof Date) {
                orderDate = order.createdAt;
            } else if (order.createdAt.seconds) {
                orderDate = new Date(order.createdAt.seconds * 1000);
            } else {
                orderDate = new Date(order.createdAt);
            }
            
            if (orderDate.getFullYear() === selectedYear && (orderDate.getMonth() + 1) === selectedMonth) {
                const day = orderDate.getDate(); // 1-indexed (1-31)
                if (day >= 1 && day <= daysInMonth) {
                    dailyRevenue[day - 1] += order.total || 0;
                }
            }
        });
        
        const canvas = document.getElementById('reportBarChart');
        if (!canvas) return;
        
        if (reportBarChartInstance) {
            reportBarChartInstance.destroy();
        }
        
        reportBarChartInstance = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Doanh thu (đ)',
                    data: dailyRevenue,
                    backgroundColor: '#0ea5e9',
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Doanh thu: ${context.parsed.y.toLocaleString()} đ`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: {
                            autoSkip: false,
                            maxRotation: 0,
                            minRotation: 0,
                            font: { family: 'Inter', size: 10, weight: '600' },
                            color: '#64748b'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: {
                            font: { family: 'Inter', size: 9, weight: '600' },
                            color: '#64748b',
                            callback: function(value) {
                                return value >= 1000000 ? (value / 1000000) + 'tr' : (value >= 1000 ? (value / 1000) + 'k' : value);
                            }
                        }
                    }
                }
            }
        });
    };

    // --- IMPORT MENU FROM EXCEL ---
    window.triggerExcelUpload = function() {
        const fileInput = document.getElementById('excel-file-input');
        if (fileInput) {
            fileInput.click();
        }
    };

    window.handleExcelUpload = async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls') && !fileName.endsWith('.csv')) {
            alert("❌ Vui lòng chọn file định dạng .xlsx, .xls hoặc .csv!");
            event.target.value = '';
            return;
        }

        const isCSV = fileName.endsWith('.csv');

        // Reset the file input value so the same file can be uploaded again
        event.target.value = '';

        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                // SheetJS tự động nhận biết định dạng CSV / XLSX khi truyền mảng byte
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Đọc toàn bộ sheet thành mảng 2 chiều (mỗi phần tử là một hàng)
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (!rows || rows.length === 0) {
                    alert("❌ File trống hoặc không đúng định dạng!");
                    return;
                }

                // Tìm dòng tiêu đề chứa chữ "Tên Món" / "Ten Mon"
                let headerRowIndex = -1;
                let nameColIndex = -1;
                let categoryColIndex = -1;
                let priceColIndex = -1;

                for (let r = 0; r < rows.length; r++) {
                    const row = rows[r];
                    if (!row || !Array.isArray(row)) continue;
                    
                    // Tìm xem trong hàng này có cột nào chứa "Tên Món" / "Ten Mon" không
                    const nameIdx = row.findIndex(cell => {
                        if (cell === undefined || cell === null) return false;
                        const cellStr = String(cell).trim().toLowerCase();
                        return cellStr.includes('tên món') || cellStr.includes('ten mon');
                    });

                    if (nameIdx !== -1) {
                        headerRowIndex = r;
                        nameColIndex = nameIdx;
                        
                        // Tìm thêm các cột danh mục và giá tiền trong chính dòng tiêu đề này
                        categoryColIndex = row.findIndex(cell => {
                            if (cell === undefined || cell === null) return false;
                            const cellStr = String(cell).trim().toLowerCase();
                            return cellStr.includes('danh mục') || cellStr.includes('danh muc');
                        });

                        priceColIndex = row.findIndex(cell => {
                            if (cell === undefined || cell === null) return false;
                            const cellStr = String(cell).trim().toLowerCase();
                            return cellStr.includes('giá tiền') || 
                                   cellStr.includes('gia tien') || 
                                   cellStr.includes('giá (vnđ)') || 
                                   cellStr.includes('gia (vnd)') || 
                                   cellStr === 'giá' || 
                                   cellStr === 'gia';
                        });

                        break; // Đã tìm thấy dòng tiêu đề, dừng tìm kiếm
                    }
                }

                if (headerRowIndex === -1 || nameColIndex === -1 || priceColIndex === -1) {
                    alert("❌ Không tìm thấy tiêu đề cột 'Tên Món' hoặc cột 'Giá tiền / Giá (VNĐ)' trong file!");
                    return;
                }

                let addedCount = 0;
                let skippedCount = 0;
                let batch = writeBatch(db);
                let operationCount = 0;

                // Bắt đầu duyệt dữ liệu từ các dòng phía dưới dòng tiêu đề
                for (let i = headerRowIndex + 1; i < rows.length; i++) {
                    const row = rows[i];
                    if (!row || !Array.isArray(row) || row.length === 0) continue;

                    const name = String(row[nameColIndex] || '').trim();
                    
                    // Đặt danh mục: nếu là file CSV thì mặc định là "Menu Aha", còn Excel thì lấy cột Danh mục
                    let category = 'Tất cả';
                    if (isCSV) {
                        category = 'Menu Aha';
                    } else if (categoryColIndex !== -1) {
                        category = String(row[categoryColIndex] || 'Tất cả').trim();
                    }
                    
                    // Đọc giá trị tiền và chuyển đổi sang số nguyên, hỗ trợ làm sạch chuỗi
                    const rawPrice = row[priceColIndex];
                    let price = NaN;
                    if (rawPrice !== undefined && rawPrice !== null) {
                        if (typeof rawPrice === 'number') {
                            price = Math.round(rawPrice);
                        } else {
                            // Loại bỏ dấu chấm, dấu phẩy, khoảng trắng, chữ đ... để parse chính xác "55.000" thành 55000
                            const cleanedPriceStr = String(rawPrice).replace(/[\.,\sđđ]/g, '');
                            price = parseInt(cleanedPriceStr);
                        }
                    }

                    // Bỏ qua nếu thiếu tên món hoặc giá tiền không phải là số hợp lệ
                    if (!name || isNaN(price)) {
                        skippedCount++;
                        continue;
                    }

                    // TUYỆT ĐỐI KHÔNG GHI ĐÈ: kiểm tra xem món ăn đã tồn tại trên database chưa (qua danh sách menuItems hiện tại)
                    const nameLower = name.toLowerCase();
                    const exists = menuItems.some(item => item.name && item.name.trim().toLowerCase() === nameLower);
                    if (exists) {
                        skippedCount++;
                        continue;
                    }

                    // Đưa vào batch setDoc (sử dụng tên món làm ID tài liệu để đồng bộ với hàm addNewItem)
                    const docRef = doc(db, 'menu', name);
                    batch.set(docRef, {
                        name: name,
                        price: price,
                        category: category || 'Tất cả',
                        createdAt: new Date()
                    });

                    addedCount++;
                    operationCount++;

                    // Commit nếu đạt 400 tác vụ (giới hạn của Firestore là 500)
                    if (operationCount >= 400) {
                        await batch.commit();
                        batch = writeBatch(db);
                        operationCount = 0;
                    }
                }

                if (operationCount > 0) {
                    await batch.commit();
                }

                alert(`🎉 Đã nhập thành công ${addedCount} món! (Bỏ qua ${skippedCount} món trùng hoặc thiếu dữ liệu)`);
            } catch (err) {
                console.error("Lỗi khi xử lý file dữ liệu:", err);
                alert("❌ Lỗi khi đọc file hoặc ghi dữ liệu lên hệ thống!");
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // --- KITCHEN NOTIFICATION SOUND & TIMER HELPERS ---
    function playNotificationSound() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            // Ting 1
            const osc1 = ctx.createOscillator();
            const gainNode1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            gainNode1.gain.setValueAtTime(0, ctx.currentTime);
            gainNode1.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.05);
            gainNode1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc1.connect(gainNode1);
            gainNode1.connect(ctx.destination);
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.5);

            // Ting 2
            const osc2 = ctx.createOscillator();
            const gainNode2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.15);
            gainNode2.gain.setValueAtTime(0, ctx.currentTime + 0.15);
            gainNode2.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
            gainNode2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
            osc2.connect(gainNode2);
            gainNode2.connect(ctx.destination);
            osc2.start(ctx.currentTime + 0.15);
            osc2.stop(ctx.currentTime + 0.8);
        } catch (err) {
            console.error("Không thể phát âm thanh thông báo:", err);
        }
    }

    let previousPendingCount = 0;

    function checkNewOrders(currentTablesData) {
        let currentPendingCount = 0;

        Object.keys(currentTablesData).forEach(tableId => {
            const order = currentTablesData[tableId];
            if (!order || !order.items) return;

            order.items.forEach(it => {
                const status = it.status || 'pending';
                if (status === 'pending' || status === 'preparing') {
                    currentPendingCount++;
                }
            });
        });

        // Lần đầu tải trang chỉ đồng bộ bộ nhớ chứ không kêu chuông
        if (isFirstLoad) {
            previousPendingCount = currentPendingCount;
            isFirstLoad = false;
            return;
        }

        if (currentPendingCount > previousPendingCount) {
            console.log("🔔 Phát hiện món mới được gọi thêm! Đang phát âm thanh báo bếp...");
            playNotificationSound();
        }

        previousPendingCount = currentPendingCount;
    }

    // Thiết lập bộ đếm thời gian chế biến chạy giây/phút liên tục không giật lắc/flicker
    setInterval(() => {
        const timers = document.querySelectorAll('.bar-item-timer');
        const now = Date.now();
        timers.forEach(timer => {
            const status = timer.getAttribute('data-status');
            if (status === 'completed') {
                timer.style.display = 'none';
                return;
            }

            const orderedAt = parseInt(timer.getAttribute('data-ordered-at'));
            if (isNaN(orderedAt) || orderedAt === 0) return;

            const elapsedSecs = Math.floor((now - orderedAt) / 1000);
            if (elapsedSecs < 0) return;

            const mins = Math.floor(elapsedSecs / 60);
            const secs = elapsedSecs % 60;
            const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

            timer.innerText = `⏳ Làm: ${timeStr}`;

            // Cảnh báo đổi màu:
            if (elapsedSecs >= 600) { // Quá 10 phút -> ĐỎ nổi bật
                timer.style.color = '#ef4444';
                timer.style.background = '#fee2e2';
                timer.style.fontWeight = '700';
            } else if (elapsedSecs >= 300) { // Quá 5 phút -> CAM cảnh báo
                timer.style.color = '#f97316';
                timer.style.background = '#ffedd5';
                timer.style.fontWeight = '600';
            } else { // Bình thường -> XÁM tinh tế
                timer.style.color = '#64748b';
                timer.style.background = '#f1f5f9';
                timer.style.fontWeight = '500';
            }
        });
    }, 1000);
    // --- FOCUS MODE (Countdown) ---
    const EXAM_START_DATE = new Date("2026-06-11T07:30:00").getTime();
    const EXAM_END_DATE = new Date("2026-06-13T17:00:00").getTime();
    const focusCountdownContainer = document.getElementById('focus-countdown-container');
    const focusTitleText = document.getElementById('focus-title-text');
    const focusTimerText = document.getElementById('focus-timer-text');
    const focusSloganText = document.getElementById('focus-slogan-text');
    const focusSuccessMsg = document.getElementById('focus-success-msg');
    const loginFormDiv = document.querySelector('.login-form');
    const roleSelectorDiv = document.querySelector('.role-selector');

    const focusQuotes = [
        "CÁ CHÉP HÓA RỒNG - TẬP TRUNG ÔN THI, KHÔNG SỬA CODE!",
        "12 NĂM ĐÈN SÁCH - QUYẾT TÂM ĐẬU NGUYỆN VỌNG 1!",
        "BÚT SA GÀ CHẾT - HỌC ĐI CHỜ CHI, TẮT APP ĐI HỌC BÀI!",
        "ĐỪNG ĐỂ BAO CÔNG SỨC ĐỔ SÔNG ĐỔ BIỂN - CHIẾN ĐẤU VÌ TƯƠNG LAI!",
        "BÊN TRONG APP CŨNG KHÔNG CÓ PHAO ĐÂU - ĐI HỌC ĐI BẠN ƠI!",
        "HÔM NAY CHẢY MỒ HÔI TRÊN TRANG SÁCH, NGÀY MAI MỈM CƯỜI TRƯỚC GIẤY BÁO TRÚNG TUYỂN!",
        "KHÔNG CÓ ÁP LỰC, KHÔNG CÓ KIM CƯƠNG - CỐ LÊN!",
        "BÂY GIỜ HOẶC KHÔNG BAO GIỜ - HỌC NGAY ĐI!",
        "ĐẠI HỌC KHÔNG PHẢI LÀ CON ĐƯỜNG DUY NHẤT NHƯNG LÀ CON ĐƯỜNG NGẮN NHẤT!",
        "HÃY ĐỂ SỰ CHĂM CHỈ CỦA BẠN LÊN TIẾNG - BỎ ĐIỆN THOẠI XUỐNG!"
    ];

    const bgThemes = ['theme-stars', 'theme-clouds', 'theme-nebula', 'theme-aurora'];

    function initFocusModeStars() {
        const overlay = document.getElementById('login-overlay');
        if (!overlay || overlay.querySelector('.clouds-bg')) return;
        
        const clouds = document.createElement('div');
        clouds.className = 'clouds-bg';
        overlay.insertBefore(clouds, overlay.firstChild);
        
        for (let i = 0; i < 40; i++) {
            const star = document.createElement('div');
            star.className = 'star';
            star.style.width = Math.random() * 3 + 1 + 'px';
            star.style.height = star.style.width;
            star.style.top = Math.random() * 100 + '%';
            star.style.left = Math.random() * 200 + 'vw';
            star.style.setProperty('--twinkle-dur', (Math.random() * 2 + 1) + 's');
            star.style.setProperty('--drift-dur', (Math.random() * 50 + 50) + 's');
            overlay.insertBefore(star, overlay.firstChild);
        }
    }

    function updateFocusMode() {
        const now = Date.now();
        const loginOverlay = document.getElementById('login-overlay');

        if (now < EXAM_START_DATE) {
            const diff = EXAM_START_DATE - now;
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const secs = Math.floor((diff % (1000 * 60)) / 1000);

            const blockIndex = Math.floor(now / (30 * 60 * 1000));
            const quoteIndex = blockIndex % focusQuotes.length;
            const themeIndex = blockIndex % bgThemes.length;

            if (focusTitleText) focusTitleText.innerText = 'KÌ THI THPTQG 2026';
            if (focusTimerText) focusTimerText.innerText = `CÒN ${days} NGÀY ${hours} GIỜ ${mins} PHÚT ${secs} GIÂY LÀ BƯỚC VÀO PHÒNG THI!`;
            if (focusSloganText) focusSloganText.innerText = focusQuotes[quoteIndex];

            if (focusCountdownContainer) focusCountdownContainer.style.display = 'flex';
            if (focusSuccessMsg) focusSuccessMsg.style.display = 'none';
            if (loginFormDiv) loginFormDiv.style.display = 'none';
            if (roleSelectorDiv) roleSelectorDiv.style.display = 'none';
            
            if (loginOverlay) {
                bgThemes.forEach(t => loginOverlay.classList.remove(t));
                loginOverlay.classList.add('focus-active', bgThemes[themeIndex]);
                initFocusModeStars();
            }
        } else if (now >= EXAM_START_DATE && now < EXAM_END_DATE) {
            const blockIndex = Math.floor(now / (30 * 60 * 1000));
            const themeIndex = blockIndex % bgThemes.length;

            if (focusTitleText) focusTitleText.innerText = 'KÌ THI THPTQG 2026';
            if (focusTimerText) focusTimerText.innerText = 'KÌ THI THPTQG 2026 ĐANG DIỄN RA!';
            if (focusSloganText) focusSloganText.innerText = 'BÌNH TĨNH - TỰ TIN - CHIẾN THẮNG! HỆ THỐNG SẼ MỞ KHÓA VÀO LÚC 17H LÀM ĐỒ ĂN MỪNG!';

            if (focusCountdownContainer) focusCountdownContainer.style.display = 'flex';
            if (focusSuccessMsg) focusSuccessMsg.style.display = 'none';
            if (loginFormDiv) loginFormDiv.style.display = 'none';
            if (roleSelectorDiv) roleSelectorDiv.style.display = 'none';
            
            if (loginOverlay) {
                bgThemes.forEach(t => loginOverlay.classList.remove(t));
                loginOverlay.classList.add('focus-active', bgThemes[themeIndex]);
                initFocusModeStars();
            }
        } else {
            if (focusCountdownContainer) focusCountdownContainer.style.display = 'none';
            if (focusSuccessMsg) focusSuccessMsg.style.display = 'block';
            if (loginFormDiv) loginFormDiv.style.display = 'flex';
            if (roleSelectorDiv) roleSelectorDiv.style.display = 'grid';
            
            if (loginOverlay) {
                loginOverlay.classList.remove('focus-active');
                bgThemes.forEach(t => loginOverlay.classList.remove(t));
                const extras = loginOverlay.querySelectorAll('.star, .clouds-bg');
                extras.forEach(el => el.remove());
            }
        }
    }

    updateFocusMode();
    setInterval(updateFocusMode, 1000);

    // Khởi chạy ứng dụng
    window.initApp();
});
