# Báo cáo khảo sát provider — MP-01

**Ngày ghi nhận:** 25/09/2026 · **Phạm vi:** dữ liệu cổ phiếu Việt Nam và VN-Index, tần suất ngày cuối phiên hoặc trễ.  
**Kết quả:** hoàn tất khảo sát tài liệu và một probe HTTP không xác thực. Cổng nguồn live vẫn **chưa đạt**: chưa có credential/quyền truy cập dự án, chưa xác nhận quyền dữ liệu, và chưa đo coverage. Vì vậy, chưa xác minh provider nào phù hợp để hiển thị dữ liệu thị trường trong sản phẩm.

## So sánh sơ bộ

| Tiêu chí | Vnstock | SSI FastConnect |
|---|---|---|
| Khả năng được tài liệu mô tả | Thư viện Python có ví dụ truy vấn OHLCV ngày cho `FPT` và index `VNINDEX`. | Market REST mô tả OHLCV ngày cho chứng khoán và chỉ số, gồm VNINDEX; FAQ phân biệt REST định kỳ và WebSocket độ trễ thấp. |
| Điều kiện truy cập | Connector chạy từ runtime cục bộ tới nguồn upstream. Hướng dẫn cài đặt hiện nêu vendor extra-index cho `vnstock`/`vnai`. Chưa cài hay chạy package trong task này. | Cần tài khoản SSI, đăng ký FastConnect được duyệt và chấp thuận điều khoản; xác thực bearer bằng key/secret. Endpoint production được tài liệu nêu; chưa có credential hay entitlement của dự án. |
| Coverage và freshness đã đo | Chưa đo. Ví dụ trong tài liệu không chứng minh dữ liệu có sẵn cho basket dự án hoặc freshness thực tế. | Chưa đo. Tài liệu nêu lịch sử ngày từ ngày giao dịch đầu tiên, nhưng không đưa ra phép đo freshness hay coverage của tài khoản dự án. |
| Quyền dữ liệu | Giấy phép phần mềm tách biệt với quyền truy cập, lưu, hiển thị hoặc phân phối dữ liệu upstream. Cần xác minh riêng. | Các trang đã xem mô tả API và điều khoản truy cập, nhưng chưa chứng minh quyền redisplay/phân phối của dự án. Cần xác minh bằng văn bản. |

**Diễn giải:** tài liệu cho thấy hai hướng đáng kiểm tra, không phải kết quả cấp quyền hoặc bảo đảm sản phẩm. Vnstock là connector/phần mềm; quyền phần mềm không thay cho quyền dữ liệu do upstream cung cấp. SSI nêu rõ quy trình account và đăng ký, nhưng chưa có bằng chứng dự án đã được cấp quyền hay nhận dữ liệu. Không đưa ra kết luận pháp lý về việc lưu trữ hoặc hiển thị; cần xác nhận điều khoản với provider và người có thẩm quyền trước khi dùng dữ liệu thật.

## Bằng chứng đã có

Tài liệu Vnstock tại thời điểm khảo sát hiển thị phiên bản 4.0.6. Trang giới thiệu mô tả v4 Unified UI, connector Python chạy cục bộ và cách cài đặt qua extra-index của nhà cung cấp. Ví dụ trang market data dùng `Market().equity('FPT').ohlcv(...)` cho dữ liệu ngày và `Market().index('VNINDEX').ohlcv(...)` cho chỉ số. Đây là mô tả API, không phải phép thử dữ liệu. Metadata môi trường dự án không cho thấy `vnstock` đã cài; package không được cài hoặc chạy trong MP-01.

Trang giấy phép Vnstock ghi phiên bản license `2026.09` và mô tả quyền sử dụng phần mềm. Nội dung này không cấp thay quyền upstream đối với dữ liệu, gồm truy cập, lưu trữ/cache, hiển thị công khai hay phân phối lại. Những quyền này phải được làm rõ riêng cho từng nguồn và cách dùng.

Tài liệu SSI mô tả REST cho market data, trường OHLCV ngày, mã chứng khoán/chỉ số, và xác thực bearer key/secret theo quyền market-data (không phải luồng OTP/giao dịch). FAQ mô tả REST phục vụ truy vấn định kỳ, WebSocket cho luồng độ trễ thấp và nói lịch sử ngày có từ ngày giao dịch đầu tiên; tài liệu không cung cấp số đo freshness đã quan sát. Trang terms/environments yêu cầu account SSI, FastConnect registration được duyệt và chấp thuận điều khoản; nêu endpoint production `https://api.ssi.com.vn`, nói UAT chưa được công bố ở trang đó và mô tả response headers cho rate limit. Các trang đã xem chưa chứng minh entitlement hoặc quyền redisplay của MarketPulse.

