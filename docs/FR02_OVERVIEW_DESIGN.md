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

## MP-11 / FR-02 — dữ liệu VN-Index đã lưu · 11/10/2026

Thiết kế Stitch đã chọn và được coordinator kiểm tra trước triển khai: project `16706610509511522903`, design system `assets/18357777504117637773`, screen `36be3fc08c1d4f88834401ec4cc4779d`. Worker đã xem ảnh và HTML tham khảo. Trang dùng bố cục bộ chọn nguồn/khoảng ngày, tóm tắt cuối khoảng, bảng bốn cột và panel nguồn. Số trong thiết kế chỉ minh họa bố cục, không dùng làm dữ liệu app; loại các câu khẳng định phiên giao dịch, snapshot đầy đủ/đồng nhất, học thuật, icon kỹ thuật và copyright không có căn cứ.

`/market` và `/market/` vẫn mặc định fixture với phép tính hiện có. Chọn “Dữ liệu đã lưu · KBS” mở `/market?source=observed&from=2026-09-28&to=2026-10-07`; đây là khoảng mẫu cố định, không phải khoảng mới nhất. Form GET cho phép hai ngày inclusive hợp lệ, chênh lệch tối đa 31 ngày (32 ngày lịch). Duplicate/unknown source hoặc query key, thiếu ngày, ngày không có thật, đảo range hoặc vượt giới hạn đều bị từ chối trước khi gọi API. Lựa chọn fixture bỏ range và quay về `/market`.

Chỉ mode observed hợp lệ gọi `GET /api/observed/assets/VNINDEX/history`, same-origin, `no-store`, timeout 10 giây. Module `observed-market-overview.ts` có contract/guard/fetcher riêng: `VN:INDEX:VNINDEX`, symbol `VNINDEX`, type `index`, currency null, unit `index_point`, timezone `Asia/Ho_Chi_Minh`, adjustment `not_applicable`. Guard giữ dataset/KBS/Vnstock 4.0.8/vnai 2.6.2, decimal string OHLC và thứ tự/range/count tối đa 32, null semantics, shape hash, nhãn provider naive và collected timestamp có múi giờ, requested/returned metadata. Chỉ tái dùng helper ngày/range/decimal thuần; không mở rộng guard/interface/detailMode của FPT. Dữ liệu FPT/index trộn bị từ chối.

Tóm tắt chỉ hiện mức đóng cửa và ngày quan sát cuối khoảng cùng số quan sát. Bảng gồm ngày, mức đóng cửa điểm chỉ số chính xác, nhãn ngày/giờ provider không có múi giờ và `collectedAt` nguyên chuỗi/offset gốc. Không chuyển mức đóng cửa qua `Number`/`Intl`, không tính change/return vì lịch phiên chưa xác minh và dữ liệu chưa được xác nhận đồng nhất; adjustment index là không áp dụng. Volume null là không có dữ liệu, tiền tệ không áp dụng, source as-of/freshness/completeness chưa xác định. Per-bar latest có thể trộn đợt thu thập và chứa row từ batch partial/failed; không suy ra snapshot hoàn chỉnh. Không có biểu đồ, breadth, thanh khoản tổng hoặc mức thị trường hiện tại.

Có loading, empty giữ source panel, invalid không request, 404, 503, network, timeout, malformed và retry phù hợp. Khi retry/unmount, abort và generation guard ngăn phản hồi cũ; wrapper key theo URL ngăn giữ dữ liệu range trước. Bảng cuộn ngang trong region có focus, header/caption/row header và live status/alert; layout thu về một cột ở màn hình hẹp. Các giới hạn dữ liệu và cảnh báo không phải lời khuyên đầu tư luôn hiện rõ. UI không bật backend flag, không gọi provider và không fallback fixture khi observed lỗi.

11 unit tests mới dùng runner Node/tsx hiện có, gồm mode/range/unknown/duplicate, precision, OHLC, metadata/null/provenance/timestamps/hash shape/order, 32 bars, FPT/index isolation, HTTP/JSON/network/timeout/abort và late response bỏ qua signal. Đây là unit tests của module, không thay browser QA. Browser QA thực và mock của coordinator được ghi riêng bên dưới; review độc lập đã hoàn tất như ghi nhận bên dưới. Không thêm E2E framework.

