# CI/CD

**Baseline đã xác minh · 18/10/2026:** P1.4 đã merge qua
[PR #35](https://github.com/Son2110/Market-Pulse/pull/35), `main` tại
`cebfede2724d97f43ed2a33e4a565d567472b9d4`.
[Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/39060311421)
và [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/39060311438)
thành công trên baseline này. CI nhánh A1 là bằng chứng riêng, chưa được xác nhận
bằng các run baseline. Xem [kiến trúc hiện hành và đề xuất](SYSTEM_ARCHITECTURE.md).

MP-10 đã bổ sung ephemeral internal ingestion secret, health worker riêng,
collector HTTP submission/replay và MongoDB assertions cho một raw delivery /
11 assets / 44 observations / success. BullMQ retry và child-worker interruption
được kiểm tra cùng MongoDB/Redis thật. GitHub Actions đăng ký mask trước khi lưu
secret vào runner environment; không cần credential provider. Xem
[ingestion evidence and limits](INGESTION.md) cho lịch sử và giới hạn.

## Đang hoạt động

`Documentation CI` chạy khi mở/cập nhật pull request và khi push vào `main`, `ci/**`, `feat/**` hoặc `docs/**`. Workflow cài dependency validation đã pin, kiểm tra link cục bộ, xác thực schema/fixture thị trường và gold synthetic offline, chạy unit tests hợp đồng, build portal từ danh sách tài liệu cho phép và lưu `_site/` thành artifact trong 7 ngày. Link ngoài không được truy cập; fragment anchor không được kiểm tra. Thiếu file cục bộ hoặc lỗi validation/test sẽ làm job thất bại.

`Application CI` là workflow riêng trên cùng pull request và các nhánh push đó.
Nó cài workspace, lint, typecheck source/tests, unit tests và build API/web;
chạy validator market/gold cùng Python contract/collector tests; kiểm tra/build
Compose, khởi động stack, đợi health và smoke test API/web/proxy. Collector fixture
được validate, submit và replay qua HTTP/worker; integration MongoDB/Redis thật
không skip khi thiếu dependency. Cuối cùng workflow cài Chromium, chạy regression
harness và Playwright core-flow E2E đã commit. Screenshot browser được mask và
giữ tối đa ba ngày khi lỗi; log service chỉ lấy khi lỗi, cleanup luôn chạy.
Workflow chỉ có quyền `contents: read`, không cần provider secret.

Chạy cùng các bước tại máy:

~~~powershell
python -m pip install -r requirements-dev.txt
python scripts/check_docs.py
python scripts/validate_market_data.py
python scripts/validate_gold_quotes.py
python -m unittest discover -s tests -v
python scripts/build_docs.py
~~~

Portal build chỉ dùng thư viện chuẩn của Python 3.12; workflow không render Markdown. `_site/` là đầu ra sinh tự động.

`Documentation Pages` chỉ chạy thủ công từ `main`: workflow kiểm tra, build và upload Pages artifact rồi deploy qua environment `github-pages`. Bật **Settings → Pages → Build and deployment → GitHub Actions** trước khi chạy. Đây là portal tài liệu, không phải website ứng dụng hay môi trường production.

## Luồng ứng dụng local hiện tại

Web đã có search, detail/chart, VN-Index, account và watchlist theo design app
hiện có. Smoke test xác nhận route shell, same-origin proxy và response fixture
có schema/provenance; đây là lớp kiểm tra khác với browser E2E. Collector fixture
không chỉ validate: CI submit/replay và kiểm tra durable receipt/canonical counts.

MP-14 dùng Playwright/Chromium đi qua API thật ở desktop 1440px và mobile 320px:
search FPT → detail/chart → register → tạo/thêm FPT watchlist → reload → logout;
context B xác nhận cách ly quyền sở hữu. Harness tự khởi động API/Vite, database
cách ly có ownership marker, ingestion/observed tắt; không seed account, mock
response thành công hoặc gọi provider. Xem
[phạm vi và lệnh E2E](LOCAL_DEVELOPMENT.md#committed-core-flow-browser-tests-mp-14).
Gold contract/storage/read có unit/integration riêng; core browser E2E không bao
phủ gold UI (chưa có), news/AI, outage Redis, nguồn live hoặc production deploy.

## Luồng ứng dụng sau này

Task runtime mới chạy các check hiện có phù hợp và bổ sung coverage cho hành vi
mới khi cần; giữ core E2E search → chart → watchlist, negative ownership và
integration replay/retry. [A4 trong roadmap](ROADMAP.md) phải kiểm tra dependency
health/recovery trước P2.2 hoặc collector tự động. Redis mất kết nối hiện làm API
shutdown; CI baseline không chứng minh degraded reads hoặc load-balancer routing.
Vercel Preview là hướng triển khai tương lai, không phải check đang hoạt động;
chỉ dùng dữ liệu có quyền và không đưa khóa provider vào preview.

Sau review và khi app gate đạt, user merge vào `main`. Đưa API và worker lên Render staging sau CI hoặc deploy thủ công đúng commit đã kiểm tra; chạy smoke test health, search/chart/watchlist và nhãn source/as-of/freshness. Chỉ promote production ở một bước riêng có người duyệt sau này. Một trạng thái Render bị skip/neutral không chứng minh app gate thành công: bảo vệ `main` bằng check cuối cùng yêu cầu job gate thực sự pass.

Trước khi triển khai, lưu secrets trong Vercel, Render, Atlas hoặc GitHub environment được bảo vệ; cấp quyền tối thiểu và không ghi secret vào log. Giới hạn Atlas theo egress backend đã xác minh hoặc private networking. Khi rollback, khôi phục deployment Vercel trước đó và commit Render tốt gần nhất. Giữ migration database tương thích ngược cho tới khi không cần rollback phiên bản cũ. Xác minh cost, network, backup và restore trước khi provision.

Giá trị thị trường cần giữ source, đơn vị/tiền tệ, timezone, as-of và freshness. Thời điểm sự kiện gần biến động giá không chứng minh quan hệ nhân quả và nội dung không phải tư vấn đầu tư.

## CodeRabbit và pull request

Một pull request thật đã xác nhận CodeRabbit truy cập được `Son2110/Market-Pulse` và đọc cấu hình với profile `assertive`. Phản hồi của bot trong [PR #1](https://github.com/Son2110/Market-Pulse/pull/1#issuecomment-5829748407) và [follow-up](https://github.com/Son2110/Market-Pulse/pull/1#issuecomment-5829751224) cho biết repository dưới 10 stars không nhận review tự động; vì vậy `.coderabbit.yaml` không đảm bảo bot tự review. Không cần thay đổi subscription hoặc billing.

Với pull request do user quản lý, trước khi user merge cần có CodeRabbit review thực chất trên commit mới nhất. Sau commit mới, nếu review tăng dần tự động bị bỏ qua, chỉ gọi `@coderabbitai review` khi user yêu cầu. Trạng thái skipped, rate-limited hoặc chỉ có summary không chứng minh đã có full review. CodeRabbit có thể tự đánh dấu kết quả review là approve hoặc request changes; trạng thái đó không tự quyết định việc merge. Coordinator đánh giá phát hiện và chỉ sửa vấn đề có căn cứ khi được giao; user quyết định merge sau khi đủ bằng chứng. Không bật cơ chế để CodeRabbit tự commit bản sửa lỗi, tự giải quyết hội thoại hoặc tự merge. Sau sửa đổi, chạy lại CI và xác nhận review bao phủ commit mới nhất trước khi user merge. Codex không tự tạo pull request hoặc kích hoạt CodeRabbit nếu user chưa yêu cầu.

Trong phản hồi ở PR #1, bot báo quota tại thời điểm đó là 1 review bao gồm mỗi giờ và còn 0 review. Nếu review bị giới hạn, gom và sửa các phát hiện có căn cứ, giữ yêu cầu review commit mới nhất; chờ quota khả dụng hoặc để chủ dự án quyết định bước tiếp theo, không bỏ qua review.

Xem thêm [quy trình nhánh FR và review](CODEX_WORKFLOW.md) và [thiết lập GitHub](GITHUB_SETUP.md). Cấu hình tham chiếu theo [schema CodeRabbit](https://coderabbit.ai/integrations/schema.v2.json), [tài liệu cấu hình](https://docs.coderabbit.ai/reference/configuration), [Quickstart](https://docs.coderabbit.ai/getting-started/quickstart) và [lệnh review](https://docs.coderabbit.ai/guides/commands).

## Tài liệu chính thức

- [GitHub Actions: dùng an toàn](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub Pages với custom workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Render background workers](https://render.com/docs/background-workers)
- [Vercel với GitHub](https://vercel.com/docs/git/vercel-for-github)
- [MongoDB Atlas IP access list](https://www.mongodb.com/docs/atlas/security/ip-access-list/)
