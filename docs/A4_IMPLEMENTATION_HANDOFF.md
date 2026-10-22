# Bàn giao triển khai A4 — dependency health và recovery

**Ngày:** 21/10/2026 · **Baseline:** `origin/main` tại `eb3a6b2`, A3 merge qua [PR #38](https://github.com/Son2110/Market-Pulse/pull/38) · **Nhánh chuẩn bị:** `ci/dependency-health-recovery`.

Đây là task **triển khai A4**, theo yêu cầu riêng mới của chủ dự án; phạm vi research-only của handoff P2.1 không áp dụng cho task A4 này. Bộ tài liệu này chưa triển khai hoặc nghiệm thu A4. Anti sửa code và kiểm tra; Codex review độc lập, chỉ commit khi implementation và checks đạt. Không bắt đầu P2.2, collector tự động hay task tiếp theo. P2.1 và quyền nguồn vẫn là cổng riêng.

**Bổ sung v1.1:** [Yêu cầu mới nguyên bản](MarketPulse_A4_Architecture_Requirements.md)
cho phép platform health/recovery, cold Redis-down API và sửa routing Compose.
Allowlist/cold-start/Compose constraints của prompt cũ dưới đây là lịch sử trước v1.1;
không dùng chúng để ghi đè code Anti hoặc bỏ yêu cầu mới. Xem [report](A4_IMPLEMENTATION_REPORT.md).

## Hiện trạng trước v1.1

[server.ts](../apps/api/src/server.ts) khởi động cần Mongo và Redis; Redis `error/end` sau kết nối gọi shutdown. [stores.ts](../apps/api/src/stores.ts) đặt health Redis `reconnectStrategy: false`. [health.ts](../apps/api/src/health.ts) có liveness và full readiness; boolean khởi tạo không thay kiểm tra dependency hiện hành. [ingestion-api.ts](../apps/api/src/ingestion-api.ts) ghi Mongo trước 202, enqueue có giới hạn rồi defer; [ingestion-queue.ts](../apps/api/src/ingestion-queue.ts) và [ingestion-worker.ts](../apps/api/src/ingestion-worker.ts) reconcile outbox với ngân sách ba attempt. [worker.ts](../apps/api/src/worker.ts) có listener loopback 3002; phải chặn lỗi/treo probe.

Auth limiter/KDF guard nằm trong process, không dựa Redis. Vite proxy chỉ `/api` trong [vite.config.ts](../apps/web/vite.config.ts); Compose health API dùng full readiness nên bằng chứng direct/proxy local không chứng minh load balancer production sẽ giữ routing.

## Prompt sao chép cho Anti

```text
Triển khai duy nhất A4 tại E:/Project/Market-Pulse, nhánh đã chuẩn bị
ci/dependency-health-recovery, baseline eb3a6b2. Không đổi nhánh hoặc tự sync Git.
Làm tuần tự bằng một worker là bạn; không delegation, commit, push, tạo PR/merge
hoặc liên hệ bot. Nếu branch/baseline khác dự kiến, báo Codex trước khi sửa.

Đọc trước khi sửa:
- E:/Project/Market-Pulse/AGENTS.md
- E:/Project/Market-Pulse/MarketPulse_VN_Project_Documentation.md
- E:/Project/Market-Pulse/docs/PRD.md
- E:/Project/Market-Pulse/docs/ROADMAP.md
- E:/Project/Market-Pulse/docs/SYSTEM_ARCHITECTURE.md
- E:/Project/Market-Pulse/docs/LOCAL_DEVELOPMENT.md
- E:/Project/Market-Pulse/docs/INGESTION.md
- E:/Project/Market-Pulse/docs/A4_IMPLEMENTATION_HANDOFF.md
- E:/Project/Market-Pulse/docs/A4_IMPLEMENTATION_REPORT.md
Đọc code hiện hành trong allowlist dưới đây và các dependency/test liên quan,
đặc biệt ingestion-store.ts, ingestion-contract.ts, config.ts, auth.ts,
observed-history.ts, gold-read.ts, apps/web/vite.config.ts, package.json,
compose.yaml, .github/workflows/app-ci.yml và tests/e2e/run.ts. Các path code
tương đối này đều nằm dưới E:/Project/Market-Pulse; không dùng snapshot cũ.

Allowlist file được sửa/thêm (chỉ khi cần cho A4):
- E:/Project/Market-Pulse/apps/api/src/server.ts
- E:/Project/Market-Pulse/apps/api/src/stores.ts
- E:/Project/Market-Pulse/apps/api/src/health.ts
- E:/Project/Market-Pulse/apps/api/src/worker.ts
- E:/Project/Market-Pulse/apps/api/src/ingestion-worker.ts
- E:/Project/Market-Pulse/apps/api/src/ingestion-queue.ts
- E:/Project/Market-Pulse/apps/api/src/ingestion-api.ts
- E:/Project/Market-Pulse/apps/api/src/dependency-lifecycle.ts (helper A4 nếu cần)
- E:/Project/Market-Pulse/apps/api/tests/: chỉ test/harness A4, health và ingestion
  liên quan; ưu tiên dependency-lifecycle.test.ts và
  dependency-recovery.integration.test.ts, không sửa corpus/hash kỳ vọng.
- E:/Project/Market-Pulse/package.json: chỉ đăng ký tests A4 vào runner hiện có.
- E:/Project/Market-Pulse/compose.yaml và compose.a4-test.yaml: chỉ hỗ trợ chạy
  tests A4 cô lập; không đổi health policy/volumes/routing của stack mặc định.
- E:/Project/Market-Pulse/.github/workflows/app-ci.yml: chỉ chạy/cleanup tests A4,
  giữ nguyên mọi check hiện có, runner workaround và dependency versions.
- E:/Project/Market-Pulse/docs/SYSTEM_ARCHITECTURE.md
- E:/Project/Market-Pulse/docs/ROADMAP.md
- E:/Project/Market-Pulse/docs/LOCAL_DEVELOPMENT.md
- E:/Project/Market-Pulse/docs/INGESTION.md
- E:/Project/Market-Pulse/docs/A4_IMPLEMENTATION_REPORT.md
Handoff này chỉ đọc. Preserve mọi thay đổi có sẵn, nhất là ba P2_NEWS_*.md
đang untracked; không sửa/gộp/chuyển trạng thái chúng. Tài liệu gốc bất biến.
Không sửa schema, contract/identity/hash/order, dependency hoặc lockfile,
auth/session/ownership/rate-limit semantics, frontend, config/env/secrets.
Không provider, news, P2.2, crawler, scheduler mới, deployment hay migration.
Build/test có thể tạo output ignored và tài nguyên tạm thuộc task; không thêm
artifact chứa secret/payload thật. Cần mở rộng allowlist thì báo blocker cho Codex.

Hành vi phải đạt:
1. Giữ GET /health/live -> 200 {status:"alive"}; GET /health/ready giữ đúng body
   {status:"ready"} hoặc {status:"not_ready"}, HTTP 200/503. Full readiness vẫn
   cần mọi dependency bắt buộc và initialization của feature đang bật; không
   bỏ Redis khỏi full probe để làm xanh. Additive capability probes có tên/path,
   status/body và dependency rõ trong docs/tests: fixture reads, Mongo-backed
   reads/account, durable ingestion acceptance; worker có readiness riêng 3002.
   Capability tắt/chưa initialize/shutdown không được báo ready. Sanitized output.
2. Cold start có thể fail closed với retry hữu hạn rồi thoát; ghi rõ lựa chọn,
   test dependency thiếu, initialization lỗi, secret/flags bật-tắt. Không giả
   degraded cold start đã hỗ trợ. Sau healthy start, Redis outage không được làm
   API thoát: live 200, full ready 503; fixture và Mongo reads vẫn hoạt động đúng
   khi dependency riêng còn tốt. Redis phục hồi tự động trên cùng API/worker
   process, không restart thủ công để chứng minh recovery.
3. Mongo outage làm capability Mongo/acceptance và worker not-ready, operation
   liên quan fail closed có thời hạn, không ack 202 khi chưa durable accept;
   fixture đã initialize vẫn đọc được. Mongo trở lại phải tự phục hồi probe VÀ
   request thật trên cùng process, không chỉ đọc boolean initialize cũ. Giữ
   auth validation/security semantics, không biến lỗi dependency thành login thành công.
4. Mongo durable accept-before-202 là bất biến: Redis down vẫn có thể nhận khi
   Mongo/store/secret sẵn sàng, queue lỗi/timeout được defer và outbox khôi phục
   sau Redis restore. Không false 202 trước ghi thành công. Giữ MAX_ATTEMPTS=3,
   terminal failure không tự requeue/reset; delivery/digest conflict, strict
   invalid-contract rejection, A3 malformed-family isolation, job names/IDs,
   canonical dedup và revision/latest ordering cho fixture/observed/gold giữ nguyên.
5. Reconnect có backoff/cap, mỗi probe/operation có timeout và giới hạn in-flight;
   không offline queue tích lũy vô hạn hoặc Promise.race để lại tác vụ nền tăng
   vô hạn. Reconcile không chồng lấp, lỗi/timeout làm readiness hạ và retry an toàn.
   Worker ready cần Mongo + Redis thực sự sẵn sàng, store initialize, worker
   running và reconcile thành công gần đây. Health listener catch cả throw/
   rejection/timeout, trả 503 an toàn; không unhandled rejection hoặc secret logs.
6. SIGTERM/SIGINT ngừng timer/reconnect/nhận work, đóng HTTP/worker/clients trong
   ngân sách hữu hạn kể cả đang startup/outage/reconcile; không leak process.

Triển khai rồi kiểm tra unit và real process recovery. Không chỉ mock createApp.
Test runner phải chạy A4 tests thật, thiếu service phải fail rõ, không skip/fake pass.
Outage chỉ tác động Docker project/container riêng của task đã xác minh tên/label,
port và volume ownership; không stop shared stack, không down -v/delete user volume.
Dùng port/database/queue riêng và cleanup đúng tài nguyên đã tạo. Không chạy outage
song song với test khác. Dùng API/worker entrypoint thật, Vite proxy hiện có thật,
seed synthetic/fixture hợp lệ; ghi PID/container identity trước/sau. Kiểm tra đọc
fixture và stored observed/gold direct HTTP lẫn /api qua Vite trong Redis outage;
health probe gọi direct vì Vite không proxy /health. Kiểm tra Mongo loss/restore,
deferred outbox cả ba family, replay/conflict/invalid payload, attempt exhaustion,
stale reconcile/worker stopped/probe throw-timeout và shutdown startup/outage.

Chạy đủ checks hiện có từ root, theo app-ci.yml/docs-ci.yml:
npm run lint; npm run typecheck; npm run test:unit; npm run test:integration;
npm run build; python scripts/check_docs.py; python scripts/build_docs.py;
python scripts/validate_market_data.py; python scripts/validate_gold_quotes.py;
python -m unittest discover -s tests -v;
python -m unittest discover -s services/collector/tests -v;
docker compose config --quiet; Docker build/start/health/smoke/collector/replay
như app-ci nhưng chỉ trên stack task cô lập; npm run test:e2e:harness;
npm run test:e2e; git diff --check (Git read-only). Đăng ký thêm A4 tests nếu runner
hiện tại chưa chạy chúng, bảo đảm CI chạy cùng kiểm tra outage cô lập. Dùng các
dependency đã pin của project; không thay version hoặc bỏ check để vượt lỗi.
Ghi command thực chạy, thời điểm, exit code, pass/fail/skip counts và blocker.
Không tuyên bố pass check chưa chạy hoặc lấy baseline CI làm bằng chứng nhánh.

Điền A4_IMPLEMENTATION_REPORT.md bằng kết quả thật; cập nhật docs mô tả đúng
hiện trạng đã chứng minh, giữ lịch sử có ngày. Để trống Codex review/commit.
Báo changed files, evidence, hạn chế và rollback. Dừng bàn giao cho Codex;
chưa commit/push/PR và chưa chuyển sang task khác.
```

Codex kiểm tra diff và bằng chứng độc lập, yêu cầu sửa nếu cần; chỉ sau A4 hoàn tất và review/checks đạt mới commit A4. Ba tài liệu P2 có scope khác, nên giữ thành logical commit riêng sau review tương ứng. Chưa có claim availability production; rollback về cặp API/worker trước A4 nếu recovery hoặc compatibility sai, không sửa/xóa dữ liệu.
