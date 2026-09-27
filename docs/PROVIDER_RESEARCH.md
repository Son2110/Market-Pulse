# Báo cáo khảo sát provider — MP-01 (ảnh chụp lịch sử tại 25/09/2026)

> **Trạng thái mới nhất · 27/09/2026:** Probe cục bộ xác nhận khả năng đọc kỹ thuật qua Vnstock/KBS và nhận được dữ liệu cho cả 11/11 mã trong basket ở phạm vi truy vấn mẫu. Đây chưa phải cổng production/live đã đạt: freshness, cơ sở điều chỉnh giá, ngữ nghĩa timestamp/as-of và quyền sử dụng dữ liệu upstream vẫn chưa được xác minh. Fixture `marketpulse-fixture` tiếp tục là dữ liệu của ứng dụng. Chi tiết và giới hạn nằm trong [xác minh kỹ thuật ngày 27/09](#xác-minh-kỹ-thuật-ngày-27092026).

**Ngày ghi nhận:** 25/09/2026 · **Phạm vi:** dữ liệu cổ phiếu Việt Nam và VN-Index, tần suất ngày cuối phiên hoặc trễ.  
**Kết quả lịch sử tại ngày khảo sát 25/09/2026:** hoàn tất khảo sát tài liệu và một probe HTTP không xác thực. Tại thời điểm đó, cổng nguồn live **chưa đạt** vì chưa xác minh quyền truy cập của dự án, quyền dữ liệu hoặc coverage cho nguồn/upstream dự kiến. Kết quả mới hơn được ghi riêng bên dưới; không sửa hồi tố bằng chứng MP-01.

## So sánh sơ bộ

| Tiêu chí | Vnstock | SSI FastConnect (phương án lịch sử, nay bị loại) |
|---|---|---|
| Khả năng được tài liệu mô tả | Thư viện Python có ví dụ truy vấn OHLCV ngày cho `FPT` và index `VNINDEX`. | Market REST mô tả OHLCV ngày cho chứng khoán và chỉ số, gồm VNINDEX; FAQ phân biệt REST định kỳ và WebSocket độ trễ thấp. |
| Điều kiện truy cập | Connector chạy từ runtime cục bộ tới nguồn upstream. Hướng dẫn cài đặt hiện nêu vendor extra-index cho `vnstock`/`vnai`. Chưa cài hay chạy package trong MP-01; yêu cầu truy cập của upstream chưa được xác minh. | Tài liệu nêu tài khoản SSI, đăng ký FastConnect được duyệt, chấp thuận điều khoản và bearer key/secret. Đây là bằng chứng của phương án đã so sánh, không phải điều kiện còn lại của hướng tích hợp hiện tại. |
| Coverage và freshness trong MP-01 | Chưa đo. Ví dụ trong tài liệu không chứng minh dữ liệu có sẵn cho basket dự án hoặc freshness thực tế. | Chưa đo. Tài liệu nêu lịch sử ngày từ ngày giao dịch đầu tiên, nhưng không đưa ra phép đo freshness hay coverage của tài khoản dự án. |
| Quyền dữ liệu | Giấy phép phần mềm tách biệt với quyền truy cập, lưu, hiển thị hoặc phân phối dữ liệu upstream. Cần xác minh riêng. | Các trang đã xem mô tả API và điều khoản truy cập, nhưng chưa chứng minh quyền redisplay/phân phối của dự án. Cần xác minh bằng văn bản. |

**Diễn giải tại thời điểm khảo sát:** đây là so sánh tài liệu, không phải kết quả cấp quyền hay bảo đảm sản phẩm. Vnstock là connector/phần mềm; quyền phần mềm không thay cho quyền dữ liệu do upstream cung cấp. Không đưa ra kết luận pháp lý về việc lưu trữ hoặc hiển thị; cần xác nhận điều khoản cho nguồn được chọn trước khi dùng dữ liệu thật.

## Bằng chứng đã có

Tài liệu Vnstock tại thời điểm khảo sát hiển thị phiên bản 4.0.6. Trang giới thiệu mô tả v4 Unified UI, connector Python chạy cục bộ và cách cài đặt qua extra-index của nhà cung cấp. Ví dụ trang market data dùng `Market().equity('FPT').ohlcv(...)` cho dữ liệu ngày và `Market().index('VNINDEX').ohlcv(...)` cho chỉ số. Đây là mô tả API, không phải phép thử dữ liệu. Metadata môi trường dự án không cho thấy `vnstock` đã cài; package không được cài hoặc chạy trong MP-01.

Trang giấy phép Vnstock ghi phiên bản license `2026.09` và mô tả quyền sử dụng phần mềm. Nội dung này không cấp thay quyền upstream đối với dữ liệu, gồm truy cập, lưu trữ/cache, hiển thị công khai hay phân phối lại. Những quyền này phải được làm rõ riêng cho từng nguồn và cách dùng.

Tài liệu SSI mô tả REST cho market data, trường OHLCV ngày, mã chứng khoán/chỉ số, và xác thực bearer key/secret theo quyền market-data (không phải luồng OTP/giao dịch). FAQ mô tả REST phục vụ truy vấn định kỳ, WebSocket cho luồng độ trễ thấp và nói lịch sử ngày có từ ngày giao dịch đầu tiên; tài liệu không cung cấp số đo freshness đã quan sát. Trang terms/environments yêu cầu account SSI, FastConnect registration được duyệt và chấp thuận điều khoản; nêu endpoint production `https://api.ssi.com.vn`, nói UAT chưa được công bố ở trang đó và mô tả response headers cho rate limit. Các trang đã xem chưa chứng minh entitlement hoặc quyền redisplay của MarketPulse.

**Probe chỉ đọc:** lúc `2026-09-25T09:21:24.2589627Z`, gửi `GET https://api.ssi.com.vn/api/v3/data/ohlc?symbol=SSI&from=2026-09-21&to=2026-09-24&timeFrame=1d&pageIndex=1&pageSize=5` không kèm xác thực. Máy chủ trả HTTP `401`, `content-type: application/json`, body `{"code":401,"msg":"Unauthorized"}`. Điều này chỉ xác nhận endpoint truy cập được và yêu cầu xác thực. Nó không xác nhận dữ liệu OHLCV, coverage, freshness hay quyền sử dụng. Không có payload thị trường nào được lấy hoặc phân phối lại.

## Basket ứng viên và cổng xác minh live

Basket sơ bộ cho lần xác minh Vnstock/upstream gồm `FPT`, `VCB`, `HPG`, `VNM`, `SSI`, `VIC`, `VHM`, `MSN`, `MWG`, `BID` và `VNINDEX`. Tất cả đều là **mã ứng viên chưa xác minh**. Scope thử nghiệm tiếp theo chỉ là dữ liệu ngày EOD/delayed; không suy rộng sang intraday hoặc coverage toàn sàn.

Trước khi dùng dữ liệu live qua hướng Vnstock đã chọn, cần hoàn tất các bước sau:

1. Xác định upstream cụ thể và xác minh quyền truy cập, gọi API, lưu trữ/cache, hiển thị công khai và phân phối lại cho đúng sản phẩm, gồm chỉ số nếu quyền khác cổ phiếu. Chỉ dùng credential trong secret local nếu upstream được chọn thực sự yêu cầu; không đưa key vào chat, PR, fixture hoặc Git.
2. Gọi có giới hạn cho đủ 11 mã, ghi số hàng trả về, dải ngày, thời điểm phản hồi, lỗi/auth/rate limit và mã nào thiếu. Không coi ví dụ tài liệu là coverage; không tự điền các ngày thiếu hay tuyên bố completeness.
3. Đối chiếu schema trước khi chuẩn hóa: giá là VND hay nghìn VND, đơn vị index points (không phải tiền tệ), timestamp và timezone/phiên Việt Nam, cơ sở điều chỉnh giá, ý nghĩa volume, ngày không giao dịch, source/as-of/freshness. Trường hợp chưa rõ phải fail closed và hiện thiếu/không xác minh, không đoán.

## Quyết định của chủ dự án · 26/09/2026

Chủ dự án chọn Vnstock làm hướng connector/tích hợp để tiếp tục xác minh. SSI FastConnect không được theo đuổi vì đăng ký không thực tế cho dự án theo đánh giá của chủ dự án; đây là quyết định theo bối cảnh dự án, không phải kết luận chung về kỹ thuật hay pháp lý. Không còn yêu cầu đăng ký tài khoản hoặc credential SSI. Lựa chọn Vnstock chưa xác minh nguồn/upstream cụ thể, khả năng truy cập thực tế, coverage, đơn vị/ngữ nghĩa thời gian hay quyền sử dụng dữ liệu. Credential chỉ cần nếu đường Vnstock/upstream được chọn thực sự yêu cầu.

## Quyết định cho MP-02 tại thời điểm khảo sát · 25/09/2026

Tại ngày khảo sát, MP-01 hoàn tất dưới dạng báo cáo; cổng LIVE chưa đạt nên MP-02 được định hướng dùng fixture tổng hợp do dự án tự tạo. MP-02 sau đó đã hoàn tất: schema và fixture được mô tả trong [hợp đồng dữ liệu](DATA_CONTRACT.md). Fixture mang provider `marketpulse-fixture`; không chép ví dụ vendor thành quan sát thị trường, không ghi fixture như dữ liệu Vnstock và không bật ingest live trước khi hoàn tất cổng xác minh.

## Xác minh kỹ thuật ngày 27/09/2026

Trong môi trường cô lập `.venv/vnstock-probe`, đã cài `vnstock` 4.0.8 và `vnai` 2.6.2 từ vendor index `https://vnstocks.com/api/simple`; `vnstock_ezchart` 1.0.2 được cài từ PyPI. Tắt agent setup và telemetry bằng `VNSTOCK_DISABLE_AGENT_SETUP=1` và `VNSTOCK_TELEMETRY=off`. Không cung cấp credential. Mười hai lần gọi chỉ đọc tới provider `KBS` hoàn tất trong khoảng 04:38:48–04:44:29 UTC (11:38–11:44 giờ Việt Nam); lần đầu cho FPT mất 2,797 giây, các lần còn lại 0,48–0,62 giây. Không gặp lỗi auth, chặn truy cập hay rate limit trong các lần này; điều đó không xác nhận quota guest ổn định, khả năng truy cập từ cloud hoặc quyền dữ liệu. Mã package cục bộ ánh xạ KBS tới host `kbbuddywts.kbsec.com.vn`; probe chỉ truy cập qua thư viện Vnstock, không gọi endpoint riêng ngoài thư viện.

Yêu cầu OHLCV `1D` cho khoảng 14–25/09/2026 trả dữ liệu cho cả 11/11 mã, nhưng số hàng và ngày cuối khác nhau. FPT được hỏi thêm đến 26/09 vẫn chỉ có dữ liệu đến ngày 24/09. Đây là kết quả của truy vấn mẫu, không xác nhận tính đầy đủ, ngày cuối cùng đã có dữ liệu hay freshness hiện tại.

Bảng dưới đây chỉ ghi metadata về số hàng và ngày; báo cáo không công bố chuỗi giá thô.

| Mã | Loại | Số hàng | Ngày trong kết quả |
|---|---|---:|---|
| FPT | Cổ phiếu | 9 | 14–24/09/2026 |
| VCB | Cổ phiếu | 9 | 14–24/09/2026 |
| HPG | Cổ phiếu | 9 | 14–24/09/2026 |
| VNM | Cổ phiếu | 9 | 14–24/09/2026 |
| SSI | Cổ phiếu | 9 | 14–24/09/2026 |
| VIC | Cổ phiếu | 9 | 14–24/09/2026 |
| VHM | Cổ phiếu | 9 | 14–24/09/2026 |
| MSN | Cổ phiếu | 9 | 14–24/09/2026 |
| MWG | Cổ phiếu | 9 | 14–24/09/2026 |
| BID | Cổ phiếu | 9 | 14–24/09/2026 |
| VNINDEX | Chỉ số | 10 | 14–25/09/2026 |

Kiểm tra cục bộ trên các hàng mẫu không thấy null hay ngày trùng; OHLC thỏa quan hệ high/low và volume không âm. Schema trả về dùng `datetime64[ns]` không timezone, timestamp đều là 07:00; giá `float64`, volume `int64`. Không gán 07:00 thành giờ đóng cửa hay timezone cụ thể. Kiểm tra tĩnh package cho thấy adapter KBS chia các trường giá cổ phiếu cho 1.000, nhưng không chia giá index/derivative; đây chỉ là phép biến đổi của package, chưa xác minh đơn vị canonical hay cơ sở điều chỉnh. Volume chưa có ngữ nghĩa được xác nhận; adapter tương lai chỉ nên ghi volume index khi contract nguồn hỗ trợ. Kết quả không có timestamp as-of chính xác từ nguồn.

License `2026.09` mô tả giấy phép phần mềm riêng với quyền truy cập và sử dụng dữ liệu upstream. Probe này không xác lập quyền lưu/cache, hiển thị công khai hay phân phối lại; tài liệu đã xem không nêu rõ quyền hiển thị công khai cho dự án. Cần xác nhận điều khoản với upstream; đây không phải kết luận rằng việc hiển thị bị cấm.

**Kết luận:** khả năng đọc kỹ thuật cục bộ và coverage của basket trong truy vấn mẫu **đạt giới hạn kiểm tra (11/11 mã)**. Cổng nguồn live cho sản phẩm vẫn **một phần / chưa đạt** cho tới khi xác minh freshness, adjustment basis, ngữ nghĩa timestamp/as-of và quyền dữ liệu upstream. Không chuyển kết quả này thành fixture, canonical records hoặc nhãn live trong app. Các lần probe thuộc xác minh thủ công; không đưa live calls vào CI.

## Nguồn chính

- [Vnstock docs](https://vnstocks.com/docs/vnstock), [giới thiệu](https://vnstocks.com/docs/vnstock/gioi-thieu-vnstock), [market data](https://vnstocks.com/docs/vnstock/du-lieu-thi-truong-market-data) và [giấy phép 2026.09](https://vnstocks.com/onboard/giay-phep-su-dung).
- [Lịch sử phiên bản Vnstock](https://vnstocks.com/docs/tai-lieu/lich-su-phien-ban) ghi phiên bản 4.0.8 ngày 15/09/2026; [vendor index](https://vnstocks.com/api/simple) được dùng cho môi trường xác minh cô lập.
- SSI FastConnect (tài liệu tham khảo lịch sử cho phương án đã loại): [overview](https://developers.ssi.com.vn/docs/getting-started/overview), [FAQ market data](https://developers.ssi.com.vn/docs/faq/market-data), [terms and environments](https://developers.ssi.com.vn/docs/getting-started/terms-and-environments), [first API call](https://developers.ssi.com.vn/docs/getting-started/first-api-call).

Phần so sánh và probe HTTP SSI là bằng chứng lịch sử đến ngày ghi nhận; probe Vnstock/KBS ngày 27/09 chỉ xác nhận truy vấn mẫu cục bộ. Không nội dung nào là ý kiến pháp lý, bảo đảm vận hành hoặc xác nhận provider đã được tích hợp vào app. Quyết định ngày 26/09/2026 chỉ chọn hướng xác minh tiếp theo.