MP-11 và FR-02 gốc vẫn một phần; MP-12 chưa bắt đầu. Quyền upstream public redisplay/deployment chưa được xác minh. Backend `OBSERVED_READS_ENABLED=false` vẫn mặc định; original requirements, backend/schema/dependencies/FPT/search/auth/watchlist giữ nguyên.

Kiểm tra worker ngày 11/10/2026 đạt: lint, typecheck, full unit suite 160 tests (0 fail/skip), build API/web, `python scripts/check_docs.py` (104 đích local) và `python scripts/build_docs.py` (19 tài liệu), `git diff --check`. Full unit/build chạy lại với sandbox escalation đã được duyệt sau lỗi sandbox (`fetch failed` ở API unit và Vite EPERM realpath); lần chạy được duyệt đạt toàn bộ. SHA-256 yêu cầu gốc vẫn `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`. GitHub CI, browser QA và review độc lập không được suy ra từ các checks worker này; bằng chứng coordinator/reviewer được ghi riêng bên dưới.

### Browser QA của coordinator · 11/10/2026

Coordinator rebuild Docker web sau sửa câu chữ hiển thị và dùng API stored thực tại local: tám quan sát VNINDEX trong 28/09–07/10/2026, mức đóng cửa cuối khoảng `1753.39`, collectedAt nguyên payload `2026-10-07T13:13:14.958625+00:00`. Giá trị `+07:00` trong output PowerShell trước đó là chuyển đổi sau parse sang múi giờ local, không phải chuỗi gốc; UI/bằng chứng này giữ chuỗi `+00:00` thật. Không gọi provider.

Responsive 1440/768/390/320px có chiều rộng trang khả dụng lần lượt 1425/753/375/305px, không overflow trang. Bảng 800px cuộn bên trong container 672/639/301/231px; coordinator đã xem ảnh desktop/tablet/mobile và thử focus bảng bằng bàn phím, ArrowRight cuộn ngang. Kiểm tra `/market/` fixture ba quan sát, đổi nguồn ba ↔ tám quan sát, reload, form GET khoảng 01–02/01/2026 trả empty thật và giữ source panel; range vượt 31 ngày hoặc source khác bị từ chối. Trang FPT observed vẫn trả tám quan sát trong regression check.

Proxy QA tạm tại port 5181 (ignored) thử loading chậm, 503 → chuyển về response thật rồi retry trả tám quan sát, giá precision `100000.00000000000000001` / `100000.00000000000000002` giữ nguyên trong bảng/tóm tắt và không overflow ở 320px, response FPT bị từ chối, decimal có LF bị từ chối, network error và thông báo timeout sau 10 giây. Các trường hợp single/gap/malformed JSON không được ghi là đã browser QA; bằng chứng unit module tách riêng phía trên. Không commit proxy, ảnh hoặc E2E framework mới.

Sau QA, coordinator phục hồi `OBSERVED_READS_ENABLED=false`, API healthy, xác nhận trang observed hiện thông báo chưa khả dụng thực và fixture vẫn ba quan sát. Proxy đã dừng và viewport được đặt lại; `.env`, backend và provider không bị ghi sửa. GitHub CI còn chờ; QA local không xác minh upstream public redisplay/deployment hoặc nguồn live đầy đủ.

### Review độc lập · 11/10/2026

GPT-6 Astra đã review độc lập và **APPROVED**, không có finding cần sửa. Reviewer kiểm tra cả mười file thay đổi, đối chiếu API/schema/routing/styles và `git diff --check` đạt; không chạy lại full suites hoặc browser QA. Các kết quả runtime/tests ở trên thuộc worker/coordinator, không phải một lượt chạy mới của reviewer. GitHub CI còn chờ; chủ dự án quản lý PR và merge. Approval này không xác minh quyền upstream public redisplay/deployment hoặc hoàn tất MP-11/FR-02 gốc.
