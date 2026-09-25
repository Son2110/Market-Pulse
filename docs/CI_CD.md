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

## CodeRabbit và pull request

`.coderabbit.yaml` mô tả cách review, nhưng riêng file này không cài ứng dụng GitHub hay cấp quyền vào repository. CodeRabbit GitHub App đã được cài ở cấp tài khoản; cần xác nhận quyền truy cập cho riêng `Son2110/Market-Pulse` và kiểm tra một review trên pull request trước khi xem tích hợp là hoạt động. Không tạo subscription hoặc thay đổi billing.

Yêu cầu CodeRabbit review trước khi merge, trên pull request và commit mới nhất. `@coderabbitai review` yêu cầu review thường/tăng dần; dùng `@coderabbitai full review` khi cần đánh giá toàn bộ pull request. Trạng thái skipped, rate-limited hoặc chỉ có summary không chứng minh đã có full review. Không tự động chấp thuận, giải quyết hội thoại hay commit mã sửa lỗi. Người review đánh giá phát hiện, sửa các vấn đề có căn cứ, chạy lại CI và để CodeRabbit xem commit mới nhất trước khi merge.

Xem thêm [quy trình nhánh FR và review](CODEX_WORKFLOW.md) và [thiết lập GitHub](GITHUB_SETUP.md). Cấu hình tham chiếu theo [schema CodeRabbit](https://coderabbit.ai/integrations/schema.v2.json), [tài liệu cấu hình](https://docs.coderabbit.ai/reference/configuration), [Quickstart](https://docs.coderabbit.ai/getting-started/quickstart) và [lệnh review](https://docs.coderabbit.ai/guides/commands).

## Tài liệu chính thức

- [GitHub Actions: dùng an toàn](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Pages với custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Render background workers](https://render.com/docs/background-workers)
- [Vercel với GitHub](https://vercel.com/docs/git/vercel-for-github)
- [MongoDB Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
