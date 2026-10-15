# Khảo sát và so sánh ba nguồn dữ liệu vàng Việt Nam — PNJ, SJC, DOJI

**Ngày khảo sát:** 15/10/2026<br>
**Trạng thái kiểm tra:** Hoàn thành khảo sát nghiên cứu P1.1 trong phạm vi khảo sát công khai (chưa xác minh pháp lý của nguồn; cổng live source chưa mở)<br>
**Phạm vi:** Khảo sát và so sánh ba ứng viên niêm yết vàng Việt Nam (PNJ, SJC, DOJI) cho hai sản phẩm mục tiêu: vàng miếng SJC và nhẫn trơn 9999 theo [PRD](PRD.md), [ROADMAP](ROADMAP.md) và [Thiết kế P1](GOLD_DATA_DESIGN_P1.md). Tài liệu này cung cấp căn cứ kỹ thuật và pháp lý để chọn nguồn ưu tiên, phục vụ thiết kế contract và fixture P1.2; không xem trang web công khai là nguồn đã được cấp phép tự động thu thập hoặc phân phối lại.

---

## 1. Phương thức và phạm vi khảo sát

### 1.1. Danh mục ứng viên và tài nguyên khảo sát
Khảo sát được thực hiện trên ba nhà niêm yết lớn có mạng lưới phân phối và bảng giá công khai tại Việt Nam:
1. **PNJ (Công ty Cổ phần Vàng bạc Đá quý Phú Nhuận):**
   - Nguồn chính: `https://www.pnj.com.vn/blog/gia-vang/` (WordPress blog tĩnh)
   - Nguồn phụ trợ: `https://www.pnj.com.vn/robots.txt`, `https://giavang.pnj.com.vn/` (React SPA có Cloudflare Challenge), `https://www.pnj.com.vn/chinh-sach-bao-hanh-va-thu-doi.html`.
2. **SJC (Công ty TNHH MTV Vàng bạc Đá quý Sài Gòn — SJC):**
   - Nguồn chính: `https://sjc.com.vn/` (Trang chủ và dịch vụ giá vàng)
   - Nguồn phụ trợ: `https://sjc.com.vn/robots.txt`, `https://sjc.com.vn/GoldPrice/Services/PriceService.ashx` (dịch vụ dữ liệu backend), `https://sjc.com.vn/bieu-do-gia-vang`, `https://sjc.com.vn/chinh-sach-bao-mat-thong-tin`.
3. **DOJI (Tập đoàn Vàng bạc Đá quý DOJI):**
   - Nguồn chính: `https://doji.vn/` và `https://banggia.doji.vn/` (Angular SPA chuyên trang bảng giá)
   - Nguồn phụ trợ: `https://doji.vn/robots.txt`, `https://banggia.doji.vn/robots.txt`, `https://banggia.doji.vn/env.json`, `https://banggia.doji.vn/api/TablePrice/GetTablePrice`.

### 1.2. Phương thức kiểm tra thực nghiệm
- **HTTP Client Inspection:** Gửi request HTTP GET/POST trực tiếp có bounded timeout (15 giây), ghi nhận status code, header, content-type, payload bytes và cấu trúc dữ liệu thô.
- **Headless Browser Inspection:** Thực thi trên Playwright Chromium headless (`@playwright/test` 1.64.0) cho các chuyên trang SPA phức tạp để kiểm tra DOM sau render, sự kiện networkidle, console errors và network XHR/Fetch calls.
- **Tuân thủ giới hạn an toàn:** Không vượt CAPTCHA/Cloudflare Challenge, không đăng nhập/đăng ký tài khoản, không khai thác lỗ hổng bảo mật, không tạo scheduler/polling lặp lại trên hạ tầng nhà cung cấp.

