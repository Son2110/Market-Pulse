# Lộ trình local-first trong ba tuần

**Khoảng thời gian:** 24/09–14/10/2026, đúng 21 ngày lịch (D1–D21).  
**Năng lực:** một người, mỗi ngày triển khai 2–3 giờ và mỗi ngày review/buffer 1 giờ. Ước lượng cơ sở: 15 × 2,4 giờ + 6 × 1 giờ = **42 giờ**. Có thể dời ngày; nếu lịch thay đổi, giữ thứ tự ngày và các cổng nghiệm thu.

Đây là kế hoạch cho một demo portfolio nhỏ, không phải hoàn tất MVP gốc. Xem giới hạn từng FR trong [PRD.md](PRD.md).

## Nhịp thực hiện

Chỉ triển khai một task tại một thời điểm với một worker. Hoàn tất code, kiểm tra và review độc lập cho task hiện tại trước khi bắt đầu task kế tiếp. Không chạy song song các dòng trong bảng.

Với mỗi task frontend, thiết kế một trang trong Stitch trước khi triển khai; giữ nhất quán với design system dùng chung và ghi project/screen Stitch đã chọn trong bàn giao. Kiểm tra responsive cùng trạng thái loading, empty, error; hoàn tất triển khai, kiểm tra và review trang đó trước khi làm trang kế tiếp. Nếu Stitch không khả dụng, ghi rõ blocker và không giả định đã dùng công cụ thay thế.

## Tuần 1 — dựng nền tảng cục bộ an toàn

| Ngày / ngày tháng | Loại | Task và sản phẩm bàn giao | Nghiệm thu / phụ thuộc |
|---|---|---|---|
| D1 · Thứ Năm 24/09 | Build · 2,4 giờ | MP-01 khảo sát provider và quyền dữ liệu | So sánh một nguồn cổ phiếu/index về quyền truy cập, điều khoản, EOD/delay, độ phủ VN-Index và 10–20 mã. Chỉ xem là xác minh sau khi thử truy cập thực tế. |
| D2 · Thứ Sáu 25/09 | Build · 2,4 giờ | MP-02 hợp đồng provider và fixture | Định nghĩa quote/candle/index và một tập fixture nhỏ, có tiền tệ, múi giờ, provider, thời điểm dữ liệu. |
| D3 · Thứ Bảy 26/09 | Build · 2,4 giờ | MP-03 scaffold ứng dụng, compose cục bộ và nền CI | Tạo layout tối thiểu cho web/API/collector và service Mongo/Redis cục bộ; xác định lint/typecheck/unit/integration/build CI ngay khi scaffold. Test dùng fixture; CI không chứa secret provider. |
| D4 · Chủ Nhật 27/09 | Review / buffer · 1 giờ | GATE-1 review kiến trúc và nguồn | Kiểm tra hợp đồng, bằng chứng điều khoản/truy cập, startup cục bộ và CI. Bỏ giả định nguồn chưa có căn cứ trước khi mở rộng app. |
| D5 · Thứ Hai 28/09 | Build · 2,4 giờ | MP-04 auth cơ bản và API shell cục bộ | Đăng ký/đăng nhập/đăng xuất, băm mật khẩu, validation, phiên hết hạn và bị vô hiệu khi logout; không log mật khẩu/token. Bảo vệ quyền sở hữu dữ liệu ở server. |
| D6 · Thứ Ba 29/09 | Build · 2,4 giờ | MP-05 đường đọc candle ngày đã chuẩn hóa | Nạp fixture qua provider adapter vào response candle ngày canonical; hiển thị trạng thái thiếu dữ liệu/as-of/freshness trung thực. |
| D7 · Thứ Tư 30/09 | Review / buffer · 1 giờ | GATE-2 tích hợp tuần 1 | Compose khởi động được, nạp fixture lặp lại được, một response API đúng contract và CI không skip. Nếu chưa đạt, dùng buffer để sửa thay vì thêm tính năng. |

### Tiến độ ghi nhận · 25/09/2026 (trước khi hoàn tất MP-02)

MP-01 đã hoàn tất báo cáo tài liệu và probe HTTP không xác thực; chưa xác minh quyền truy cập, quyền dữ liệu hoặc coverage của nguồn live. Cổng LIVE còn mở. Tại thời điểm này, dùng fixture tổng hợp cho MP-02. Xem [báo cáo khảo sát provider](PROVIDER_RESEARCH.md); lịch, phạm vi và tiêu chí MP-02 không đổi.

### Tiến độ ghi nhận · 26/09/2026

