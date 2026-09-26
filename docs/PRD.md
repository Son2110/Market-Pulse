# Yêu cầu sản phẩm và giới hạn ba tuần

**Sản phẩm:** MarketPulse VN — nền tảng thông tin thị trường Việt Nam theo sự kiện  
**Trạng thái kế hoạch:** repo hiện là nền tảng tài liệu, chưa chứng minh ứng dụng đã chạy. Yêu cầu gốc nằm trong [MarketPulse_VN_Project_Documentation.md](../MarketPulse_VN_Project_Documentation.md).

## Mục tiêu sản phẩm

Giúp người đọc hiểu thị trường Việt Nam đang diễn biến thế nào, tài sản nào vừa biến động và những sự kiện công khai nào xảy ra gần thời điểm đó. Đây là công cụ thông tin và nghiên cứu. Sản phẩm không khuyến nghị giao dịch, không thực hiện giao dịch và không khẳng định sự kiện gây ra biến động giá.

## Mục tiêu trong ba tuần

Xây dựng demo chạy cục bộ với tài khoản cơ bản, tìm kiếm cổ phiếu, trang chi tiết một mã có biểu đồ dữ liệu ngày, tổng quan VN-Index và watchlist của người dùng. Mục tiêu dữ liệu là 10–20 mã cổ phiếu Việt Nam cùng VN-Index ở tần suất cuối ngày hoặc trễ, chỉ khi nguồn đã được xác minh về quyền truy cập, điều khoản và độ phủ. Mọi màn hình dữ liệu cần ghi rõ thời điểm theo phiên/múi giờ Việt Nam, tiền tệ, provider, thời điểm quan sát và độ mới.

Nếu thiếu credential, quyền sử dụng hoặc độ phủ phù hợp, dùng fixture hoặc snapshot được gán nhãn rõ ràng. Gọi đây là **demo suy giảm**; không gọi là MVP có nguồn dữ liệu thật. Vàng, FX và một lát cắt sự kiện nhỏ được tuyển chọn thủ công chỉ là hạng mục mở rộng sau khi qua các cổng chất lượng nguồn và luồng chính. Không cam kết dữ liệu realtime hay intraday.

## Cách hiểu trạng thái

- **Một phần:** chỉ nhắm tới lát cắt được nêu; các tính năng bỏ qua vẫn hoãn.
- **Hoãn:** không nằm trong mục tiêu ba tuần.
- **Mở rộng / một phần:** chỉ bắt đầu sau khi qua các cổng đã nêu và không làm lùi luồng chính.

Không FR nào được xem là hoàn tất theo toàn bộ mô tả gốc. Trạng thái dưới đây là kế hoạch, chưa phải bằng chứng triển khai trong repo.

## Đối chiếu yêu cầu chức năng

