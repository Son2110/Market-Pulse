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

## MP-11 / FR-04 — dữ liệu FPT đã lưu · 10/10/2026

Lát cắt nối trang FPT tới [API observed opt-in](LOCAL_DEVELOPMENT.md#optional-stored-observed-history-api), trên nhánh `feat/fr-04-observed-detail-2`. Thiết kế Stitch đã chọn trước triển khai: project `16706610509511522903`, design system `assets/18357777504117637773`, screen `4dd2d180b5fb4bf284f9c8907ba05ef4`. Ảnh/HTML tham khảo cục bộ nằm trong `.venv/stitch-observed-detail/`, được ignore và không commit. Trang dùng header, nền ấm, panel trắng và xanh rừng của design system chung. Các ghi nhận MP-07 phía trên là lịch sử fixture; lát cắt này không hoàn tất toàn bộ FR-04 hay MP-11, MP-12 chưa bắt đầu.

### Chọn nguồn và khoảng ngày

`/stocks/FPT` mặc định vẫn tải fixture. Chỉ `source=observed` với hai ngày hợp lệ `from`/`to` mới đọc `/api/observed/assets/FPT/history`; observed UI chỉ hỗ trợ FPT, dù API đã hỗ trợ cả VNINDEX. Hai ngày inclusive là bắt buộc, chênh lệch tối đa 31 ngày (32 ngày lịch). Nguồn không biết, ngày thiếu/sai/đảo/thừa khoảng, tham số nguồn/ngày lặp hoặc tham số observed ngoài phạm vi bị từ chối trước request. Khoảng mẫu 28/09–07/10/2026 là lựa chọn cố định có nhãn, không phải khoảng mới nhất hoặc default API. Form GET cập nhật URL; direct link/reload đọc lại đúng khoảng. Link nguồn giữ query search hợp lệ để quay lại kết quả đã tìm.

UI không tự bật `OBSERVED_READS_ENABLED`; backend flag vẫn mặc định `false`. Khi route tắt hoặc asset chưa có, 404 chỉ báo dữ liệu đã lưu chưa khả dụng, không suy đoán cấu hình server. Không tự quay về fixture khi observed lỗi, không dùng fixture để lấp ngày thiếu và không gọi provider/collector hoặc ingestion API. Search, market, account, watchlist, fixture history API, backend, schema, dependency và lockfile không đổi trong task này.

### Giá, biểu đồ và provenance

Giá đóng cửa cuối khoảng có dữ liệu và OHLC trong bảng/summary giữ nguyên decimal string; không làm tròn hoặc định dạng qua floating point. Guard kiểm tra contract riêng FPT/KBS/daily, phiên bản vnstock 4.0.8/vnai 2.6.2, đơn vị/tiền tệ VND, timezone `Asia/Ho_Chi_Minh`, metadata unknown/null, tối đa 32 quan sát, chronology/uniqueness/range, timestamp, hash shape và quan hệ OHLC bằng so sánh chuỗi thập phân chính xác. Payload malformed không render thành giá. Guard chỉ kiểm tra shape hash, không tính lại digest hay xác minh nguồn upstream.

Biểu đồ đường ghi rõ xấp xỉ; floating point chỉ dùng cho hình học, giá chính xác luôn nằm trong bảng và mô tả chart. Chart bị ẩn nếu conversion không hữu hạn/không dương hoặc giá khác nhau bị trùng giá trị hay tọa độ vì mất chính xác. Ngày đặt theo khoảng cách lịch, đoạn ngắt qua hơn một ngày lịch; không bù/nội suy ngày thiếu. Không tính change/return vì adjustment basis chưa xác định. Volume null hiện “Không có dữ liệu”, không biến thành 0.

Panel nguồn và bảng giữ nhãn ngày/giờ provider không có múi giờ cùng `collectedAt` với múi giờ gốc, tách khỏi source as-of chưa xác định. Asset timezone Việt Nam không được dùng để gán múi giờ cho provider label. Freshness, source as-of, adjustment và completeness chưa xác định; lịch phiên chưa xác minh. Các dòng được chọn latest theo collection tuple từng bar, có thể trộn delivery hoặc gồm row từ đợt ghi partial/failure; không xác nhận mẫu đồng nhất/đầy đủ hay correction precedence từ provider. Giá thuộc khoảng đã chọn, không gọi là giá hiện tại. Quyền upstream public redisplay/deployment còn mở; nguồn live vẫn **NOT VERIFIED**.

### Trạng thái và kiểm tra

Loading, empty, input invalid, unavailable/network/timeout/malformed response và retry có thông báo riêng. Request dùng `no-store`, timeout mười giây, abort cùng request identity để bỏ callback cũ; không giữ giá cũ khi retry. Empty giữ panel provenance và requested range, không bịa giá/chart/returned range. Layout chuyển một cột trên mobile; bảng OHLC và timestamp cuộn trong vùng riêng có thể focus, giá chính xác không xuống dòng trong ô. Skip-link, heading, live status/alert, caption và mô tả chart hỗ trợ bàn phím.

Mười một test client observed được thêm vào runner Node/tsx hiện có: source/range/query và link search, boundary 31/32 ngày/leap date, exact decimal/OHLC, empty/single/metadata, malformed identity/provenance/null/extra field/timestamp/order, chart gap/flat/narrow/unreliable geometry, URL/no-store cùng HTTP/JSON/network/timeout/caller abort. Đây là unit tests với response mock, không phải browser E2E đã commit.

Checks local ngày 10/10 đạt: `npm run lint`, `npm run typecheck`, `npm run test:unit` (149 tests, 0 fail/skip), `npm run build`, `python scripts/check_docs.py` (101 local file targets), `python scripts/build_docs.py` (19 tài liệu nguồn) và `git diff --check`. Lần unit/build đầu trong sandbox bị chặn loopback fetch và Vite realpath `EPERM`; chạy lại đúng lệnh với quyền local cần thiết đã đạt, không sửa ứng dụng để né check. Không chạy lại integration MongoDB/Redis hoặc Python contract/collector suite trong task UI này.

### Browser QA của coordinator · 10/10/2026

Coordinator rebuild Docker API/worker/web, xác nhận cả năm service healthy và tạm đặt `OBSERVED_READS_ENABLED=true` cho QA; không sửa `.env` hay gọi provider mới. Với API và dữ liệu đã lưu thực tế, khoảng 28/09–07/10 trả tám dòng FPT, giá đóng cửa cuối khoảng `59700` VND, `collectedAt` cuối `2026-10-07T13:12:46.484758+00:00`. Chart có tám điểm, hai đoạn và không nối/nội suy qua cuối tuần. Reload giữ đúng nguồn/khoảng; chuyển fixture ↔ observed hiện ba ↔ tám dòng, quay lại search giữ `fpt`. Date form chọn 01–02/01/2026 nhận empty thực, không có chart. Khoảng chênh lệch hơn 31 ngày, nguồn sai và observed VCB bị từ chối. Smoke VCB fixture có ba dòng và không có link observed, market có ba dòng, watchlist guest hiện yêu cầu đăng nhập; không kiểm tra write watchlist của user đăng nhập trong task này.

Browser ở 1440/768/390/320px có page scrollWidth lần lượt 1425/753/375/305px, không overflow ngang trang. Bảng rộng 1260px cuộn nội bộ trong vùng rộng 679/639/302/231px; các giá chính xác không xuống dòng. Coordinator đã xem ảnh desktop, bảng, tablet và mobile sau sửa CSS cuối. Đây là bằng chứng responsive của code hiện tại, không dùng ảnh Stitch làm kết quả runtime.

Qua proxy QA tạm được ignore tại port 5180, coordinator thử loading chậm, 503 → chuyển lại API thực → retry phục hồi tám dòng, 404 chưa khả dụng, network error và response giá chứa LF bị từ chối. Response mock một quan sát cho một marker/không có đường; hai điểm có gap cho hai marker/không có đường. Hai decimal `100000.00000000000000001` và `100000.00000000000000002` còn chính xác trong bảng, chart bị ẩn vì xấp xỉ không phân biệt được chúng. Các mock này tách khỏi bằng chứng dữ liệu đã lưu thực tế ở trên; script/proxy/ảnh QA không được commit thành E2E suite.

Sau QA, coordinator khôi phục API qua Compose với `OBSERVED_READS_ENABLED=false`, xác nhận route observed thực trả 404 và UI báo chưa khả dụng; link fixture tường minh vẫn hiện ba dòng. `.env` giữ nguyên. Proxy QA đã dừng và viewport đã reset. Browser error log chỉ có lỗi Vite HMR dự kiến ở proxy 5180 do không forward WebSocket, không quan sát thấy exception của ứng dụng. Ảnh desktop local `.venv/observed-detail-qa/fpt-desktop.jpg` được ignore.

Review GPT-6 Astra độc lập ở mức medium ngày **10/10/2026** đã **APPROVE**, không có finding cần sửa. Reviewer kiểm tra code, CSS, tests và docs, lựa chọn nguồn/request/error, decimal chính xác, chart/gap, metadata, coverage responsive và đối chiếu API contract; `git diff --check` đạt. Reviewer không chạy lại unit suite hoặc browser QA; bằng chứng runtime phía trên là của worker/coordinator. GitHub CI trên branch này chưa được xác nhận; PR/merge do chủ dự án quản lý. Tài liệu yêu cầu gốc giữ nguyên, SHA-256 `21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`.