MP-02 đã hoàn tất schema JSON v1, fixture tổng hợp xác định trước và validator offline có kiểm tra ràng buộc chéo; 24 unit tests và các bước docs/link/build hiện có đều đạt. Documentation CI chạy validation/test này trên pull request và push vào `main`, `ci/**`, `feat/**`, `docs/**`. Các ngày fixture chưa xác minh theo lịch giao dịch; cổng LIVE vẫn mở. Ngày 26/09, chủ dự án chọn Vnstock làm hướng connector/tích hợp để xác minh tiếp; SSI bị loại vì đăng ký không thực tế cho dự án theo đánh giá của chủ dự án, không phải kết luận chung về kỹ thuật hay pháp lý. Lựa chọn này chưa xác minh upstream, truy cập thực tế, coverage, đơn vị/ngữ nghĩa thời gian hoặc quyền dữ liệu. Không còn yêu cầu tài khoản/credential SSI; credential chỉ cần nếu upstream Vnstock được chọn thực sự yêu cầu. Fixture giữ provider `marketpulse-fixture`.

### Tiến độ ghi nhận · MP-03 · 26/09/2026

Scaffold local có workspace npm với lockfile, API chỉ có liveness/readiness, React/Vite root trống chờ thiết kế Stitch, Compose MongoDB/Redis, và Python CLI chỉ xác thực cùng báo cáo metadata fixture. Collector chưa kết nối Vnstock. Compose chỉ publish cổng loopback; startup retry có giới hạn. Sau khi Redis ngắt kết nối, API thoát lỗi để Compose thử khởi động lại tối đa năm lần; MongoDB readiness failure trả 503 trong khi liveness còn 200. Workflow `Application CI` chạy checks app, collector, Compose và integration MongoDB/Redis; xem [hướng dẫn local](LOCAL_DEVELOPMENT.md) và [CI/CD](CI_CD.md) để biết lệnh chi tiết.

Kiểm tra local đã đạt: `npm ci`, lint, typecheck source/test, 8 API unit tests, build, fixture validator, 24 test contract và 2 test collector. Cả ba images build; `docker compose up --build --wait` đưa bốn service tới healthy; container collector báo 11 assets, 33 candles, 10 quotes và 1 index observation; API liveness/readiness cùng web root trả 200; integration MongoDB/Redis đạt 1 test, 0 skip. Khi dừng MongoDB, liveness vẫn 200 và readiness 503; khi Redis bị dừng, API thoát với log đã khử lỗi, rồi tự chạy lại và readiness 200 sau khi Redis hoạt động. Bài kiểm tra startup SIGTERM thoát mã 0 trong 1,327 ms. GitHub Actions ở remote chưa chạy trên branch này. Cổng truy cập/điều khoản/provider Vnstock vẫn mở; fixture vẫn là synthetic.

### GATE-1 review · 27/09/2026

