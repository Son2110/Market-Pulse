# Yêu cầu sản phẩm và giới hạn ba tuần

**Sản phẩm:** MarketPulse VN — nền tảng thông tin thị trường Việt Nam theo sự kiện  

**MP-11 / FR-18 · 06/10/2026:** theo ưu tiên chủ dự án, Vnstock được tích hợp serial trước MP-12. Lát cắt đầu đã có adapter KBS opt-in Python cho FPT/VNINDEX, contract candle observed v2 riêng và hai probe cuối trả bảy candle đã kiểm tra mỗi mã. Giá VND/điểm chỉ số, provenance nhãn thời gian provider và collectedAt được giữ rõ; source as-of/adjustment cổ phiếu/freshness chưa xác minh, volume null. Chưa đổi ingestion Node, dữ liệu persistent, public reads hay UI; app vẫn dùng fixture. Kế tiếp cần isolation/revision/replay cho observed ingestion → stored public reads → UI từng trang qua Stitch. Quyền upstream public redisplay/deployment còn mở; MP-11 chưa hoàn tất, MP-12 chưa bắt đầu. Xem [bàn giao adapter và bằng chứng](VNSTOCK_ADAPTER.md). Các ghi nhận “MP-11 chưa bắt đầu” ở gate bên dưới là lịch sử trước lát cắt này.

**Trạng thái:** MP-06 có API search công khai cùng trang tra cứu tiếng Việt theo mã, tên công ty và bí danh trong mười cổ phiếu của fixture. MP-07 nối kết quả đã chọn tới `/stocks/:symbol`, với giá đóng cửa và OHLCV mới nhất, thay đổi so với quan sát có sẵn trước đó, biểu đồ đường giá đóng cửa và bảng dữ liệu ngày. MP-08 thêm `/market` với mức đóng cửa VN-Index mới nhất, thay đổi so với quan sát có sẵn trước đó và bảng ba quan sát; đơn vị điểm chỉ số, tiền tệ không áp dụng, khối lượng không có trong mẫu. Các trang ghi nguồn, đơn vị/tiền tệ, múi giờ Việt Nam, as-of, độ mới chưa xác định và lịch phiên chưa xác minh; fixture chỉ có ba ngày, không phải dữ liệu hiện tại. Tiêu chí mở trang chi tiết trong lát cắt FR-03 đã có; fuzzy/recent search, breadth/thanh khoản tổng, độ phủ toàn thị trường, live adapter và deployment vẫn chưa có. MP-05 cung cấp API đọc lịch sử candle ngày; MP-04 cung cấp lát cắt API auth local. Không FR nào được hoàn tất theo toàn bộ yêu cầu gốc; xem [roadmap](ROADMAP.md), [bàn giao thiết kế search](FR03_SEARCH_DESIGN.md), [bàn giao chi tiết](FR04_DETAIL_DESIGN.md), [bàn giao tổng quan](FR02_OVERVIEW_DESIGN.md) và [yêu cầu gốc](../MarketPulse_VN_Project_Documentation.md).

**Tiến độ MP-09 API · 03/10/2026 (trước D12 · 05/10):** đã có một watchlist theo user đăng nhập cục bộ, với API tạo/đổi tên/xóa và thêm/bỏ mã trong đúng mười equity canonical của fixture. Server lấy owner từ phiên xác thực, dùng unique index theo user và cập nhật atomic; không nhận owner từ client. Test MongoDB thực kiểm tra phân quyền âm tính, đồng thời, expiry và logout. Response chỉ gồm ID, tên, danh sách symbol và thời điểm thay đổi dữ liệu tài khoản; chưa lưu/hiện giá, thay đổi giá hoặc market as-of. UI auth, UI watchlist và giá/thay đổi mới nhất còn chờ các bước frontend serial có thiết kế Stitch; có thể dùng API history hiện có cho dữ liệu giá. MP-09/FR-06 vẫn **một phần**, chưa qua GATE-3; cổng nguồn live vẫn **NOT VERIFIED**. Xem [hợp đồng API và hướng dẫn local](LOCAL_DEVELOPMENT.md).

**Tiến độ FR-01 web · 04/10/2026:** đã có trang `/account` tiếng Việt theo thiết kế Stitch, kết nối API local để đăng ký/đăng nhập/đăng xuất, restore phiên qua `/me`, xử lý expiry và lỗi cùng lưu token/expiry theo tab. Đây là bước chuẩn bị cho MP-09; UI watchlist và giá/thay đổi mới nhất vẫn còn chờ. Không hoàn tất toàn bộ FR-01 gốc hoặc MP-09 và không thay trạng thái nguồn live **NOT VERIFIED**. Xem [bàn giao trang tài khoản](FR01_AUTH_DESIGN.md).

**Tiến độ FR-06 web · 05/10/2026:** `/watchlists` và `/watchlists/` đã kết nối auth/watchlist/history API local theo thiết kế Stitch: một danh sách theo user, tạo/đổi tên/xóa, tìm/thêm/bỏ mười equity canonical, giá đóng cửa và thay đổi so với quan sát có sẵn trước đó. Trang xác minh `/me` trước khi đọc dữ liệu riêng, xử lý expiry/401/identity change và đối chiếu server sau write chưa xác nhận; market rows có nguồn, VND, UTC+7, as-of, freshness chưa xác định, lịch phiên chưa xác minh và adjustment basis. Code cùng QA fixture của lát cắt chức năng MP-09 đã có; review GPT-6 Astra độc lập ngày 05/10/2026 đã chấp thuận, không có finding cần sửa. GitHub CI còn chờ. FR-06 theo yêu cầu gốc vẫn **một phần**, GATE-3 chưa nghiệm thu, nguồn live **NOT VERIFIED**; không mở MP-10 từ task này. Các ghi nhận API/account ở trên mô tả trạng thái tại thời điểm trước đó. Xem [bàn giao watchlist](FR06_WATCHLIST_DESIGN.md).

