# MP-07 — bàn giao trang chi tiết cổ phiếu

## Phạm vi và tham chiếu Stitch

Thiết kế đã chọn trước triển khai: project `16706610509511522903` — **MarketPulse VN — Local Demo**; design system `assets/18357777504117637773`; screen `45d9188f44ef4f9e8b289e73c14a8b64` — **MarketPulse VN - Chi tiết mã FPT**. Ảnh và HTML tham khảo đã được xem cục bộ; HTML sinh tự động chỉ dùng làm tham khảo bố cục. Trang giữ nền ấm, panel trắng, viền mảnh, chữ tối và xanh rừng cùng font hệ thống như [trang search](FR03_SEARCH_DESIGN.md). Bỏ các footer link giả và copyright sinh tự động.

Một trang `/stocks/:symbol` gồm liên kết quay lại search, nhãn demo, định danh mã/sàn, giá đóng cửa mới nhất, OHLCV, thay đổi so với quan sát có sẵn trước đó, biểu đồ đường giá đóng cửa, bảng dữ liệu ngày và panel nguồn. Liên kết từ doanh nghiệp đã chọn trên search giữ query đã submit; quay lại tái hiện query, còn reload/direct link đọc lại API. Điều hướng dùng link và tải trang thông thường; không thêm thư viện router/chart hoặc package mới. Symbol viết thường được chuẩn hóa. Mã không biết, route sai và `VNINDEX` ngoài phạm vi được báo rõ.

Chỉ là lát cắt FR-04/MP-07 trên fixture: không có intraday, candlestick, chart khối lượng, bộ chọn timeframe, chỉ báo, fundamentals/ngành tự suy ra, tin tức/sự kiện, watchlist, live provider hoặc deployment. Tiêu chí mở detail từ search trong lát cắt FR-03 đã có; không tuyên bố toàn bộ FR-03 hay FR-04 gốc hoàn tất. API, schema và fixture giữ nguyên.

## Hành vi và dữ liệu

History gọi `GET /api/assets/:symbol/history` qua proxy cùng origin, không có tham số range/timeframe giả. Lookup company reference là request độc lập qua search API; nếu lỗi, lịch sử hợp lệ vẫn hiển thị với tên chung theo mã. Response guard từ chối sai asset/equity/symbol, tiền tệ/đơn vị, provenance fixture, OHLCV, timestamp, thứ tự/ngày trùng, metadata và cơ sở điều chỉnh trộn lẫn. Không render HTML từ response. Request có `no-store`, timeout 10 giây, abort khi unmount/retry và chặn kết quả cũ.

Fixture `marketpulse-fixture` chỉ có ba ngày 21–23/09/2026. FPT đóng cửa 102.500 VND ngày 23/09, tăng 1.500 VND (+1,49%) so với quan sát 22/09 có sẵn trước đó. Câu chữ không khẳng định đây là phiên giao dịch liền trước vì lịch phiên chưa xác minh. Một điểm không có baseline; thay đổi bằng 0 giữ 0%; không có dữ liệu thì không có giá/chart/as-of. Biểu đồ đặt ngày theo khoảng cách lịch thực, giữ tất cả marker và ngắt đoạn khi hai ngày cách nhau hơn một ngày lịch; không bù/nội suy ngày thiếu, kể cả khoảng cuối tuần chưa xác minh.

Nguồn, nhãn `SYNTHETIC FIXTURE — NOT MARKET DATA`, `fixture / unknown`, as-of, VND, khối lượng cổ phiếu, múi giờ Việt Nam (UTC+7), cơ sở điều chỉnh, phạm vi sẵn có và thời điểm nạp fixture được ghi rõ. Ngày rà soát công ty và nguồn HTTPS vẫn là thông tin tham khảo, không phải market as-of hoặc xác nhận đăng ký hiện tại. Nhãn “không phải giá hiện tại” và disclaimer nghiên cứu/không phải lời khuyên đầu tư luôn hiện diện.

State gồm loading, dữ liệu hợp lệ, no-data, unknown/invalid và lỗi có retry. Layout hai cột chuyển thành một cột ở màn hình hẹp; OHLCV chuyển thành hai cột, bảng cuộn trong vùng riêng. Biểu đồ đo chiều rộng bằng `ResizeObserver` và đồng bộ SVG viewBox để text giữ kích thước đọc được; mobile chỉ giảm số label, vẫn giữ mọi điểm. Skip-link, heading, live status/alert, mô tả biểu đồ, caption bảng và vùng cuộn có thể focus hỗ trợ bàn phím.

## Kiểm tra và bằng chứng

Unit tests kiểm tra route/decode, contract history và metadata lỗi, ngày/timestamp, baseline/return âm và 0, empty/single/flat, khoảng cách ngày và đoạn ngắt, hình học chart 246px, HTTP/JSON/network/timeout/caller abort. Dùng runner Node/tsx hiện có. Application CI thêm kiểm tra HTTP direct route và history proxy; HTTP smoke không phải kiểm tra React render.

Checks cuối local đạt: `npm run lint`, `npm run typecheck`, `npm run test:unit` (65 tests: 47 API, 8 search client, 10 detail client; 0 fail/skip), `npm run build`, `python scripts/check_docs.py` (43 đích local tồn tại) và `python scripts/build_docs.py` (13 tài liệu nguồn). `git diff --check` đạt. Hash SHA-256 tài liệu yêu cầu gốc vẫn là `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`.

Coordinator đã kiểm tra độc lập bằng Edge với API thực tại Vite port 5174: `vin` → chọn VIC → detail → reload → quay lại query `vin`; direct FPT viết thường, mã không biết, `VNINDEX` và route không hợp lệ; FPT đúng giá/thay đổi, OHLCV, ba điểm và ba dòng. Không có pageerror. Qua response chặn tạm trong QA, đã thử loading chậm, 503/retry, network failure, no-data/as-of null, một điểm thiếu baseline, 0%, gap không nối, mixed adjustment basis bị từ chối và reference 503 không che lịch sử. Đây là QA tạm thời, không phải E2E framework được commit. Vite chặn một số URL encoding sai trước React; decoder được unit test riêng.

Responsive 1440/768/390/320px không overflow ngang; bảng cuộn nội bộ, skip-link bàn phím hoạt động. Sau sửa text chart mobile, đã kiểm tra SVG rộng thực 678,55/654/316/246px, cao 285px, font label 12px và ba marker còn đủ; ảnh 320px đã được review. Docker web build và Compose đưa cả bốn service tới healthy. Smoke cuối qua port Docker 5173 đạt readiness 200, direct `/stocks/FPT` HTML 200, history 200/`no-store`/ba candle/as-of `2026-09-23T15:00:00+07:00`. Edge 390px tại Docker chạy search FPT → detail, đúng 102.500/+1.500 (+1,49%), ba điểm, không overflow ngang và reload thành công.

GitHub Actions trên nhánh này chưa được xác nhận; nguồn live vẫn **NOT VERIFIED**. Tài liệu yêu cầu gốc giữ nguyên. Hướng dẫn tái tạo và checks nằm trong [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).
