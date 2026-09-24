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
| D7 · Thứ Tư 30/09 | Review / buffer · 1 giờ | GATE-2 tích hợp tuần 1 | Compose khởi động được, seed lặp lại được, một response API đúng contract và CI không skip. Nếu chưa đạt, dùng buffer để sửa thay vì thêm tính năng. |

## Tuần 2 — hoàn thành luồng người dùng chính

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
| D15 · Thứ Năm 08/10 | Build · 2,4 giờ | MP-11 tích hợp nguồn đã xác minh hoặc demo suy giảm | Nếu credential, điều khoản và coverage đã xác minh, tích hợp lát cắt EOD/delay giới hạn. Nếu không, giữ fixture và gắn nhãn demo suy giảm; không gọi là MVP có nguồn thật. |
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
- [Tổng quan SSI FastConnect API](https://developers.ssi.com.vn/docs/getting-started/overview) mô tả market API và streaming; project chưa thử truy cập.
- [Render background worker](https://render.com/docs/background-workers) mô tả worker và cách dùng BullMQ/Key Value. Cần xác minh topology và plan trước production.
- [Giới hạn MongoDB time-series](https://www.mongodb.com/docs/manual/core/timeseries/timeseries-limitations/) không cho phép unique index trên time-series collection.
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use) khuyến nghị quyền tối thiểu và pin action reference.