GATE-1 đạt cho việc tiếp tục demo cục bộ bằng fixture: contract, fixture, scaffold và CI không có blocker cho MP-04. Trên [commit `d6648b4`](https://github.com/Son2110/Market-Pulse/commit/d6648b48ce0053b0988bad53a77a767108411d7f), [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/36292869880) và [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/36292869917) đều thành công; Application CI hoàn tất lint, typecheck, 8 API unit tests, build, fixture validation, 24 contract tests, 2 collector tests, Compose build/health/smoke và 1 integration test MongoDB/Redis, không skip bước bắt buộc.

Kiểm tra runtime ngày 27/09: `docker compose up --wait` đưa cả API, web, MongoDB và Redis tới healthy; hai health endpoint cùng web root trả HTTP 200. Collector fixture báo 11 assets, 33 candles, 10 quotes và 1 index observation; integration MongoDB/Redis đạt 1 test, 0 skip với MongoDB tại `127.0.0.1:27018`. Các kịch bản outage và SIGTERM thuộc bằng chứng MP-03 ngày 26/09, không được chạy lại trong lần review này.

Cổng live source vẫn **NOT VERIFIED**: chưa xác minh upstream, quyền truy cập/điều khoản, coverage, đơn vị/ngữ nghĩa thời gian hoặc quyền dữ liệu. Tiếp tục MP-04 trên fixture; không gọi scaffold là live-ready hay xem các tính năng sản phẩm đã hoàn tất.

### Tiến độ ghi nhận · MP-04 · 28/09/2026

API auth local có `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` và `GET /api/auth/me`. Mật khẩu được băm bằng scrypt có salt riêng; bearer token ngẫu nhiên chỉ được lưu dưới dạng SHA-256 digest trong MongoDB, hết hạn sau 8 giờ và bị xóa khi logout. Validation, giới hạn tốc độ/KDF và việc khởi tạo index nằm trong API; readiness chờ MongoDB, Redis và auth index. Đây là lát cắt API cho tài khoản demo, chưa có trang đăng nhập, API thị trường/watchlist hay toàn bộ yêu cầu FR-01. Xem [hướng dẫn local](LOCAL_DEVELOPMENT.md) để biết request, giới hạn và lệnh chạy.

Kiểm tra local đạt: lint, typecheck, build, 17 API unit tests, fixture validation, 24 contract tests, 2 collector tests, docs check/build và 2 integration tests MongoDB/Redis (0 skip). `docker compose up --wait` đưa API, web, MongoDB và Redis tới healthy; smoke test nhận HTTP 200 ở `/health/live`, `/health/ready` và web root, cùng 401 tại `/api/auth/me` khi không có bearer token. Không tạo tài khoản trong smoke test. GitHub Actions trên branch này chưa được xác nhận.

### Tiến độ ghi nhận · MP-05 · 28/09/2026

API có `GET /api/assets/:symbol/history`, đọc fixture canonical một lần qua provider adapter và không yêu cầu đăng nhập vì dữ liệu này chỉ là fixture tổng hợp công khai. `interval` mặc định `1d`; `from`/`to` là ngày ISO hợp lệ và inclusive. Query sai trả 400, symbol không biết trả 404, range rỗng của asset đã biết trả 200 với `status: no_data` và `asOf: null`. Response giữ nguyên asset/candle được chọn cùng provenance và nhãn `SYNTHETIC FIXTURE — NOT MARKET DATA`, freshness `fixture / unknown`, lịch phiên `unverified`, đơn vị, volume null của VNINDEX và timestamp fixture; ngày thiếu không được bù. `availableRange` là toàn chuỗi; `asOf` theo candle mới nhất trong kết quả. API đặt `Cache-Control: no-store`. Fixture hỏng hoặc thiếu làm readiness 503, còn liveness độc lập; lỗi route đã được khử chi tiết nội bộ.

Đây là phần API-only của FR-04. Chưa có trang giao diện, search, nguồn live đã xác minh, ingestion hoặc cache; cổng source live vẫn **NOT VERIFIED**. Kiểm tra local đạt: lint, typecheck, 35 API unit tests, build, fixture validator, 24 contract tests, 2 collector tests, docs check (34 đích link local) và docs build (11 tài liệu). `docker compose build api` thành công và `docker compose up --detach --wait` đưa MongoDB, Redis, API và web tới healthy. Smoke test từ API container xác nhận health/web, FPT có đúng hai candle fixture trong range inclusive cùng source/freshness/as-of, range rỗng trả `no_data`/`asOf: null`, symbol lạ trả 404 và response `no-store`. Hai envelope API thực tế (có candle và rỗng) đều qua validator Python hiện có với `fixture_only=False`. Integration MongoDB/Redis đạt 2 test, 0 skip bằng host URL tại `127.0.0.1:27018` và `127.0.0.1:6379`. GitHub Actions trên branch này chưa được xác nhận.

### Tiến độ ghi nhận · MP-06 API · 29/09/2026

Đã thêm `GET /api/assets/search?q=...` cho đúng mười equity trong fixture. Catalog tham chiếu có tên, bí danh, URL nguồn chính thức và ngày rà soát 29/09/2026; nó được join với asset canonical đã nạp, loại trừ VNINDEX và làm readiness thất bại nếu catalog trùng hoặc lệch coverage. Query là substring literal sau chuẩn hóa Unicode và tiếng Việt, có giới hạn 100 codepoint, xếp exact symbol → symbol prefix → symbol alphabetically. Response giữ asset canonical, provenance tham khảo, `fixture / unknown`, provider fixture và `asOf: null`; không có dữ liệu giá trong catalog. Phần này chỉ hoàn tất một lát cắt API của MP-06/FR-03; chưa có trang search, lựa chọn mở detail, fuzzy/recent search hay độ phủ live. Lát cắt frontend kế tiếp cần thiết kế Stitch riêng; MP-07 tiếp tục sở hữu detail/chart. Cổng nguồn live vẫn **NOT VERIFIED**.

Kiểm tra local đạt: lint, typecheck, 47 API unit tests, build, fixture validator, 24 contract tests, 2 collector tests, docs check (34 đích link local) và docs build (11 tài liệu). Kiểm tra Docker/API do coordinator chạy đưa API, MongoDB và Redis tới healthy; smoke HTTP xác nhận cả mười tên/bí danh trả đúng asset canonical, symbol dùng được với history và candle vẫn là tập con fixture. VNINDEX, chuỗi regex literal và từ khóa lạ trả 200 với danh sách rỗng; query thiếu/rỗng/trùng/nested/lạ/quá dài/chỉ có dấu kết hợp trả 400 cùng `no-store`. Health/readiness trả 200, `/api/auth/me` không token trả 401; integration MongoDB/Redis đạt 2 test, 0 skip. GitHub Actions trên branch này chưa được xác nhận.

### Tiến độ ghi nhận · MP-06 web · 01/10/2026

Trang root đã triển khai tra cứu tiếng Việt trên API của mười equity, theo screen Stitch đã chọn trong [bàn giao thiết kế](FR03_SEARCH_DESIGN.md). Giữ thứ tự response, chọn kết quả bằng button và hiển thị thông tin tham khảo doanh nghiệp trên cùng trang, với nguồn HTTPS, ngày rà soát, tiền tệ/múi giờ và nhãn dữ liệu minh họa. Có initial/loading/results/empty/error/retry, giới hạn query 100 Unicode codepoint, timeout và hủy/chặn request cũ. Vite proxy cùng origin dùng API host ở local hoặc tên service `api` trong Compose. Không có giá/chart, trang auth/watchlist hoặc route chi tiết. Tiêu chí mở trang chi tiết của MP-06/FR-03 vẫn chờ MP-07; nguồn live vẫn **NOT VERIFIED**.

Kiểm tra local đạt: lint, typecheck, 55 unit tests (47 API và 8 client, 0 skip), build, docs check (37 đích link local) và docs build (12 tài liệu nguồn). Coordinator đã kiểm tra Edge desktop/mobile 1440/768/390/320px, các state, retry, request race, lựa chọn result và metadata; không có overflow ngang/pageerror. Compose rebuild/start web healthy và HTTP search qua proxy port 5173 đạt. Review độc lập không phát hiện blocker. Bằng chứng cụ thể nằm trong bàn giao thiết kế; GitHub Actions trên nhánh này chưa được xác nhận.

### GATE-2 review · 29/09/2026 (thực hiện trước D7)

**PASS trong phạm vi demo cục bộ dùng fixture; tiếp tục MP-06.** Trên [commit `988dd17`](https://github.com/Son2110/Market-Pulse/commit/988dd179704fd70d861817d5946cf7a79c5fae06), [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/36409640344) và [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/36409640298) đều thành công. Application CI chạy đủ lint, typecheck, 37 unit tests, build, validation fixture, 24 contract tests, 2 collector tests, Compose build/start/health/smoke và 2 integration tests MongoDB/Redis; không có test bị skip. Các bước log chẩn đoán bị skip sau khi job thành công không phải test bị skip.

Kiểm tra runtime ngày 29/09: Compose build từ `main` đưa cả bốn service tới healthy. API trả 200 cho FPT đủ fixture và VNINDEX, cùng 200 `no_data` cho FPT từ `2026-09-24`; cả ba response giữ nguyên tập con canonical của fixture và qua `validate_market_data(..., fixture_only=False)`. Health/readiness và web trả 200; `/api/auth/me` không token trả 401; mã lạ trả 404; ngày `2026-02-29` trả 400. Chỉ restart API rồi đọc lại; SHA-256 của bộ ba response giống nhau trước/sau: `208debf588d4b80b851a6f4d92b258eae6ed5168961ba0343c94192fd809f29b`. Chạy collector fixture hai lần đều báo 11 assets, 33 candles, 10 quotes và 1 index observation với nhãn `SYNTHETIC FIXTURE` / `fixture / unknown`; integration MongoDB/Redis local đạt 2/2, 0 skip.

Ở cổng này, “nạp fixture lặp lại được” nghĩa là API nạp fixture đã đóng gói lặp lại khi khởi động và trả cùng dữ liệu; **không** phải seed market data vào MongoDB hoặc chứng minh idempotency/replay. Hiện không có market seed hay collector writes; ingestion và replay vẫn thuộc MP-10. Cổng nguồn live vẫn chưa đạt: probe KBS/Vnstock 27/09 đã đọc được 11/11 mã trong truy vấn mẫu, nhưng freshness, adjustment basis, ngữ nghĩa timestamp/as-of và quyền dữ liệu upstream còn chưa xác minh. Kết quả PASS này chỉ mở đường cho demo fixture, không phê duyệt live ingestion, production hay hoàn tất MVP.

## Tuần 2 — hoàn thành luồng người dùng chính

### Tiến độ ghi nhận · MP-07 · 02/10/2026

Trang `/stocks/:symbol` nối từ search đã chọn, với giá đóng cửa/OHLCV fixture mới nhất, thay đổi so với quan sát có sẵn trước đó, biểu đồ đường và bảng dữ liệu ngày. Source/as-of/freshness, VND, khối lượng cổ phiếu, UTC+7 và lịch phiên chưa xác minh hiện rõ; không gọi là giá hiện tại hoặc tự bù ngày thiếu. Query search được giữ khi quay lại; direct link/reload, loading/no-data/error/retry và lỗi reference độc lập đã có. Chỉ ba ngày fixture; candlestick/intraday/timeframe/indicator/news/event và nguồn live còn hoãn. Tiêu chí mở detail của lát cắt FR-03 đã có, nhưng FR-03/FR-04 theo mô tả gốc vẫn chưa hoàn tất. Xem [bàn giao thiết kế MP-07](FR04_DETAIL_DESIGN.md).

Coordinator đã review độc lập và QA Edge responsive 1440/768/390/320px cùng trạng thái lỗi/loading/empty, baseline thiếu/0%, gap và metadata sai. Không có pageerror hoặc overflow ngang; chart mobile đã sửa để text đọc được. Docker build/start đạt healthy, HTTP direct route/history proxy và browser 390px search → detail → reload qua port 5173 đạt. GitHub Actions trên nhánh này chưa được xác nhận; cổng nguồn live vẫn **NOT VERIFIED**.

Checks cuối local đạt lint, typecheck, 65 unit tests (47 API + 18 client, 0 skip), build, docs check (43 đích local) và docs build (13 tài liệu nguồn). Tài liệu yêu cầu gốc giữ nguyên; API/schema/fixture không đổi.

### Tiến độ ghi nhận · MP-08 · 03/10/2026

Trang `/market` hiện VN-Index đóng cửa mới nhất 1.308 điểm, giảm 2 điểm (-0,15%) so với quan sát có sẵn trước đó, bảng ba quan sát ngày và source panel. Ghi rõ `index_point`, tiền tệ không áp dụng, volume không có trong mẫu, UTC+7, as-of, `fixture / unknown` và lịch phiên chưa xác minh. Có loading/no-data/error/retry, direct link/reload và header dùng chung nối overview/search/detail. Không thêm breadth, thanh khoản tổng, chỉ số khác, vàng/FX hoặc nguồn live; FR-02 gốc vẫn chưa hoàn tất. API/schema/fixture không đổi. Xem [bàn giao thiết kế MP-08](FR02_OVERVIEW_DESIGN.md).

Coordinator đã QA Edge bằng API thực và response chặn tạm: responsive 1440/768/390/320px, loading/empty/error/retry, baseline thiếu/0/dương/gap và metadata sai; không có overflow ngang/pageerror. Luồng overview → search → detail → overview và quay lại search giữ query đạt. Docker web build/Compose healthy, direct `/market`, VNINDEX history proxy và browser 390px qua port 5173 đạt; khởi động lại Docker ngày 03/10 cũng đạt health/route/proxy smoke. GitHub Actions trên nhánh này chưa được xác nhận; cổng nguồn live vẫn **NOT VERIFIED**.

Checks cuối local đạt lint, typecheck, 74 unit tests (47 API + 27 client, 0 fail/skip), build, docs check (50 đích local), docs build (14 tài liệu nguồn) và `git diff --check`. Tài liệu yêu cầu gốc giữ nguyên.

### D11 review UX và chất lượng dữ liệu · 03/10/2026 (thực hiện trước D11 · 04/10)

**PASS cho UX và dữ liệu fixture hiện có.** Trên `main` đã merge PR #14, [commit `658ca47`](https://github.com/Son2110/Market-Pulse/commit/658ca47e0adcfaf619db670679c50cbb9cb38774), [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/37103098432) và [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/37103098426) đều thành công. Application CI hoàn tất lint, typecheck, build, 74 Node unit tests (47 API + 27 client), fixture validator, 24 Python contract tests, 2 collector tests, Compose build/start/health/HTTP smoke/collector và 2 integration tests MongoDB/Redis; 0 test bị skip.

Coordinator rebuild Docker web từ đúng commit `main` trên; cả bốn service Compose healthy. Audit HTTP qua web proxy đối chiếu đủ 11 assets và 33 candles với fixture canonical, gồm metadata/provenance; exact-symbol search của cả mười equity trả đúng asset, response có `no-store`.

QA trình duyệt thủ công bằng script Playwright tạm và Edge kiểm tra search/detail/market ở 1440/768/390/320px với `Asia/Ho_Chi_Minh` và `America/Los_Angeles` (24 view); không có overflow ngang/pageerror, ảnh 390px của cả ba trang đã được xem trực tiếp. Hai múi giờ trình duyệt đều hiển thị `15:00:00 23/09/2026 UTC+7`; VND, `index_point`, tiền tệ không áp dụng của index, ngày rà soát reference riêng và nhãn fixture/unknown/unverified hiển thị đúng. Skip link, search/select VIC bằng Enter và luồng `vin` → VIC detail/chart → reload → back giữ query đạt; overview/reload/search có `aria-current` đúng. Mock response tạm cho từng trang xác nhận loading, empty, HTTP 503 và retry thành công; empty không bịa giá/chart, không có pageerror. Đây là QA thủ công tạm thời, chưa phải E2E suite đã commit.

Không phát hiện lỗi cần sửa code trong phạm vi review này. Nguồn live vẫn **NOT VERIFIED**; UI auth và watchlist còn chờ MP-09. Kết quả này không phải GATE-3, hoàn tất MVP hay nghiệm thu production. Sau khi bản ghi này được merge, task kế tiếp duy nhất là MP-09 watchlist có xác thực.

### Tiến độ ghi nhận · MP-09 API · 03/10/2026 (thực hiện trước D12 · 05/10)

Đã thêm API watchlist có xác thực cho đúng một danh sách mỗi user: đọc/tạo/đổi tên/xóa và thêm/bỏ mã trong mười equity canonical của fixture. MongoDB lưu collection `watchlists` riêng, owner ObjectId lấy từ phiên server, unique index theo user, danh sách symbol bounded và cập nhật atomic. Mọi query/field dư bị từ chối; ID không tồn tại và ID của user khác cùng trả 404. Symbol phải uppercase canonical, loại trừ VNINDEX; thêm lặp không trùng và bỏ lặp không lỗi. Readiness chờ catalog và index watchlist; lỗi được khử chi tiết và response đặt `no-store`. Không lưu giá, dữ liệu doanh nghiệp hoặc market as-of trong watchlist; timestamp chỉ là thời điểm dữ liệu tài khoản thay đổi.

Kiểm tra local đạt: lint, typecheck, build, 83 unit tests (56 API + 27 client, 0 fail/skip), fixture validator, 24 Python contract tests, 2 collector tests, docs check (51 đích local), docs build (14 tài liệu nguồn) và `git diff --check`. Integration MongoDB/Redis đạt 3 test cấp cao cùng 6 subtest watchlist (runner báo 9 test, 0 fail/skip), dùng database test có tên duy nhất và chỉ xóa database do test tạo. Test đăng ký hai user bằng auth thật, kiểm tra mọi route thiếu/sai token, user B không thấy/sửa/xóa/thêm/bỏ dữ liệu user A, owner giả từ header/query/body, create đồng thời, add đồng thời không mất/trùng symbol, đủ mười mã và từ chối mã thứ mười một/index, remove lặp, delete/recreate, expiry và logout.

Coordinator rebuild Docker API thành công; Compose đưa cả bốn service tới healthy. HTTP health/live và ready trả 200; cả sáu route watchlist không token trả 401 `unauthorized` cùng `no-store` qua API port 3001 và proxy web port 5173. Web root, `/stocks/FPT`, `/market` vẫn trả HTML 200; FPT history qua proxy giữ ba candle fixture và close mới nhất 102.500 VND. Smoke không tạo thêm tài khoản. GitHub Actions trên nhánh này chưa được xác nhận.

Đây chỉ là lát cắt API của MP-09/FR-06. Tại ngày 03/10, UI auth, UI watchlist và giá/thay đổi mới nhất còn chờ các bước serial có thiết kế Stitch; có thể compose API history hiện có và giữ đủ nhãn nguồn/as-of/freshness. MP-09 chưa hoàn tất, GATE-3 chưa được nghiệm thu; cổng nguồn live vẫn **NOT VERIFIED**. Không đổi lịch hay mở MP-10 từ lát cắt này.

### Tiến độ ghi nhận · FR-01 web chuẩn bị MP-09 · 04/10/2026

Trang tài khoản `/account` và `/account/` dùng thiết kế Stitch project `16706610509511522903`, screen `b706d5ecf27f434e9d0e08f012cb3710`, cùng design system của các trang trước. Trang đăng ký/đăng nhập/đăng xuất qua API local, giữ token/expiry trong sessionStorage theo tab, xác minh `/me` khi restore trước khi hiện identity và xử lý phiên hết hạn/lỗi/logout chưa xác nhận. Lint, typecheck, build, 101 unit tests (18 client/helper mới, 0 fail/skip), docs check/build và diff check đạt. Coordinator đã thử API thật và trạng thái lỗi/storage/expiry bằng Edge cùng Playwright tạm thời ở 1440/768/390/320px; không tràn ngang/page error. Chi tiết bằng chứng và giới hạn trong [bàn giao tài khoản](FR01_AUTH_DESIGN.md); đây không phải E2E framework đã commit.

Coordinator build lại Docker web thành công; Compose có bốn service healthy. `/account` và `/account/` trên port 5173 trả 200; browser Docker web ở 390px/Asia_Ho_Chi_Minh kiểm tra register → reload/me restore → logout bằng API thật đạt, không tràn ngang/page error. Tài khoản QA được xóa theo đúng email/user ID; ảnh login cuối cùng được kiểm tra nhất quán với thiết kế Stitch. Review độc lập và GitHub CI của branch hiện tại còn chờ.

Đây là một trang prerequisite serial, không mở UI watchlist hay giá/thay đổi mới nhất. FR-01 gốc và MP-09/FR-06 vẫn một phần, GATE-3 chưa đạt, nguồn live **NOT VERIFIED**. Task kế tiếp chỉ được bắt đầu sau khi hoàn tất kiểm tra và review trang hiện tại; không mở MP-10 trong lát cắt này.

| Ngày / ngày tháng | Loại | Task và sản phẩm bàn giao | Nghiệm thu / phụ thuộc |
|---|---|---|---|
| D8 · Thứ Năm 01/10 | Build · 2,4 giờ | MP-06 tìm kiếm mã và tên công ty | Tìm trong tập mã đã seed/ingest, trả symbol ổn định và mở trang chi tiết. Phụ thuộc MP-02. |
| D9 · Thứ Sáu 02/10 | Build · 2,4 giờ | MP-07 trang chi tiết và biểu đồ ngày | Hiện định danh, OHLCV ngày mới nhất và chart lịch sử cho một mã; thể hiện tiền tệ, stale và dữ liệu thiếu. |
| D10 · Thứ Bảy 03/10 | Build · 2,4 giờ | MP-08 tổng quan VN-Index cơ bản | Hiện quan sát VN-Index mới nhất và thay đổi, kèm timestamp. Không đưa ra breadth hay thanh khoản tổng chưa hỗ trợ. |
| D11 · Chủ Nhật 04/10 | Review / buffer · 1 giờ | Review UX và chất lượng dữ liệu | Thử search → detail → chart và overview bằng fixture; kiểm tra timezone, đơn vị, trạng thái trống/lỗi và layout hẹp. |
| D12 · Thứ Hai 05/10 | Build · 2,4 giờ | MP-09 watchlist có xác thực | Tạo/đổi tên/xóa một danh sách; thêm/bỏ symbol theo user đăng nhập cục bộ. |
| D13 · Thứ Ba 06/10 | Build · 2,4 giờ | MP-10 ranh giới ingestion và replay an toàn | Dùng Python collector → internal ingestion endpoint có xác thực → Node/BullMQ worker. Lưu raw và canonical đã chuẩn hóa; phát lại cùng một delivery không tạo canonical observation trùng. |
| D14 · Thứ Tư 07/10 | Review / buffer · 1 giờ | GATE-3 review luồng chính | Search, detail/chart, VN-Index và watchlist hoạt động local với fixture. Nếu còn lỗi, bỏ hạng mục mở rộng. |

## Tuần 3 — làm demo cục bộ đáng tin cậy

| Ngày / ngày tháng | Loại | Task và sản phẩm bàn giao | Nghiệm thu / phụ thuộc |
|---|---|---|---|
| D15 · Thứ Năm 08/10 | Build · 2,4 giờ | MP-11 tích hợp nguồn đã xác minh hoặc demo suy giảm | Thử hướng Vnstock cho lát cắt EOD/delay chỉ sau khi xác minh upstream, truy cập (và credential nếu đường đó yêu cầu), điều khoản/quyền sử dụng, coverage, đơn vị và ngữ nghĩa thời gian. Nếu chưa đạt, giữ fixture `marketpulse-fixture` và gắn nhãn demo suy giảm; không gọi là MVP có nguồn thật. |
| D16 · Thứ Sáu 09/10 | Build · 2,4 giờ | MP-12 freshness, retry và cache | Ghi provider/as-of/freshness/trạng thái ingestion. Chỉ thêm Redis cache nếu kiểm thử được invalidation và expiry; retry/replay không tạo bản ghi canonical trùng. |
| D17 · Thứ Bảy 10/10 | Build · 2,4 giờ | MP-13 chọn tối đa một hạng mục mở rộng khi qua cổng | Ưu tiên một chuỗi vàng hoặc USD/VND đã xác minh nguồn, đơn vị và quyền. Nếu chưa đạt, thêm timeline thủ công ít sự kiện, có nguồn. Phân tích tác động cần đủ lịch sử ngày; không tuyên bố nhân quả. |
| D18 · Chủ Nhật 11/10 | Review / buffer · 1 giờ | GATE-4 review bằng chứng và phạm vi | Kiểm tra bằng chứng nguồn, hạn chế, nhãn thời gian, replay và câu chữ sự kiện. Bỏ mọi khẳng định chưa có căn cứ. |
| D19 · Thứ Hai 12/10 | Build · 2,4 giờ | MP-14 test và hoàn thiện application CI | Chạy unit test normalization/analytics; API integration với Mongo/Redis cục bộ; test phân quyền phủ định (user B không sửa watchlist user A); test retry/crash không nhân đôi; một E2E bằng fixture: search → chart → add watchlist; typecheck và build. |
| D20 · Thứ Ba 13/10 | Build · 2,4 giờ | MP-15 demo cục bộ và lối xem cho recruiter | Startup local một lệnh, đăng nhập tài khoản seed, tìm mã, mở chart, xem VN-Index và lưu watchlist. README chỉ thêm ảnh khi có ảnh chụp app thật. |
| D21 · Thứ Tư 14/10 | Review / buffer · 1 giờ | GATE-5 quyết định hoàn tất và danh sách sprint sau | Chạy lại startup và CI, ghi khoảng trống, quyết định demo local đã đạt hay chưa. Không production deploy trong 42 giờ này. |

## Cổng nghiệm thu theo tuần

- **Tuần 1:** hiểu nguồn/điều khoản; contract và fixture ổn định; có scaffold và CI không skip.
- **Tuần 2:** search → chart cổ phiếu, thẻ VN-Index và watchlist hoạt động cục bộ.
- **Tuần 3:** freshness và replay thể hiện rõ; CI đáng tin; demo local chạy lại được. Chỉ gọi là demo có nguồn khi quyền, truy cập và coverage được xác nhận thực tế.

## Phạm vi dự phòng

Khi thiếu quyền truy cập hoặc điều khoản, chuyển sang fixture xác định trước, gắn nhãn “fixture / delayed / as of …” trên từng view và báo cáo demo suy giảm. Giữ search cổ phiếu, trang chi tiết, VN-Index, auth và watchlist. Cắt vàng/FX và event trước; không bịa độ phủ hoặc nội suy phiên còn thiếu.

## Rủi ro

| Rủi ro | Dấu hiệu sớm | Ứng phó |
|---|---|---|
| Quyền truy cập/điều khoản provider không rõ | Thiếu credential, tài liệu giới hạn hoặc thiếu coverage Việt Nam | Dùng fixture; ghi hạn chế; không công bố dữ liệu provider khi chưa xác minh quyền. |
| Trường dữ liệu khác nhau giữa provider | Sai tiền tệ, đơn vị, điều chỉnh hoặc phiên | Giữ adapter và normalization tường minh; loại record mơ hồ. |
| Thiếu thời gian | Cổng bị trễ hoặc task cần thêm ngày | Dùng buffer; cắt hạng mục mở rộng; giữ luồng chính và nhãn dữ liệu. |
| Delivery lặp sau retry/crash | Số observation tăng sau replay | Dùng idempotency và unique key ở collection thường; xem projection time-series là dữ liệu có thể dựng lại vì collection này không hỗ trợ unique index. |
| Câu chữ event hàm ý nhân quả | Trang viết “gây ra” hoặc “vì thế” | Viết “biến động liên quan theo thời điểm”, công bố phương pháp và khoảng dữ liệu. |
| Đánh giá thấp topology production | Chưa cấp worker, queue hoặc kết nối mạng | Để deployment sang milestone sau; kiểm tra chi phí và dịch vụ trước khi cam kết. |

## Definition of Done cho kế hoạch này

Kế hoạch ba tuần hoàn thành khi hướng dẫn local tái tạo được demo stock; search/detail/chart/VN-Index/watchlist dùng fixture có nhãn hoặc provider giới hạn đã xác minh; dữ liệu có source/as-of/freshness; replay không nhân đôi canonical observation; test quyền sở hữu âm tính, retry/crash và một luồng E2E cốt lõi đạt; application CI pass. Kết quả này **không** hoàn tất MVP gốc: vàng/FX đầy đủ, dashboard phong phú, heatmap, news/AI, alert, portfolio, compare/correlation, admin monitoring, realtime và production deploy đều còn lại.

## Milestone production sau kế hoạch (chưa nằm trong 42 giờ)

- **Frontend:** Vercel.
- **Database:** MongoDB Atlas; giới hạn network access vào địa chỉ outbound đã xác minh của backend hoặc dùng kết nối private có tài liệu.
- **Backend:** Render web service cho API, background worker cho BullMQ (worker nhận queue, không nhận request trình duyệt), queue store tương thích Redis và scheduled service cho Python collector.
- Trước khi provision, xác minh tương thích dịch vụ, network path, secret, retention, backup/restore, health check, chi phí và giới hạn plan hiện tại. Không giả định free tier đủ năng lực.

Workflow GitHub Pages trong repo này chỉ publish documentation portal, tách khỏi app Vercel trong tương lai.

## Nguồn tham khảo

- [Tài liệu Vnstock](https://vnstocks.com/docs/vnstock) mô tả thư viện dữ liệu cổ phiếu Python và phân biệt phần mềm với quyền dữ liệu nguồn; [macro layer của vnstock_data](https://vnstocks.com/docs/vnstock-data/macro-layer-v3) liệt kê khả năng tỷ giá và vàng/hàng hóa. Các tài liệu này không chứng minh runtime access, coverage hoặc quyền dữ liệu của project.
- [Tổng quan SSI FastConnect API](https://developers.ssi.com.vn/docs/getting-started/overview) là tài liệu tham khảo lịch sử cho phương án đã loại theo quyết định chủ dự án ngày 26/09; đăng ký được đánh giá là không thực tế cho dự án, không phải kết luận chung hay điều kiện hiện tại.
- [Render background worker](https://render.com/docs/background-workers) mô tả worker và cách dùng BullMQ/Key Value. Cần xác minh topology và plan trước production.
- [Giới hạn MongoDB time-series](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-limitations/) không cho phép unique index trên time-series collection.
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) khuyến nghị quyền tối thiểu và pin action reference.