**GATE-3 · 06/10/2026:** **PASS cho các luồng local bằng fixture** trên `main` sau PR #19, commit `b996e3e3e70ffbacf13fb8d319a182303d05dfc9`. Application/Documentation CI trên đúng baseline thành công: 131 unit, 17 integration MongoDB/Redis, 24 Python contract và sáu collector tests; không skip check bắt buộc. QA mới rebuild Compose năm service healthy, thử API thật search theo mã/tên → detail/chart/reload/quay lại giữ query, VNINDEX, auth/reload `/me` và watchlist create/add/rename/remove/delete/recreate/logout cùng cách ly tài khoản B. Năm trang ở 1440/390/320px không overflow trang/pageerror; loading/empty/error/retry được mock riêng. MP-09 và MP-10 đã có trong baseline merge; các trạng thái “còn chờ” trong ghi nhận 03–05/10 ở trên là lịch sử. Public reads vẫn dùng fixture đóng gói; nguồn live **NOT VERIFIED**, FR gốc vẫn một phần, E2E được commit còn chờ MP-14. **MP-11 chưa bắt đầu**. Xem [bản ghi gate với bằng chứng và giới hạn](GATE_3_REVIEW.md).

## Mục tiêu sản phẩm

**Tiến độ MP-10 / FR-18 · 05/10/2026:** lát cắt fixture Python → internal API có bearer riêng → BullMQ worker tách process → raw/canonical MongoDB đã có. HTTP 202 chỉ xác nhận receipt bền vững; replay cùng content không tạo canonical trùng, content khác tại cùng identity thất bại và không ghi đè. Mỗi record atomic, cả batch không atomic; raw outbox hỗ trợ recovery sau enqueue lỗi/crash. Public reads vẫn dùng fixture đóng gói, time-series projection/live provider/cache/admin UI còn hoãn. P2 về ingestion initialization đã sửa và có regression API startup thật; review GPT-6 Astra độc lập cuối ngày 05/10/2026 chấp thuận push branch, không còn finding cần sửa. Reviewer kiểm tra code/collector/tests/CI/Compose/docs và diff, không chạy lại tests. Kiểm tra local đạt; coordinator rebuild Docker API/worker/web sau sửa startup, xác nhận năm service healthy và collector replay success với counts 11/44. GitHub CI và PR/merge do chủ dự án quản lý còn chờ. FR-18 gốc vẫn **một phần**, GATE-3 chưa nghiệm thu và nguồn live **NOT VERIFIED**. Xem [bàn giao ingestion](INGESTION.md).

Giúp người đọc hiểu thị trường Việt Nam đang diễn biến thế nào, tài sản nào vừa biến động và những sự kiện công khai nào xảy ra gần thời điểm đó. Đây là công cụ thông tin và nghiên cứu. Sản phẩm không khuyến nghị giao dịch, không thực hiện giao dịch và không khẳng định sự kiện gây ra biến động giá.

## Mục tiêu trong ba tuần

Xây dựng demo chạy cục bộ với tài khoản cơ bản, tìm kiếm cổ phiếu, trang chi tiết một mã có biểu đồ dữ liệu ngày, tổng quan VN-Index và watchlist của người dùng. Mục tiêu dữ liệu là 10–20 mã cổ phiếu Việt Nam cùng VN-Index ở tần suất cuối ngày hoặc trễ, chỉ khi nguồn đã được xác minh về quyền truy cập, điều khoản và độ phủ. Mọi màn hình dữ liệu cần ghi rõ thời điểm theo phiên/múi giờ Việt Nam, tiền tệ, provider, thời điểm quan sát và độ mới.

Nếu thiếu credential, quyền sử dụng hoặc độ phủ phù hợp, dùng fixture hoặc snapshot được gán nhãn rõ ràng. Gọi đây là **demo suy giảm**; không gọi là MVP có nguồn dữ liệu thật. Vàng, FX và một lát cắt sự kiện nhỏ được tuyển chọn thủ công chỉ là hạng mục mở rộng sau khi qua các cổng chất lượng nguồn và luồng chính. Không cam kết dữ liệu realtime hay intraday.

## Cách hiểu trạng thái

- **Một phần:** chỉ nhắm tới lát cắt được nêu; các tính năng bỏ qua vẫn hoãn.
- **Hoãn:** không nằm trong mục tiêu ba tuần.
- **Mở rộng / một phần:** chỉ bắt đầu sau khi qua các cổng đã nêu và không làm lùi luồng chính.

Không FR nào được xem là hoàn tất theo toàn bộ mô tả gốc. Trạng thái FR dưới đây vẫn là mục tiêu ba tuần; tiến độ scaffold và bằng chứng kiểm tra được ghi riêng trong [roadmap](ROADMAP.md).

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
