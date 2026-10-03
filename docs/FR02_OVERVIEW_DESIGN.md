# MP-08 — bàn giao tổng quan VN-Index

## Phạm vi và tham chiếu Stitch

Thiết kế đã chọn trước triển khai: project `16706610509511522903` — **MarketPulse VN — Local Demo**; design system `assets/18357777504117637773`; screen `d3404feb64c64ed4bea816dfe2e2e5b1` — **MarketPulse VN - Tổng quan thị trường (VN-Index)**. Coordinator đã review ảnh thiết kế trước triển khai; HTML tải về làm tài liệu tham khảo. Trang giữ nền ấm, panel trắng, viền mảnh, chữ tối, xanh rừng và font hệ thống như [trang search](FR03_SEARCH_DESIGN.md) và [trang chi tiết](FR04_DETAIL_DESIGN.md). HTML sinh tự động chỉ là tham khảo bố cục; bỏ copyright 2024 và các tuyên bố học thuật không có căn cứ.

Một trang `/market` gồm mức đóng cửa VN-Index mới nhất, thay đổi điểm/phần trăm so với quan sát có sẵn trước đó, bảng mức đóng cửa theo ngày và panel nguồn/phạm vi. Header dùng chung nối tổng quan, search và detail; trang search vẫn ở `/`, detail vẫn ở `/stocks/:symbol`. Điều hướng dùng link và tải trang thông thường; không thêm router, chart hoặc package. Direct `/market`, `/market/` và reload đọc lại API; `/stocks/VNINDEX` vẫn ngoài phạm vi trang cổ phiếu. Query search từ detail được giữ khi quay lại.

Đây là lát cắt FR-02/MP-08 trên fixture, hoàn tất ngày 03/10/2026: không có VN30/HNX/UPCOM, vàng/FX, breadth, thanh khoản tổng, movers, live provider hoặc deployment. Ba dòng là ba quan sát có sẵn, không phải ba phiên đã xác minh. Không cần biểu đồ cho lát cắt này; không tuyên bố toàn bộ FR-02 gốc hoàn tất. API, schema và fixture giữ nguyên.

## Hành vi và dữ liệu

Trang gọi `GET /api/assets/VNINDEX/history` qua proxy cùng origin, không thêm endpoint overview hoặc tham số range/timeframe giả. Guard riêng cho index từ chối sai identity/type, currency/unit, volume semantics, provenance fixture, OHLC, ngày/timestamp, thứ tự/ngày trùng, adjustment basis và metadata/as-of không khớp. Không render HTML từ response. Request dùng `no-store`, timeout 10 giây, abort khi unmount/retry và chặn kết quả cũ.

Fixture `marketpulse-fixture` có ba quan sát 21–23/09/2026 với mức đóng cửa 1.300, 1.310 và 1.308 điểm. Mức mới nhất là 1.308 điểm ngày 23/09, giảm 2 điểm (-0,15%) so với quan sát 22/09 có sẵn trước đó; as-of là `2026-09-23T15:00:00+07:00`. Khi thiếu ngày, baseline vẫn là quan sát có sẵn trước đó, không giả định phiên liền trước. Một điểm không có thay đổi; thay đổi bằng 0 giữ 0%; không có dữ liệu thì không có mức đóng cửa, thay đổi hoặc as-of. Không bù/nội suy ngày thiếu.

Đơn vị là `index_point`, tiền tệ `null` được ghi “Không áp dụng”; volume `null`/`not_available` được ghi không có trong mẫu, không suy ra thanh khoản tổng. Nguồn, nhãn `SYNTHETIC FIXTURE — NOT MARKET DATA`, `fixture / unknown`, as-of, UTC+7/`Asia/Ho_Chi_Minh`, lịch phiên chưa xác minh, cơ sở điều chỉnh không áp dụng, phạm vi sẵn có và thời điểm nạp fixture hiện rõ. Nhãn “không phải mức chỉ số hiện tại” và disclaimer minh họa/nghiên cứu/không phải lời khuyên đầu tư luôn hiện diện.

State gồm loading, dữ liệu hợp lệ, no-data và lỗi có retry; 404 thiếu index, HTTP unavailable, network, timeout và dữ liệu sai có thông báo phù hợp. Source panel vẫn hiện trong no-data. Layout hai cột chuyển thành một cột ở màn hình hẹp; header xuống dòng và bảng giữ trong chiều rộng trang. Skip-link, heading, live status/alert, `aria-busy`, caption và row/column header bảng hỗ trợ bàn phím và công nghệ trợ giúp. Có page title riêng và active navigation cho `/market`.

## Kiểm tra và bằng chứng

Chín unit tests mới dùng runner Node/tsx hiện có: route `/market` và việc detail tiếp tục từ chối index; contract index/metadata/provenance/OHLC/ngày sai; empty/single; thay đổi âm/0/dương; baseline qua gap; same-origin/no-store; HTTP/JSON/network/timeout/caller abort. Application CI thêm HTTP smoke direct `/market` và VNINDEX history proxy, kiểm tra ba mức đóng cửa, null currency/volume, index unit, as-of và fixture freshness. HTTP smoke không kiểm tra React render.

Coordinator đã kiểm tra độc lập bằng Edge với API thực tại Vite port 5174: mức 1.308 điểm/-2 (-0,15%), ba dòng 21–23/09, source/as-of/unit/freshness đúng, active nav và page title; direct `/market/`, reload, skip-link bàn phím và luồng market → search `vin` → VIC detail → market → browser back → quay lại search giữ `vin`. `/stocks/VNINDEX` vẫn báo ngoài phạm vi. Responsive 1440/768/390/320px không overflow ngang hoặc pageerror; coordinator xem ảnh 1440px và 320px.

Qua response chặn tạm bằng Playwright/Edge, coordinator đã thử 503/retry, loading chậm rồi dữ liệu hợp lệ, no-data/as-of null không có số, một điểm thiếu baseline, 0%, +10 điểm (+0,76%), gap baseline 21/09 cho +8 (+0,62%), currency VND/volume 0/as-of sai bị từ chối, 404 và network failure; không có pageerror. QA này dùng script tạm, không phải E2E framework được commit.

Docker web build đạt exit 0 và Compose đưa cả bốn service tới healthy. Smoke coordinator đạt readiness 200, direct `/market` HTML 200, VNINDEX history proxy 200/`no-store`/ba candle/null currency/`index_point`/null volume/`not_available`/as-of `2026-09-23T15:00:00+07:00`. Edge 390px qua Docker port 5173 kiểm tra reload market → search FPT → detail ba điểm chart → overview, đúng mức/thay đổi và không overflow ngang/pageerror. Coordinator khởi động lại Docker ngày 03/10 và xác nhận lại bốn service healthy, readiness/direct route 200 và proxy giữ mức 1.308 điểm.

Checks cuối local đạt: `npm run lint`, `npm run typecheck`, `npm run test:unit` (74 tests: 47 API, 8 search client, 10 detail client, 9 overview client; 0 fail/skip), `npm run build`, `python scripts/check_docs.py` (50 đích local tồn tại) và `python scripts/build_docs.py` (14 tài liệu nguồn). `git diff --check` đạt. Hash SHA-256 tài liệu yêu cầu gốc vẫn là `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`.

GitHub Actions trên nhánh này chưa được xác nhận; nguồn live vẫn **NOT VERIFIED**. Tài liệu yêu cầu gốc giữ nguyên. Hướng dẫn tái tạo và checks nằm trong [LOCAL_DEVELOPMENT.md](LOCAL_DEVELOPMENT.md).