**Probe chỉ đọc:** lúc `2026-09-25T09:21:24.2589627Z`, gửi `GET https://api.ssi.com.vn/api/v3/data/ohlc?symbol=SSI&from=2026-09-21&to=2026-09-24&timeFrame=1d&pageIndex=1&pageSize=5` không kèm xác thực. Máy chủ trả HTTP `401`, `content-type: application/json`, body `{"code":401,"msg":"Unauthorized"}`. Điều này chỉ xác nhận endpoint truy cập được và yêu cầu xác thực. Nó không xác nhận dữ liệu OHLCV, coverage, freshness hay quyền sử dụng. Không có payload thị trường nào được lấy hoặc phân phối lại.

## Basket ứng viên và cổng xác minh live

Basket sơ bộ cho lần kiểm tra có credential gồm `FPT`, `VCB`, `HPG`, `VNM`, `SSI`, `VIC`, `VHM`, `MSN`, `MWG`, `BID` và `VNINDEX`. Tất cả đều là **mã ứng viên chưa xác minh**. Scope thử nghiệm tiếp theo chỉ là dữ liệu ngày EOD/delayed; không suy rộng sang intraday hoặc coverage toàn sàn.

Trước khi chọn provider live, cần hoàn tất các bước sau:

1. Dùng credential được phê duyệt trong secret local; không đưa key vào chat, PR, fixture hoặc Git. Xin provider xác nhận quyền truy cập, gọi API, lưu trữ/cache, hiển thị công khai và phân phối lại cho đúng sản phẩm, gồm chỉ số nếu khác quyền cổ phiếu.
2. Gọi có giới hạn cho đủ 11 mã, ghi số hàng trả về, dải ngày, thời điểm phản hồi, lỗi/auth/rate limit và mã nào thiếu. Không coi ví dụ tài liệu là coverage; không tự điền các ngày thiếu hay tuyên bố completeness.
3. Đối chiếu schema trước khi chuẩn hóa: giá là VND hay nghìn VND, đơn vị index points (không phải tiền tệ), timestamp và timezone/phiên Việt Nam, cơ sở điều chỉnh giá, ý nghĩa volume, ngày không giao dịch, source/as-of/freshness. Trường hợp chưa rõ phải fail closed và hiện thiếu/không xác minh, không đoán.

## Quyết định cho MP-02

MP-01 hoàn tất dưới dạng báo cáo nghiên cứu; cổng LIVE vẫn chưa đạt. MP-02 nên dùng fixture nhỏ có giá trị tổng hợp do dự án tự tạo, gắn nhãn `fixture` rõ ràng và metadata thời điểm nguồn phù hợp với contract. Không chép ví dụ trong tài liệu vendor thành quan sát thị trường, không ghi fixture như dữ liệu provider và không bật đường ingest live. Contract/fixture cụ thể chưa được triển khai trong báo cáo này. Chỉ đánh giá lại nguồn sau khi credential, quyền, coverage, đơn vị và thời gian được kiểm chứng bằng phép gọi có kiểm soát.

## Nguồn chính

- [Vnstock docs](https://vnstocks.com/docs/vnstock), [giới thiệu](https://vnstocks.com/docs/vnstock/gioi-thieu-vnstock), [market data](https://vnstocks.com/docs/vnstock/du-lieu-thi-truong-market-data) và [giấy phép 2026.09](https://vnstocks.com/onboard/giay-phep-su-dung).
- SSI FastConnect: [overview](https://developers.ssi.com.vn/docs/getting-started/overview), [FAQ market data](https://developers.ssi.com.vn/docs/faq/market-data), [terms and environments](https://developers.ssi.com.vn/docs/getting-started/terms-and-environments), [first API call](https://developers.ssi.com.vn/docs/getting-started/first-api-call).

Đây là tóm tắt tài liệu và kết quả probe có giới hạn đến ngày ghi nhận, không phải ý kiến pháp lý, bảo đảm vận hành hoặc xác nhận provider đã được tích hợp.