| Yêu cầu | Trạng thái ba tuần | Tiêu chí mục tiêu | Phần hoãn rõ ràng |
|---|---|---|---|
| FR-01 Authentication | Một phần | Đăng ký, đăng nhập, đăng xuất cho tài khoản demo cục bộ; băm mật khẩu, kiểm tra input, phân quyền sở hữu phía server, phiên có hạn và vô hiệu hóa sau logout; không ghi mật khẩu/token vào log. | Quên/đặt lại mật khẩu, xoay vòng refresh token, OAuth, quản lý thiết bị/phiên, hardening production và phân quyền admin đầy đủ. |
| FR-02 Market Overview Dashboard | Một phần | Hiện mức và thay đổi mới nhất của VN-Index cùng số liệu tổng quan có sẵn, kèm nguồn và thời điểm dữ liệu. | VN30/HNX/UPCOM, vàng/FX nếu chưa xác minh, market breadth, thanh khoản tổng, bảng movers đầy đủ và cập nhật realtime. |
| FR-03 Stock Search | Một phần | Tìm mã hoặc tên công ty trong danh sách đã seed/ingest và mở trang chi tiết. | Xếp hạng fuzzy, lịch sử tìm gần đây, gợi ý phong phú và độ phủ toàn thị trường. |
| FR-04 Stock Detail | Một phần | Thông tin mã cơ bản, OHLCV ngày mới nhất, giá đóng cửa trước/thay đổi và biểu đồ lịch sử ngày cho một mã. | Intraday, đủ mọi khoảng thời gian, chỉ báo kỹ thuật, fundamentals đầy đủ, tin tức và sự kiện liên quan. |
| FR-05 Market Heatmap | Hoãn | Không có trong mục tiêu ba tuần. | Sàn, ngành, kích thước theo vốn hóa, bộ lọc watchlist và trực quan hóa heatmap. |
| FR-06 Watchlist | Một phần | Một danh sách theo người dùng; tạo, đổi tên, xóa, thêm/bỏ mã cổ phiếu; hiện giá/thay đổi mới nhất. | Nhiều danh sách, tài sản ngoài cổ phiếu, biểu đồ mini, tin mới và trạng thái alert. |
| FR-07 Market News | Hoãn | Không có trong luồng chính ba tuần. | Thu thập bài rộng, bộ lọc, liên kết entity, tóm tắt và cam kết độ phủ. |
| FR-08 AI News Analysis | Hoãn | Không có trong ba tuần. | Làm sạch, trích xuất, phân loại, ánh xạ mã, tóm tắt và quy trình duyệt. |
| FR-09 Event Timeline | Mở rộng / một phần | Nếu qua cổng luồng chính, tuyển chọn thủ công 3–5 sự kiện có nguồn và ngày. | Phát hiện tự động, độ phủ rộng, sự kiện do AI tạo và lọc đầy đủ. |
| FR-10 Event Detail | Mở rộng / một phần | Nếu FR-09 đạt, hiện nguồn, ngày, mô tả và tài sản liên quan cho sự kiện được tuyển chọn. | Liên kết tin/entity đầy đủ và quản trị sự kiện hoàn chỉnh. |
| FR-11 Event Impact Analysis | Mở rộng / một phần | Nếu có đủ lịch sử ngày đã xác minh, hiện mô tả biến động giá/khối lượng quanh một sự kiện kèm cảnh báo chỉ là liên hệ theo thời điểm. | Tất cả cửa sổ yêu cầu, mô hình biến động, benchmark cho mọi tài sản và phát biểu nhân quả. |
| FR-12 Correlation Explorer | Hoãn | Không có trong mục tiêu ba tuần. | Overlay, rolling correlation, hệ số và các cửa sổ chọn được. |
| FR-13 Anomaly Detection | Hoãn | Không có trong mục tiêu ba tuần. | Quy tắc giá/khối lượng/biến động, tinh chỉnh ngưỡng và liên hệ tin/sự kiện. |
| FR-14 Smart Alerts | Hoãn | Không có trong mục tiêu ba tuần. | Điều kiện giá/thay đổi/khối lượng/vàng/FX và gửi in-app/email/Telegram/push. |
| FR-15 Portfolio Simulator | Hoãn | Không có trong mục tiêu ba tuần. | Giao dịch mô phỏng, định giá, lời/lỗ, phân bổ và hiệu suất. |
| FR-16 Compare Assets | Hoãn | Không có trong mục tiêu ba tuần. | So sánh tối đa năm tài sản, chuẩn hóa và lịch sử đa tài sản. |
| FR-17 Data Source Management | Hoãn | Chỉ có log cục bộ và kiểm tra độ mới trong lúc phát triển; không có UI admin. | Danh mục nguồn, dashboard độ trễ/rate-limit, usage và điều khiển nhiều provider. |
| FR-18 Data Ingestion Monitoring | Một phần | Log phát triển cho biết queued/running/success/failure và đủ ngữ cảnh để chẩn đoán sync cục bộ. | UI job admin, retry tùy ý, phân tích thời lượng đầy đủ và dashboard vận hành production. |

## Ràng buộc dữ liệu và kiến trúc

- Hướng tích hợp được chọn ngày 26/09/2026 là Vnstock qua provider adapter; giữ fixture xác định trước cho tới khi xác minh upstream, khả năng truy cập, coverage, đơn vị/ngữ nghĩa thời gian, điều khoản và quyền sử dụng. Credential chỉ cần nếu đường Vnstock/upstream được chọn thực sự yêu cầu; lựa chọn connector không xác minh nguồn live.
- Lưu tách payload thô và bản ghi canonical đã chuẩn hóa; giữ provider và thời điểm ingest.
- Luồng dự kiến: Python collector → ingestion API nội bộ có xác thực → Node/BullMQ worker → collection thường cho dữ liệu raw/normalized → projection MongoDB time-series cho truy vấn. Retry hoặc crash không được tạo bản ghi canonical trùng. Dùng khóa idempotency/unique index ở collection thường; MongoDB time-series không hỗ trợ unique index nên không được dựa vào đó.
- Chuẩn hóa đơn vị giá, tiền tệ, sàn, interval và timestamp. Ghi rõ múi giờ và dùng lịch phiên giao dịch Việt Nam khi có. Không tự bù hoặc nội suy điểm dữ liệu thị trường/sự kiện bị thiếu.
- Chỉ thêm cache khi kiểm tra được thời hạn và invalidation. Cache không được sống lâu hơn freshness contract của provider.
- Phân tích sự kiện phải căn theo phiên giao dịch thực tế, ghi rõ cửa sổ so sánh và dùng “biến động liên quan theo thời điểm”, không tuyên bố quan hệ nhân quả.
- Redis và BullMQ là hạ tầng local dự kiến. Phát lại fixture nếu chưa có nguồn được xác minh.

## Nghiệm thu phi chức năng

Demo cục bộ có hướng dẫn khởi động lặp lại được, fixture xác định trước, validation input, log kèm request/job, provider, status, thời lượng và lỗi; kiểm tra normalization, dedup/replay, API lõi, quyền sở hữu watchlist âm tính (user B không sửa được watchlist user A), retry/crash ingestion và một E2E từ tìm mã đến mở chart rồi thêm watchlist. Không commit secret. SLO production để giai đoạn sau.

## Không phải lời khuyên đầu tư

MarketPulse VN phục vụ minh họa và nghiên cứu. Sản phẩm không đưa ra tư vấn đầu tư cá nhân, khuyến nghị mua/bán, dự đoán giá hoặc thực hiện lệnh môi giới. Trang sự kiện không được hàm ý quan hệ nhân quả.
