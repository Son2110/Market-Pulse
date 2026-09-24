# Thiết lập GitHub

Các workflow hiện tại chỉ kiểm tra tài liệu. Sau khi workflow được push lên `main`:

1. Trong **Settings → Actions → General**, cho phép GitHub Actions cần thiết và giữ quyền mặc định của `GITHUB_TOKEN` ở mức read-only.
2. Trong **Settings → Branches** hoặc rulesets, bảo vệ `main`: yêu cầu pull request, chặn force-push và xóa nhánh. Sau lần chạy thành công đầu tiên, chọn đúng tên check mà GitHub hiển thị cho job tài liệu; không đoán tên check trước khi có run. Khi app CI tồn tại, thêm app gate cuối làm check bắt buộc và yêu cầu trạng thái success thật.
3. Trong **Settings → Pages**, chọn **GitHub Actions** làm nguồn publish. Đây chỉ bật workflow portal tài liệu.
4. Khi muốn publish portal, vào **Actions → Documentation Pages → Run workflow**, chọn `main` rồi chạy. Workflow không có trigger push và bỏ qua nhánh khác `main`.

Workflow tài liệu không cần provider secret. Khi tích hợp app sau này, lưu credential ở Vercel/Render/Atlas hoặc protected GitHub environment; chỉ cấp quyền cần thiết, không log secret, không commit secret và rotate credential đã lộ.

Luồng release app dự kiến: PR chạy app checks bắt buộc và nhận Vercel Preview; review rồi merge `main`; deploy API/worker Render lên staging sau CI hoặc bằng commit đã xác minh; smoke test; production chỉ được promote qua bước riêng có người duyệt. Không dựa riêng vào check Render có thể ở trạng thái skipped/neutral: app gate phải thật sự yêu cầu các job cần thiết thành công.

Để rollback, chọn deployment Vercel tốt gần nhất và commit Render đã biết là tốt; giữ schema và migration tương thích với phiên bản app trước đó. Trước khi cấu hình service, xác minh egress/network Atlas, health check, backup/restore và chi phí. Chưa có app code, secret, môi trường host hoặc production deploy nào được cấu hình bởi các workflow tài liệu.

Xem [CI/CD](CI_CD.md), hướng dẫn [Actions an toàn](https://docs.github.com/en/actions/reference/security/secure-use), [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github), [Render workers](https://render.com/docs/background-workers) và [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
