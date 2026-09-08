# 🏛️ Thư viện Văn bản Quy phạm Pháp luật & Tiêu chuẩn Kỹ thuật (Client-Side Web App + AI Copilot)

Ứng dụng web chuyên nghiệp hoạt động **100% trên trình duyệt** (Zero-backend, Zero-installation, Offline-first) phục vụ quản lý dự án xây dựng, đấu thầu, kỹ thuật và tra cứu quy chuẩn pháp luật Việt Nam. Toàn bộ dữ liệu lưu trữ cục bộ qua **IndexedDB (Dexie.js)** và **LocalStorage** – không gửi dữ liệu người dùng về bất kỳ máy chủ nào.

---

## ✨ Các tính năng nổi bật

### 1. Kiến trúc Giao diện Master-Detail 3 Cột Hiện đại
- **Cột 1 (Sidebar - 260px):** 10 Danh mục Lĩnh vực khởi tạo sẵn kèm Badge đếm số lượng văn bản động.
- **Cột 2 (320px):** Danh sách Văn bản phân loại theo Trạng thái (Còn hiệu lực, Có SĐ/BS, Hết hiệu lực) & Loại VB (Luật, Nghị định, Thông tư, QCVN, TCVN). Khi click vào một văn bản, **cây mục lục phân cấp (Chương / Mục / Điều)** tự động mở rộng bên dưới.
- **Cột 3 (Không gian Đọc):** Hiển thị văn bản chất lượng cao, Hộp ngữ cảnh thông minh (Legal Callout Banners), Ma trận đối chiếu văn bản liên quan và ô Ghi chú riêng cho từng Điều.

### 2. Engine Phân tích & Tự động Liên kết Chéo (Auto-Linking Regex)
- **Nạp trực tiếp in-browser:** Đọc file Word (`.docx`) qua `mammoth.js`, file HTML hoặc Plain Text (`.txt`).
- **Bóc tách phân cấp:** Tự động trích xuất Căn cứ ban hành, Chương, Mục, Điều, Khoản, Điểm.
- **Dẫn chiếu chéo thông minh:** Tự động phát hiện các cụm dẫn chiếu (ví dụ: `Khoản 2 Điều 107 của Luật số 50/2014/QH13`, `Điều 15/2021/NĐ-CP`) và chuyển đổi thành **Hyperlink tương tác (Deep Links)**. Click để cuộn tới Điều hoặc chuyển sang văn bản đích.

### 3. Tra cứu Toàn thư viện Siêu tốc (`Ctrl + K`)
- Modal tra cứu tức thời theo số hiệu, trích yếu hoặc nội dung chi tiết từng Điều/Khoản.
- Phím tắt tiện lợi `Ctrl + K` hoặc `Cmd + K`, hỗ trợ phím `ESC` để đóng nhanh.

### 4. Trợ lý AI Pháp lý & Kỹ thuật (Legal Copilot - Client-Side RAG)
- **Drawer Slide-over bên phải:** Bật/tắt nhanh qua Floating Action Button góc phải dưới.
- **Cơ chế Client-Side RAG:** Tự động tìm kiếm top 3-5 Điều/Khoản liên quan nhất từ cơ sở dữ liệu IndexedDB nạp làm Context cho AI.
- **Dẫn chứng chính xác:** AI phản hồi kèm trích dẫn Điều/Khoản có thể click để cuộn trực tiếp màn hình đến vị trí tương ứng.
- **Đa Provider linh hoạt (BYOK):**
  - Google Gemini API (Khuyến nghị, model `gemini-1.5-flash`).
  - OpenAI API (`gpt-4o-mini`, `gpt-4o`).
  - Local Ollama / Custom OpenAI-compatible endpoint (`http://localhost:11434/v1` với model `qwen2.5:7b`...).

### 5. Quản lý Dữ liệu & An toàn Bảo mật
- Toàn bộ dữ liệu lưu trữ trên **IndexedDB** (`Dexie.js`) và **LocalStorage** của trình duyệt máy người dùng. Không gửi dữ liệu lên server trung gian.
- **Sao lưu & Khôi phục (Backup & Restore):** Xuất toàn bộ cơ sở dữ liệu thư viện ra 1 file `.json` duy nhất và khôi phục lại bất kỳ lúc nào.
- Hỗ trợ đổi giao diện Dark / Light Mode và tăng/giảm cỡ chữ (A- / A+).

---

## ⚙️ Cấu hình AI Copilot (BYOK – Bring Your Own Key)

> **An toàn tuyệt đối:** API Key của bạn được lưu **trực tiếp trong LocalStorage** của trình duyệt cá nhân, **không bao giờ** gửi về máy chủ trung gian hay chia sẻ với bất kỳ bên thứ ba nào.

1. Bấm vào biểu tượng **Bánh răng (Cài đặt)** trên thanh Header (góc trên cùng bên phải).
2. Trong mục **Nhà cung cấp AI (Provider)**, chọn một trong các tùy chọn:

