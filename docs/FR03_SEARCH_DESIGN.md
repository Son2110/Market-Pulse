# MP-06 — bàn giao trang tra cứu doanh nghiệp

## Phạm vi và tham chiếu Stitch

Thiết kế Stitch đã được chọn trước triển khai: project `16706610509511522903` — **MarketPulse VN — Local Demo**; design system `assets/18357777504117637773`; screen `bd99c42d60924767b44172b6cf7b0d25`. Worker đã xem ảnh và HTML của screen được tải cục bộ; HTML là tham khảo bố cục, không phải source ứng dụng hay chỉ dẫn thực thi. Thiết kế giữ nền ấm `#F5F5F0`, panel trắng, viền mảnh, màu chữ `#172923` và màu xanh `#176B52`, typography tiếng Việt dùng font hệ thống để không cần tải font ngoài.

Chỉ triển khai một trang root: header MarketPulse VN/Bản demo, hero tra cứu, form có label, ba ví dụ tìm kiếm, kết quả và panel tham khảo doanh nghiệp. Bố cục hai cột chuyển thành một cột dưới 850px; dưới 520px nút submit xếp dưới input. Bỏ navigation giả, icon tài khoản/theme, mô tả ngành tự suy ra, ISIN, thông tin xác minh pháp lý, copyright 2024 và các link pháp lý trong HTML sinh tự động.

Không có `/stocks/:symbol`, giá, chart, watchlist hay trang auth. MP-07 vẫn sở hữu trang chi tiết/chart và việc mở trang đó từ search; tiêu chí navigation của MP-06/FR-03 còn chờ. Không tuyên bố FR-03 hoàn tất theo mô tả gốc.

## Hành vi và dữ liệu

Web gọi `GET /api/assets/search?q=...` qua proxy cùng origin, không chứa kết quả hardcode hoặc delay giả. Giữ nguyên tên và thứ tự API; ví dụ `vin` → VHM, VIC, VNM. Nút chọn kết quả có `aria-pressed`; panel cùng trang có mã, sàn, VND, múi giờ Việt Nam (UTC+7), ngày rà soát nguồn DD/MM/YYYY và link nguồn HTTPS với `noopener noreferrer`. Metadata demo được diễn đạt cho người đọc; ngày rà soát không được dùng như market as-of. Trang gắn nhãn “Dữ liệu minh họa — không phải dữ liệu thị trường”, độ mới chưa xác định và chưa có thời điểm quan sát thị trường, cùng disclaimer không phải lời khuyên đầu tư.

State thực gồm initial, loading, results, empty, error/retry. Input vẫn dùng được khi loading. Query tối đa 100 Unicode codepoint trước normalization; blank và dấu kết hợp rỗng được báo lỗi. Request có timeout 10 giây, abort khi submit mới/unmount và số thứ tự request để chặn response cũ. Query đã submit được dùng trong caption thay vì draft đang sửa; selected company cũ được xóa khi request mới, lỗi hoặc empty. Guard runtime từ chối response sai shape/metadata, tài sản ngoài contract, ngày sai hoặc source URL không an toàn trước render. Không dùng HTML từ response.

## Kiểm tra và bằng chứng

Client unit tests kiểm tra giới hạn Unicode, response contract/nguồn HTTPS, thứ tự/name giữ nguyên, URL encoding, no-store, lỗi HTTP/JSON/network, timeout và caller abort. Dùng runner Node/tsx sẵn có, không thêm package hoặc framework trình duyệt. Application CI có smoke HTTP qua port web để xác nhận proxy cùng origin và thứ tự `vin`.

Kiểm tra local đạt: lint, typecheck, 55 unit tests (47 API và 8 client, 0 skip), build, docs check (37 đích link local) và docs build (12 tài liệu nguồn). Coordinator đã kiểm tra bằng Edge cài sẵn qua Playwright runtime ngoài project: desktop 1440px và responsive 768/390/320px không có overflow ngang; đã xem ảnh desktop kết quả, mobile 390px và desktop lỗi. Initial, kết quả thực `vin` đúng thứ tự, chọn VIC, draft chưa submit không đổi caption, skip-link bàn phím, query không biết/combining-mark rỗng, loading, lỗi 503 và retry sang VCB, metadata sai và request FPT chậm bị Vietcombank thay thế đều đạt; không có pageerror. Loading/503/metadata sai/race được dựng bằng chặn response trong QA, không phải hành vi delay của ứng dụng. Coordinator đã xác nhận lại metadata dễ đọc và chạy `docker compose up --build --detach --wait web` thành công, service web healthy. Browser thực tại port 5173 tìm Hòa Phát trả HPG với tên công ty chính xác, hai link nguồn chính thức, múi giờ Việt Nam (UTC+7), ngày 29/09/2026; mobile 390px không overflow. HTTP qua proxy port 5173 tìm Vietcombank trả 200/VCB. Review độc lập của coordinator không phát hiện blocker. Đây là QA tạm thời, không phải E2E framework được commit. Chưa tuyên bố GitHub Actions trên nhánh này đạt, hay có deployment/provider live.