### 1.3. Nguyên tắc suy luận và ranh giới bằng chứng
Tuân thủ nghiêm ngặt các nguyên tắc suy luận độc lập:
- Việc trang web mở công khai hoặc `robots.txt` không cấm đường dẫn **không cấu thành** giấy phép tự động thu thập (crawling/scraping) hay quyền tái phân phối dữ liệu.
- Phản hồi mã lỗi `HTTP 400 Bad Request` hoặc `HTTP 403 Forbidden` trên một request đơn lẻ chỉ phản ánh kết quả của probe cụ thể đó; **không chứng minh** toàn bộ nguồn không có API hoặc cấm vĩnh viễn truy cập.
- Ngược lại, việc một endpoint AJAX/JSON nội bộ trả về `HTTP 200` **chỉ chứng minh tính khả thi kỹ thuật** trong phiên kiểm tra đơn lẻ; **hoàn toàn không chứng minh quyền pháp lý** được phép khai thác tự động hay thương mại.
- Sự hiện diện của hàm JavaScript (như `get_prices_30_day`) hoặc nút chọn dropdown **không chứng minh** tính khả dụng thực tế của dữ liệu lịch sử hoặc tính gắn kết khu vực nếu không có dữ liệu thực tế tương ứng.
- Chưa tìm thấy tài liệu API mở công khai trong phạm vi khảo sát **không đồng nghĩa** với việc nhà cung cấp hoàn toàn không có hạ tầng API đối tác thương mại.

---

## 2. Kết quả quan sát chi tiết từng nguồn

### 2.1. Ứng viên 1 — PNJ (Phú Nhuận Jewelry)

#### A. Sản phẩm và giá quan sát được
- Tại `https://www.pnj.com.vn/blog/gia-vang/` (ngày kiểm tra 15/10/2026), quan sát được bảng HTML chứa:
  - **Vàng miếng SJC:** Tên `Vàng miếng SJC 999.9`, mua vào `14,030`, bán ra `14,330`. Độ tinh khiết 999.9. Nhà niêm yết: PNJ; Thương hiệu: SJC.
  - **Nhẫn trơn 9999:** Tên `Nhẫn Trơn PNJ 999.9`, mua vào `13,980`, bán ra `14,280`. Độ tinh khiết 999.9. Nhà niêm yết: PNJ; Thương hiệu: PNJ.