| Nhà cung cấp | Mô tả | Lấy API Key |
|---|---|---|
| **Google Gemini** | Miễn phí/Chi phí thấp, khuyến nghị cho người dùng mới | [Google AI Studio](https://aistudio.google.com/) |
| **OpenAI** | Chất lượng cao, GPT-4o mini / GPT-4o | [OpenAI Platform](https://platform.openai.com/api-keys) |
| **Ollama / Custom Endpoint** | Chạy Local hoặc tự host OpenAI-compatible API | [Ollama Official](https://ollama.com/) |

3. Dán **API Key cá nhân** vào trường tương ứng:
   - Với **Gemini:** Dán key dạng `AIzaSy...` → Model mặc định: `gemini-1.5-flash`
   - Với **OpenAI:** Dán key dạng `sk-...` → Model mặc định: `gpt-4o-mini`
   - Với **Ollama/Custom:** Nhập Endpoint URL (ví dụ: `http://localhost:11434/v1`) và Tên Model (ví dụ: `qwen2.5:7b`)
4. Bấm **Lưu cấu hình** → Xong. Bây giờ bạn có thể mở AI Copilot bằng Floating Button ✨ góc phải dưới.

---

## 🚀 Hướng dẫn Chạy ứng dụng

Ứng dụng hoàn toàn là **Static Client-side**, bạn có thể chạy bằng các cách sau:

### Cách 1: Triển khai lên GitHub Pages (Khuyến nghị)

Khi push mã nguồn lên GitHub, **GitHub Actions** sẽ tự động build và deploy ứng dụng:

1. Tạo repository trên GitHub và push mã nguồn lên.
2. Vào **Settings → Pages** của repository.
3. Trong **Source**, chọn **GitHub Actions**.
4. Push code lên nhánh `main` → Workflow `.github/workflows/deploy.yml` tự động chạy.
5. Hoàn tất! Truy cập: `https://<username>.github.io/<repo-name>/`

### Cách 2: Tự triển khai lên Cloudflare Pages

1. Đăng ký Cloudflare Pages → Kết nối với GitHub repository.
2. Build command: `npm install && npx tailwindcss -i ./css/input.css -o ./css/style.min.css --minify`
3. Output directory: `/` (root)
4. Deploy xong → Truy cập `https://<project>.pages.dev`

### Cách 3: Chạy Local trên máy tính (không cần cài đặt)

Mở **Terminal / Command Prompt** tại thư mục gốc dự án và chạy:

```bash
# Cách A: Sử dụng Node.js npx (khuyến nghị)
npx serve .

# Cách B: Sử dụng Python 3.x build-in server
python -m http.server 8000
```

Sau đó mở trình duyệt và truy cập:
- Với npx serve: `http://localhost:3000`
- Với Python: `http://localhost:8000`

---

## 📦 Cấu trúc Thư mục Dự án

```
.
├── index.html                    # Trang chính, giao diện 3 cột
├── css/
│   ├── input.css                 # Tailwind input (@tailwind directives)
│   ├── styles.css                # Custom styles (scrollbar, legal typography, TOC, ref links)
│   └── style.min.css             # Tailwind đã biên dịch + nén (auto-generated)
├── js/
│   ├── app.js                    # Main Controller & UI State Manager
│   ├── db.js                     # IndexedDB / Dexie.js (LegalDB)
│   ├── parser.js                 # Parser .docx/.html/.txt → TOC tree + Nodes
│   ├── search.js                 # Inverted index + Full-text search (LegalSearch)
│   └── ai.js                     # AI Copilot Logic (Multi-provider RAG)
├── data/
│   ├── preloaded_data.js         # Kho dữ liệu 160+ VB (nạp qua window.PRELOADED_DATA)
│   ├── preloaded_data.json       # Backup dữ liệu full (fetch fallback)
│   └── ...                       # Các thư mục nguồn (.docx/.md/.pdf)
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions auto deploy Pages
├── tailwind.config.js            # Tailwind CSS config (brand colors, darkMode)
├── package.json                  # Dependencies & build scripts
└── README.md                     # Tài liệu này
```

---

## 🛠️ Build Local (Để regenerate style.min.css)

```bash
# Cài dependencies (chỉ cần 1 lần)
npm install

# Biên dịch Tailwind CSS ra css/style.min.css (đã nén minify)
npm run build
```

---

## 🔒 Bảo mật & Quyền riêng tư

- **Zero Server:** Không có backend, không có cơ sở dữ liệu tập trung.
- **BYOK AI:** API Key người dùng chỉ tồn tại trên trình duyệt của chính họ.
- **Client-side Only:** Toàn bộ logic (parser, tìm kiếm, AI request) chạy hoàn toàn phía máy người dùng.
- **Export/Import JSON:** Người dùng hoàn toàn sở hữu dữ liệu của mình – có thể sao lưu và di chuyển bất kỳ lúc nào.
