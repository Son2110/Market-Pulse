# Hợp đồng dữ liệu thị trường v1

Hợp đồng JSON Schema tại [`packages/schemas/market-data-v1.schema.json`](../packages/schemas/market-data-v1.schema.json) định nghĩa envelope canonical dùng chung cho adapter Python, TypeScript hoặc ngôn ngữ khác. Schema dùng JSON Schema Draft 2020-12, phiên bản `1.0.0`, và chỉ tham chiếu `$defs` nội bộ nên kiểm tra được offline. Nó mô tả chế độ `observed` trong tương lai; validator hiện tại chỉ chấp nhận fixture tổng hợp, chưa có live adapter.

Fixture nhỏ nằm tại [`fixtures/market/mp-02-synthetic.json`](../fixtures/market/mp-02-synthetic.json). Toàn bộ giá và volume do project tự tạo, issuer chỉ được ghi bằng symbol. Ba ngày `2026-09-21` đến `2026-09-23` là ngày phiên được chọn để thử nghiệm, chưa xác minh lịch giao dịch Việt Nam. Không dùng fixture làm giá thật, bằng chứng freshness hay kết quả provider.

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
