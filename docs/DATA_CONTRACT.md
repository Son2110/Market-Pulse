# Hợp đồng dữ liệu thị trường v1

## Observed candle subset v2 · 06/10/2026

Adapter opt-in Vnstock/KBS đã có [schema candle riêng v2](../packages/schemas/observed-candles-v2.schema.json) và validator Python offline cho FPT/VNINDEX. Giá là decimal string VND/điểm chỉ số; equity adjustment `unknown`, `sourceAsOf: null`, `collectedAt` UTC thực tế và nguyên nhãn thời gian naive của provider cùng provenance. Freshness `unknown`, lịch phiên `unverified`, volume null. `barId`/`contentDigest` ổn định qua refetch, tách thời điểm lấy dữ liệu. Schema/validator fixture v1 bên dưới giữ nguyên, không được nới hay đổi nhãn để nhận v2. API ingestion/public read hiện tại không nhận contract này. Xem [ngữ nghĩa, kiểm tra, probe và giới hạn](VNSTOCK_ADAPTER.md).

## MP-10 persisted fixture boundary

Authenticated internal delivery submission now stores the full bounded fixture raw payload and canonical assets/observations with immutable identity/digest confirmation. SHA-256 uses RFC 8785 canonical JSON; duplicate keys, unsafe integers and invalid encoding are rejected before storage. Same delivery ID/content replays safely; changed content returns 409. Canonical uniqueness is enforced by `_id` on ordinary collections. Individual writes are atomic; the batch is not atomic, so valid prior rows remain after conflict/crash. Public APIs still read the packaged fixture. See [the ingestion contract, indexes and recovery handoff](INGESTION.md) for limits, identity tuples, counts, source/time semantics and actual validation evidence. Live sources remain **NOT VERIFIED**.

Hợp đồng JSON Schema tại [`packages/schemas/market-data-v1.schema.json`](../packages/schemas/market-data-v1.schema.json) định nghĩa envelope canonical dùng chung cho adapter Python, TypeScript hoặc ngôn ngữ khác. Schema dùng JSON Schema Draft 2020-12, phiên bản `1.0.0`, và chỉ tham chiếu `$defs` nội bộ nên kiểm tra được offline. Validator v1 hiện chỉ chấp nhận fixture tổng hợp; adapter observed cục bộ dùng subset v2 riêng nêu trên.

Fixture nhỏ nằm tại [`fixtures/market/mp-02-synthetic.json`](../fixtures/market/mp-02-synthetic.json). Toàn bộ giá và volume do project tự tạo, issuer chỉ được ghi bằng symbol. Ba ngày `2026-09-21` đến `2026-09-23` là ngày phiên được chọn để thử nghiệm, chưa xác minh lịch giao dịch Việt Nam. Không dùng fixture làm giá thật, bằng chứng freshness hay kết quả provider.

## API đọc candle ngày

`GET /api/assets/:symbol/history` trả envelope canonical v1 gồm đúng asset đã chọn và các candle ngày còn trong fixture, giữ nguyên từng record cùng provenance. Route công khai không cần bearer token vì nội dung chỉ là fixture tổng hợp. `interval` mặc định là `1d`; `from` và `to` là ngày ISO lịch Việt Nam hợp lệ, inclusive. Query trùng, nested, lạ, ngày sai hoặc interval khác trả 400; symbol không có trong fixture trả 404. Asset đã biết nhưng range không có candle trả 200 với `status: no_data`, mảng candle rỗng và `asOf: null`.

`meta.availableRange` mô tả toàn bộ chuỗi fixture; `meta.asOf` là timestamp gốc của candle mới nhất thực sự trả về. Filter lịch sử không được dùng timestamp của candle mới hơn. Response luôn giữ `SYNTHETIC FIXTURE — NOT MARKET DATA`, `fixture / unknown`, `sessionCalendar: unverified`, currency/unit, index volume `null` và timestamp nguyên bản. Ngày thiếu vẫn thiếu; API không nội suy hoặc tuyên bố bao phủ lịch phiên. API đặt `Cache-Control: no-store` trong lát cắt này.

## API tìm kiếm cổ phiếu

`GET /api/assets/search?q=...` là endpoint công khai, chỉ tìm trong đúng mười equity của fixture đã join với catalog tham chiếu theo symbol; asset canonical được giữ nguyên và `assetId` phải duy nhất. `VNINDEX` và mọi mã chỉ có trong catalog đều không thể xuất hiện. Catalog cung cấp tên công ty, bí danh, URL nguồn chính thức và `reviewedOn`; đây là snapshot tham chiếu được tuyển chọn, không đảm bảo tình trạng đăng ký hiện tại. Không sao chép giá hay fundamentals từ các nguồn đó.

Query phải có đúng một tham số `q`; giá trị sau URL decode tối đa 100 Unicode codepoint trước normalization. Thiếu/rỗng/chỉ có khoảng trắng, chỉ còn dấu kết hợp sau normalization, trùng, nested, tham số lạ hoặc quá dài trả 400 `invalid_query`. Search chuẩn hóa Unicode, bỏ dấu kết hợp, quy `đ` về `d`, không phân biệt hoa thường và gộp khoảng trắng; nó tìm substring literal trong symbol, tên và bí danh, không dùng regex, fuzzy hay lịch sử tìm gần đây. Kết quả được xếp symbol khớp chính xác trước, tiếp theo symbol có tiền tố khớp, rồi các kết quả khác theo symbol tăng dần.

