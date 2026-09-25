# Quy trình làm việc với Codex

Quy trình này tách riêng bước lập kế hoạch, triển khai và đánh giá độc lập. Đây là cách làm mà chủ dự án yêu cầu; nội dung ở đây không tự đổi model đang chạy hay chứng minh cấu hình đã được áp dụng.

## Vai trò

1. GPT-6 Astra ở mức suy luận medium điều phối, đọc brief và tài liệu liên quan, giao việc triển khai có giới hạn, sau đó tự đánh giá kết quả.
2. GPT-6 Luna ở mức suy luận max chỉ triển khai phần được giao, giữ nguyên các thay đổi khác, chạy các kiểm tra đã nêu và báo cáo file, bằng chứng cùng hạn chế. Không giao việc tiếp cho agent khác.
3. Nếu model hoặc khả năng được yêu cầu không có sẵn, hãy nói rõ; không tự thay bằng model khác hay khẳng định đã dùng model được yêu cầu.
4. Chỉ làm một task tại một thời điểm với một worker. Hoàn tất triển khai, kiểm tra bắt buộc và review độc lập rồi mới bắt đầu task kế tiếp. Không triển khai nhiều task song song và không giao việc tiếp cho agent khác.
5. Ghi rõ phạm vi file, tiêu chí nghiệm thu và lệnh kiểm tra trước khi giao việc. Không giao câu hỏi chỉ cần giải thích hoặc nghiên cứu thành việc viết code.

## Nhánh FR và review

- Bắt đầu mỗi FR từ `main` hiện tại trên nhánh `feat/fr-XX-ten-ngan`, ví dụ `feat/fr-03-stock-search`. Mỗi nhánh và pull request chỉ chứa một FR; mỗi lần chỉ xử lý một task. Nếu FR lớn, chia thành các pull request nhỏ theo thứ tự, giữ cùng mã FR và thêm hậu tố số như `feat/fr-06-01-watchlist-api`, `feat/fr-06-02-watchlist-ui`.
- Việc hạ tầng hoặc tài liệu dùng nhánh `ci/...` hoặc `docs/...`, không gán mã FR giả.
- Thứ tự thực hiện: triển khai và chạy các kiểm tra sẵn có phù hợp; GPT-6 Astra review độc lập phần triển khai; sau đó push nhánh và bàn giao tên nhánh cùng bằng chứng. Không tự đặt lệnh kiểm tra runtime khi repository chưa có chúng. User tự tạo pull request và quyết định merge; Codex không tự tạo pull request hoặc merge.
- Với pull request do user quản lý, trước khi user merge cần có CodeRabbit review thực chất trên commit mới nhất. Phản hồi hiện tại của bot cho biết repository dưới 10 stars không nhận review tự động, nên không giả định `.coderabbit.yaml` đảm bảo bot chạy. Chỉ khi user yêu cầu mới gọi `@coderabbitai full review` cho pull request mới hoặc `@coderabbitai review` sau commit mới nếu review tăng dần bị bỏ qua. Coordinator đánh giá phần triển khai; user quyết định merge.
- User chỉ squash-merge sau khi các check bắt buộc đã pass, review đã đạt yêu cầu và mọi hội thoại review đã được xử lý. Không push thẳng lên `main` hoặc bỏ qua review. Đồng bộ nhánh với `main` mới nhất trước FR kế tiếp.

## Quy trình thiết kế frontend theo từng trang

- Khi vào giai đoạn frontend, dùng Stitch để thiết kế từng trang trước khi triển khai trang đó; giữ các trang nhất quán với design system dùng chung.
- Ghi project Stitch và tham chiếu screen đã chọn trong bàn giao task. Xem trang ở các kích thước responsive và kiểm tra trạng thái loading, empty, error.
- Hoàn tất triển khai, kiểm tra và review trang hiện tại trước khi sang trang tiếp theo. Làm tuần tự với một worker, không chạy song song các trang hoặc task. Review của coordinator có thể chốt trang mà không cần yêu cầu user duyệt riêng từng trang.
- Nếu Stitch không khả dụng, báo blocker cụ thể; không âm thầm thay bằng công cụ thiết kế khác hoặc nói rằng đã tạo thiết kế Stitch.

## Mẫu bàn giao triển khai

~~~text
Triển khai task MP-### trong docs/ROADMAP.md.

Đọc AGENTS.md, docs/PRD.md, ghi chú kiến trúc liên quan và
MarketPulse_VN_Project_Documentation.md. Brief gốc là bối cảnh; tiêu chí trong
docs/PRD.md giới hạn phạm vi triển khai.

Phạm vi được phép sửa:
- [file hoặc thư mục cụ thể]

Không sửa:
- [file người dùng sở hữu hoặc nội dung ngoài phạm vi]

Tiêu chí nghiệm thu:
- [hành vi có thể quan sát]
- [nguồn dữ liệu, tiền tệ, múi giờ, thời điểm dữ liệu và độ mới]
- [hành vi khi lỗi, retry hoặc replay nếu liên quan]

Kiểm tra bắt buộc:
- [lệnh hoặc bước kiểm tra cụ thể]

Giữ nguyên thay đổi không liên quan. Không giao việc tiếp cho agent khác.
Kết thúc bằng danh sách file đã sửa, kiểm tra đã chạy và kết quả, cùng các hạn chế.
~~~

## Mẫu đánh giá độc lập

~~~text
Đánh giá task MP-### theo AGENTS.md, docs/PRD.md và tiêu chí nghiệm thu.
Không sửa file. Xem diff và bằng chứng kiểm tra. Chỉ báo cáo lỗi có thể hành
động, hồi quy, vấn đề bảo mật/chất lượng dữ liệu hoặc bước kiểm tra còn thiếu.
Nếu không phát hiện vấn đề, nêu phạm vi đã xem và bằng chứng đã kiểm tra.
Không kết luận rằng provider hoặc deployment bên ngoài đã được thử nếu không
có bằng chứng.
~~~

## Ví dụ cấu hình profile cục bộ

Ví dụ sau dùng các trường model và mức suy luận cơ bản trong tài liệu cấu hình Codex. Đây chỉ là ví dụ: nó không tự áp dụng, không đổi model của task hiện tại và không đảm bảo model có sẵn trên client của người dùng. Hãy xác nhận model có trong sản phẩm đang dùng trước khi phụ thuộc vào profile này.

~~~toml
[profiles.coordinator]
model = "gpt-6-astra"
model_reasoning_effort = "medium"

[profiles.implementation]
model = "gpt-6-luna"
model_reasoning_effort = "max"
~~~

Khi Luna có sẵn, không thay vai trò triển khai bằng Astra. Profile triển khai dành cho task có giới hạn, không phải agent tự chạy định kỳ.

## Tài liệu tham khảo

- [Tham chiếu cấu hình Codex](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Cấu hình agent và subagent của Codex](https://learn.chatgpt.com/docs/agent-configuration/subagents)
