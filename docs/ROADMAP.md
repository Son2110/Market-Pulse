# Lộ trình MarketPulse VN — cập nhật 20/10/2026

## Kế hoạch mở rộng hiện hành

**Baseline hiện hành · 20/10/2026:** P1.4, A1 và A2 đã merge, mới nhất qua
[PR #37](https://github.com/Son2110/Market-Pulse/pull/37); `main` tại
`f51dbd3958dc0d4db6410d13c2a28085dcb02853` (sau [PR #36](https://github.com/Son2110/Market-Pulse/pull/36) tại `a7206fee2fcfb317c2ee44c6342d3359510eea9e`).
[Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/39106893071)
và [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/39106893021)
trên baseline `f51dbd3` đều thành công. P1.2 contract, P1.3A storage, P1.4 API đọc
synthetic và A2 shared primitives đã nằm trên `main`; P1.4 không có UI. Collector
vàng thật P1.3B, public redisplay và training vẫn đóng. Các dòng “CI còn chờ”,
“P1.4/A3 chưa triển khai” có ngày cũ bên dưới là bằng chứng lịch sử, không là trạng
thái hiện tại; CI baseline trên không tự nghiệm thu nhánh làm việc A3.

### Foundation A1–A4 — thứ tự đã duyệt

Quyết định tại [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md): modular monolith,
một codebase Node với API/worker tách process, Python collector và nghiên cứu
forecast offline. Giữ outbox/reconciliation/revision hiện có, không viết framework
chung hoặc di chuyển hàng loạt thư mục. A1 chỉ bàn giao tài liệu. Review độc lập
GPT-6 Astra ngày 18/10/2026 đã chấp thuận, không có finding, sau đối chiếu code
server/health, ingestion, auth, gold storage, Compose và CI; reviewer chạy lại
docs check (186 local targets), portal build (24 tài liệu) và diff check đều đạt.
Đây là review tài liệu, không phải lần chạy runtime test mới. A1 và A2 đã merge và
CI đạt như baseline ở trên; không dùng CI baseline để nghiệm thu thay đổi A3 mới.

| Thứ tự serial | Task và nhánh | Công sức | Phạm vi và cổng |
|---|---|---|---|
| 1 | A1 · tài liệu kiến trúc · `docs/architecture-foundation` | 3–4 giờ | Baseline so với đề xuất, module/dependency, dataflow, quyền nguồn, compatibility/rollback và ADR; không đổi app. |
| 2 | A2 · ingestion primitives · `feat/fr-18-ingestion-foundation-1` | 4–6 giờ | Tách primitive cần thiết, giữ parity Python/Node, decimal, UTC microsecond, hash/ID và replay; một worker, kiểm tra/review trước task tiếp. |
| 3 | A3 · family dispatch · `feat/fr-18-ingestion-foundation-2` | 5–7 giờ | Phân loại nội bộ payload legacy **đã validate**, không đổi wire/hash/delivery/job ID; derive metadata cũ, chỉ additive nếu cần, không bulk migration. |
| 4 | P2.1 · nghiên cứu nguồn news / quyền theo mục đích | Theo ngân sách P2 hiện có | Chốt feed/field được phép, registry decision cho access/store/redisplay/AI/training và retention; unknown đóng. Research không mở collector. |
| 5 | A4 · dependency health/recovery · `ci/dependency-health-recovery` | 8–12 giờ | Sửa lifecycle Redis có chủ đích, full/capability readiness, outage/recovery và outbox. **Phải xong trước P2.2 hoặc bất kỳ collector tự động nào.** Đọc degraded cần bằng chứng routing; auth limiter hiện ở process, không ở Redis. |
| 6 | P2.2 → P2.3 | Theo ngân sách P2 hiện có | Ingest/dedup/revision news sau cổng quyền và A4; rồi API/UI theo design app hiện có, làm từng task serial. |

Tổng riêng **A1–A4: 20–29 giờ**, cộng **20% buffer: khoảng 24–35 giờ**,
không gồm chờ quyền/review bên ngoài. P2.1/P2.2/P2.3 thuộc **24–36 giờ P2**
trong bảng pha, không cộng lần nữa vào A1–A4. Các ngân sách P1–P6 bên dưới là
baseline kế hoạch trước foundation, không là ước lượng giờ còn lại đã đo lại;
không trừ tùy ý giờ P1 đã làm hay cộng buffer foundation lần hai vào tổng cũ.
Đo lại phần còn lại sau A4 và audit P2.1.

### Ghi nhận có ngày — bằng chứng triển khai và kiểm tra

**A3 family dispatch · 20/10/2026:** nhánh `feat/fr-18-ingestion-foundation-2`
bổ sung phân loại nội bộ tường minh (`fixture-market`, `observed-candle`,
`synthetic-gold`) qua `classifyPayload` tại `ingestion-contract.ts` chỉ sau khi
payload đi qua `validatePayload`, không suy ra family từ `schemaVersion` đơn lẻ và
từ chối mọi trường `family` bơm vào envelope hoặc payload. `ingestion_deliveries`
lưu trường nội bộ tùy chọn `family` (không trả trong `receipt`), suy dẫn và kiểm
tra lại family/provider/`schemaVersion`/dataset/digest khi đọc qua `classifyDelivery`
để các dòng outbox legacy không có `family` vẫn tương thích mà không cần bulk
migration. `IngestionStore.persist` điều phối theo `classified.family` sang
`gold.persist`, `observed.persist` và `persistFixture`; `DeliveryQueue.enqueue` giữ
nguyên `jobId` và tên job BullMQ (`persist-fixture`, `persist-observed`,
`persist-gold`), đồng thời cô lập dòng outbox hỏng/sai contract thành `failure`
(`invalid_contract`) khi reconcile để không chặn các delivery hợp lệ; worker kiểm
tra `classifyDelivery` và khớp tên job trước khi ghi. Handoff Gemini trước đó báo
187 Node unit, 42 integration và các kiểm tra hỗ trợ; đây là bằng chứng worker
lịch sử, tách khỏi lần xác minh Sol mới. Review Astra ban đầu phát hiện enum MongoDB
mới cho `family` tùy chọn chặn cập nhật terminal khi dòng cũ chứa `"unknown"` hoặc
`null`, làm reconcile không tới delivery hợp lệ phía sau. Sol tái hiện lỗi MongoDB
121 rồi bỏ riêng enum mới, giữ strict validator lõi trước A3 và kiểm tra runtime
`classifyDelivery`; metadata hỏng và payload thô được giữ để chẩn đoán, không bypass
validation trong production hay rewrite dữ liệu. Regression mới xác nhận hai dòng
hỏng thành `invalid_contract`, delivery hợp lệ hoàn tất và status lõi sai vẫn bị
MongoDB từ chối; test legacy cả ba family và job mismatch vẫn đạt.
**Xác minh Sol mới · 20/10/2026:** lint/typecheck, 187 Node unit, 43 integration
MongoDB/Redis, API/web build, 44 Python contract, 29 collector tests, hai validators,
Compose config, bốn browser harness tests và hai journeys desktop/mobile đạt,
không skip. Dịch vụ test cô lập
trên loopback 27019/6381 được giữ cho review độc lập; các suite dọn database test.
SHA-256 yêu cầu gốc giữ
`21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`.
**Review độc lập A3 · 20/10/2026:** GPT-6 Astra chấp thuận implementation sau sửa,
không còn finding. Reviewer tự chạy đạt hai focused tests MongoDB/Redis thật,
bao phủ cô lập family hỏng, strict validator lõi, legacy cả ba family, job đã xếp
hàng và tên job sai; diff check đạt. Full suite ở trên vẫn là bằng chứng worker
Sol; CI remote cho A3 còn chờ.

**A2 ingestion primitives · 18/10/2026:** nhánh
`feat/fr-18-ingestion-foundation-1` tách `Json`, `ContractError`, canonical JSON,
SHA-256 và strict parser sang
[platform/contracts/json.ts](../apps/api/src/platform/contracts/json.ts), giữ nguyên
implementation và re-export cùng binding từ `ingestion-contract.ts`. Gold và các
consumer primitive dùng module độc lập; domain validation, family dispatch,
decimal, timestamp, collection và queue semantics giữ nguyên. Trước khi sửa đã
đóng băng literal digest của fixture v1, observed v2, gold v1, queue ID và ba
persisted identity; tests mới khóa các giá trị này, export/error identity cùng
depth boundary, `__proto__` và native string `SyntaxError` hiện có. Local đạt lint,
typecheck, 186 Node unit, 41 integration MongoDB/Redis, API/web build, 44 Python
contract và 29 collector tests, hai validators, Compose config, bốn browser
harness tests và hai Playwright journeys desktop/mobile; không skip. Docs check
đạt 188 local targets, portal build 24 tài liệu và diff check đạt. Dịch vụ test cô
lập dùng loopback 27019/6381, không đổi stack có sẵn; database ngẫu nhiên đã được
dọn. SHA-256 yêu cầu gốc giữ
`21E98449A2A0BAA9B716F6720863A9902EBF605700D9B5229181C9121B2847F8`.
**Review độc lập A2 · 18/10/2026:** GPT-6 Astra chấp thuận, không có finding sau
khi kiểm tra cả 13 file, xác nhận implementation giống hệt khi chuẩn hóa newline
và không có dependency cycle mới. Reviewer chạy độc lập 13 focused tests, gồm ba
test mới, tất cả đạt. Đã merge qua PR #37 với CI remote đạt như baseline ở trên.

**P1.4 stored gold reads · 16/10/2026:** triển khai API-only trên P1.3A đã merge
PR #34; flag `GOLD_READS_ENABLED` mặc định false, hai route latest/history chỉ đọc
synthetic projection đã lưu. Exact series/filter/pagination, decimal/null/provenance,
chi conversion, whitelist/validation và 503 no-store đã có; không gọi provider,
repair/fallback, thay ingestion hoặc thêm UI. History và latest có semantics riêng,
đọc eventual/non-atomic, không suy ra freshness hoặc completeness. Xem
[hợp đồng local](LOCAL_DEVELOPMENT.md#optional-stored-synthetic-gold-read-api).
Local đạt 183 Node unit và 41 integration MongoDB/Redis (5 read mới), không skip;
lint/typecheck/build, 44 Python contract, 29 collector tests, hai validators,
Compose config, 173 docs targets và portal 23 tài liệu đạt. Sau bổ sung null-region
và product isolation, 10 focused checks chạy lại đạt. Bằng chứng local không thay
review/CI; CI remote P1.4 còn chờ. Cổng collector thật P1.3B,
public redisplay/training vẫn đóng; các ghi nhận P1.3A pending bên dưới là lịch sử.

**Review độc lập P1.4 · 16/10/2026:** GPT-6 Astra chấp thuận implementation,
không có finding cần sửa. Reviewer chạy độc lập 14 focused checks, gồm năm
integration MongoDB, tất cả đạt và không skip. Bằng chứng này tách biệt với full
suite của worker ở trên; CI remote vẫn còn chờ. User quản lý tạo PR và merge.

**P1.3A ingestion/storage vàng · 16/10/2026:** đã triển khai validator Node cùng
contract v1, nhận fixture qua internal HTTP có xác thực, outbox/BullMQ worker và
bốn collection MongoDB riêng. Revision giữ nguyên đầy đủ bản ghi đầu tiên; snapshot
và latest dùng thứ tự nguyên tử, phục hồi sau crash và giữ đúng A→B→A.
Kiểm tra local đạt: 177 Node unit, 36 integration MongoDB/Redis (chín gold),
44 Python contract (17 gold), 29 collector tests; hai validators,
lint/typecheck/build và docs checks. Corpus 138 mutation dùng chung Python/Node.
Review GPT-6 Astra đã chạy đạt chín gold integration tests và tìm một lỗi parity
whitespace region. Sau sửa schema/corpus, reviewer kiểm tra độc lập đạt 5 Node gold
tests, 17 Python gold tests với corpus 138 case và chấp thuận, không còn finding.
Worker chạy lại đạt chín gold integration tests sau sửa. CI remote còn chờ;
full-suite counts ở trên thuộc lần kiểm tra trước sửa.
P1.4 read API/UI và collector thật P1.3B chưa triển khai; cổng nguồn thật vẫn đóng.
Xem [ngữ nghĩa lưu trữ và giới hạn](INGESTION.md#synthetic-gold-storage-and-ordering).

**P1.2 contract vàng · 16/10/2026:** đã triển khai schema synthetic-only,
[fixture vàng có nhãn](../fixtures/gold/README.md), validator offline và kiểm thử
Python/Node cho decimal, đơn vị, thời gian và JCS/SHA-256; CI gọi validator tường
minh. Review độc lập GPT-6 Astra ngày 16/10 chấp thuận, không có finding; reviewer
chạy lại 16 gold Python tests, ba Node golden tests và kiểm tra thêm giới hạn
decimal/calendar. Worker đã chạy đầy đủ 175 Node unit, 43 Python contract, 29
collector tests; validators, lint/typecheck/build và docs checks đạt. Review tập
trung không thay cho full suite của worker; CI remote còn chờ trước nghiệm thu.
Phạm vi này không triển
khai collector, ingestion/storage P1.3A, read API P1.4 hoặc UI; cổng nguồn thật
P1.3B vẫn đóng. Quy tắc định danh được làm rõ trong
[thiết kế P1](GOLD_DATA_DESIGN_P1.md#p12-contract-implementation--16102026).

Phần này là kế hoạch ưu tiên hiện hành, thay lịch mục tiêu ba tuần cho công việc tiếp theo. Bản kế hoạch **24/09–14/10/2026, 21 ngày / 42 giờ** và mọi bằng chứng tiến độ bên dưới được giữ làm baseline lịch sử; ngày cũ không phải cam kết hoàn thành phạm vi mới. Xem [PRD mở rộng](PRD.md) và [nghiên cứu nguồn, AI và dự báo](PRODUCT_EXPANSION_RESEARCH.md). Các cập nhật triển khai có ngày ở trên là trạng thái hiện hành; baseline lịch sử bên dưới không tự đánh dấu hoàn tất các hạng mục mở rộng.

**Baseline đã xác minh 13/10:** `origin/main` tại `1fc81a3b2e5e0c663cec8b8985c0435aefd8e3ee`; [PR #28](https://github.com/Son2110/Market-Pulse/pull/28) đã merge lúc 08:05:12 UTC. FR-04 FPT collection-status UI đã nằm trên main, nhưng MP-11/MP-12 và các FR gốc vẫn một phần; source as-of/freshness/completeness và quyền upstream public redisplay/deployment chưa được xác minh. MP-14 còn cần E2E được commit; MP-15 demo tái tạo vẫn cần nghiệm thu. Không suy ra hoàn tất core từ merge một lát cắt.

**P0.1 quyết định giới hạn · 14/10/2026:** baseline triển khai là `main` sau PR #29, commit `8280759`. Nhãn fixture/observed hiện có, FPT collection-status UI và API collection-status cho FPT/VNINDEX đủ để chuyển sang P0.2 kiểm thử core fixture. Không mở thêm VNINDEX status UI hoặc cache trong task này. MP-12 vẫn một phần: source as-of/freshness/completeness thực, quyền upstream, lịch thu thập và quyết định cache/invalidation/expiry còn mở; receipt success không chứng minh dữ liệu fresh. Đây là quyết định phạm vi local, không nghiệm thu nguồn live.

**P0.2 / MP-14 triển khai cục bộ · 14/10/2026:** thêm framework Playwright/Chromium có version cố định và bước bắt buộc trong Application CI; harness tự chạy API/Vite và database ngẫu nhiên có ownership marker, ingestion/observed tắt. Hai luồng desktop 1440px/mobile 320px qua API thật: search FPT → detail SVG ba quan sát/bảng/nhãn nguồn → đăng ký → tạo/thêm FPT watchlist → reload giữ phiên/list → logout ẩn dữ liệu riêng; context B chỉ thấy list riêng trống. Không mock response thành công, seed tài khoản hoặc gọi provider. Local đạt 172 unit, 27 integration MongoDB/Redis, 27 Python contract, 29 collector và hai browser tests, không skip; lint/typecheck/build và docs checks đạt. Hướng dẫn, phạm vi và giới hạn ở [LOCAL_DEVELOPMENT](LOCAL_DEVELOPMENT.md#committed-core-flow-browser-tests-mp-14). MP-14 chỉ được nghiệm thu sau review độc lập và CI trên commit được push; bằng chứng local không thay review/CI. P0 vẫn mở vì MP-15/demo tái tạo và GATE-5 chưa nghiệm thu; không mở P1 trong task này.

**Review độc lập · 14/10/2026:** GPT-6 Astra chấp thuận triển khai sau sửa hai finding về che lỗi cấu hình và dọn process group Linux, không còn blocker. Reviewer tự chạy bốn regression harness Windows và xem bằng chứng sáu regression Linux đạt do worker chạy trong container cô lập; full suite, hai browser journeys và audit cleanup là bằng chứng của worker. Remote CI/full Linux browser còn chờ; chưa nghiệm thu MP-14/P0 từ review này.

**P0.2 / MP-14 nghiệm thu remote · 14/10/2026:** PR #30 đã merge, baseline `main` tại [`dd1ae64e509e67cead2a1c93a607372e1346e62c`](https://github.com/Son2110/Market-Pulse/commit/dd1ae64e509e67cead2a1c93a607372e1346e62c). [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/38507379609) và [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/38507379712) trên đúng SHA đều thành công. Log thực xác nhận 172 unit, 27 integration MongoDB/Redis, sáu harness regression Linux, hai Chromium journeys, 27 Python contract và 29 collector tests; lint/typecheck/build, Compose/HTTP smoke và replay 1 raw/11 assets/44 observations đạt. Không bỏ qua check bắt buộc; screenshot/log khi lỗi không chạy do job thành công. MP-14 được nghiệm thu trên baseline này; những câu remote/Linux còn chờ ở ghi nhận trước là lịch sử.

**P0.3 / MP-15 và GATE-5 · 14/10/2026:** **GATE-5 PASS — reproducible local fixture core demo / P0 closure.** Worker tạo Compose project/volumes mới cách ly, dùng `.env.example`, ingestion tắt/observed false và cổng loopback riêng; năm service healthy. Browser API thật thử FPT search/chart, VN-Index, đăng ký/tạo list/thêm FPT/reload/logout; stop/start không xóa volume rồi login giữ nguyên account/list/FPT. Desktop/320px không tràn ngang, nhãn fixture/VND/index_point/as-of/UTC+7/unknown còn rõ. [GATE_5_REVIEW](GATE_5_REVIEW.md) tách evidence worker và CI baseline; GPT-6 Astra đã chấp thuận review độc lập nhánh tài liệu ngày 14/10, không có finding, không chạy lại browser/restart. CI nhánh tài liệu chưa chạy. Không sửa app, seed, dependency hay runtime config. P0 đóng trong phạm vi core fixture local, không hoàn tất MP-11/12 hoặc FR gốc, nguồn live hay production. Kế tiếp chỉ mở task riêng **P1.1 audit một nhà niêm yết vàng có SJC và nhẫn trơn 9999** sau review/merge tài liệu này.

**P1 Nghiên cứu và Thiết kế tổng thể dữ liệu vàng (P1.1–P1.4) · 15/10/2026:** hoàn tất toàn bộ tài liệu nghiên cứu và thiết kế kỹ thuật cho phase P1 (chưa viết code implementation; cổng live source chưa mở). Khảo sát mở rộng so sánh 3 ứng viên niêm yết (PNJ, SJC, DOJI): cả 3 nguồn đều cung cấp vàng miếng SJC và nhẫn trơn 9999. Về mặt kỹ thuật, SJC là ứng viên ưu tiên số 1 (backend có `latestDate` rõ ràng, phân tách 12 chi nhánh cụ thể; nhưng `robots.txt` cấm AI input/training), PNJ là nguồn dự phòng số 2 (đơn vị 1.000 VND/chỉ, nhưng timestamp `#time-now` rỗng và chọn zone không đổi giá), DOJI xếp sau do backend mã hóa Base64 payload. Cả 3 nguồn đều chưa vượt qua Live Source Gate: toàn bộ quyền sử dụng từ nguồn là `unknown` hoặc bị hạn chế; dự án chủ động tạm chặn collector thật, public redisplay và training để phòng ngừa rủi ro. Đã hoàn tất đặc tả kiến trúc P1.2–P1.4 tại [Thiết kế dữ liệu vàng P1](GOLD_DATA_DESIGN_P1.md) và [báo cáo khảo sát nguồn vàng](GOLD_SOURCE_AUDIT.md).

**Làm rõ kế hoạch MP-15 · 14/10/2026:** dòng lịch sử D20 nói tài khoản seed; implementation không có seed account/command. Demo lần đầu đăng ký trên UI rồi đăng nhập lại bằng account đã tạo; không có credential dùng chung. README/LOCAL ghi đúng đường này, không thêm helper hay sửa yêu cầu gốc.

**Nhịp và ước lượng:** giả định một người làm **5 ngày/tuần × 2–3 giờ = 10–15 giờ/tuần**, một worker, các task nối tiếp. Sau nghiệm thu core fixture P0 ở trên, công sức kế hoạch còn lại cho P1–P6 là **174–266 giờ** triển khai và kiểm tra thông thường; cộng **25% buffer** cho review độc lập, sửa finding và dao động nhỏ thành khoảng **218–333 giờ**, tương đương **15–34 tuần công sức**. Đây chỉ là phép trừ ước lượng P0 cũ 24–36 giờ khỏi tổng trước cổng 198–302 giờ, không là đo năng suất mới hoặc deadline. Chờ quyền dữ liệu, mua/thu thập lịch sử, credential và shadow observation không nằm trong phép tính; shadow 8–12 tuần có thể kéo dài thời gian lịch. Đo lại sau mỗi cổng, không dùng 42 giờ cũ cho phạm vi mới.

| Pha / ưu tiên | Công sức | Các task nhỏ làm serial | Cổng bàn giao và phụ thuộc |
|---|---|---|---|
| P0 · Core local — đã qua GATE-5 trong scope fixture | Ước lượng trước gate: 24–36 giờ; không cộng vào phần còn lại | P0.1 giới hạn MP-12; P0.2 MP-14 E2E fixture và CI; P0.3 MP-15 startup/demo, GATE-5 | Core fixture có bằng chứng trên; review độc lập/CI nhánh tài liệu là bước riêng. MP-11/12 và nguồn live vẫn một phần/chưa xác minh. Không bắt buộc cache nếu chưa có nhu cầu và kiểm tra invalidation/expiry. |
| P1 · Bắt buộc — dữ liệu vàng Việt Nam | 32–48 giờ (trong đó 16–24 giờ cho P1.2–P1.4 kỹ thuật local) | P1.1 nghiên cứu & khảo sát 3 nguồn; P1.2 contract + synthetic fixture; P1.3A ingestion pipeline & storage MongoDB; P1.4 API đọc dữ liệu đã lưu; P1.3B collector nguồn thật (có điều kiện mở lại) | Sau P0. Nghiên cứu & thiết kế P1.1–P1.4 hoàn tất tại [Thiết kế dữ liệu vàng P1](GOLD_DATA_DESIGN_P1.md). Cổng live source vẫn **TẠM CHẶN**; các task kỹ thuật P1.2–P1.4 thực hiện trên synthetic fixture có nhãn; collector thật P1.3B chỉ mở khi có văn bản thỏa thuận cấp phép. |

| P2 · Bắt buộc — news FR-07 | 24–36 giờ; không gồm A1–A4 | P2.1 quyền một RSS/feed tiếng Việt và link chính thức tuyển chọn; P2.2 ingest/dedup/revision; P2.3 danh sách + lọc vàng/FX/cổ phiếu | Sau lát cắt synthetic P1, theo thứ tự foundation ở trên: P2.1 research sau A3; P2.2 chỉ sau A4 và cổng quyền. Có title, canonical URL, publisher, publishedAt, collectedAt, language; lỗi/thiếu tin/stale minh bạch. Không giả định RSS cho phép toàn văn hoặc AI processing. |
| P3 · Bắt buộc — AI FR-08 và market brief | 32–48 giờ | P3.1 entity/category; P3.2 summary có citation; P3.3 brief ghép dữ liệu đo được với tin; P3.4 đánh giá held-out, budget/fallback | Sau P2 và dữ liệu định danh P1. Phân tách sự thật có nguồn, số liệu tính bằng code và diễn giải. Gate AI theo PRD/nghiên cứu; event do AI đề xuất phải duyệt. Fallback về tin gốc khi thiếu bằng chứng/lỗi model/hết budget. |
| P4 · Bắt buộc — dashboard vàng và events | 28–44 giờ | P4.1 giá mua/bán/spread/history; P4.2 FR-09/10 timeline/detail có nguồn; P4.3 FR-11 chỉ khi đủ lịch sử | Sau P3. SJC và nhẫn là hai sản phẩm riêng; gap/stale/unknown không bị che. Phản ứng quanh event có cửa sổ và số quan sát; không tuyên bố nhân quả. Thiếu lịch sử thì chỉ hiển thị event và dữ liệu mô tả. |
| P5 · Bắt buộc nghiên cứu — dự báo vàng | 40–60 giờ | P5.1 khóa target/horizon/ngưỡng và audit quyền/lịch sử; P5.2 baseline + walk-forward; P5.3 holdout/calibration; P5.4 shadow + báo cáo go/no-go | Sau P4, lịch sử đủ điều kiện và quyền training. Luôn bàn giao báo cáo, kể cả không có edge. Xác suất trong app chỉ mở sau gate nghiên cứu; chưa đạt thì duy trì descriptive dashboard. Không dùng LLM làm oracle giá. |
| P6 · Bắt buộc — local v2; pilot tùy chọn | 18–30 giờ | P6.1 E2E news/gold/AI citation và kiểm tra budget; P6.2 tài liệu/demo local v2; P6.3 audit khả năng pilot | Sau P5 có quyết định và P0–P4 đạt. Local v2 có thể hoàn tất với kết luận dự báo chưa đủ bằng chứng. Pilot/production cần cổng riêng về quyền public, secrets, chi phí, backup/restore, network và vận hành; không mặc nhiên deploy. |

P1 chỉ bắt đầu lưu quan sát thực khi cổng quyền, contract **và A4 dependency health/recovery** đạt; collector đã nghiệm thu có thể tự tích lũy dữ liệu khi người phát triển làm các pha sau. Đây là vận hành thu thập tự động, không là triển khai song song hoặc cho phép bỏ qua review. Không đảm bảo lịch sử thu mới sẽ đủ cho P5; thử khả năng mua/nhận lịch sử có quyền ngay ở P1.

### Phạm vi cam kết và tiêu chí dừng

News tiếng Việt, AI phân tích có nguồn và vàng **SJC + nhẫn trơn 9999** là các pha tương lai đã đưa vào kế hoạch, không còn là hạng mục hoãn vô thời hạn. “Bắt buộc” là cam kết bàn giao lát cắt và bằng chứng của pha, không cam kết nguồn sẽ cấp quyền hoặc mô hình sẽ dự báo tốt. Mỗi pha có thể tách thành PR nhỏ serial theo FR hiện có; P0–P6 là nhãn kế hoạch, không là FR mới hoặc tuyên bố hoàn tất FR gốc. Giữ quy trình branch/review/push và PR/merge do user quản lý trong [CODEX_WORKFLOW.md](CODEX_WORKFLOW.md).

- Nếu quyền/nguồn vàng chưa đạt: bàn giao audit + fixture có nhãn, chặn dữ liệu public và forecast; có thể chuyển sang P2 bằng task serial riêng, không gọi P1 đạt nguồn thật.
- Nếu news chỉ cho phép metadata: hiển thị metadata/link trong quyền cho phép; chỉ chạy AI trên nội dung được phép. Chặn summary/brief không có bằng chứng thay vì bịa nội dung.
- Nếu AI gate chưa đạt: giữ tin gốc và dữ liệu deterministic, sửa lỗi rồi đánh giá lại trên tập độc lập; event chưa duyệt không public.
- Nếu lịch sử/coverage/quyền training, chống leakage hoặc edge/calibration chưa đạt: P5 trả **insufficient evidence** và điều kiện mở lại; không đưa xác suất vào app. Thời gian shadow một mình không đủ.

### Mở rộng kế tiếp — xếp theo giá trị và phụ thuộc

| Thứ tự | Mức | Hạng mục | Điều kiện mở task |
|---|---|---|---|
| 1 | Bắt buộc xuyên pha | Source-quality FR-17/18: nguồn, lần thành công, gap/revision/freshness | Đưa phần cần thiết vào P1–P4; dashboard admin rộng vẫn tách task. Receipt success không chứng minh nguồn fresh. |
| 2 | Kế tiếp | FR-14 alert ngưỡng giá/spread trong app | Sau P4; dedup/cooldown, chặn alert stale/unknown, không tự gửi email/Telegram. |
| 3 | Kế tiếp | Lịch sự kiện và related news FR-09/10 phong phú hơn | Sau lát cắt P4; nguồn/ngày/timezone và human review rõ. |
| 4 | Kế tiếp | Chênh lệch vàng nội địa với tham chiếu thế giới | Chỉ sau xác minh quyền XAU/FX, timestamp, đơn vị và độ tinh khiết tương thích; không gọi là arbitrage. |
| 5 | Kế tiếp | Trợ lý nghiên cứu có citation | Sau AI gate; truy xuất nguồn được phép, abstain và không tư vấn giao dịch. |
| 6 | Sau đó | Compare/correlation FR-16/12 | Dùng returns, overlap/timezone/số quan sát; không đồng nhất tương quan với nhân quả. |
| 7 | Sau đó | Rule anomaly FR-13; portfolio FR-15, heatmap và realtime | Anomaly sau coverage/threshold validation; các mục còn lại sau quyền và độ phủ phù hợp. Không mở cùng lúc để tránh phình scope. |

## Baseline lịch sử — demo local trong ba tuần

Các đoạn dưới đây giữ mục tiêu, lịch và trạng thái tại ngày ghi nhận. Những câu “hoãn”, “chỉ MP-13” hoặc “kế tiếp qua Stitch” mô tả baseline cũ; công việc mới theo phần hiện hành ở trên và quy trình frontend 12/10. Không xóa hoặc suy diễn lại bằng chứng cũ.

**MP-12 / FR-04 FPT collection-status UI · 13/10/2026:** đã thêm card FPT observed riêng theo UI hiện có, không tạo Stitch. Đọc collection-status no-store/timeout/abort; loading/empty/error/retry độc lập history, retry chỉ status. Sáu bucket đếm quan sát cùng ranges/collected timestamp thuộc lần đọc status; non-atomic/read riêng có thể khác history, unknown không failure và success không xác nhận freshness/provider health/coverage. Không backend/VNINDEX status UI/cache/scheduler/provider call. [Bàn giao FR-04](FR04_DETAIL_DESIGN.md#mp-12--fr-04--trạng-thái-thu-thập-fpt--13102026) ghi checks/QA; coordinator review/push/CI riêng, user tạo/merge PR. Ghi nhận API-only bên dưới là lịch sử; MP-12 vẫn một phần và quyền upstream redisplay/deployment còn mở.

**Khoảng thời gian:** 24/09–14/10/2026, đúng 21 ngày lịch (D1–D21).  
**Năng lực:** một người, mỗi ngày triển khai 2–3 giờ và mỗi ngày review/buffer 1 giờ. Ước lượng cơ sở: 15 × 2,4 giờ + 6 × 1 giờ = **42 giờ**. Có thể dời ngày; nếu lịch thay đổi, giữ thứ tự ngày và các cổng nghiệm thu.

Đây là kế hoạch cho một demo portfolio nhỏ, không phải hoàn tất MVP gốc. Xem giới hạn từng FR trong [PRD.md](PRD.md).

**Ưu tiên MP-11 · 06/10/2026:** chủ dự án mở lại tích hợp Vnstock làm luồng chính trước MP-12. Lát cắt FR-18 đầu có adapter KBS opt-in cho FPT/VNINDEX, contract candle observed v2 riêng và hai probe cuối trả bảy candle đã kiểm tra mỗi mã. Public app vẫn dùng fixture; freshness/as-of/adjustment và quyền public redisplay/deployment còn chưa xác minh. Tiếp theo: ingestion observed có isolation/revision/replay → stored public reads → UI từng trang qua Stitch, serial và review từng lát cắt. Chưa bắt đầu MP-12. Xem [bàn giao adapter](VNSTOCK_ADAPTER.md); ghi nhận “MP-11 chưa bắt đầu” trong gate dưới đây là trạng thái lịch sử trước lát cắt này.

## Nhịp thực hiện

**MP-12 / FR-18 collection status · 13/10/2026:** lát cắt đầu MP-12 có API-only `collection-status` cho FPT/VNINDEX, cùng flag observed mặc định false và hai ngày inclusive chênh lệch tối đa 31 ngày. Đọc latest đã validate như history, đếm candle theo receipt accepted/queued/running/success/failure/unknown và trả khoảng collectedAt gốc theo UTC microsecond. Đây là trạng thái ingestion cục bộ tại lúc đọc không atomic; source as-of null, freshness/completeness unknown, lịch phiên chưa xác minh. Empty là không có bar đã lưu, không khẳng định provider no-data. Không thêm UI/cache/scheduler/retry hay gọi provider; MP-12/FR-18 vẫn một phần và quyền upstream redisplay/deployment còn mở. Hợp đồng ở [LOCAL_DEVELOPMENT](LOCAL_DEVELOPMENT.md#optional-stored-observed-collection-status-api); các ghi nhận MP-12 chưa bắt đầu trước ngày này là lịch sử. Review GPT-6 Astra độc lập ngày 13/10 chấp thuận cả mười file, không có finding; reviewer chạy mười test focused, kiểm tra diff/hash và log 27 integration pass. Bằng chứng full checks thuộc worker ở INGESTION; remote CI còn chờ.

**MP-11 / FR-02 observed UI · 11/10/2026:** `/market` có lựa chọn KBS đã lưu theo Stitch project `16706610509511522903`, screen `36be3fc08c1d4f88834401ec4cc4779d`; fixture và phép tính mặc định giữ nguyên. Opt-in URL yêu cầu một source cùng hai ngày inclusive, chênh lệch tối đa 31 ngày. Mức đóng cửa là decimal string chính xác, currency null/đơn vị điểm chỉ số, adjustment không áp dụng; không tính change/return vì lịch phiên chưa xác minh và tập dữ liệu chưa được xác nhận đồng nhất. Source as-of/freshness/completeness chưa xác định, collectedAt giữ múi giờ gốc. Không gọi provider, bật backend flag hay fallback fixture; FPT guard giữ riêng. Kiểm tra/browser QA/review ghi riêng trong [bàn giao FR-02](FR02_OVERVIEW_DESIGN.md#mp-11--fr-02--dữ-liệu-vn-index-đã-lưu--11102026). MP-11/FR-02 vẫn một phần, MP-12 chưa bắt đầu và quyền upstream public redisplay/deployment chưa xác minh. Các ghi nhận trước ngày này là lịch sử.

**MP-11 / FR-04 observed UI · 10/10/2026:** trang FPT đã có lựa chọn dữ liệu KBS đã lưu theo thiết kế Stitch project `16706610509511522903`, screen `4dd2d180b5fb4bf284f9c8907ba05ef4`. Opt-in URL yêu cầu `source=observed` và hai ngày inclusive hợp lệ, chênh lệch tối đa 31 ngày; fixture vẫn mặc định. Decimal price giữ chính xác, chart xấp xỉ có gap, không tính change/return hay bịa volume; source as-of/freshness/adjustment/completeness unknown và calendar chưa xác minh. Không tự bật backend flag, không gọi provider hoặc fallback fixture khi observed lỗi. Bằng chứng checks/browser/review được ghi riêng trong [bàn giao FR-04](FR04_DETAIL_DESIGN.md#mp-11--fr-04--dữ-liệu-fpt-đã-lưu--10102026). MP-11 vẫn một phần, MP-12 chưa bắt đầu; chưa mở UI observed cho trang khác hoặc xác minh quyền upstream public redisplay/deployment. Ghi nhận “web giữ nguyên/UI kế tiếp” ngày 08/10 bên dưới là lịch sử trước lát cắt này.

**MP-11 / FR-04 stored reads · 08/10/2026:** đã có API local opt-in riêng cho FPT/VNINDEX từ `observed_assets`/`observed_candles_latest`, mặc định tắt bằng `OBSERVED_READS_ENABLED=false`. Query yêu cầu hai mốc ngày inclusive, chênh lệch tối đa 31 ngày; giữ decimal string/null/provenance, không gọi provider hay cần ingestion secret. Per-bar latest chỉ là collection tuple, có thể trộn delivery hoặc row partial/failure; completeness/source as-of/freshness vẫn unknown, calendar chưa xác minh. Existing fixture routes/web giữ nguyên. Hợp đồng và giới hạn ở [LOCAL_DEVELOPMENT](LOCAL_DEVELOPMENT.md#optional-stored-observed-history-api); review độc lập/push/CI là bằng chứng riêng. Kế tiếp là UI từng trang qua Stitch sau khi task này hoàn tất kiểm tra/review; MP-11 chưa hoàn tất, MP-12 chưa bắt đầu, quyền upstream public redisplay/deployment chưa xác minh.

Chỉ triển khai một task tại một thời điểm với một worker. Hoàn tất code, kiểm tra và review độc lập cho task hiện tại trước khi bắt đầu task kế tiếp. Không chạy song song các dòng trong bảng.

**Quy trình frontend · 12/10/2026:** từ ngày này, tạo hoặc điều chỉnh từng trang theo thiết kế app hiện có; không tạo thiết kế Stitch mới. Trước triển khai, xem route, component dùng chung, styles và các bàn giao trang trước; bàn giao task ghi các tham chiếu hiện có cùng thay đổi dự kiến để giữ nhất quán với design system. Kiểm tra responsive, loading, empty, error, retry, điều hướng bàn phím, focus và nhãn truy cập. Hoàn tất triển khai, kiểm tra và review một trang với một worker rồi mới làm trang kế tiếp, theo [CODEX_WORKFLOW.md](CODEX_WORKFLOW.md). Skill frontend chỉ là hỗ trợ tùy chọn, không phải điều kiện bắt đầu. Quy trình này thay yêu cầu Stitch cho công việc tiếp theo; các project/screen và bằng chứng Stitch ghi trước ngày này giữ nguyên như lịch sử, không thay tiến độ MP hay các cổng nghiệm thu.

### GATE-3 review luồng chính · 06/10/2026 (thực hiện trước D14 · 07/10)

**PASS cho luồng local bằng fixture:** search theo mã/tên → detail/chart, VN-Index và watchlist có xác thực. Baseline là `main` sau PR #19, [commit `b996e3e`](https://github.com/Son2110/Market-Pulse/commit/b996e3e3e70ffbacf13fb8d319a182303d05dfc9); [Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/37275919994) và [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/37275920075) thành công trên đúng commit đó. Log xác nhận 131 unit tests, 17 integration tests MongoDB/Redis, 24 Python contract tests và sáu collector tests; không skip check bắt buộc. Đây là bằng chứng CI đã có, không chạy lại full suite trong task tài liệu này.

Worker rebuild Compose từ baseline, cả năm service healthy, health/route/proxy HTTP smoke đạt. Browser Edge/Playwright tạm dùng API thật kiểm tra đăng ký/đăng nhập/reload `/me`, search FPT theo mã/tên → chart → reload → quay lại giữ query, VNINDEX 1.308 điểm và −2 (−0,15%), create/add/link/reload/rename/remove/delete/recreate/logout watchlist và tài khoản B chỉ thấy dữ liệu riêng. Năm trang ở 1440/390/320px (15 view) không overflow trang hay pageerror. Mock response tạm kiểm tra loading/history empty/503/retry và lỗi một row không ảnh hưởng row còn lại; ghi tách khỏi API thật. Coordinator xem trực tiếp ảnh market 320px/detail 390px/watchlist 390px, không có finding về layout/nhãn. Tài khoản QA được xóa theo email/user ID chính xác và đọc lại xác nhận không còn record của chúng.

Chi tiết baseline, API thật, mock, ảnh local và giới hạn ở [GATE_3_REVIEW.md](GATE_3_REVIEW.md). Không phát hiện bug cần sửa code trong phạm vi gate. Public reads vẫn dùng fixture đóng gói; nguồn live **NOT VERIFIED**, các FR gốc vẫn một phần, chưa có E2E được commit. MP-10 đã merge; **MP-11 chưa bắt đầu**, là task serial riêng kế tiếp sau review/merge bản ghi gate này. Các đoạn tiến độ bên dưới giữ lịch sử tại ngày ghi nhận; PASS này không hoàn tất MVP hay nghiệm thu production.

## Tuần 1 — dựng nền tảng cục bộ an toàn

### Tiến độ ghi nhận · MP-10 / FR-18 · 05/10/2026

Lát cắt fixture ingestion có internal API xác thực bearer trước parse, SHA-256/RFC 8785 và full schema/cross-record validation; raw receipt bền vững trước 202, BullMQ worker riêng và MongoDB uniqueness/digest confirmation bảo vệ replay/crash. Raw outbox reconcile sau enqueue lỗi hoặc restart; conflict không ghi đè và các row hợp lệ trước lỗi vẫn tồn tại vì batch không atomic. Public read adapter giữ fixture đóng gói; chưa có time-series projection, nguồn live, cache, admin UI hoặc deployment.

131 unit tests và 17 integration tests thật MongoDB/Redis (tám scenario ingestion mới) đạt, không fail/skip. Python/Node dùng chung negative corpus; fault harness kill worker sau write thứ 12 và sau Mongo success trước queue completion đều giữ canonical không trùng. Test API startup thật xác nhận ingestion initialization lỗi thì thoát mã 1 để restart, sửa database/relaunch thì ready, thiếu secret vẫn dùng public API và internal trả 503. Coordinator Docker QA thấy năm service healthy, hai lần submit cùng fixture trả success/cùng digest và totals 1 raw / 11 assets / 44 observations; dừng worker rồi submit ID riêng trả queued, restart phục hồi success, totals canonical vẫn 11/44. Hai raw demo receipts được giữ làm audit. Chi tiết và giới hạn ở [INGESTION.md](INGESTION.md).

Review GPT-6 Astra độc lập cuối ngày **05/10/2026** đã chấp thuận push branch, không còn finding cần sửa sau khi P2 ingestion initialization được sửa và có regression API startup thật. Reviewer kiểm tra production code/collector/tests/CI/Compose/docs và diff check đạt; không chạy lại tests. Coordinator rebuild Docker API/worker/web sau sửa startup, xác nhận năm service healthy và collector replay success với counts 11/44. Ghi nhận cập nhật **06/10/2026:** MP-10 đã merge qua PR #19, CI trên `main` thành công và GATE-3 fixture PASS theo bản ghi ở trên; FR-18 gốc vẫn **một phần**, nguồn live **NOT VERIFIED**. Các đoạn lịch sử bên dưới mô tả thời điểm trước MP-10.

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

### Tiến độ ghi nhận · FR-06 web / MP-09 · 05/10/2026

Trang `/watchlists` và `/watchlists/` dùng Stitch project `16706610509511522903`, screen `397463272a4642d7b9690e4df8bd6935` và shared design system `assets/18357777504117637773`. Một danh sách theo user đã có create/rename/delete, tìm/thêm/bỏ mười equity canonical và từng row giá đóng cửa/thay đổi từ API history fixture. Xác minh `/me` trước đọc dữ liệu riêng; input/response validation, khóa một write, reconciliation GET sau write chưa xác nhận và token/owner/generation guards bảo vệ expiry/logout/identity change/late callbacks. Thời điểm sửa danh sách được tách khỏi market as-of; mỗi row giữ nguồn, VND, UTC+7, unknown freshness, lịch phiên chưa xác minh và adjustment basis.

Worker kiểm tra 127 unit tests (56 API + 71 web) và chín integration tests MongoDB/Redis, không fail/skip; build, fixture validator, 24 Python contract tests và hai collector tests đạt. Coordinator QA browser/API thật hai tài khoản và vòng create/rename/add/remove/reload/isolation/delete/recreate/logout; 1440/768/390/320px không overflow/page error. QA response mock riêng kiểm tra row error/retry, zero/single observation, ambiguous write/read failure, 401 và expiry. Browser Back thật đổi tài khoản và persisted pageshow mô phỏng được ghi tách trong [bàn giao watchlist](FR06_WATCHLIST_DESIGN.md), cùng keyboard/nav checks; không có E2E framework mới được commit.

Review GPT-6 Astra độc lập ngày **05/10/2026** đã chấp thuận lát cắt frontend MP-09, không có finding cần sửa. Reviewer kiểm tra code/tests/docs, diff và hash yêu cầu gốc; không chạy lại full suite/browser. Bằng chứng runtime ở trên thuộc worker/coordinator; actual BFCache chưa được xác minh, tách khỏi browser Back thật và persisted pageshow mô phỏng.

Lát cắt chức năng MP-09 đã có code, fixture QA và review độc lập; GitHub CI và GATE-3 còn chờ. FR-06 gốc vẫn **một phần**, nguồn live **NOT VERIFIED**. Những đoạn API/account trước đó là lịch sử tại ngày ghi nhận; không mở MP-10 trong task này.

| Ngày / ngày tháng | Loại | Task và sản phẩm bàn giao | Nghiệm thu / phụ thuộc |
|---|---|---|---|
| D8 · Thứ Năm 01/10 | Build · 2,4 giờ | MP-06 tìm kiếm mã và tên công ty | Tìm trong tập mã đã seed/ingest, trả symbol ổn định và mở trang chi tiết. Phụ thuộc MP-02. |
| D9 · Thứ Sáu 02/10 | Build · 2,4 giờ | MP-07 trang chi tiết và biểu đồ ngày | Hiện định danh, OHLCV ngày mới nhất và chart lịch sử cho một mã; thể hiện tiền tệ, stale và dữ liệu thiếu. |
| D10 · Thứ Bảy 03/10 | Build · 2,4 giờ | MP-08 tổng quan VN-Index cơ bản | Hiện quan sát VN-Index mới nhất và thay đổi, kèm timestamp. Không đưa ra breadth hay thanh khoản tổng chưa hỗ trợ. |
| D11 · Chủ Nhật 04/10 | Review / buffer · 1 giờ | Review UX và chất lượng dữ liệu | Thử search → detail → chart và overview bằng fixture; kiểm tra timezone, đơn vị, trạng thái trống/lỗi và layout hẹp. |
| D12 · Thứ Hai 05/10 | Build · 2,4 giờ | MP-09 watchlist có xác thực | Tạo/đổi tên/xóa một danh sách; thêm/bỏ symbol theo user đăng nhập cục bộ; giá/thay đổi mới nhất có nhãn nguồn/thời điểm. Astra chấp thuận review độc lập 05/10/2026; CI trên baseline `main` đạt và GATE-3 fixture PASS ngày 06/10. FR-06 gốc vẫn một phần. |
| D13 · Thứ Ba 06/10 | Build · 2,4 giờ | MP-10 ranh giới ingestion và replay an toàn | Dùng Python collector → internal ingestion endpoint có xác thực → Node/BullMQ worker. Lưu raw và canonical đã chuẩn hóa; phát lại cùng một delivery không tạo canonical observation trùng. |
| D14 · Thứ Tư 07/10 | Review / buffer · 1 giờ | GATE-3 review luồng chính | **PASS sớm ngày 06/10:** search, detail/chart, VN-Index và watchlist hoạt động local với fixture. Xem [bằng chứng và giới hạn](GATE_3_REVIEW.md); không nghiệm thu nguồn live hay hoàn tất MVP. |

## Tuần 3 — làm demo cục bộ đáng tin cậy

| Ngày / ngày tháng | Loại | Task và sản phẩm bàn giao | Nghiệm thu / phụ thuộc |
|---|---|---|---|
| D15 · Thứ Năm 08/10 | Build · 2,4 giờ | MP-11 tích hợp Vnstock serial, giữ fixture mặc định | Đã mở lại ngày 06/10 với adapter observed v2 cục bộ FPT/VNINDEX; ingestion isolation/revision/replay/latest projection có từ 07/10 và stored reads opt-in từ 08/10. Cập nhật 10/10: FR-04 FPT có UI observed opt-in qua Stitch, giữ decimal string và metadata unknown; unit/build/docs local đạt, browser QA/review cuối ghi riêng trong bàn giao FR-04. Giữ fixture mặc định, không fallback khi observed lỗi; backend reads mặc định tắt. MP-11 vẫn một phần; cập nhật 11/10: FR-02 tổng quan VNINDEX có UI observed opt-in, MP-12 chưa bắt đầu, quyền public redisplay/deployment upstream còn mở. Không gọi là MVP nguồn live đã xác minh. |
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


