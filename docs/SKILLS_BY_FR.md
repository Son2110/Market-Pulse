# Hướng dẫn skill theo FR

Tài liệu này ghi lại sáu skill Codex đã cài cục bộ và các lựa chọn có thể cân nhắc cho FR sau này. Skill không phải nguồn dữ liệu hay bằng chứng rằng provider, API hoặc Atlas đã kết nối. Mọi dữ liệu/tin/sự kiện dùng trong MarketPulse cần có nguồn, thời điểm nguồn và thời điểm quan sát, múi giờ Việt Nam, tiền tệ/đơn vị và nhãn độ mới; không diễn giải tương quan thành nhân quả hoặc khuyến nghị mua/bán. Không tự tạo số liệu hay fundamentals khi thiếu nguồn.

## Skill đã cài

Các thư mục dưới đây nằm trong `E:\CodexHome\skills` trên máy hiện tại. Chúng sẵn dùng từ lượt Codex tiếp theo; không được thêm vào repository và không tự có trên máy contributor khác. Cài đặt chỉ sao chép skill cùng tài nguyên đi kèm, không thiết lập credential, provider, API hay MCP.

| Skill | Nguồn đã pin và giấy phép | Phạm vi dùng trong MarketPulse |
|---|---|---|
| `market-news-analyst` | [tradermonty/claude-trading-skills](https://github.com/tradermonty/claude-trading-skills/tree/40ae281e05e34812020232852305b3b2ba57f2b2/skills/market-news-analyst), ref `40ae281e05e34812020232852305b3b2ba57f2b2`; `SKILL.md` không khai báo giấy phép. | Mặc định hướng tới cổ phiếu Mỹ, hàng hóa, tiếng Anh và cửa sổ 10 ngày. Chỉ dùng khi yêu cầu nêu rõ Việt Nam/tiếng Việt; xác minh từng tin và điều chỉnh phạm vi, múi giờ `Asia/Ho_Chi_Minh`, VND khi thích hợp. Bỏ phần định vị giao dịch. FR-07/08 đang hoãn khỏi kế hoạch ba tuần. |
| `sector-overview` | [anthropics/financial-services](https://github.com/anthropics/financial-services/tree/574ed3624aebd0418c7e96cd101262f30210ab26/plugins/vertical-plugins/equity-research/skills/sector-overview), ref `574ed3624aebd0418c7e96cd101262f30210ab26`; Apache-2.0. | Chỉ làm nền nghiên cứu ngành khi có nguồn xác minh; không suy diễn hoặc tự điền fundamentals. Không nằm trong luồng chính ba tuần. |
| `catalyst-calendar` | [anthropics/financial-services](https://github.com/anthropics/financial-services/tree/574ed3624aebd0418c7e96cd101262f30210ab26/plugins/vertical-plugins/equity-research/skills/catalyst-calendar), ref `574ed3624aebd0418c7e96cd101262f30210ab26`; Apache-2.0. | Có thể hỗ trợ lịch sự kiện FR-09/10 chỉ khi MP-13 qua cổng mở rộng; mọi mục phải có nguồn và ngày. Bỏ ngôn ngữ về vị thế giao dịch, không hàm ý sự kiện gây biến động. |
| `typesafe-ai` | [typesafe-ai/skills](https://github.com/typesafe-ai/skills/tree/65a39f393687675ce170e6094757de20370365b9/skills/typesafe-ai), ref `65a39f393687675ce170e6094757de20370365b9`; MIT. | Tùy chọn cho tích hợp TypeScript/AI sau demo. Không phải market data provider hay model thay thế, và nằm ngoài FR-07/08 của kế hoạch ba tuần. |
| `mongodb-schema-design` | [mongodb/agent-skills](https://github.com/mongodb/agent-skills/tree/d1d2d86754ff303ac441624b2ac8e0380465aa9b/skills/mongodb-schema-design), ref `d1d2d86754ff303ac441624b2ac8e0380465aa9b`; Apache-2.0 theo metadata skill. | Dùng cho câu hỏi thiết kế schema, truy cập dữ liệu và migration; giữ hợp đồng dữ liệu, nguồn gốc và replay idempotent của dự án. |
| `mongodb-query-optimizer` | [mongodb/agent-skills](https://github.com/mongodb/agent-skills/tree/d1d2d86754ff303ac441624b2ac8e0380465aa9b/skills/mongodb-query-optimizer), ref `d1d2d86754ff303ac441624b2ac8e0380465aa9b`; Apache-2.0. | Chỉ gọi cho yêu cầu hiệu năng, index hoặc query chậm. MCP/Atlas là tùy chọn; cài skill không kết nối database, không cấp credential và không cho phép giả định Atlas đang hoạt động. |

Các `SKILL.md` và thư mục tài nguyên kèm theo đã được kiểm tra tại các đường dẫn cục bộ; không chạy workflow, script hay API của skill trong lượt cài đặt này.

## Lựa chọn cho FR sau này — chưa cài

Các mục dưới đây chỉ là gợi ý theo task, không phải yêu cầu cài trước hay thay đổi phạm vi roadmap.

| FR / thời điểm | Skill hoặc công cụ có thể cân nhắc | Điều kiện và giới hạn |
|---|---|---|
| FR-01 / MP-04 | [openai/skills: `security-best-practices`](https://github.com/openai/skills/tree/main/skills/.curated/security-best-practices) | Tùy chọn cho review bảo mật; không thay thế tiêu chí auth, phân quyền và log đã có trong PRD. |
| FR-02/03/04/06 — từng trang frontend | [Stitch `manage-design-system`](https://github.com/google-labs-code/stitch-skills/tree/main/plugins/stitch-design/skills/manage-design-system) và [`generate-design`](https://github.com/google-labs-code/stitch-skills/tree/main/plugins/stitch-design/skills/generate-design), rồi Vercel [`vercel-react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices) và [`web-design-guidelines`](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines) | Chưa cài. Quy trình hiện hành vẫn yêu cầu Stitch thiết kế từng trang trước khi triển khai. Với FR-06, kiểm thử phủ định user B không sửa watchlist của user A vẫn là tiêu chí bắt buộc, không phụ thuộc skill. |
| FR-04 — mở rộng tương lai | [Anthropic `earnings-analysis`](https://github.com/anthropics/financial-services/tree/main/plugins/vertical-plugins/equity-research/skills/earnings-analysis) | Tùy chọn ngoài phạm vi fundamentals đã lược khỏi demo ba tuần; chỉ dùng khi có nguồn và dữ liệu được xác minh. |
| FR-07/08 — sau demo | Skill phân tích tin đã cài và `typesafe-ai` đã cài | Hai FR đang hoãn. Chỉ xem xét sau demo; mặc định tiếng Anh/Mỹ/10 ngày của skill tin không đại diện độ phủ Việt Nam. |
| FR-09/10 — MP-13 mở rộng | `catalyst-calendar` đã cài | Chỉ dùng nếu luồng chính đạt cổng và có sự kiện được tuyển chọn thủ công cùng nguồn. |
| FR-18 / MP-10, MP-12 | [redis/agent-skills: `redis-core`, `redis-connections`](https://github.com/redis/agent-skills) | Gợi ý tùy chọn nếu task thực sự cần Redis; không xây pipeline chất lượng dữ liệu rộng ngoài scope. |
| MP-10 / MP-12 ingestion | [data-quality-and-contract-testing](https://github.com/vaquarkhan/data-engineering-agent-skills/tree/main/skills/data-quality-and-contract-testing) | Tùy chọn để bổ trợ kiểm tra schema, provenance, freshness và replay; không mở rộng thành pipeline dữ liệu ngoài scope. |
| MP-14 E2E | [OpenAI Playwright browser skill](https://github.com/openai/skills/tree/main/skills/.curated/playwright) hoặc công cụ browser hiện có | Tùy chọn theo hạ tầng test sẵn có. Skill/CLI browser không tự trở thành test framework đã commit; không thay tiêu chí E2E trong PRD. |
| CI và review PR | [openai/skills: `gh-fix-ci`](https://github.com/openai/skills/tree/main/skills/.curated/gh-fix-ci), [`gh-address-comments`](https://github.com/openai/skills/tree/main/skills/.curated/gh-address-comments) | Tùy chọn. User quản lý việc tạo/merge PR; không giả định CodeRabbit tự review. |
| Sau ba tuần — production | [`render-deploy`](https://github.com/openai/skills/tree/main/skills/.curated/render-deploy), [`vercel-deploy`](https://github.com/openai/skills/tree/main/skills/.curated/vercel-deploy), [`redis-security`](https://github.com/redis/agent-skills/tree/main/skills/redis-security) | Chưa cài và chưa triển khai. Chỉ xem xét sau khi xác minh network, secret, backup, giới hạn dịch vụ và chi phí theo roadmap. |

Nguồn dữ liệu, quyền truy cập/điều khoản, coverage, chất lượng dữ liệu và nghiệm thu vẫn phải được xác minh theo PRD; cài skill không thay bất kỳ cổng nào trong roadmap.
