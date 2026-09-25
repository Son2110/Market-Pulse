# Thiết lập GitHub

Các workflow hiện tại chỉ kiểm tra tài liệu. Sau khi workflow được push lên `main`:

1. Trong **Settings → Actions → General**, cho phép GitHub Actions cần thiết và giữ quyền mặc định của `GITHUB_TOKEN` ở mức read-only.
2. Quy tắc hiện tại của `main` yêu cầu pull request, check bắt buộc tên `docs` strict/up-to-date, hội thoại review được xử lý, bỏ qua review cũ sau khi có commit mới, đồng thời chặn force-push và xóa nhánh. Quy tắc áp dụng cả với admin; không yêu cầu số approval người cố định để tránh khóa luồng solo-maintainer. Repository chỉ cho squash merge và tự xóa nhánh sau merge. Khi app CI tồn tại, thêm app gate cuối làm check bắt buộc và yêu cầu trạng thái success thật.
3. Trong **Settings → Pages**, chọn **GitHub Actions** làm nguồn publish. Đây chỉ bật workflow portal tài liệu.
4. Khi muốn publish portal, vào **Actions → Documentation Pages → Run workflow**, chọn `main` rồi chạy. Workflow không có trigger push và bỏ qua nhánh khác `main`.

Workflow tài liệu không cần provider secret. Khi tích hợp app sau này, lưu credential ở Vercel/Render/Atlas hoặc protected GitHub environment; chỉ cấp quyền cần thiết, không log secret, không commit secret và rotate credential đã lộ.

Luồng release app dự kiến: PR chạy app checks bắt buộc và nhận Vercel Preview; review rồi merge `main`; deploy API/worker Render lên staging sau CI hoặc bằng commit đã xác minh; smoke test; production chỉ được promote qua bước riêng có người duyệt. Không dựa riêng vào check Render có thể ở trạng thái skipped/neutral: app gate phải thật sự yêu cầu các job cần thiết thành công.

Để rollback, chọn deployment Vercel tốt gần nhất và commit Render đã biết là tốt; giữ schema và migration tương thích với phiên bản app trước đó. Trước khi cấu hình service, xác minh egress/network Atlas, health check, backup/restore và chi phí. Chưa có app code, secret, môi trường host hoặc production deploy nào được cấu hình bởi các workflow tài liệu.

Xem [CI/CD](CI_CD.md), hướng dẫn [Actions an toàn](https://docs.github.com/en/actions/reference/security/secure-use), [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github), [Render workers](https://render.com/docs/background-workers) và [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).

## Nhánh FR, pull request và CodeRabbit

Bắt đầu mỗi FR từ `main` hiện tại bằng nhánh `feat/fr-XX-ten-ngan`, một FR cho mỗi nhánh/pull request. Xử lý FR lớn thành các pull request nhỏ theo thứ tự với cùng mã FR và hậu tố số. Dùng `ci/...` hoặc `docs/...` cho việc không thuộc FR. Không push thẳng lên `main` hay bỏ qua review; chỉ squash-merge sau khi check bắt buộc pass, review hoàn tất và hội thoại được xử lý. Đồng bộ với `main` trước FR tiếp theo.

Quyền CodeRabbit với repository `Son2110/Market-Pulse` đã được xác nhận qua pull request trực tiếp; bot cũng đọc `.coderabbit.yaml` và nhận profile `assertive`. Phản hồi của bot trong [PR #1](https://github.com/Son2110/Market-Pulse/pull/1#issuecomment-5829748407) và [follow-up](https://github.com/Son2110/Market-Pulse/pull/1#issuecomment-5829751224) cho biết repository dưới 10 stars không nhận review tự động. Vì vậy, gọi `@coderabbitai full review` trên mỗi pull request mới và `@coderabbitai review` sau commit mới nếu review tăng dần tự động bị bỏ qua; không dựa riêng vào YAML để kết luận bot đã review. Context CodeRabbit đã quan sát được, nhưng chưa đặt làm check bắt buộc cho tới khi full review được xác minh hoạt động thành công. Không cần tạo subscription hoặc đổi billing. Quy tắc `main` hiện đã yêu cầu PR, check `docs`, xử lý hội thoại review, bỏ qua review cũ và chặn force-push/xóa nhánh; repository chỉ cho squash merge và tự xóa nhánh sau merge. Xem [CI/CD](CI_CD.md) và [quy trình Codex](CODEX_WORKFLOW.md).
