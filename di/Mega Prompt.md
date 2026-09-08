# MISSION & ROLE
Bạn là một Chuyên gia Full-stack Web Developer & UI/UX Designer cấp cao. Nhiệm vụ của bạn là xây dựng hoàn chỉnh một ứng dụng Client-side Web App mang tên **"Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật"** hoạt động 100% trên trình duyệt (in-browser, zero-backend, zero-installation), cho phép người dùng nạp file Word (.docx), HTML hoặc Text, tự động parse mục lục phân cấp, tự động liên kết chéo (cross-reference) sâu đến từng Điều/Khoản và tra cứu siêu tốc.

---

## 1. TECH STACK YÊU CẦU
- **Core:** HTML5, Modern Vanilla TypeScript / JavaScript (hoặc React/Tailwind loaded qua ESM / Vite standalone bundle).
- **Storage:** LocalStorage (Cài đặt, Bookmarks, Ghi chú) + IndexedDB qua thư viện `idb` hoặc `Dexie.js` (Lưu trữ toàn bộ cấu trúc Cây văn bản, Nodes, File gốc).
- **File Parsing In-browser:** `mammoth.js` (xử lý .docx sang HTML/Text) hoặc custom DOMParser (cho file .html).
- **Full-Text Search:** `FlexSearch.js` hoặc `Fuse.js` tích hợp in-memory index trên IndexedDB để tra cứu tức thì qua phím tắt `Ctrl + K`.
- **Styling:** Tailwind CSS (Dark Mode mặc định, hỗ trợ Light Mode toggle), Lucide Icons.

---

## 2. KIẾN TRÚC GIAO DIỆN (3-COLUMN MASTER-DETAIL LAYOUT)

### Header toàn cục:
- Logo & Tên ứng dụng: Cân công lý + "THƯ VIỆN VBPL — QUẢN LÝ DỰ ÁN & KỸ THUẬT".
- Global Search Bar (`Ctrl + K`): Tìm kiếm tức thời theo số hiệu, trích yếu hoặc nội dung từng Điều/Khoản.
- Quick Actions: Quản lý danh mục, Thống kê, Xuất dữ liệu (JSON backup), Nạp văn bản (+), Tăng/Giảm cỡ chữ (A-/A+), Toggle Dark/Light theme.

### Cột 1: Cây Danh mục Lĩnh vực (Sidebar Trái - 260px)
- Hộp lọc nhanh lĩnh vực.
- Danh mục khởi tạo sẵn (Pre-seeded Categories) kèm Badge đếm số lượng văn bản:
  1. Luật - Bộ Luật
  2. Nghị định Chính phủ
  3. Thông tư các Bộ
  4. Văn bản Bộ / Địa phương
  5. QCVN - Quy chuẩn kỹ thuật
  6. TCVN - Tiêu chuẩn quốc gia
  7. Định mức - Đơn giá XD
  8. An toàn - Môi trường
  9. Phòng cháy chữa cháy (PCCC)
  10. Quản lý Dự án & Đấu thầu
- Nút cố định ở đáy: "Tra cứu toàn thư viện".

### Cột 2: Danh sách Văn bản & Mục lục Chi tiết (320px)
- Tab chuyển đổi: [Văn bản] | [Kết quả tìm kiếm] | [Đánh dấu] | [Gần đây].
- Bộ lọc: Theo Loại văn bản & Hiệu lực (Còn hiệu lực, Hết hiệu lực, Có sửa đổi).
- Thẻ văn bản: Hiển thị Số hiệu (ví dụ `90/2025/QH15`), tag trạng thái (`có SĐ`, `hết hiệu lực`), trích yếu ngắn.
- **Khi Click chọn 1 văn bản:** Tự động mở rộng Cây mục lục phân cấp ngay bên dưới thẻ đó:
  - Căn cứ ban hành - Lời mở đầu
  - Chương / Mục (nếu có)
  - Điều (Ví dụ: `Điều 1`, `Điều 29b`...) -> Click để cuộn tới Điều tương ứng ở Cột 3.

### Cột 3: Không gian Đọc & Ma trận Liên kết Pháp lý (Vùng chính)
- **Header Văn bản:** Số hiệu lớn, Tên/Trích yếu đầy đủ, Cơ quan ban hành, Ngày ban hành, Ngày hiệu lực, Tổng số điều, Tổng số khoản/điểm.
- **Legal Callout Banners (Hộp ngữ cảnh thông minh):**
  - Banner Xanh dương (Sửa đổi): *"Điều này sửa đổi [SỐ_HIỆU] — mọi dẫn chiếu bên dưới đều trỏ về văn bản gốc đó"* + nút `Mở bản gốc`.
  - Banner Xanh lá (Quy định chi tiết): *"Điều này quy định chi tiết cho [SỐ_HIỆU]..."* + nút `Mở văn bản cấp trên`.
  - Matrix Đối chiếu: Danh sách các văn bản bị tác động; nếu văn bản đó chưa có trong IndexedDB, gắn tag `CHƯA CÓ` kèm nút `Nạp vào để đối chiếu`.
- **Nội dung Văn bản:**
  - Định dạng rõ ràng theo cấp: Điều -> Khoản -> Điểm.
  - Tích hợp ô **"Ghi chú riêng (Bấm để viết)"** dưới mỗi Điều/Khoản để lưu lại rủi ro, kinh nghiệm áp dụng thực tế (Lưu trực tiếp vào LocalStorage/IndexedDB).
  - Các cụm tham chiếu như `Khoản 1 Điều 2`, `Điểm c Khoản 2 Điều 7`, `Luật số 48/2024/QH15` được tự động chuyển thành **Hyperlink nội tuyến (Inline Deep Link)**. Khi click: Mở popover xem nhanh nội dung hoặc nhảy trực tiếp đến điều/văn bản đó.

