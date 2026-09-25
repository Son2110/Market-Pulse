# Fixture thị trường tổng hợp MP-02

`mp-02-synthetic.json` là fixture nhỏ để kiểm tra contract v1 và cách xử lý dữ liệu thiếu. Mọi giá, OHLC và volume đều do project tự tạo, không sao chép từ provider; các mã chỉ là symbol, không xác minh tên tổ chức phát hành.

Fixture gồm 10 symbol cổ phiếu ứng viên và VNINDEX, ba ngày được chọn `2026-09-21`–`2026-09-23`, candle ngày, quote mới nhất và một quan sát VNINDEX. Ngày này chưa đối chiếu lịch giao dịch Việt Nam. Mốc `asOf`/`ingestedAt` là timestamp tổng hợp có offset `+07:00`, không phải timestamp do sàn hay provider ghi nhận. Dataset luôn mang nhãn `SYNTHETIC FIXTURE — NOT MARKET DATA` và freshness `fixture / unknown`.

Xem `docs/DATA_CONTRACT.md` để biết ý nghĩa trường và cách chạy validator offline. Không dùng fixture làm giá thị trường hoặc bằng chứng source, coverage hay freshness live.
