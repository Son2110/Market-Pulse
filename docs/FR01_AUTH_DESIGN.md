# Bàn giao trang tài khoản demo · FR-01

**Ngày:** 04/10/2026. Trang `/account` là bước frontend chuẩn bị cho MP-09; `/account/` và tải lại trực tiếp dùng cùng trang. Đây là lát cắt đăng ký, đăng nhập và đăng xuất bằng API auth local của MP-04. FR-01 theo tài liệu gốc vẫn **một phần**; UI watchlist và giá/thay đổi mới nhất của MP-09 chưa có. Cổng nguồn live vẫn **NOT VERIFIED**.

## Thiết kế được chọn trước triển khai

- Stitch project: `16706610509511522903`.
- Shared design system: `assets/18357777504117637773`.
- Screen: `b706d5ecf27f434e9d0e08f012cb3710` — **MarketPulse VN - Tài khoản demo**.

Ảnh và HTML Stitch được đọc để tham chiếu bố cục: nền ấm, hai cột, thông tin phạm vi bên trái, form trắng với chuyển đăng nhập/đăng ký bên phải. Mã ứng dụng dùng React và CSS hiện có, giữ logo/header chung; không tải font, CDN hoặc script từ bản xuất. Header thêm liên kết tĩnh “Tài khoản” với active state, không tạo auth context toàn cục hay UI watchlist.

Điều chỉnh bản xuất: bỏ copyright 2024, account/expiry giả, script chuyển trạng thái mô phỏng và khẳng định không gửi dữ liệu bên ngoài. Nội dung hiện tại nói tài khoản được lưu trên máy chủ demo và phiên có hạn. Trang chỉ dùng API thật; không có OAuth, quên mật khẩu, remember-me, refresh token hoặc redirect sau login.

## Luồng và hợp đồng

Form có nhãn email/mật khẩu, `username`, `current-password`/`new-password`, nút hiện/ẩn có tên truy cập, xác nhận mật khẩu chỉ phía client khi đăng ký. Email trim/lowercase theo backend, tối đa 254 ký tự và cùng regex. Mật khẩu giữ nguyên, 15–128 Unicode codepoints và tối đa 512 byte UTF-8; không dùng HTML maxlength 128 vì đếm UTF-16 sẽ cắt emoji hợp lệ. Form kiểm tra lỗi, focus field lỗi, thông báo live và focus thông báo sau thao tác. Chặn gửi trùng/chuyển mode khi đang gửi; xóa mật khẩu sau hoàn tất và khi chuyển mode.

Client gọi các path cố định `/api/auth/register`, `/login`, `/me`, `/logout` qua proxy cùng origin, `cache: no-store`, timeout 10 giây và hủy khi unmount. Token chỉ ở Authorization cho me/logout; không đưa vào URL, log hoặc thông báo. Guard kiểm tra token, email, user ID/role và timestamp UTC ISO hợp lệ; register phải trả 201, login/me 200, logout 204 không đọc JSON. Lỗi 400/401/409/429/5xx, JSON sai, network và timeout có thông báo tiếng Việt đã khử dữ liệu thô. Không tự phát lại credential POST; đăng ký có kết quả mơ hồ đề nghị thử login vì tài khoản có thể đã được tạo.

Helper độc lập framework chỉ lưu `{ version: 1, token, expiresAt }` trong `sessionStorage` key `marketpulse.auth.v1`. Không lưu user, email, mật khẩu hay `localStorage`. Bản ghi hỏng/sai phiên bản/hết hạn bị bỏ. Restore phải kiểm tra me trước khi hiện identity; lỗi tạm thời giữ token và chỉ cho kiểm tra lại/đăng xuất. Login/register thành công hợp lệ xác lập phiên. Thử khả năng storage trước credential POST; nếu write sau response thất bại, giữ handle trong bộ nhớ cùng cảnh báo và khả năng logout.

Logout chưa được server xác nhận thì giữ phiên và cho thử lại; 204 hoặc 401 phiên đã vô hiệu mới xóa. Expiry timer cùng focus/visibility kiểm tra đồng hồ, và pageshow khi quay về từ cache trình duyệt kiểm tra lại phiên. Generation và abort ngăn response cũ thay thế state sau cleanup/StrictMode. Timestamp tài khoản/expiry hiển thị UTC+7 và được ghi rõ không phải market as-of. SessionStorage chỉ là lưu trữ demo theo tab, không phải hardening production; server vẫn kiểm tra quyền sở hữu.

## Bằng chứng kiểm tra

18 test client/helper mới đã đạt: Unicode/bounds/password preservation, guards, request/header/status, timeout/caller abort, no retry, storage corrupt/expired/denied, restore trước identity, transient retain, write failure, logout clear/retain, expiry và stale response qua stop/start. Lint, typecheck toàn workspace, build, toàn bộ 101 unit tests (0 fail/skip), docs check (54 đích local), docs build (15 tài liệu nguồn) và `git diff --check` đều đạt. Lần chạy sandbox ban đầu chặn HTTP loopback của các API test hiện có và Vite realpath; chạy lại với escalation đã được chấp thuận đạt, không sửa test để né hạn chế môi trường.

Coordinator kiểm tra thủ công bằng Playwright tạm thời với Edge qua preview local port 5174, không commit framework E2E. 24 view (login/register/đã đăng nhập và ba trang hiện có ở 1440/768/390/320px) không tràn ngang hoặc page error. Đã thử API thật: đăng ký, focus khi xác nhận sai, storage chỉ token/expiry/version không localStorage, chuyển trang/tải lại restore, logout, mật khẩu sai, email trùng và login/logout lại. Coordinator chỉ xóa user QA được tạo theo đúng email/user ID; không thay tài khoản khác.

QA transport giả lập riêng đã thử checking → 503 giữ phiên → verify retry, logout 503 giữ phiên → 204, restore 401 xóa, expiry timer, storage preflight chặn và 0 credential POST, write sau success lỗi nhưng còn memory handle/logout, email dài ở 320px, register pending khóa mode/form, show-password, lỗi network đăng ký có câu kết quả mơ hồ, xóa password/confirmation và chỉ một POST. Không có page error. Đây là bằng chứng kiểm tra thủ công của coordinator, không phải E2E đã commit; các response giả chỉ thuộc kiểm tra, không thuộc app.

Coordinator build lại Docker web thành công; Compose đưa cả bốn service tới healthy. `/account` và `/account/` qua web port 5173 trả HTTP 200. Browser trên Docker web ở 390px, múi giờ `Asia/Ho_Chi_Minh`, chạy API thật register → reload/me restore → logout đạt, không tràn ngang hoặc page error; tài khoản QA được xóa theo đúng email/user ID. Coordinator đã xem ảnh login cuối cùng ở 390px với nội dung cập nhật và xác nhận nhất quán với Stitch.

Review độc lập còn chờ coordinator. HTML smoke CI chỉ kiểm tra phục vụ trang SPA, không chứng minh thao tác auth. Chưa hoàn tất luồng search → chart → add watchlist của MP-14 và chưa production deploy; GitHub CI cho branch hiện tại chưa được xác nhận.