---

## 3. ENGINE PARSER & AUTO-LINKING RULES (CLIENT-SIDE REGEX)

### A. Quy tắc nhận diện cấu trúc để bóc tách cây DOM:
- **Căn cứ:** `/^Căn cứ\s+(.*?)[\;\,]?$/gim`
- **Chương/Mục:** `/^(CHƯƠNG|MỤC)\s+([IVXLCDM\d]+)[\.\:\-\s]*(.*)$/gim`
- **Điều:** `/^Điều\s+(\d+[a-z]?)[\.\:\-\s]*(.*)$/gim`
- **Khoản:** `/^(\d+)\.\s+(.*)$/gm`
- **Điểm:** `/^([a-zđ])\)\s+(.*)$/gm`

### B. Quy tắc nhận diện Dẫn chiếu chéo (Cross-Reference Regex):
- **Số hiệu văn bản:** `/\b(\d+[\/\-]\d{4}[\/\-](?:QH\d+|NĐ-CP|TT-[A-Z]+|QĐ-[A-Z]+|UBND))\b/gi`
- **Điều/Khoản/Điểm:** `/(?:(Điểm\s+[a-zđ])\s+)?(?:(khoản\s+\d+)\s+)?(Điều\s+\d+[a-z]?)(?:\s+(?:của\s+)?(Luật|Nghị định|Thông tư)\s+([^,;\n\.]+))?/gi`
- **Xử lý Link:** Tự động convert các đoạn match thành `<a class="legal-ref" data-target-doc="..." data-article="..." data-clause="..." data-point="...">MatchText</a>`.

---

## 4. QUẢN LÝ DỮ LIỆU & EMPTY STATE (ON-DEMAND INGESTION)
- **Khởi động lần đầu (First Load):** Cơ sở dữ liệu IndexedDB trống rỗng, chỉ nạp sẵn 10 Category định danh.
- **Empty State Screen:** Màn hình chào đón với Icon Cân công lý + Hướng dẫn nạp file Word (.docx) hoặc HTML.
- **Luồng nạp tài liệu (Ingestion Pipeline):**
  1. Người dùng bấm `+ Nạp văn bản` -> Chọn file .docx / .html.
  2. Engine Parser chạy in-browser -> Quét metadata (Số hiệu, Ngày, Loại VB) -> Tách cây Nodes -> Bóc link liên kết.
  3. Modal hiển thị bản Review cấu trúc mục lục được dựng tự động -> Cho phép gán nhanh vào 1 hoặc nhiều Danh mục Lĩnh vực.
  4. Bấm "Lưu vào Thư viện" -> Cập nhật IndexedDB -> Tự động kích hoạt lại các liên kết `CHƯA CÓ` đang chờ nếu trùng khớp số hiệu.
- **Backup & Restore:** Cho phép Export toàn bộ thư viện ra 1 file `.json` duy nhất và Import ngược lại trên bất kỳ máy tính/trình duyệt nào.

---

## 5. YÊU CẦU ĐẦU RA (OUTPUT DELIVERABLE)
Hãy viết mã nguồn hoàn chỉnh, sạch, có comment chi tiết, chia module rõ ràng:
1. `index.html`: Cấu trúc khung giao diện 3 cột, modals nạp file, global search dialog.
2. `schema.ts / db.ts`: Cấu hình IndexedDB (Tables: `categories`, `documents`, `document_nodes`, `legal_relations`, `notes_bookmarks`).
3. `parser.ts`: Logic bóc tách file Word/HTML thành cấu trúc phân cấp và engine gắn link tham chiếu Regex.
4. `app.ts / main.js`: Điều khiển trạng thái UI, tìm kiếm tức thì, render cây mục lục, Dark mode, Bookmark, Export/Import JSON.

### BỔ SUNG YÊU CẦU: TÍCH HỢP AI COPILOT / LEGAL CHATBOT
Hãy bổ sung thêm tính năng AI Chatbot vào ứng dụng với các yêu cầu sau:

1. **Giao diện Chat Drawer / Slide-over (Góc phải màn hình):**
   - Nút nổi (Floating Action Button) hình AI Sparkles/Bot ở góc phải dưới để bật/tắt Drawer chat.
   - Hộp thoại tin nhắn hiển thị dạng Markdown, hỗ trợ bôi đậm, bảng biểu và đặc biệt là tự động gắn link vào các trích dẫn (ví dụ: click vào "[Điều 12, NĐ 252]" sẽ tự cuộn màn hình chính tới đúng Điều đó).

2. **Cấu hình Model & Endpoint linh hoạt (Settings Modal):**
   - Cho phép người dùng chọn Provider: 
     + OpenAI / Gemini API (Người dùng tự nhập API Key, lưu tại LocalStorage).
     + Local Ollama / Custom Endpoint (URL: `http://localhost:11434/v1`).
   - Chọn Model (ví dụ: `gemini-1.5-flash`, `gpt-4o-mini`, `qwen2.5:7b`...).

3. **Cơ chế Client-Side RAG (Retrieval-Augmented Generation):**
   - Khi người dùng đặt câu hỏi, sử dụng `FlexSearch` tìm kiếm top 3-5 `document_nodes` liên quan nhất trong IndexedDB.
   - Ghép các node này làm Context vào System Prompt để gửi đến LLM, ép LLM trả lời kèm dẫn chứng chính xác theo dữ liệu đã nạp trong thư viện.

Lập kế hoạch chi tiết
Sinh toàn bộ mã nguồn để tôi có thể chạy ngay lập tức trên trình duyệt!