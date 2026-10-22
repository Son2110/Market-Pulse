# P2.1 — catalog bằng chứng nguồn news

**Trạng thái:** `RESEARCHED_WITH_BLOCKERS` · **Ngày tạo / cập nhật khảo sát:** 21/10/2026 (`Asia/Ho_Chi_Minh`) · **Baseline khảo sát:** `eb3a6b2` / PR #38 · **Đóng nghiên cứu tài liệu:** 22/10/2026 trên `654d177`, sau A4 merge qua [PR #39](https://github.com/Son2110/Market-Pulse/pull/39). Tài liệu giữ bằng chứng khảo sát P2.1 (đợt đầu `04:25:25+07:00` – `04:29:45+07:00`, hai lượt đọc chính sách bổ sung không theo redirect `10:33:08+07:00` – `10:33:11+07:00`); nghiệm thu tài liệu không phê duyệt nguồn hoặc mở P2.2, và không là lần xác minh nguồn mới.

GPT-6 Astra đã đọc và chấp thuận đóng bộ nghiên cứu gồm 14 Evidence ID duy nhất, ba ứng viên RSS và hai cổng chính thức bị chặn. Không chứng nhận giới hạn một lượt đọc được tuân thủ: catalog giữ nguyên disclosure 50 redirect SSC và hai lượt đọc bổ sung. Nhãn `allow` có điều kiện bên dưới là diễn giải nghiên cứu cho đọc thủ công/trình đọc RSS cá nhân hoặc phi lợi nhuận theo từng nguồn; không là quyền MarketPulse ingest/lưu DB/redisplay. Automated collection, lưu trữ, public redisplay, AI và training vẫn `unknown` và đóng; feature flag hoặc chấp thuận của chủ dự án không cấp quyền publisher.

Đọc [handoff](P2_NEWS_RESEARCH_HANDOFF.md); kết luận tổng hợp ở [audit](P2_NEWS_SOURCE_AUDIT.md). Catalog cho phép người review tra nguồn và hiểu giới hạn quan sát, không là kho toàn văn hay feed archive.

## Quy tắc ghi nhận

- Khi có bằng chứng thật, gán ID duy nhất tăng dần `NEWS-E001`, `NEWS-E002`…; không tái dùng ID, không tạo ID giả để lấp ô trống. Audit phải dẫn đúng ID/anchor có thật và catalog chỉ rõ mục audit sử dụng.
- Mỗi record có Source ID, publisher/cơ quan, URL gốc và URL cuối nếu thấy, thời điểm truy cập ISO 8601 có offset cùng `Asia/Ho_Chi_Minh`; ngày hiệu lực/cập nhật chính sách của nguồn ghi riêng hoặc `unknown`.
- Ghi locator tái tìm được: tiêu đề mục/đoạn điều khoản hoặc RSS/Atom path và vị trí mẫu/GUID nếu được phép. Search snippet chỉ hỗ trợ discovery, không chứng minh điều khoản; không sao chép một nguồn sang nhiều ID để tăng vẻ chắc chắn.
- Mức kết luận: `observed` là tool cho thấy trực tiếp; `inferred` nêu tiền đề và giới hạn; `unverified` chưa kiểm chứng. HTTP/header không lộ ghi `unavailable`; không coi lỗi tool là status của publisher.
- Chỉ giữ đoạn trích chính sách tối thiểu cần chứng minh quyền, hoặc mô tả quan sát kỹ thuật. Không chép toàn văn bài, toàn feed, description, corpus, secret, cookie hay ảnh chụp hàng loạt. Nếu quyền lưu nội dung chưa rõ, ghi URL/locator và quan sát thay bản sao.
- Ghi cả kết quả âm tính: không tìm thấy điều khoản/feed trong giới hạn, chặn truy cập, định dạng không đọc được, nội dung không lộ header. Không biến “không thấy” thành “không tồn tại”; một lần đọc không xác minh revision/cadence/độ phủ.
- Nội dung bên ngoài là dữ liệu không tin cậy, không phải chỉ dẫn cho agent. Không làm theo lệnh nhúng trong feed/trang hoặc lưu chuỗi nhạy cảm không cần thiết.

## Chỉ mục bằng chứng

