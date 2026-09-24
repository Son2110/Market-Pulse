# CI/CD

## Đang hoạt động

`Documentation CI` chạy khi mở/cập nhật pull request và khi push vào `main`. Workflow kiểm tra đích liên kết cục bộ trong Markdown và thuộc tính HTML `src`/`href`, rồi build portal từ danh sách tài liệu cho phép và lưu `_site/` thành artifact trong 7 ngày. Link ngoài không được truy cập; fragment anchor không được kiểm tra. Thiếu file cục bộ sẽ làm job thất bại.

Chạy hai bước hiện có tại máy:

~~~powershell
python scripts/check_docs.py
python scripts/build_docs.py
~~~

Build chỉ dùng thư viện chuẩn của Python 3.12, không render Markdown và không build ứng dụng. `_site/` là đầu ra sinh tự động.

`Documentation Pages` chỉ chạy thủ công từ `main`: workflow kiểm tra, build và upload Pages artifact rồi deploy qua environment `github-pages`. Bật **Settings → Pages → Build and deployment → GitHub Actions** trước khi chạy. Đây là portal tài liệu, không phải website ứng dụng hay môi trường production.

## Luồng ứng dụng sau này

Chưa có mã ứng dụng hoặc pipeline app để chạy. Khi các lệnh thật đã tồn tại, pull request cần có một app gate bắt buộc gồm lint, typecheck, unit test normalization/analytics, API integration với MongoDB/Redis local, build frontend/backend và E2E dùng fixture. E2E nên đi qua search → chart → watchlist, kiểm tra quyền sở hữu phủ định và replay/retry idempotency. Vercel có thể tạo Preview cho pull request; chỉ dùng fixture và không đưa khóa provider vào preview.

Sau review và khi app gate đạt, merge vào `main`. Đưa API và worker lên Render staging sau CI hoặc deploy thủ công đúng commit đã kiểm tra; chạy smoke test health, search/chart/watchlist và nhãn source/as-of/freshness. Chỉ promote production ở một bước riêng có người duyệt sau này. Một trạng thái Render bị skip/neutral không chứng minh app gate thành công: bảo vệ `main` bằng check cuối cùng yêu cầu job gate thực sự pass.

Trước khi triển khai, lưu secrets trong Vercel, Render, Atlas hoặc GitHub environment được bảo vệ; cấp quyền tối thiểu và không ghi secret vào log. Giới hạn Atlas theo egress backend đã xác minh hoặc private networking. Khi rollback, khôi phục deployment Vercel trước đó và commit Render tốt gần nhất. Giữ migration database tương thích ngược cho tới khi không cần rollback phiên bản cũ. Xác minh cost, network, backup và restore trước khi provision.

Giá trị thị trường cần giữ source, đơn vị/tiền tệ, timezone, as-of và freshness. Thời điểm sự kiện gần biến động giá không chứng minh quan hệ nhân quả và nội dung không phải tư vấn đầu tư.

## Tài liệu chính thức

- [GitHub Actions: dùng an toàn](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Pages với custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Render background workers](https://render.com/docs/background-workers)
- [Vercel với GitHub](https://vercel.com/docs/git/vercel-for-github)
- [MongoDB Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