- **Đơn vị và dấu phân cách:** Tiêu đề ghi rõ `ĐVT: 1.000đ/Chỉ`. Dấu phẩy `,` là dấu phân cách hàng nghìn.
  - Giá mua SJC: 14.030 × 1.000 = 14.030.000 VND/chỉ (= 140.300.000 VND/lượng).
  - Giá bán SJC: 14.330 × 1.000 = 14.330.000 VND/chỉ (= 143.300.000 VND/lượng).
  - Giá mua Nhẫn: 13.980 × 1.000 = 13.980.000 VND/chỉ (= 139.800.000 VND/lượng).
  - Giá bán Nhẫn: 14.280 × 1.000 = 14.280.000 VND/chỉ (= 142.800.000 VND/lượng).
  - Quy đổi khối lượng chuẩn: 1 chỉ = 3,75 gam = 0,1 lượng (1 lượng = 10 chỉ = 37,5 gam). Theo [NIST Precious Metals Conversion Information](https://www.nist.gov/system/files/documents/2017/05/09/Precious-Metals-Conversion-Information-march2015.pdf), 1 troy ounce = 31,1034768 gam (1 troy oz ≈ 8,29426 chỉ; 1 chỉ ≈ 0,120565 troy oz).

#### B. Timestamp, khu vực và runtime JavaScript
- **Timestamp nguồn (`sourceAsOf`):** Thẻ `<h2>Cập nhật ngày: <span id="time-now"></span></h2>` hoàn toàn rỗng trong snapshot tĩnh và **vẫn rỗng trong DOM** sau khi chạy Chromium headless với JavaScript đầy đủ. Script client `default.js` không gọi hàm cập nhật giờ trong `ready()`, đồng thời biến `window.ajaxurl` là `UNDEFINED`, khiến việc gọi hàm ném lỗi `ReferenceError: ajaxurl is not defined`. Do đó, `sourceAsOf` là **rỗng / không xác định (`null`)**.
- **Khu vực áp dụng (`region`):** Dropdown có 6 tùy chọn (`00` Hồ Chí Minh, `07` Cần Thơ, `11` Hà Nội, `13` Đà Nẵng, `14` Tây Nguyên, `21` Đông Nam Bộ). Khi chọn Hà Nội (`zone=11`), form submit reload trang nhưng bảng giá HTML giữ nguyên số liệu y hệt mặc định. Mối liên kết khu vực là **chưa xác minh (`unverified`)**; dữ liệu thật phải đặt `region: null`.

#### C. API, lịch sử và hạ tầng
- **Probe endpoint AJAX:**
  - GET `admin-ajax.php?action=get_prices_lasttime` trả về `HTTP 400 Bad Request`.
  - POST `admin-ajax.php` kèm `action=get_prices_30_day&code_gold=vang-pnj` trả về `HTTP 200` với payload JSON: `{"msg":"success","data":{"labelsFull":[],"labels":[],"buy":[],"sell":[]}}` (các mảng rỗng, không chứa dữ liệu lịch sử thực tế).
  - DOM không chứa thẻ `#myChart`.
- **Chuyên trang SPA:** `https://giavang.pnj.com.vn/` tích hợp Cloudflare Challenge Platform, không thể truy cập programmatic nếu không vượt qua rào cản.
- **Kết luận API/Lịch sử:** Chưa xác minh được API mở hay lịch sử upstream khả dụng trong phạm vi khảo sát công khai.

---

### 2.2. Ứng viên 2 — SJC (Saigon Jewelry Company)

#### A. Sản phẩm và giá quan sát được
- Tại `https://sjc.com.vn/` và dịch vụ backend `https://sjc.com.vn/GoldPrice/Services/PriceService.ashx` (ngày kiểm tra 15/10/2026, lúc 09:10:50 UTC, tương ứng 16:10 giờ Hà Nội), quan sát được cấu trúc JSON chính thức:
  - Header: `latestDate: "13:50 15/10/2026"`, `success: true`.
  - **Vàng miếng SJC:** Tên `Vàng SJC 1L, 10L, 1KG`, chi nhánh `Hồ Chí Minh`: Buy `"140,300"`, `BuyValue: 140300000.0`, Sell `"143,300"`, `SellValue: 143300000.0`.
  - **Nhẫn trơn SJC:** Tên `Vàng nhẫn SJC 99,99% 1 chỉ, 2 chỉ, 5 chỉ`, chi nhánh `Hồ Chí Minh`: Buy `"139,800"`, `BuyValue: 139800000.0`, Sell `"142,800"`, `SellValue: 142800000.0`. Ngoài ra có phân loại `0.5 chỉ, 0.3 chỉ` (Sell: 142.900).
  - Nhà niêm yết: SJC; Thương hiệu: SJC (cho cả vàng miếng và nhẫn). Độ tinh khiết: 99,99%.
- **Đơn vị tính và số học:**
  - Bảng HTML trên trang chủ ghi chú: `ĐVT: ngàn đồng/ lượng`.
  - Trong JSON backend: Trường string `Buy: "140,300"` thể hiện theo nghìn VND/lượng (140.300 nghìn = 140.300.000 VND/lượng), và trường số `BuyValue: 140300000.0` ghi nhận trực tiếp giá trị số tuyệt đối tính bằng **VND/lượng**.

#### B. Timestamp và khu vực
- **Timestamp nguồn (`sourceAsOf`):** Khác biệt rõ rệt so với PNJ, SJC cung cấp trường `latestDate: "13:50 15/10/2026"` trong payload JSON và hiển thị trên giao diện web. Múi giờ ngầm định là `Asia/Ho_Chi_Minh` (UTC+7).
- **Khu vực áp dụng (`region`):** Danh mục dữ liệu backend phân tách rõ 12 chi nhánh/khu vực: `Hồ Chí Minh`, `Hà Nội / Miền Bắc`, `Đà Nẵng / Miền Trung`, `Nha Trang`, `Huế`, `Quảng Ngãi`, `Biên Hòa`, `Miền Tây`, `Hạ Long`, `Hải Phòng`, `Cà Mau`, `Bạc Liêu`.
  - Giá vàng miếng SJC 1L-10L đồng nhất 140.300 / 143.300 tại thời điểm khảo sát trên toàn hệ thống chi nhánh, nhưng cấu trúc dữ liệu thể hiện rõ ràng `BranchName`, cho phép gán nhãn khu vực có căn cứ hơn PNJ.

#### C. Phương thức truy cập và chính sách bản quyền / AI
- **Phương thức kỹ thuật:** Endpoint `POST /GoldPrice/Services/PriceService.ashx` (với tham số form `method=GetCurrentGoldPrice`) trả về JSON trực tiếp mà không bị chặn bởi WAF challenge ở mức request thông thường.
- **Chính sách `robots.txt` (`https://sjc.com.vn/robots.txt`):**
  - Khác với hầu hết website thông thường, SJC có tuyên bố chính sách nội dung đặc biệt:
    ```text
    Content-Signal: search=yes,ai-input=no,ai-train=no
    ```
  - Chặn tường minh danh sách dài các bot AI/scraping: `GPTBot`, `ClaudeBot`, `anthropic-ai`, `Claude-Web`, `ChatGPT-User`, `CCBot`, `Bytespider`, `Applebot-Extended`, `Google-Extended`, `PerplexityBot`, `YouBot`, `Amazonbot` (Disallow: /).
  - Riêng đường dẫn `Allow: /GoldPrice/` và `Allow: /xml/tygiavang.xml` được cho phép cho search engine thông thường, nhưng file `/xml/tygiavang.xml` khi truy cập thực tế trả về mã lỗi `HTTP 404 Not Found`.

---

### 2.3. Ứng viên 3 — DOJI (Tập đoàn Vàng bạc Đá quý DOJI)

#### A. Sản phẩm và giá quan sát được
- Tại chuyên trang bảng giá `https://banggia.doji.vn/` (ngày kiểm tra 15/10/2026, 16:12 UTC+7, kiểm tra bằng Playwright Chromium headless):
  - **Vàng miếng SJC:** Tên `VÀNG MIẾNG SJC`, mua vào `14,030`, bán ra `14,330`.
  - **Nhẫn trơn 9999:** Tên `NHẪN TRÒN 9999 HƯNG THỊNH VƯỢNG`, mua vào `13,900`, bán ra `14,300` (kèm dòng sản phẩm `KIM TT/AVPL` cùng mức giá).
  - Nhà niêm yết: DOJI; Thương hiệu: SJC (cho vàng miếng) và DOJI (cho nhẫn Hưng Thịnh Vượng).
- **Đơn vị tính:** Giao diện ghi rõ `Đơn vị: Nghìn VND/chỉ` cho bảng giá vàng.
  - Vàng miếng SJC: 14.030 nghìn VND/chỉ = 140.300.000 VND/lượng.
  - Nhẫn tròn DOJI 9999: Mua 13.900 nghìn VND/chỉ (= 139.000.000 VND/lượng), Bán 14.300 nghìn VND/chỉ (= 143.000.000 VND/lượng). Chênh lệch mua/bán (spread) của nhẫn DOJI là 400.000 VND/chỉ, rộng hơn mức 300.000 VND/chỉ của PNJ và SJC.

#### B. Timestamp và khu vực
- **Timestamp nguồn (`sourceAsOf`):** Bảng giá DOJI hiển thị rõ thời điểm: `Cập nhật 16:12 ngày 15/10/2026`. Múi giờ nghiệp vụ: `Asia/Ho_Chi_Minh`.
- **Khu vực áp dụng (`region`):** Giao diện bảng giá chính hiển thị biểu giá chung của Tập đoàn; không có dropdown lựa chọn khu vực riêng lẻ trên view mặc định. Mối liên kết khu vực chi tiết chưa được xác minh trong phạm vi khảo sát.

#### C. Hạ tầng kỹ thuật và mã hóa dữ liệu
- Chuyên trang `https://banggia.doji.vn/` là ứng dụng Angular SPA hiện đại:
  - File cấu hình `https://banggia.doji.vn/env.json` công khai: `{"API_BASE_URL": "/api", "hangfireUrl": "/hangfire", "signalrUrl":"/api/Hub/Notification"}`.
  - Gọi API nội bộ: `GET /api/TablePrice/GetTablePrice` và `GET /api/TablePrice/GetChart/gold_day`.
  - **Đặc điểm mã hóa (Encryption):** Payload trả về từ các API này được mã hóa Base64/Ciphertext (ví dụ: `{"status":true,"data":"qm2Wsv2ruobt2lxqtenqA1BCFh3m4bwL9TINA0UCxIGV6+..."}`), sau đó client JavaScript giải mã trong bộ nhớ để render lên bảng DOM.
  - Domain chính `https://doji.vn/robots.txt` trả về `HTTP 403 Forbidden`; trong khi `https://banggia.doji.vn/robots.txt` trả về mã 200 nhưng nội dung là HTML fallback của ứng dụng SPA.

---

## 3. Bảng so sánh tổng hợp ba nguồn dữ liệu vàng

Bảng đối chiếu kỹ thuật và pháp lý giữa 3 ứng viên dựa trên bằng chứng thu thập thực tế ngày 15/10/2026:

| Tiêu chí khảo sát | Ứng viên 1: PNJ | Ứng viên 2: SJC | Ứng viên 3: DOJI |
|---|---|---|---|
| **Sản phẩm 1 (Vàng miếng SJC)** | `Vàng miếng SJC 999.9`<br>Mua 14.030 / Bán 14.330 | `Vàng SJC 1L, 10L, 1KG`<br>Mua 140.300 / Bán 143.300 | `VÀNG MIẾNG SJC`<br>Mua 14.030 / Bán 14.330 |
| **Sản phẩm 2 (Nhẫn trơn 9999)** | `Nhẫn Trơn PNJ 999.9`<br>Mua 13.980 / Bán 14.280 | `Vàng nhẫn SJC 99,99%`<br>Mua 139.800 / Bán 142.800 | `NHẪN TRÒN 9999 HƯNG THỊNH VƯỢNG`<br>Mua 13.900 / Bán 14.300 |
| **Provider & Brand định danh** | Provider: PNJ<br>Brand: SJC & PNJ | Provider: SJC<br>Brand: SJC (cho cả 2) | Provider: DOJI<br>Brand: SJC & DOJI |
| **Đơn vị niêm yết gốc** | `1.000đ/Chỉ` | `ngàn đồng/lượng` (trên web) & `VND/lượng` (trong JSON) | `Nghìn VND/chỉ` |
| **Dấu phân cách số học** | Dấu phẩy `,` (thousands separator) | Dấu phẩy `,` (thousands separator) | Dấu phẩy `,` (thousands separator) |
| **Timestamp nguồn (`sourceAsOf`)** | **Không có** (thẻ `#time-now` rỗng cả ở static lẫn JS runtime) | **Có** (`latestDate: "13:50 15/10/2026"` trong JSON backend) | **Có** (`Cập nhật 16:12 ngày 15/10/2026` trên giao diện) |
| **Tính gắn kết khu vực (`region`)** | `unverified` (chọn zone=11 giá không đổi so với mặc định) | `observed` (phân tách rõ 12 `BranchName` trong payload) | `unverified` (bảng giá tổng hợp toàn quốc, chưa rõ phân vùng) |
| **Kênh truy cập kỹ thuật** | HTML tĩnh qua WordPress blog | POST JSON endpoint (`PriceService.ashx`) | Angular SPA (API trả payload mã hóa ciphertext) |
| **Rào chắn WAF / Bot** | SPA có Cloudflare Challenge; blog không chặn HTTP GET | Cloudflare thông thường, endpoint POST hoạt động | `robots.txt` chính bị 403; API payload mã hóa |
| **Dữ liệu lịch sử upstream** | Chưa xác minh (POST `get_prices_30_day` trả mảng rỗng) | Endpoint `GetGoldPriceHistory` tồn tại trong JS nhưng chưa xác minh | Endpoint `/GetChart/gold_day` trả ciphertext |
| **Chính sách bản quyền / AI** | Không công bố open license; chính sách tập trung e-commerce | `robots.txt` cấm rõ `ai-input=no,ai-train=no` và chặn 12 AI bot | Không công bố open license; bản quyền thuộc DOJI |

---

## 4. Ma trận quyền sử dụng dữ liệu chi tiết (Data Rights Matrix)

Phân định rạch ròi giữa **trạng thái pháp lý từ phía nguồn** (upstream legal status) và **quyết định kỹ thuật / phòng ngừa rủi ro của dự án** (project technical guardrail):

| Mục đích sử dụng | PNJ (Nguồn / Dự án) | SJC (Nguồn / Dự án) | DOJI (Nguồn / Dự án) | Căn cứ kiểm tra (15/10/2026) |
|---|---|---|---|---|
| **1. Truy cập tự động (Automated Read)** | `unknown` / **Tạm chặn collector** | `unknown` / **Tạm chặn collector** | `unknown` / **Tạm chặn collector** | Cả ba nguồn đều không có văn bản cấp phép khai thác tự động qua máy. Riêng SJC chặn rõ ràng các bot crawling tự động trong `robots.txt`. |
| **2. Lưu trữ cục bộ (Local Storage)** | `unknown` / **Tạm chặn lưu dữ liệu thật dài hạn** | `unknown` / **Tạm chặn lưu dữ liệu thật dài hạn** | `unknown` / **Tạm chặn lưu dữ liệu thật dài hạn** | Không có nguồn nào công bố giấy phép dữ liệu mở (Creative Commons, Open Data). Dự án chỉ lưu synthetic fixture cho kiểm thử. |
| **3. Hiển thị cục bộ (Local Display)** | `unknown` / **Ưu tiên hiển thị fixture có nhãn** | `unknown` / **Ưu tiên hiển thị fixture có nhãn** | `unknown` / **Ưu tiên hiển thị fixture có nhãn** | Môi trường localhost không tự động có quyền sử dụng. Mẫu khảo sát nếu hiển thị phải có nhãn nguồn và cảnh báo quyền chưa xác minh. |
| **4. Hiển thị công khai (Public Redisplay)** | `unknown` / **Project Blocked (Tuyệt đối cấm)** | `unknown` / **Project Blocked (Tuyệt đối cấm)** | `unknown` / **Project Blocked (Tuyệt đối cấm)** | Xuất bản bảng giá thật ra public internet khi chưa có hợp đồng cấp phép tiềm ẩn rủi ro xâm phạm quyền tác giả và quyền sở hữu thương hiệu. |
| **5. Thu thập lịch sử (Backfill)** | `unknown` / **Project Blocked** | `unknown` / **Project Blocked** | `unknown` / **Project Blocked** | Chưa xác minh được kho lịch sử công khai hợp pháp từ bất kỳ nguồn nào. Dự án không giả định có dữ liệu backfill quá khứ. |
| **6. Huấn luyện mô hình (AI/ML Training)** | `unknown` / **Project Blocked** | `disallowed` / **Project Blocked** | `unknown` / **Project Blocked** | SJC cấm rõ ràng trong `robots.txt` (`ai-train=no`). PNJ và DOJI không có điều khoản cho phép; dự án chủ động chặn sử dụng cho training. |

---

## 5. Đánh giá và Đề xuất Lựa chọn Nguồn cho Phase P1

### 5.1. Kết luận nghiệm thu cổng dữ liệu thật
- **Kết luận chung:** **Chưa có nguồn nào vượt qua cổng dữ liệu thật (Live Source Gate NOT VERIFIED)** để đưa vào vận hành tự động trong môi trường production. Toàn bộ các quyền khai thác thương mại, public redisplay và training đều ở trạng thái `unknown` hoặc `disallowed`.
- **Ranh giới thực hiện:** Giai đoạn P1 chỉ phát triển đường ống kỹ thuật (contract, storage, queue, worker, projection, API đọc) dựa trên **dữ liệu mẫu tổng hợp (synthetic fixture)**. Tuyệt đối không bật collector tự động thu thập từ bất kỳ nguồn nào khi chưa có thỏa thuận chính thức.

### 5.2. Đề xuất thứ tự ưu tiên khi chuẩn bị adapter kỹ thuật
Nếu sau này dự án tiến hành đàm phán hợp đồng cấp phép hoặc mở cổng dữ liệu thật, thứ tự ưu tiên dựa trên tính khả thi kỹ thuật quan sát được như sau:
1. **Nguồn ưu tiên nghiên cứu số 1: SJC**
   - *Lý do:* Là đơn vị phát hành trực tiếp thương hiệu vàng miếng SJC chuẩn quốc gia. Cung cấp cả vàng miếng SJC và vàng nhẫn SJC 99,99%. Dữ liệu kỹ thuật có cấu trúc JSON rõ ràng, có timestamp công bố chính thức (`latestDate`), và phân tách cụ thể 12 chi nhánh khu vực.
   - *Rào cản cần gỡ:* Thỏa thuận bằng văn bản với SJC về quyền khai thác dữ liệu; gỡ bỏ rào cản cấm AI/training nếu dự án muốn sử dụng dữ liệu cho mục đích nghiên cứu dự báo.
2. **Nguồn dự phòng nghiên cứu số 2: PNJ**
   - *Lý do:* Cung cấp đủ 2 sản phẩm (Vàng miếng SJC niêm yết tại PNJ và Nhẫn trơn PNJ 999.9). Dữ liệu HTML tĩnh dễ phân tích cho mục đích nghiên cứu thử nghiệm nội bộ.
   - *Rào cản lớn:* Thiếu timestamp nguồn tĩnh (`sourceAsOf: null`); chưa xác minh được sự phân tách giá theo khu vực; endpoint AJAX không trả dữ liệu lịch sử khả dụng.
3. **Nguồn xếp sau cùng: DOJI**
   - *Lý do:* Mặc dù có đủ sản phẩm và timestamp, nhưng hạ tầng API nội bộ mã hóa dữ liệu ciphertext trong bộ nhớ frontend. Việc giải mã kỹ thuật mà không có tài liệu chính thức tiềm ẩn rủi ro phá vỡ tính ổn định (brittle) và vi phạm ranh giới phát triển của dự án.

---

## 6. Kết luận Nghiên cứu P1.1

1. Khảo sát nghiên cứu P1.1 hoàn tất trong phạm vi khảo sát công khai; không tuyên bố đã xác minh pháp lý của nguồn và cổng live source chưa mở.
2. Cả ba nguồn đều xác nhận sự tồn tại của 2 dòng sản phẩm riêng biệt với biểu giá mua/bán rõ ràng và quy tắc dấu phân cách thống nhất.
3. Cung cấp đầy đủ căn cứ thực nghiệm để hoàn thiện **[Tài liệu Thiết kế Kỹ thuật Tổng hợp P1](GOLD_DATA_DESIGN_P1.md)** (bao gồm Contract P1.2, Storage/Collector P1.3, Read API P1.4 và Kế hoạch Implementation).