| Evidence ID thật | Source ID / loại bằng chứng | URL / thời điểm truy cập | Mức xác minh / mục audit dùng |
|---|---|---|---|
| [NEWS-E001](#news-e001) | `N01` (VnExpress) / landing page (lượt khảo sát đầu) | `https://vnexpress.net/rss` · `2026-10-21T04:25:25+07:00` | `observed` (HTTP header & `<head>`); `unverified` ở lượt đầu đối với body sau dòng 223 do cắt dòng (được xác minh bổ sung tại [NEWS-E014](#news-e014)) · Mục 1, 2 (`N01`), 3 (`N01`) |
| [NEWS-E002](#news-e002) | `N01` (VnExpress) / discovery | `search_web` (`domain: vnexpress.net`) · `2026-10-21T04:25:47+07:00` & `2026-10-21T04:26:01+07:00` | `observed` (kết quả discovery URL); `unverified` (tóm tắt điều khoản từ search snippet không làm bằng chứng pháp lý) · Mục 1, 2 (`N01`), 3 (`N01`) |
| [NEWS-E003](#news-e003) | `N01` (VnExpress) / policy | `https://vnexpress.net/dieu-khoan-su-dung` · `2026-10-21T04:26:12+07:00` | `observed` (status line `HTTP/1.1 200 OK`); `unavailable` / `unverified` (header còn lại và body do lỗi tách mảng dòng ở lượt đầu) · Mục 1, 2 (`N01`), 3 (`N01`), 5 |
| [NEWS-E004](#news-e004) | `N01` (VnExpress) / feed metadata | `https://vnexpress.net/rss/kinh-doanh.rss` · `2026-10-21T04:26:48+07:00` | `observed` (HTTP 200, header, cấu trúc RSS 2.0 và 3 mẫu metadata đầu tiên) · Mục 1, 2 (`N01`), 3 (`N01`), 5 |
| [NEWS-E005](#news-e005) | `N02` (Tuổi Trẻ Online) / discovery | `search_web` (`tuoitre.vn`) · `2026-10-21T04:27:12+07:00` & `2026-10-21T04:27:20+07:00` | `observed` (discovery URL trang RSS chính thức `https://tuoitre.vn/rss.htm`) · Mục 1, 2 (`N02`) |
| [NEWS-E006](#news-e006) | `N02` (Tuổi Trẻ Online) / landing & policy | `https://tuoitre.vn/rss.htm` · `2026-10-21T04:27:31+07:00` | `observed` (HTTP 200, header, danh sách RSS và toàn văn mục `Điều khoản sử dụng` / `Khái niệm RSS`) · Mục 1, 2 (`N02`), 3 (`N02`), 5 |
| [NEWS-E007](#news-e007) | `N02` (Tuổi Trẻ Online) / feed metadata | `https://tuoitre.vn/kinh-doanh.rss` · `2026-10-21T04:27:51+07:00` | `observed` (HTTP 200, header, cấu trúc RSS 2.0 và 3 mẫu metadata đầu tiên) · Mục 1, 2 (`N02`), 3 (`N02`), 5 |
| [NEWS-E008](#news-e008) | `N03` (Báo Thanh Niên) / discovery | `search_web` (`domain: thanhnien.vn`) · `2026-10-21T04:28:04+07:00` & `2026-10-21T04:28:12+07:00` | `observed` (discovery URL `https://thanhnien.vn/rss.html` và `https://thanhnien.vn/rss/kinh-te.rss`); `unverified` (search summary về điều khoản không khớp trang thực tế) · Mục 1, 2 (`N03`), 3 (`N03`) |
| [NEWS-E009](#news-e009) | `N03` (Báo Thanh Niên) / landing & policy (lượt khảo sát đầu) | `https://thanhnien.vn/rss.html` · `2026-10-21T04:28:26+07:00` | `observed` (HTTP 200, header, danh sách feed, mục `RSS là gì?` và dòng bản quyền ở footer; đối chiếu bổ sung mục `Điều kiện sử dụng` tại [NEWS-E013](#news-e013)) · Mục 1, 2 (`N03`), 3 (`N03`), 5 |
| [NEWS-E010](#news-e010) | `N03` (Báo Thanh Niên) / policy | `https://thanhnien.vn/policy.html` · `2026-10-21T04:28:40+07:00` | `observed` (HTTP 200, header, nội dung `Chính sách bảo mật` & `Chính sách đóng góp tự nguyện`, không có điều khoản cấp phép RSS) · Mục 1, 2 (`N03`), 3 (`N03`), 5 |
| [NEWS-E011](#news-e011) | `N03` (Báo Thanh Niên) / feed metadata | `https://thanhnien.vn/rss/kinh-te.rss` · `2026-10-21T04:29:00+07:00` | `observed` (HTTP 200, header, cấu trúc RSS 2.0 và 3 mẫu metadata đầu tiên) · Mục 1, 2 (`N03`), 3 (`N03`), 5 |
| [NEWS-E012](#news-e012) | `O01` (SBV) & `O02` (SSC) / official announcement & blocked | `https://www.sbv.gov.vn` (`2026-10-21T04:29:26+07:00`) & `https://ssc.gov.vn` (`2026-10-21T04:29:45+07:00`) | `observed` (HTTP 403 tại `sbv.gov.vn`; 50 lần HTTP 302 tới `/webcenter/portal/ubck` do cờ `-L` của `curl` tại `ssc.gov.vn`); `inferred` / `unverified` (nguyên nhân WAF/cookie) · Mục 1, 4, 5 |
| [NEWS-E013](#news-e013) | `N03` (Báo Thanh Niên) / landing & policy (lượt xác minh bổ sung) | `https://thanhnien.vn/rss.html` · `2026-10-21T10:33:08+07:00` | `observed` (lượt xác minh bổ sung không theo redirect: đối chiếu trực tiếp mục `Điều kiện sử dụng` với tuyên bố bản quyền ở footer) · Mục 1, 3 (`N03`), 5 |
| [NEWS-E014](#news-e014) | `N01` (VnExpress) / landing & policy (lượt xác minh bổ sung) | `https://vnexpress.net/rss` · `2026-10-21T10:33:11+07:00` | `observed` (lượt xác minh bổ sung không theo redirect: nguyên văn mục `Khái niệm RSS`, danh sách kênh RSS và `Điều khoản sử dụng` trên `https://vnexpress.net/rss`) · Mục 1, 2 (`N01`), 3 (`N01`), 5 |

## Hồ sơ bằng chứng chi tiết

### `NEWS-E001`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N01` — Báo điện tử VnExpress (`vnexpress.net`) |
| Loại | `landing` (trang danh mục RSS chính thức từ seed của handoff — lượt khảo sát đầu tiên) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://vnexpress.net/rss` · URL cuối: `https://vnexpress.net/rss` · Không có HTTP redirect (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:25:25+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:25:28 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | `unknown` (không thấy ngày hiệu lực chính sách trong phần `<head>` và `<header>` đã đọc) |
| Locator | HTTP response headers và phần đầu tài liệu HTML (`<!DOCTYPE html>` đến dòng 223, thẻ `<head>` và `<header class="section top-header">`) |
| Trích dẫn ngắn tối thiểu / quan sát | `<html lang="vi" xmlns="http://www.w3.org/1999/xhtml">`, `<title>RSS - Báo VnExpress</title>`, `<meta name="copyright" content="VnExpress"/>`, `<meta name="robots" content="index, follow, max-image-preview:large"/>` |
| Tool / thao tác thủ công | `run_command` chạy `curl.exe -sS -i -L --max-time 15 "https://vnexpress.net/rss" \| Select-Object -First 220` |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/html; charset=utf-8`; `cache-control: private, max-age=0, no-cache, no-store`; `server: vne-vn-fe-lv1-other-2`; `<meta charset="utf-8">` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với trạng thái HTTP 200, header, ngôn ngữ trang `vi` và sự tồn tại của trang RSS; `unverified` trong lượt đọc đầu tiên này đối với bảng danh sách feed và khung điều khoản nằm dưới dòng 223 |
| Giới hạn / điều chưa chứng minh | Do dòng 73 chứa chuỗi script/style nội tuyến dài nên `Select-Object -First 220` cắt đầu ra trước thẻ `<main>` trong lượt khảo sát đầu lúc `04:25:25+07:00`. Lịch sử lượt đọc đầu này được giữ nguyên; phần thân điều khoản trên trang được đọc ở lượt xác minh bổ sung [NEWS-E014](#news-e014) |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N01](P2_NEWS_SOURCE_AUDIT.md#21-source-id-n01--vnexpress), [Mục 3 — N01](P2_NEWS_SOURCE_AUDIT.md#31-ma-trận-quyền-n01--vnexpress) |

### `NEWS-E002`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N01` — Báo điện tử VnExpress (`vnexpress.net`) |
| Loại | `discovery` (tra cứu đường dẫn feed Kinh doanh và trang Điều khoản sử dụng trên tên miền `vnexpress.net`) |
| URL gốc / URL cuối / redirect quan sát | Truy vấn `search_web` giới hạn `domain: "vnexpress.net"` trả về các đích `https://vnexpress.net/rss`, `https://vnexpress.net/rss/kinh-doanh.rss` và `https://vnexpress.net/dieu-khoan-su-dung`; link nguồn trong kết quả tool bọc qua redirect grounding của Google (`unavailable` đối với HTTP redirect chain trực tiếp của publisher) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:25:47+07:00` và `2026-10-21T04:26:01+07:00` (`Asia/Ho_Chi_Minh`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | `unknown` |
| Locator | Kết quả `search_web` cho truy vấn `"vnexpress.net/rss" "Kinh doanh" "Điều khoản sử dụng"` và `"vnexpress.net/rss/kinh-doanh.rss" OR "vnexpress.net/dieu-khoan-su-dung"` |
| Trích dẫn ngắn tối thiểu / quan sát | Xác định địa chỉ feed chuyên mục Kinh doanh `https://vnexpress.net/rss/kinh-doanh.rss` và trang `https://vnexpress.net/dieu-khoan-su-dung`. Bản tóm tắt tìm kiếm nêu điều khoản RSS VnExpress cung cấp miễn phí cho cá nhân và tổ chức phi lợi nhuận, yêu cầu ghi rõ nguồn gốc và giữ quyền yêu cầu dừng phân tán bất kỳ lúc nào |
| Tool / thao tác thủ công | `search_web` (`domain: "vnexpress.net"`) |
| HTTP/status/header/encoding | `unavailable` (công cụ tìm kiếm không trả HTTP status/header của trang đích) |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với việc khám phá URL `https://vnexpress.net/rss/kinh-doanh.rss` và `https://vnexpress.net/dieu-khoan-su-dung`; `unverified` đối với nội dung điều khoản vì quy tắc catalog quy định “Search snippet chỉ hỗ trợ discovery, không chứng minh điều khoản” |
| Giới hạn / điều chưa chứng minh | Không dùng bản tóm tắt của công cụ tìm kiếm để kết luận quyền; điều khoản trực tiếp trên `https://vnexpress.net/rss` chỉ được xác nhận sau khi có lượt đọc bổ sung [NEWS-E014](#news-e014) |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N01](P2_NEWS_SOURCE_AUDIT.md#21-source-id-n01--vnexpress), [Mục 3 — N01](P2_NEWS_SOURCE_AUDIT.md#31-ma-trận-quyền-n01--vnexpress) |

### `NEWS-E003`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N01` — Báo điện tử VnExpress (`vnexpress.net`) |
| Loại | `policy` (trang Điều khoản sử dụng chung của VnExpress) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://vnexpress.net/dieu-khoan-su-dung` · Status line đầu tiên trả về trực tiếp `HTTP/1.1 200 OK` (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:26:12+07:00` (`Asia/Ho_Chi_Minh`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | `unknown` |
| Locator | Dòng đầu tiên của HTTP response từ `https://vnexpress.net/dieu-khoan-su-dung` |
| Trích dẫn ngắn tối thiểu / quan sát | Chỉ thu được dòng trạng thái `HTTP/1.1 200 OK`; phần header còn lại và thân HTML không được trích xuất ra stdout do lệnh PowerShell tách mảng dòng `$raw -split "\r?\n\r?\n", 2` khi chưa nối chuỗi (`-join`) |
| Tool / thao tác thủ công | `run_command` chạy một lượt `curl.exe -sS -i -L --max-time 15 "https://vnexpress.net/dieu-khoan-su-dung"` |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK` (`observed`); các header khác và encoding là `unavailable` trong đầu ra đã thu |
| Mức xác minh / nhận định được hỗ trợ | `observed` rằng endpoint `https://vnexpress.net/dieu-khoan-su-dung` phản hồi `HTTP/1.1 200 OK`; `unverified` đối với toàn bộ nội dung điều khoản chung trên trang này |
| Giới hạn / điều chưa chứng minh | Không gọi lại `https://vnexpress.net/dieu-khoan-su-dung`. Quyền sử dụng RSS của `N01` được đánh giá dựa trên điều khoản RSS chuyên biệt đã xác minh bổ sung tại [NEWS-E014](#news-e014), trong khi các quy định chung ngoài trang `/rss` tại `/dieu-khoan-su-dung` vẫn là `unverified` |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N01](P2_NEWS_SOURCE_AUDIT.md#21-source-id-n01--vnexpress), [Mục 3 — N01](P2_NEWS_SOURCE_AUDIT.md#31-ma-trận-quyền-n01--vnexpress), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E004`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N01` — Báo điện tử VnExpress (`vnexpress.net`) |
| Loại | `feed metadata` (feed RSS chính thức chuyên mục Kinh doanh) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://vnexpress.net/rss/kinh-doanh.rss` · URL cuối: `https://vnexpress.net/rss/kinh-doanh.rss` · Không có redirect (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:26:48+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:26:50 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Channel `<pubDate>`: `Wed, 21 Oct 2026 03:53:12 +0700` (`observed`) |
| Locator | `<rss version="2.0"><channel>` và 3 phần tử `<item>` đầu tiên (trong tổng số 60 `<item>`) tại `https://vnexpress.net/rss/kinh-doanh.rss` |
| Trích dẫn ngắn tối thiểu / quan sát | Channel: `<title>Kinh doanh - VnExpress RSS</title>`, `<generator>VnExpress</generator>`, `<link>https://vnexpress.net/rss/kinh-doanh.rss</link>`, không có thẻ `<language>`. 3 mẫu `<item>` đầu tiên đều có bộ thẻ `title, description, pubDate, link, guid, enclosure`: (1) `guid`/`link`: `https://vnexpress.net/lai-suat-trai-phieu-doanh-nghiep-gan-vung-dinh-5134769.html`, `pubDate`: `Wed, 21 Oct 2026 03:26:25 +0700`; (2) `guid`/`link`: `https://vnexpress.net/thao-cam-vien-bao-lai-nho-don-gan-2-trieu-luot-khach-5134815.html`, `pubDate`: `Wed, 21 Oct 2026 03:00:08 +0700`; (3) `guid`/`link`: `https://vnexpress.net/petronas-muon-dua-dien-gio-viet-nam-sang-malaysia-va-singapore-5134797.html`, `pubDate`: `Wed, 21 Oct 2026 02:17:49 +0700`. Thẻ `<guid>` không khai báo thuộc tính `isPermaLink`. `<description>` bọc `CDATA` dài 411–427 ký tự chứa HTML (`<a>`, `<img>`), chỉ là đoạn tóm tắt ngắn, không có toàn văn bài báo |
| Tool / thao tác thủ công | `run_command` chạy một lượt `curl.exe -sS -i -L --max-time 15 "https://vnexpress.net/rss/kinh-doanh.rss"` và chỉ đọc metadata của 3 `<item>` đầu tiên |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: application/xml; charset=utf-8`; `cache-control: private, max-age=0, no-cache, no-store,max-age=120, stale-while-revalidate=6, stale-if-error=864000, private`; XML prolog `<?xml version="1.0" encoding="UTF-8"?>` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với cấu trúc kỹ thuật RSS 2.0, định dạng thời gian RFC 2822 có offset `+0700`, đồng nhất `guid` và `link`, sự vắng mặt của `<language>` và `updatedAt`, và sự hiện diện của HTML trong `<description>` |
| Giới hạn / điều chưa chứng minh | Một lần đọc 3 mẫu không chứng minh quy tắc sửa bài (revision), tần suất cập nhật thực tế, độ phủ lịch sử hay tự thân cấp quyền sử dụng hợp pháp |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N01](P2_NEWS_SOURCE_AUDIT.md#21-source-id-n01--vnexpress), [Mục 3 — N01](P2_NEWS_SOURCE_AUDIT.md#31-ma-trận-quyền-n01--vnexpress), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E005`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N02` — Báo Tuổi Trẻ Online (`tuoitre.vn`) |
| Loại | `discovery` (tìm kiếm trang danh mục RSS chính thức của Báo Tuổi Trẻ) |
| URL gốc / URL cuối / redirect quan sát | Truy vấn `search_web` xác định trang RSS chính thức tại `https://tuoitre.vn/rss.htm` (link nguồn trong kết quả tìm kiếm qua redirect grounding; được xác minh trực tiếp ở `NEWS-E006`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:27:12+07:00` và `2026-10-21T04:27:20+07:00` (`Asia/Ho_Chi_Minh`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | `unknown` |
| Locator | Kết quả `search_web` cho truy vấn `site:tuoitre.vn rss kinh doanh điều khoản sử dụng` và `"tuoitre.vn/rss.htm" OR "tuoitre.vn/rss" "Kinh doanh" "Điều khoản sử dụng"` |
| Trích dẫn ngắn tối thiểu / quan sát | Khám phá địa chỉ landing page chính thức `https://tuoitre.vn/rss.htm` của Tuổi Trẻ Online |
| Tool / thao tác thủ công | `search_web` (`domain: "tuoitre.vn"`) |
| HTTP/status/header/encoding | `unavailable` (search tool không cung cấp HTTP header) |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với đường dẫn khám phá `https://tuoitre.vn/rss.htm` |
| Giới hạn / điều chưa chứng minh | Snippet tìm kiếm không dùng làm bằng chứng điều khoản; điều khoản và đường dẫn feed được kiểm chứng trực tiếp tại `NEWS-E006` và `NEWS-E007` |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N02](P2_NEWS_SOURCE_AUDIT.md#22-source-id-n02--tuổi-trẻ-online) |

### `NEWS-E006`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N02` — Báo Tuổi Trẻ Online (`tuoitre.vn`) |
| Loại | `policy` (trang danh mục RSS chính thức kèm mục `Điều khoản sử dụng` và `Khái niệm RSS`) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://tuoitre.vn/rss.htm` · URL cuối: `https://tuoitre.vn/rss.htm` · Không có HTTP redirect; header trả `x-canonical-url: /rss.htm` (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:27:31+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:27:34 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Header `lastmodifieddate: 21/10/2026 04:18:50`; văn bản điều khoản không ghi ngày ban hành/hiệu lực riêng (`unknown`) |
| Locator | Trang `https://tuoitre.vn/rss.htm`: danh sách `Cấu trúc chuyên mục` (liên kết `Kinh doanh RSS` trỏ tới `/kinh-doanh.rss`), mục `Điều khoản sử dụng` và mục `Khái niệm RSS` |
| Trích dẫn ngắn tối thiểu / quan sát | Mục `Điều khoản sử dụng`: *"Các nguồn kênh tin được cung cấp miễn phí cho các cá nhân và các tổ chức phi lợi nhuận. Chúng tôi yêu cầu bạn cung cấp rõ các thông tin cần thiết khi bạn sử dụng các nguồn kênh tin này từ Tuổi Trẻ. Tuổi Trẻ có quyền yêu cầu bạn ngừng cung cấp và phân tán thông tin dưới dạng này ở bất kỳ thời điểm nào và với bất kỳ lý do nào."* Mục `Khái niệm RSS`: *"Trên trình đọc tin này, người sử dụng có thể thấy những tin chính mới nhất, tiêu đề, tóm tắt và cả đường link để xem toàn bộ tin."* |
| Tool / thao tác thủ công | `run_command` chạy một lượt `curl.exe -sS -i -L --max-time 15 "https://tuoitre.vn/rss.htm"` |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/html; charset=utf-8`; `server: Kestrel`; `x-canonical-url: /rss.htm`; `timeexpire: 600`; `<html lang="vi">` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` nguyên văn điều khoản sử dụng RSS của Tuổi Trẻ Online và đường dẫn feed `/kinh-doanh.rss`. Hỗ trợ trực tiếp quyền đọc/hiển thị cục bộ cá nhân/phi lợi nhuận đối với metadata và đoạn tóm tắt có trong feed kèm ghi rõ nguồn và nghĩa vụ ngừng cung cấp khi có yêu cầu |
| Giới hạn / điều chưa chứng minh | Điều khoản không nêu rõ: (1) tần suất/cơ chế polling tự động định kỳ của hệ thống backend, (2) thời hạn lưu trữ cơ sở dữ liệu lâu dài, (3) phân biệt giữa trình đọc cá nhân (News reader) và tái phân phối trên ứng dụng web công khai của bên thứ ba, (4) việc gửi dữ liệu sang mô hình AI/LLM bên thứ ba hoặc (5) huấn luyện mô hình (training). Do đó các mục đích ngoài truy cập/hiển thị cục bộ cá nhân phải giữ `unknown` |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N02](P2_NEWS_SOURCE_AUDIT.md#22-source-id-n02--tuổi-trẻ-online), [Mục 3 — N02](P2_NEWS_SOURCE_AUDIT.md#32-ma-trận-quyền-n02--tuổi-trẻ-online), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E007`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N02` — Báo Tuổi Trẻ Online (`tuoitre.vn`) |
| Loại | `feed metadata` (feed RSS chính thức chuyên mục Kinh doanh) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://tuoitre.vn/kinh-doanh.rss` (từ href `/kinh-doanh.rss` trên `https://tuoitre.vn/rss.htm`) · URL cuối: `https://tuoitre.vn/kinh-doanh.rss` · Không có HTTP redirect (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:27:51+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:27:54 GMT`, `timecached: 21/10/2026 03:37:10`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Channel `<lastBuildDate>`: `Wed, 21 Oct 2026 03:37:10 GMT+7` (`observed`) |
| Locator | `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>` và 3 phần tử `<item>` đầu tiên (trong tổng số 50 `<item>`) tại `https://tuoitre.vn/kinh-doanh.rss` |
| Trích dẫn ngắn tối thiểu / quan sát | Channel: `<title><![CDATA[TUOI TRE ONLINE - Kinh doanh - RSS Feed]]></title>`, `<link><![CDATA[https://tuoitre.vn/kinh-doanh.htm]]></link>`, `<language>vi-vn</language>`, `<copyright>tuoitre.vn</copyright>`, `<lastBuildDate>Wed, 21 Oct 2026 03:37:10 GMT+7</lastBuildDate>`, `<ttl>50</ttl>`. 3 mẫu `<item>` đầu tiên đều chỉ có các thẻ `title, description, link, enclosure, author, pubDate` và **hoàn toàn không có thẻ `<guid>`**: (1) `link`: `https://tuoitre.vn/5-tiem-vang-lon-dong-loat-ra-thong-bao-moi-khong-nhan-vi-dien-tu-tai-khoan-khong-chinh-chu-100261020215400673.htm`, `pubDate`: `10/20/2026 10:08:00 PM`; (2) `link`: `https://tuoitre.vn/viet-nam-huong-toi-tang-truong-hai-con-so-trong-nam-2027-10026102020291308.htm`, `pubDate`: `10/20/2026 9:05:00 PM`; (3) `link`: `https://tuoitre.vn/ong-lon-nang-luong-malaysia-thuc-day-hop-tac-lng-dien-sach-voi-viet-nam-100261020193918622.htm`, `pubDate`: `10/20/2026 8:45:00 PM`. `<pubDate>` của từng `<item>` dùng định dạng `MM/dd/yyyy hh:mm:ss tt` (có ký tự khoảng trắng hẹp `U+202F` trước `PM`) và **không có timezone offset riêng trên từng item**. `<description>` bọc `CDATA` dài 150–271 ký tự, không chứa thẻ HTML `<a>/<img>/<p>`, không chứa toàn văn bài báo |
| Tool / thao tác thủ công | `run_command` chạy một lượt `curl.exe -sS -i -L --max-time 15 "https://tuoitre.vn/kinh-doanh.rss"` và chỉ đọc metadata của 3 `<item>` đầu tiên |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/xml` (không khai báo `charset` ở HTTP header); XML prolog `<?xml version="1.0" encoding="UTF-8"?>`; `server: Kestrel` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với cấu trúc RSS 2.0, việc thiếu thẻ `<guid>`, định dạng `pubDate` phi chuẩn RFC 2822 thiếu offset ở mức `<item>` (chỉ có `GMT+7` ở `<channel><lastBuildDate>`) và `<language>vi-vn</language>` |
| Giới hạn / điều chưa chứng minh | Không được tự suy diễn offset của `<item><pubDate>` là `+07:00` như một trường đã xác minh nếu contract yêu cầu offset tường minh trên từng bản ghi; một lần đọc không kiểm chứng được hành vi sửa bài (revision) |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N02](P2_NEWS_SOURCE_AUDIT.md#22-source-id-n02--tuổi-trẻ-online), [Mục 3 — N02](P2_NEWS_SOURCE_AUDIT.md#32-ma-trận-quyền-n02--tuổi-trẻ-online), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E008`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N03` — Báo Thanh Niên (`thanhnien.vn`) |
| Loại | `discovery` (tra cứu trang RSS chính thức và feed Kinh tế của Báo Thanh Niên) |
| URL gốc / URL cuối / redirect quan sát | Truy vấn `search_web` (`domain: "thanhnien.vn"`) trả về địa chỉ trang danh mục `https://thanhnien.vn/rss.html` và feed `https://thanhnien.vn/rss/kinh-te.rss` |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:28:04+07:00` và `2026-10-21T04:28:12+07:00` (`Asia/Ho_Chi_Minh`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | `unknown` |
| Locator | Kết quả `search_web` cho truy vấn `"thanhnien.vn/rss" "Kinh tế" OR "Tài chính" "Điều khoản"` và `"thanhnien.vn/rss.html" OR "thanhnien.vn/rss" "Kênh tin RSS" OR "Điều khoản sử dụng"` |
| Trích dẫn ngắn tối thiểu / quan sát | Xác định địa chỉ trang danh mục RSS `https://thanhnien.vn/rss.html` và feed `https://thanhnien.vn/rss/kinh-te.rss`. Lưu ý: đoạn tóm tắt tổng hợp của `search_web` có câu nói chung rằng RSS cung cấp miễn phí cho cá nhân/phi lợi nhuận, nhưng khi đọc trực tiếp trang `https://thanhnien.vn/rss.html` (`NEWS-E009`, `NEWS-E013`) và `https://thanhnien.vn/policy.html` (`NEWS-E010`) thì câu chữ cấp phép cho tổ chức phi lợi nhuận đó **không tồn tại** trên trang của Báo Thanh Niên |
| Tool / thao tác thủ công | `search_web` (`domain: "thanhnien.vn"`) |
| HTTP/status/header/encoding | `unavailable` |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với discovery URL `https://thanhnien.vn/rss.html` và `https://thanhnien.vn/rss/kinh-te.rss`; bác bỏ việc dùng tóm tắt của công cụ tìm kiếm làm bằng chứng điều khoản |
| Giới hạn / điều chưa chứng minh | Minh họa trực tiếp lý do không được tin vào tóm tắt chính sách do công cụ tìm kiếm tổng hợp nếu không đối chiếu văn bản gốc trên trang của publisher |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N03](P2_NEWS_SOURCE_AUDIT.md#23-source-id-n03--báo-thanh-niên), [Mục 3 — N03](P2_NEWS_SOURCE_AUDIT.md#33-ma-trận-quyền-n03--báo-thanh-niên) |

### `NEWS-E009`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N03` — Báo Thanh Niên (`thanhnien.vn`) |
| Loại | `landing` & `policy` (trang danh mục RSS chính thức kèm hướng dẫn RSS Reader và tuyên bố bản quyền ở footer — lượt khảo sát đầu tiên) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://thanhnien.vn/rss.html` · URL cuối: `https://thanhnien.vn/rss.html` · Không có HTTP redirect (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:28:26+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:28:28 GMT`, `lastmodifieddate: 21/10/2026 04:28:14`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Footer ghi: `Giấy phép xuất bản số 110/GP - BTTTT cấp ngày 24.3.2020 © 2003-2026` (`observed`) |
| Locator | Trang `https://thanhnien.vn/rss.html`: bảng danh mục RSS (mục `Kinh tế - https://thanhnien.vn/rss/kinh-te.rss`, `Ngân hàng - https://thanhnien.vn/rss/kinh-te/ngan-hang.rss`, `Chứng khoán - https://thanhnien.vn/rss/kinh-te/chung-khoan.rss`, `Cải chính - https://thanhnien.vn/rss/cai-chinh.rss`), mục `RSS là gì?`, `Chương trình đọc RSS là gì?` và chân trang (footer) |
| Trích dẫn ngắn tối thiểu / quan sát | Mục `RSS là gì?`: *"Mỗi tin dưới dạng RSS sẽ gồm : Tiêu đề, tóm tắt nội dung và đường dẫn nối đến trang Web chứa nội dung đầy đủ của tin."* Mục `Chương trình đọc RSS là gì?`: *"RSS Reader là phần mềm có chức năng tự động lấy tin tức đã được cấu trúc theo định dạng RSS. Một số phần mềm đọc RSS cho phép bạn lập lịch cập nhật tin tức."* Footer: *"© 2003-2026 Bản quyền thuộc về Báo Thanh Niên. Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản."* Liên kết chính sách ở footer là `Chính sách bảo mật -> https://thanhnien.vn/policy.html` |
| Tool / thao tác thủ công | `run_command` chạy `curl.exe -sS -i -L --max-time 15 "https://thanhnien.vn/rss.html"` |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/html; charset=utf-8`; `server: nginx`; `cache-control: no-cache, private`; `timeexpire: 604800`; `<html lang="vi">` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` danh mục RSS chính thức, mô tả chức năng RSS Reader cá nhân và tuyên bố bản quyền ở footer |
| Giới hạn / điều chưa chứng minh | Ở lượt khảo sát đầu tiên này chưa trích dẫn và đối chiếu mục `Điều kiện sử dụng` nằm ngay dưới mục `Chương trình đọc RSS là gì?`; việc đối chiếu trực tiếp giữa mục `Điều kiện sử dụng` và footer bản quyền được thực hiện bổ sung tại [NEWS-E013](#news-e013) |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N03](P2_NEWS_SOURCE_AUDIT.md#23-source-id-n03--báo-thanh-niên), [Mục 3 — N03](P2_NEWS_SOURCE_AUDIT.md#33-ma-trận-quyền-n03--báo-thanh-niên), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E010`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N03` — Báo Thanh Niên (`thanhnien.vn`) |
| Loại | `policy` (trang `Chính sách bảo mật` được liên kết từ footer của `https://thanhnien.vn/rss.html`) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://thanhnien.vn/policy.html` · URL cuối: `https://thanhnien.vn/policy.html` · Không có HTTP redirect (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:28:40+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:28:42 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Điều 13 khoản 3 (phần Chính sách đóng góp tự nguyện): *"Chính sách này có hiệu lực từ ngày 10 tháng 10 năm 2026."* (`observed`) |
| Locator | Trang `https://thanhnien.vn/policy.html`: mục `Chính sách bảo mật` và `Chính sách đóng góp tự nguyện` (Điều 1 đến Điều 13) |
| Trích dẫn ngắn tối thiểu / quan sát | Trang chỉ quy định về thu thập/bảo vệ dữ liệu cá nhân của bạn đọc và quy chế tính năng “Ủng hộ tự nguyện” (hiệu lực từ `10/10/2026`); không có bất kỳ điều khoản nào đề cập đến RSS, cấp phép nội dung báo chí, lưu trữ, phân phối lại hay AI/training |
| Tool / thao tác thủ công | `run_command` chạy một lượt `curl.exe -sS -i -L --max-time 15 "https://thanhnien.vn/policy.html"` |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/html; charset=utf-8`; `server: nginx`; `cache-control: no-cache, private` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` rằng trang chính sách liên kết ở footer của Báo Thanh Niên không có quy định làm rõ thêm về RSS hay cấp quyền khai thác/lưu trữ/tái phân phối RSS |
| Giới hạn / điều chưa chứng minh | Không giải quyết được sự thiếu cụ thể và xung đột giữa mục `Điều kiện sử dụng` trên trang RSS với dòng bản quyền ở footer (xem đối chiếu tại [NEWS-E013](#news-e013)); do đó các mục đích ngoài thao tác đọc RSS cá nhân phải giữ `unknown` (đóng) |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N03](P2_NEWS_SOURCE_AUDIT.md#23-source-id-n03--báo-thanh-niên), [Mục 3 — N03](P2_NEWS_SOURCE_AUDIT.md#33-ma-trận-quyền-n03--báo-thanh-niên), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E011`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N03` — Báo Thanh Niên (`thanhnien.vn`) |
| Loại | `feed metadata` (feed RSS chính thức chuyên mục Kinh tế) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://thanhnien.vn/rss/kinh-te.rss` · URL cuối: `https://thanhnien.vn/rss/kinh-te.rss` · Không có HTTP redirect (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T04:29:00+07:00` (`Asia/Ho_Chi_Minh`; header `date: Tue, 20 Oct 2026 21:29:02 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Channel `<pubDate>` và `<lastBuildDate>`: `Wed, 21 Oct 26 04:29:02 +0700` (`observed`) |
| Locator | `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel>` và 3 phần tử `<item>` đầu tiên (trong tổng số 50 `<item>`) tại `https://thanhnien.vn/rss/kinh-te.rss` |
| Trích dẫn ngắn tối thiểu / quan sát | Tài liệu bắt đầu trực tiếp bằng `<rss version="2.0" ...>` (không có prolog `<?xml ...?>`). Channel có `<title>Kinh tế \| Báo Thanh Niên</title>`, `<link>https://thanhnien.vn/kinh-te.htm</link>`, `<language>vi-vn</language>`, `<ttl>15</ttl>` và **hai thẻ `<atom:link rel="self">` xung đột nhau** (`href="https://thanhnien.vn/rss/kinh-te.rss"` và `href="https://thanhnien.vn/kinh-te.htm"`). 3 mẫu `<item>` đầu tiên đều có bộ thẻ `title, link, description, pubDate, guid`: (1) `guid`/`link`: `https://thanhnien.vn/agribank-cung-sinh-vien-gom-diem-moi-ngay-doi-qua-me-say-tren-agribank-plus-185261020144729177.htm`, `pubDate`: `Tue, 20 Oct 26 20:00:00 +0700`; (2) `guid`/`link`: `https://thanhnien.vn/rang-sang-mai-se-hop-long-cau-di-bo-ngan-ti-vuot-song-sai-gon-18526102019465209.htm`, `pubDate`: `Tue, 20 Oct 26 19:48:00 +0700`; (3) `guid`/`link`: `https://thanhnien.vn/chu-dau-tu-nutifood-khoanh-khac-ket-noi-hai-bo-song-sai-gon-san-sang-hop-long-185261020173958657.htm`, `pubDate`: `Tue, 20 Oct 26 19:00:00 +0700`. Phát hiện kỹ thuật quan trọng: `<title>` bọc trong `CDATA` nhưng vẫn chứa HTML entity dạng tên (`&ugrave;`, `&ecirc;`, `&lsquo;`, `&agrave;`, `&rsquo;`, `&aacute;`, `&ocirc;`, `&ograve;`); `<pubDate>` dùng **năm 2 chữ số (`26`)** theo RFC 822 cũ thay vì 4 chữ số (`2026`); `<description>` bọc `CDATA` dài 555–891 ký tự có HTML (`<a>`, `<img>`), không có toàn văn |
| Tool / thao tác thủ công | `run_command` chạy một lượt `curl.exe -sS -i -L --max-time 15 "https://thanhnien.vn/rss/kinh-te.rss"` và chỉ đọc metadata của 3 `<item>` đầu tiên |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/xml; charset=UTF-8`; `server: nginx`; `cache-control: no-cache, private`; `timeexpire: 300` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` đối với cấu trúc RSS 2.0, lỗi double-encoding HTML entity bên trong `CDATA` của `<title>`, định dạng năm 2 chữ số trong `<pubDate>`, hai thẻ `atom:link rel="self"` không đồng nhất và sự đồng nhất giữa `guid` và `link` |
| Giới hạn / điều chưa chứng minh | Một lần đọc 3 mẫu không chứng minh quy tắc sửa bài (dù trang danh mục có chuyên mục riêng `https://thanhnien.vn/rss/cai-chinh.rss`), không chứng minh độ phủ hay cấp quyền sử dụng |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N03](P2_NEWS_SOURCE_AUDIT.md#23-source-id-n03--báo-thanh-niên), [Mục 3 — N03](P2_NEWS_SOURCE_AUDIT.md#33-ma-trận-quyền-n03--báo-thanh-niên), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E012`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `O01` — Ngân hàng Nhà nước Việt Nam (`sbv.gov.vn`) và `O02` — Ủy ban Chứng khoán Nhà nước (`ssc.gov.vn`) |
| Loại | `official announcement` & `blocked` (kiểm tra truy cập trang công bố của hai cơ quan quản lý về vàng/FX và chứng khoán) |
| URL gốc / URL cuối / redirect quan sát | (1) `O01`: URL yêu cầu `https://www.sbv.gov.vn` -> trả trực tiếp `HTTP/1.1 403 No server`, không có redirect (`observed`). (2) `O02`: URL yêu cầu `https://ssc.gov.vn` -> do lệnh `curl.exe` có bật cờ `-L` (tự động theo redirect), lệnh đã gửi liên tiếp 51 HTTP request (1 request đầu tới `https://ssc.gov.vn` và **theo tự động 50 lần redirect `HTTP/1.1 302 Moved Temporarily`** tới `Location: https://ssc.gov.vn/webcenter/portal/ubck`) trước khi `curl` tự dừng với lỗi `curl: (47) Maximum (50) redirects followed` (`observed`) |
| Thời điểm truy cập / múi giờ | Discovery `search_web`: `2026-10-21T04:29:15+07:00`; `https://www.sbv.gov.vn`: `2026-10-21T04:29:26+07:00`; `https://ssc.gov.vn`: `2026-10-21T04:29:45+07:00` (`Asia/Ho_Chi_Minh`; header `Date` trên `ssc.gov.vn` báo `Tue, 20 Oct 2026 21:50:03 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | `unavailable` (không đọc được nội dung trang công bố do HTTP 403 và chuỗi 50 redirect 302) |
| Locator | HTTP response headers và thân lỗi của `https://www.sbv.gov.vn` và chuỗi 50 phản hồi `302` của `https://ssc.gov.vn` |
| Trích dẫn ngắn tối thiểu / quan sát | Chỉ các trường HTTP status/header/body dưới đây là `observed`: (1) `https://www.sbv.gov.vn`: `HTTP/1.1 403 No server`, `Content-Type: text/html; charset=UTF-8`, `Set-Cookie: SBVCookie=...`, `Set-Cookie: f5avraaaaaaaaaaaaaaaa_session_=...`, `Set-Cookie: TS01b20a71=...`, `<title>Error</title>`. (2) `https://ssc.gov.vn`: 50 phản hồi `HTTP/1.1 302 Moved Temporarily`, `Server: nginx`, `Location: https://ssc.gov.vn/webcenter/portal/ubck`, `X-ORACLE-DMS-RID: 0`, `Set-Cookie: JSESSIONID=...; path=/webcenter; HttpOnly` |
| Tool / thao tác thủ công | `search_web` (`site:sbv.gov.vn OR site:ssc.gov.vn`) để xác nhận domain `.gov.vn`, sau đó `run_command` chạy `curl.exe -sS -i -L --max-time 15` cho mỗi URL. **Ghi nhận trung thực:** vì truyền cờ `-L`, lệnh `curl` đối với `ssc.gov.vn` đã tự động theo tới 50 redirect (tạo 50 lượt truy cập lặp lại vào `https://ssc.gov.vn/webcenter/portal/ubck` trong cùng một lệnh) chứ không dừng ngay sau phản hồi `302` đầu tiên |
| HTTP/status/header/encoding | `O01` (`sbv.gov.vn`): `HTTP/1.1 403 No server`, `Content-Type: text/html; charset=UTF-8` (`observed`); `O02` (`ssc.gov.vn`): `HTTP/1.1 302 Moved Temporarily`, `Location: https://ssc.gov.vn/webcenter/portal/ubck`, `Content-Type: text/html` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` **chỉ** đối với mã trạng thái `HTTP/1.1 403 No server` (trên `sbv.gov.vn`), chuỗi 50 phản hồi `HTTP/1.1 302 Moved Temporarily` tới `Location: https://ssc.gov.vn/webcenter/portal/ubck` (trên `ssc.gov.vn`), và các header `Set-Cookie` / `X-ORACLE-DMS-RID` xuất hiện trong phản hồi. Nhận định rằng `sbv.gov.vn` chặn bằng thiết bị WAF (từ tiền đề tên cookie `f5avraaaaaaaaaaaaaaaa_session_`, `TS01b20a71`) và rằng `ssc.gov.vn` lặp redirect do cổng WebCenter yêu cầu duy trì cookie phiên `JSESSIONID` khi `curl -L` không gửi lại cookie chỉ là **`inferred` / `unverified`**, không phải kết luận `observed` trực tiếp từ tài liệu hay thông báo của cơ quan |
| Giới hạn / điều chưa chứng minh | Không thử gắn cookie jar hay giả lập trình duyệt; nội dung thông cáo cụ thể, điều khoản bản quyền và nguyên nhân cấu hình máy chủ phía sau HTTP 403 / 302 của hai cổng này đều là `unverified` |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 4](P2_NEWS_SOURCE_AUDIT.md#4-liên-kết-công-bố-chính-thức-tuyển-chọn--tối-đa-hai), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E013`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N03` — Báo Thanh Niên (`thanhnien.vn`) |
| Loại | `policy` (lượt đọc xác minh bổ sung trên `https://thanhnien.vn/rss.html` để đối chiếu mục `Điều kiện sử dụng` với footer bản quyền) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://thanhnien.vn/rss.html` · URL cuối: `https://thanhnien.vn/rss.html` · Không theo redirect tự động (gọi `curl.exe` không có `-L`), phản hồi trực tiếp `HTTP/1.1 200 OK` (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T10:33:08+07:00` (`Asia/Ho_Chi_Minh`; header `date: Wed, 21 Oct 2026 03:33:11 GMT`, `lastmodifieddate: 16/10/2026 11:49:11`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Mục `Điều kiện sử dụng` không ghi ngày hiệu lực riêng (`unknown`); footer ghi `Giấy phép xuất bản số 110/GP - BTTTT cấp ngày 24.3.2020 © 2003-2026` (`observed`) |
| Locator | Trang `https://thanhnien.vn/rss.html`: mục `RSS là gì?`, mục `Chương trình đọc RSS là gì?`, mục `Điều kiện sử dụng` và phần chân trang (footer) |
| Trích dẫn ngắn tối thiểu / quan sát | Mục `Điều kiện sử dụng`: *"Báo Thanh Niên không chịu trách nhiệm về các nội dung của các trang khác ngoài Báo Thanh Niên được dẫn trong trang này. Khi sử dụng lại các tin lấy từ Báo Thanh Niên, bạn phải ghi rõ nguồn tin là "Theo Báo Thanh Niên" hoặc "Báo Thanh Niên"."* Đối chiếu với footer trên cùng trang ([NEWS-E009](#news-e009)): *"© 2003-2026 Bản quyền thuộc về Báo Thanh Niên. Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản."* |
| Tool / thao tác thủ công | `run_command` chạy một lượt xác minh bổ sung `curl.exe -sS -i --max-time 15 "https://thanhnien.vn/rss.html"` (không dùng cờ `-L`, không tự động theo redirect) |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/html; charset=utf-8`; `server: nginx`; `cache-control: no-cache, private`; `x-cache-status: HIT` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` nguyên văn mục `Điều kiện sử dụng` trên `https://thanhnien.vn/rss.html` và sự đồng tồn tại giữa hai câu chữ trên cùng một trang: một mặt mục `Điều kiện sử dụng` nêu *"Khi sử dụng lại các tin lấy từ Báo Thanh Niên, bạn phải ghi rõ nguồn tin là 'Theo Báo Thanh Niên' hoặc 'Báo Thanh Niên'"*, mặt khác footer tuyên bố *"Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản"* |
| Giới hạn / điều chưa chứng minh | Văn bản trên trang không giải thích mối quan hệ pháp lý giữa câu *"Khi sử dụng lại các tin... phải ghi rõ nguồn tin"* ở mục `Điều kiện sử dụng` và câu *"Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản"* ở footer; không nêu rõ đối tượng được phép (cá nhân, phi lợi nhuận hay thương mại), phạm vi trường được phép sử dụng lại (chỉ tiêu đề + link, đoạn tóm tắt hay toàn văn), có cần xin văn bản chấp thuận trước khi ghi nguồn hay không, cũng như không đề cập đến thu thập tự động, lưu trữ cơ sở dữ liệu, hiển thị lại trên sản phẩm/ứng dụng, AI hay training. Vì phạm vi cho phép và điều kiện tiên quyết chưa rõ ràng, các mục đích ngoài thao tác đọc RSS thủ công phải được cập nhật về `unknown` (đóng, không tự mở collector) thay vì tự suy diễn thành `allow` hay khẳng định `deny` tuyệt đối |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N03](P2_NEWS_SOURCE_AUDIT.md#23-source-id-n03--báo-thanh-niên), [Mục 3 — N03](P2_NEWS_SOURCE_AUDIT.md#33-ma-trận-quyền-n03--báo-thanh-niên), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

### `NEWS-E014`

| Thuộc tính | Giá trị |
|---|---|
| Source ID / publisher hoặc cơ quan | `N01` — Báo điện tử VnExpress (`vnexpress.net`) |
| Loại | `landing` & `policy` (lượt đọc xác minh bổ sung trên `https://vnexpress.net/rss` để thu thập nguyên văn điều khoản sử dụng RSS) |
| URL gốc / URL cuối / redirect quan sát | URL yêu cầu: `https://vnexpress.net/rss` · URL cuối: `https://vnexpress.net/rss` · Không theo redirect tự động (gọi `curl.exe` không có `-L`), phản hồi trực tiếp `HTTP/1.1 200 OK` (`observed`) |
| Thời điểm truy cập / múi giờ | `2026-10-21T10:33:11+07:00` (`Asia/Ho_Chi_Minh`; header `date: Wed, 21 Oct 2026 03:33:15 GMT`) |
| Ngày hiệu lực/cập nhật do nguồn ghi | Văn bản điều khoản trên trang không ghi ngày ban hành/hiệu lực riêng (`unknown`); giao diện trang hiển thị ngày hiện tại `Thứ tư, 21/10/2026` (`observed`) |
| Locator | Phần thân chính của `https://vnexpress.net/rss`: mục `Khái niệm RSS`, danh sách kênh RSS (trong đó có `Kinh doanh RSS`) và mục `Điều khoản sử dụng` ở cuối trang |
| Trích dẫn ngắn tối thiểu / quan sát | Mục `Khái niệm RSS`: *"Dữ liệu này được các chương trình đọc tin chuyên biệt ( gọi là News reader) phân tích và hiển thị trên máy tính của người sử dụng. Trên trình đọc tin này, người sử dụng có thể thấy những tin chính mới nhất, tiêu đề, tóm tắt và cả đường link để xem toàn bộ tin."* Mục `Điều khoản sử dụng`: *"Các nguồn kênh tin được cung cấp miễn phí cho các cá nhân và các tổ chức phi lợi nhuận. Chúng tôi yêu cầu bạn cung cấp rõ các thông tin cần thiết khi bạn sử dụng các nguồn kênh tin này từ VnExpress. VnExpress có quyền yêu cầu bạn ngừng cung cấp và phân tán thông tin dưới dạng này ở bất kỳ thời điểm nào và với bất kỳ lý do nào."* |
| Tool / thao tác thủ công | `run_command` chạy một lượt xác minh bổ sung `curl.exe -sS -i --max-time 15 "https://vnexpress.net/rss"` (không dùng cờ `-L`, không tự động theo redirect) |
| HTTP/status/header/encoding | `HTTP/1.1 200 OK`; `content-type: text/html; charset=utf-8`; `cache-control: private, max-age=0, no-cache, no-store`; `server: vne-vn-fe-lv1-other-0` (`observed`) |
| Mức xác minh / nhận định được hỗ trợ | `observed` trực tiếp nguyên văn `Khái niệm RSS` và `Điều khoản sử dụng` trên trang `https://vnexpress.net/rss` (vốn bị cắt ở dòng 223 trong lượt khảo sát đầu tiên `NEWS-E001`). Hỗ trợ quyền `allow` có điều kiện đối với thao tác truy cập thủ công và hiển thị cục bộ trên máy người dùng (tương đương News reader cho cá nhân/tổ chức phi lợi nhuận kèm ghi rõ nguồn và nghĩa vụ ngừng ngay khi VnExpress yêu cầu) đối với metadata và đoạn tóm tắt có trong feed |
| Giới hạn / điều chưa chứng minh | Điều khoản trên `https://vnexpress.net/rss` (tương tự `N02`) không quy định rõ: (1) quyền chạy bộ thu thập tự động định kỳ từ backend (`automated_collection`), (2) quyền lưu trữ bền vững vào cơ sở dữ liệu (`local_storage`) và thời hạn retention, (3) quy trình/điều kiện cụ thể của yêu cầu *"cung cấp rõ các thông tin cần thiết"* khi hiển thị công khai hoặc phân phối lại (`public_redisplay`), (4) quyền xử lý bằng AI/LLM bên thứ ba (`ai_processing`) và (5) quyền tạo bộ dữ liệu hay huấn luyện mô hình (`model_training`). Các mục đích này tiếp tục giữ `unknown` (đóng, không tự mở collector) |
| Tham chiếu audit | [P2_NEWS_SOURCE_AUDIT.md — Mục 1](P2_NEWS_SOURCE_AUDIT.md#1-phạm-vi-và-nhật-ký-khảo-sát), [Mục 2 — N01](P2_NEWS_SOURCE_AUDIT.md#21-source-id-n01--vnexpress), [Mục 3 — N01](P2_NEWS_SOURCE_AUDIT.md#31-ma-trận-quyền-n01--vnexpress), [Mục 5](P2_NEWS_SOURCE_AUDIT.md#5-đề-xuất-bằng-văn-xuôi--chưa-là-thiết-kế-triển-khai) |

## Thay đổi, kết quả âm tính và mâu thuẫn

| Thời điểm | Source ID / Evidence ID | Phát hiện hoặc thay đổi so bằng chứng trước | Ảnh hưởng tới audit / giới hạn |
|---|---|---|---|
| `2026-10-21T04:25:25+07:00` – `2026-10-21T04:26:12+07:00` & `2026-10-21T10:33:11+07:00` | `N01` / [NEWS-E001](#news-e001), [NEWS-E002](#news-e002), [NEWS-E003](#news-e003), [NEWS-E014](#news-e014) | Trong đợt khảo sát đầu tiên (`NEWS-E001`, `NEWS-E003`), phần thân điều khoản trên `https://vnexpress.net/rss` bị cắt sau dòng 223 và trang `https://vnexpress.net/dieu-khoan-su-dung` chỉ in dòng trạng thái `HTTP/1.1 200 OK`, nên toàn bộ quyền `N01` ban đầu phải để `unknown`. Trong lượt đọc xác minh bổ sung lúc `10:33:11+07:00` ([NEWS-E014](#news-e014), không sửa lịch sử `NEWS-E001`), nguyên văn mục `Khái niệm RSS` và `Điều khoản sử dụng` trên `https://vnexpress.net/rss` đã được quan sát trực tiếp (`observed`): cấp miễn phí cho cá nhân và tổ chức phi lợi nhuận, yêu cầu cung cấp rõ thông tin cần thiết và bảo lưu quyền yêu cầu ngừng cung cấp/phân tán bất kỳ lúc nào | Cập nhật ma trận quyền `N01`: mở `allow` có điều kiện cho `Truy cập thủ công` và `Hiển thị local` (trong phạm vi News reader cá nhân/phi lợi nhuận kèm attribution và nghĩa vụ ngừng khi có yêu cầu) đối với metadata và `description` có trong feed; giữ nguyên `unknown` (đóng, không mở collector) đối với `Truy cập tự động`, `Lưu cục bộ` vào DB, `Hiển thị public / phân phối lại`, `AI processing` và `Training` |
| `2026-10-21T04:27:51+07:00` | `N02` / [NEWS-E007](#news-e007) | Feed `https://tuoitre.vn/kinh-doanh.rss` trả HTTP 200 hợp lệ nhưng các phần tử `<item>` hoàn toàn không có thẻ `<guid>`, đồng thời `<pubDate>` ở mức `<item>` dùng định dạng `10/20/2026 10:08:00 PM` (có ký tự `U+202F` và không có timezone offset), khác với `<lastBuildDate>` ở mức `<channel>` (`Wed, 21 Oct 2026 03:37:10 GMT+7`) | Nếu chọn `N02`, không thể dựa vào `<guid>` làm định danh bài báo mà phải dùng canonical URL từ `<link>` kết hợp `publisher`, đồng thời phải xử lý rõ việc thiếu timezone offset ở `<item><pubDate>` (không tự bịa offset nếu chưa có quy tắc chuẩn hóa được duyệt) |
| `2026-10-21T04:28:04+07:00` – `2026-10-21T04:28:40+07:00` & `2026-10-21T10:33:08+07:00` | `N03` / [NEWS-E008](#news-e008), [NEWS-E009](#news-e009), [NEWS-E010](#news-e010), [NEWS-E013](#news-e013) | (1) Tóm tắt của `search_web` (`NEWS-E008`) nói RSS miễn phí cho cá nhân/tổ chức phi lợi nhuận nhưng câu này không có trên trang của Báo Thanh Niên. (2) Lượt đọc xác minh bổ sung `https://thanhnien.vn/rss.html` ([NEWS-E013](#news-e013)) cho thấy ngay trên cùng một trang có hai nội dung cần đối chiếu: mục `Điều kiện sử dụng` ghi *"Khi sử dụng lại các tin lấy từ Báo Thanh Niên, bạn phải ghi rõ nguồn tin là 'Theo Báo Thanh Niên' hoặc 'Báo Thanh Niên'"*, trong khi footer (`NEWS-E009`, `NEWS-E013`) ghi *"© 2003-2026 Bản quyền thuộc về Báo Thanh Niên. Cấm sao chép dưới mọi hình thức nếu không có sự chấp thuận bằng văn bản."* | Thay vì chỉ nhìn footer để gán `deny` cho lưu cục bộ và phân phối lại như bản trước, báo cáo cập nhật trung thực sự mâu thuẫn/chưa rõ phạm vi giữa mục `Điều kiện sử dụng` và footer bản quyền: chỉ `Truy cập thủ công` qua RSS Reader đối với metadata/tóm tắt trong feed là `allow`; mọi mục đích còn lại (`Truy cập tự động`, `Lưu cục bộ`, `Hiển thị local` trên ứng dụng, `Hiển thị public / phân phối lại`, `AI processing`, `Training`) đều đặt là `unknown` (đóng, không tự mở collector) vì chưa rõ điều kiện ghi nguồn có miễn trừ yêu cầu chấp thuận bằng văn bản hay cho phép hệ thống thứ ba lưu/phân phối lại hay không |
| `2026-10-21T04:29:00+07:00` | `N03` / [NEWS-E011](#news-e011) | Feed `https://thanhnien.vn/rss/kinh-te.rss` chứa hai thẻ `<atom:link rel="self">` trỏ tới hai URL khác nhau (`.../rss/kinh-te.rss` và `.../kinh-te.htm`), `<pubDate>` dùng năm 2 chữ số (`26`), và `<title>` chứa HTML entity (`&ugrave;`, `&ecirc;`...) nằm bên trong khối `CDATA` | Nếu xử lý kỹ thuật trong tương lai, parser không được giải mã HTML entity một cách mù quáng làm hỏng cấu trúc nhưng phải nhận diện tình trạng double-encoding trong `CDATA` của `N03` và năm 2 chữ số trong RFC 822 |
| `2026-10-21T04:29:26+07:00` – `2026-10-21T04:29:45+07:00` | `O01`, `O02` / [NEWS-E012](#news-e012) | Truy cập HTTP tới hai cổng cơ quan quản lý (`https://www.sbv.gov.vn` và `https://ssc.gov.vn`) đều không trả về nội dung trang: trên `sbv.gov.vn`, trạng thái `observed` là `HTTP/1.1 403 No server`; trên `ssc.gov.vn`, do lệnh `curl` có bật `-L`, công cụ đã tự động theo chuỗi 50 lần redirect `HTTP/1.1 302 Moved Temporarily` tới `Location: https://ssc.gov.vn/webcenter/portal/ubck` trước khi dừng ở giới hạn 50 redirect (`observed`). Nguyên nhân máy chủ trả 403 (nghi do WAF từ tên cookie) và nguyên nhân lặp 302 (nghi do cổng WebCenter đòi cookie phiên `JSESSIONID`) chỉ là `inferred` / `unverified` | Bỏ khẳng định “mỗi URL chỉ được truy cập một lần và dừng ngay”; ghi rõ lệnh `curl -L` đã theo 50 redirect ở `ssc.gov.vn` và hai trang `vnexpress.net/rss`, `thanhnien.vn/rss.html` có thêm 1 lượt đọc xác minh bổ sung không theo redirect; tách bạch rõ status/redirect (`observed`) với suy đoán nguyên nhân WAF/cookie (`inferred` / `unverified`) |

## Review độc lập — dành riêng Codex

**GPT-6 Astra · 22/10/2026 — chấp thuận đóng nghiên cứu tài liệu:** đã đọc audit và catalog; 14 Evidence ID duy nhất (`NEWS-E001`…`NEWS-E014`) có tham chiếu audit, ba ứng viên RSS và hai cổng chính thức bị chặn được ghi nhận cùng giới hạn. Chấp thuận báo cáo ở mức `RESEARCHED_WITH_BLOCKERS`, không xác minh lại nguồn, không cấp quyền publisher và không chứng nhận tuân thủ giới hạn một lượt đọc. Bằng chứng 21/10, 50 redirect SSC, hai lượt đọc chính sách bổ sung, kết quả âm tính và suy luận nguyên nhân WAF/cookie được giữ nguyên.

**Cổng còn đóng:** A4 đã merge qua PR #39 nhưng P2.2 chưa mở. Các diễn giải `allow` cho đọc thủ công/local RSS Reader không mở MarketPulse ingestion, lưu DB hoặc redisplay; automated collection, lưu trữ, public redisplay, AI/training vẫn `unknown`. Feature flag, retention/xóa theo yêu cầu hay chấp thuận của chủ dự án không thay quyền publisher. Quyết định task tiếp theo phải có bằng chứng quyền theo trường/mục đích và retention/xóa hoặc chốt riêng synthetic fixture có nhãn; xem [quyết định đóng audit](P2_NEWS_SOURCE_AUDIT.md#6-tự-đối-chiếu-và-review-codex). Không thêm Evidence ID, source fetch, runtime test hoặc portal registration trong lần đóng tài liệu này.