Response gồm asset canonical nguyên vẹn, tên/bí danh và provenance từng công ty. Metadata ghi `scope: fixture equities`, `dataset: fixture / unknown`, `provider: marketpulse-fixture`, nhãn synthetic và `asOf: null`: catalog tham khảo không phải quan sát thị trường. `reviewedOn` là ngày rà soát nguồn tham khảo, không phải market as-of. Nếu catalog trùng hoặc không phủ chính xác mười equity đã nạp, API trả 503 đã khử chi tiết và readiness không đạt. Mọi response, kể cả lỗi, đặt `Cache-Control: no-store`.

## Cấu trúc và đơn vị

Envelope có `schemaVersion`, nhãn `dataset`, danh mục `assets`, cùng các mảng `candles`, `quotes` và `indexObservations`. Mỗi asset có `assetId` ổn định theo dạng `VN:{exchange}:{symbol}`, symbol viết hoa, loại equity/index và múi giờ `Asia/Ho_Chi_Minh`. Equity dùng `currency: VND`, `unit: VND` (đồng, không phải nghìn đồng). Index dùng `currency: null`, `unit: index_point`; không diễn giải điểm chỉ số như tiền.

Candle hiện giới hạn ở `interval: 1d`, có OHLC dương hữu hạn và kiểm tra `low <= open, close <= high`. `adjustmentBasis` phải nêu rõ `unadjusted`, `split_adjusted` hoặc `total_return_adjusted`; index dùng `not_applicable`. Equity volume là số nguyên không âm theo `shares`; index volume là `null` với `volumeUnit: not_available`. `null` nghĩa là không có quan sát, không phải số không. Unit hay adjustment mơ hồ phải bị loại hoặc giải quyết ở adapter có căn cứ, không được tự đổi thang đo hay gán mặc định.

## Thời gian, nguồn và freshness

Mỗi quan sát ghi `tradingDate`, `timezone`, `asOf`, `ingestedAt` và `source` gồm `provider`, `mode`, `recordId`. Ngày phải là ngày lịch hợp lệ; timestamp theo dạng RFC 3339 có giây và offset rõ ràng (`Z` hoặc `±HH:MM`), không nhận giờ naive hay offset sai. `asOf` biểu thị thời điểm quan sát dữ liệu; `ingestedAt` không được sớm hơn `asOf`. Validator hiện dùng UTC+07:00 cố định cho `Asia/Ho_Chi_Minh` trong contract này; nó không thay thế dịch vụ timezone hay lịch phiên lịch sử.

Fixture dùng `provider: marketpulse-fixture`, `mode: fixture`, ID nguồn có tiền tố `synthetic-`, nhãn `SYNTHETIC FIXTURE — NOT MARKET DATA`, `freshness: fixture / unknown` và `sessionCalendar: unverified`. Timestamp trong fixture là mốc tổng hợp để kiểm thử, không phải lúc sàn ghi nhận. Dữ liệu được tạo gần ngày hiện tại vẫn phải mang freshness fixture/unknown; không suy ra freshness theo đồng hồ hệ thống. Adapter live sau này phải ghi provider/as-of thực tế và chỉ gắn nhãn current hoặc delayed khi có tiêu chí xác minh.

## Tính nhất quán và thiếu dữ liệu

ID/symbol phải duy nhất và khớp nhau; mọi observation phải tham chiếu asset đã khai báo, khớp currency/unit/timezone và đúng loại equity hoặc index. Các mảng quan sát được sắp theo thời gian trong từng chuỗi. Candle không trùng khóa `(assetId, provider, interval, tradingDate, adjustmentBasis)`. Quote/index mới nhất phải khớp ngày, giá trị đóng cửa, thời điểm as-of và (với quote) volume của candle tương ứng.

`previousTradingDate` xác định candle có sẵn gần nhất dùng làm baseline; không suy ngày phiên bằng lịch, không nội suy khoảng trống. Khi không có baseline, `previousTradingDate`, `previousClose`, `change` và `changePercent` đều `null`. Nếu có baseline thì `change = value - previousClose`; `changePercent = change / previousClose * 100`, làm tròn half-up hai chữ số thập phân theo đơn vị phần trăm (ví dụ `1.25` là `1.25%`). Không tự tạo baseline khi nguồn không cung cấp được dữ liệu đáng tin cậy.

## Kiểm tra cục bộ

Tại thư mục gốc repository, cài dependency đã pin rồi chạy validator offline và unit tests:

```sh
python -m pip install -r requirements-dev.txt
python scripts/validate_market_data.py
python -m unittest discover -s tests -v
```

Validator kiểm tra schema, định dạng ngày giờ độc lập với dependency timezone/format tùy chọn, rồi kiểm tra ràng buộc chéo cho fixture. Nó không gọi provider, tải schema qua mạng hay chứng minh quyền dữ liệu và coverage live.
