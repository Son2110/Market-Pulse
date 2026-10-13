# Nghiên cứu mở rộng — vàng Việt Nam, news và AI

**Ngày nghiên cứu:** 13/10/2026. **Phạm vi:** kế hoạch tài liệu cho một người phát triển, news tiếng Việt, AI phân tích có nguồn, vàng SJC và nhẫn trơn 9999, nghiên cứu dự báo xác suất vàng nội địa. Không triển khai collector/model/API trong task này. [PRD](PRD.md) ghi sửa đổi phạm vi theo yêu cầu chủ dự án; [roadmap](ROADMAP.md) là thứ tự công việc hiện hành. Tài liệu gốc giữ nguyên.

## Kết luận và ranh giới bằng chứng

Ưu tiên một nhà niêm yết có cả SJC và nhẫn, sau đó một feed tin tiếng Việt, rồi AI có citation và dashboard gold/events. Dự báo là nghiên cứu có cổng: sản phẩm vẫn hữu ích với dữ liệu mô tả và báo cáo “chưa đủ bằng chứng”. Không cam kết dự báo đúng, edge hay lợi nhuận; không dùng lời giải thích của LLM làm xác suất thị trường. Các phát hiện nguồn dưới đây là nghiên cứu tài liệu, chưa xác minh connector runtime, credential, coverage lịch sử hoặc quyền cho MarketPulse. Trước tích hợp phải kiểm tra lại điều khoản và khả năng truy cập hiện hành.

## Nguồn vàng, FX và tham chiếu quốc tế

| Nguồn và phát hiện | Có thể dùng để quyết định gì | Điều chưa được chứng minh / bước tiếp theo |
|---|---|---|
| [Bảng giá PNJ](https://www.pnj.com.vn/blog/gia-vang/) liệt kê vàng miếng SJC 999.9 và nhẫn trơn PNJ 999.9, giá mua/bán theo **1.000 VND/chỉ**. Giá trị timestamp không hiện trong extract đã kiểm tra. | Ứng viên audit đầu tiên cho hai sản phẩm từ một nhà niêm yết. Ghi đúng “SJC do PNJ niêm yết”, không gọi là dữ liệu SJC trực tiếp. | Chưa xác minh API, lịch sử đủ dài, cadence, region áp dụng, timestamp thực hay giấy phép lưu/redisplay/training. Xác minh nhãn nguồn và quyền trước collector; không suy ra quyền từ website đọc công khai. |
| [SJC chính thức](https://sjc.com.vn/) không tải được trong lần kiểm tra do công cụ timeout. | Giữ làm ứng viên nguồn trực tiếp để kiểm tra lại có giới hạn. | Timeout không chứng minh website outage hay nguồn không tồn tại. Chưa xác minh bảng giá/API/history hoặc quyền sử dụng. |
| [Tỷ giá Vietcombank](https://www.vietcombank.com.vn/vi-VN/KHCN/Cong-cu-tien-ich/Ty-gia) có liên kết XML và các cột mua tiền mặt, mua chuyển khoản, bán. | Ứng viên USD/VND làm context, cần chọn rõ quote side. | Không là tỷ giá trung tâm SBV. Chưa xác minh quyền redisplay/history, truy cập XML thực hoặc căn timestamp với gold. |
| [WGC Gold prices](https://www.gold.org/goldhub/data/gold-prices) thông báo dữ liệu LBMA bị hạn chế từ 18/03/2025; lịch sử bị gỡ theo yêu cầu ICE, các trung bình dài hạn vẫn còn. | Xác định rủi ro quyền và lịch sử cho tham chiếu quốc tế. | Không giả định có daily history miễn phí để training. XAU là context riêng, không là target vàng SJC/nhẫn; chỉ dùng chuỗi có quyền và timestamp/đơn vị rõ. |

### Contract và cổng dữ liệu vàng

Mỗi observation cần identity ổn định: **nhà niêm yết/provider, thương hiệu, sản phẩm, độ tinh khiết, khu vực và quote side**. SJC miếng và nhẫn trơn 9999 không được ghép thành một chuỗi “GOLD”; không đổi brand/region giữa lịch sử mà không tách series. Giá mua/bán là quote của nhà niêm yết, không mặc nhiên là giá khớp giao dịch. Lưu raw quote cùng source URL, điều khoản/phiên bản adapter, source as-of (nếu có), collectedAt, timezone, tiền tệ, đơn vị gốc, cadence đã biết, revision và trạng thái chất lượng.

Giữ decimal chính xác; quy đổi 1 lượng = 10 chỉ chỉ khi đơn vị được xác minh. Với đơn vị 1.000 VND/chỉ, nhân hệ số 1.000 trước khi chuẩn hóa. Giữ đơn vị gốc và phép quy đổi để audit, không trộn triệu VND/lượng với nghìn VND/chỉ. Spread = giá bán − giá mua của **cùng identity và timestamp tương thích**; không tự tạo spread bằng hai quan sát không đồng thời. Giá trị thiếu/âm/sell thấp hơn buy cần xử lý quality rõ, không sửa im lặng.

Cổng P1 yêu cầu audit từng quyền **truy cập, lưu, lịch sử, hiển thị cục bộ/public và training** theo mục đích sử dụng; khả năng API hoặc phương thức truy cập được phép; mẫu thực có identity/units/time semantics; kiểm tra revision, replay, missing/invalid records, quota và lỗi nguồn. Public page và thư viện connector không tự cấp quyền. Khi thiếu source timestamp, giữ unknown: collectedAt chỉ là thời điểm project quan sát. Receipt ingestion success không chứng minh freshness hay coverage. Fixture có nhãn hỗ trợ UI/test nhưng không vượt cổng dữ liệu thật hoặc forecasting.

Sau quyền/contract, bắt đầu collector có cadence phù hợp và retention được phép để tích lũy từ sớm. Thu thập tự động của pipeline đã nghiệm thu có thể chạy khi phát triển task tiếp theo; không chạy nhiều task implementation đồng thời. Song song về thời gian với việc tích lũy tự động không có nghĩa có lịch sử đủ cho research. Khảo sát backfill có quyền ngay từ P1; lịch sử chỉ là latest snapshot hoặc không biết revisions phải ghi hạn chế.

## Nguồn news và dữ liệu sự kiện

| Nguồn và phát hiện | Cách dùng đề xuất | Giới hạn |
|---|---|---|
| [VnExpress RSS](https://vnexpress.net/rss) có feed kinh doanh; điều kiện mô tả dùng miễn phí cá nhân/phi lợi nhuận, yêu cầu attribution và khả năng dừng phân phối. | Audit làm feed tiếng Việt đầu tiên; ưu tiên title/link/publisher/publishedAt và nội dung feed thực sự được phép dùng. | Không suy ra quyền toàn văn, AI processing, public/thu phí hay phân phối lại. Lưu bằng chứng điều khoản; xin quyền/chọn nguồn khác khi mục đích chưa rõ. |
| [GDELT DOC 2.0](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) mô tả discovery đa ngôn ngữ/JSON trong tài liệu năm 2017. | Tùy chọn discovery sau feed chính, rồi xác minh publisher gốc. | Tài liệu cũ không bảo đảm coverage/quota hiện tại; GDELT không thay giấy phép của publisher. Không dùng toàn bộ discovery làm tin đã xác thực. |

P2 dùng **một feed có quyền** cộng nguồn chính thức tuyển chọn (ví dụ cơ quan công bố quyết định), tránh mở crawler rộng. Metadata tối thiểu: title, canonical URL, publisher/source, publishedAt, collectedAt, language; thêm updatedAt nếu nguồn cung cấp và revision digest để giữ sửa đổi. URL chuẩn hóa/dedup cần bảo toàn attribution; hai bài khác publisher về cùng sự kiện vẫn là hai bằng chứng riêng. Missing publish time giữ unknown, không thay bằng collectedAt. News filter vàng/FX/cổ phiếu và mapping entity cần nêu ambiguous/unresolved; từ viết tắt không tự thành mã chứng khoán.

Không lưu/fetch toàn văn hoặc gửi nội dung vào model vượt quyền. Nếu chỉ được metadata, UI hiển thị metadata và link; summary chỉ dựa trên nội dung được phép và không vượt bằng chứng đầu vào. Bài sửa/đính chính cần revision và invalidate output AI cũ; không đưa bản sửa tương lai vào feature quá khứ. Event có ngày dự kiến và ngày thực tế phân biệt, timezone rõ, liên kết nguồn; AI đề xuất event luôn **PENDING_REVIEW** trước public trong lát cắt đầu.

## AI market analysis có thể kiểm tra

AI hỗ trợ entity extraction, category, ticker mapping có confidence, summary ngắn và market brief. Brief có ba phần phân biệt: **sự thật có nguồn**, **số liệu đo được** từ chuỗi đã validate, và **diễn giải** có uncertainty. Citation phải gắn với claim cụ thể và phiên bản nguồn; số giá/spread/return/correlation tính deterministic bằng code. Sự kiện gần biến động chỉ cho phép nói liên hệ theo thời điểm, không khẳng định nguyên nhân. Không tạo khuyến nghị giao dịch hoặc nhận portfolio cá nhân để tư vấn.

Nội dung news là dữ liệu không tin cậy: lệnh trong bài không được thay policy, gọi tool, đọc secret hoặc thay kết quả. Khi nguồn conflict/thiếu evidence, entity mơ hồ hoặc input lỗi thì abstain; cho người dùng xem tin gốc và labels. Mỗi output giữ input IDs/revisions, source/published/collected dates, model/prompt/schema version, generatedAt, citation mapping và người duyệt event. Cache theo các phiên bản này; cấu hình cap token/chi phí/job, giới hạn retry và quota; hết budget/lỗi model trả fallback tin gốc, không giả làm AI output mới. Bước triển khai sau mới chọn provider/model và đo budget, tài liệu này không cấu hình credential hoặc service.

### Gate đánh giá AI đề xuất

Chuẩn bị **ít nhất 50 case tiếng Việt held-out**, người đánh giá độc lập với phát triển prompt; gồm entity/ticker mơ hồ, tin cũ, corrected news, thiếu nguồn, conflict và malicious instructions. Các ngưỡng là quyết định project cần khóa trước test, không phải quy định của [NIST Generative AI Risk Management Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence), tài liệu hỗ trợ việc nhận diện/đánh giá rủi ro AI.

- 100% factual claims có citation tới evidence đầu vào; đo **supported claims / tổng factual claims được phát ra ≥95%**, ghi cả số tuyệt đối, tỷ lệ theo nhóm case và abstention coverage. Citation tồn tại không bằng claim được nguồn hỗ trợ; không tính output rỗng như bằng chứng đạt chất lượng.
- **0 lỗi nghiêm trọng**: bịa nguồn, bịa/sai số liệu, gán sai symbol hoặc đưa khuyến nghị giao dịch. Kiểm tra numeric facts với dữ liệu/code và timestamps, không dùng model tự chấm làm bằng chứng duy nhất.
- Case thiếu/conflict phải abstain đúng; event đề xuất qua human review; logging/version/cache/budget/fallback và phản ứng với malicious content có kiểm tra. Ghi failure cases và quyết định mở lại, không đổi tập held-out để che lỗi.

Chưa đạt gate thì app giữ news và market calculations gốc, không mở AI brief public. Trợ lý research có citation chỉ là bước kế tiếp sau gate này, chưa có implementation.

## Thiết kế nghiên cứu dự báo vàng nội địa

### Target và label khóa trước

Target đầu là thay đổi **giá bán niêm yết** của một nhà niêm yết/product/region; SJC và nhẫn có model/report riêng. Giá mua và spread giữ thành series riêng phục vụ mô tả, không thay quote side giữa nhãn. XAU/USD không là target thay thế. Không dự báo giá khớp, lợi nhuận hay điểm mua/bán.

Đề xuất v1 horizon **7 ngày lịch**; 1 ngày chỉ nghiên cứu sau khi mật độ quote đủ. Trước test phải khóa: giờ cutoff và `Asia/Ho_Chi_Minh`, quan sát đầu vào hợp lệ cuối cùng trước cutoff với giới hạn tuổi nguồn, thời điểm endpoint t + 7 ngày, quy tắc chọn endpoint và tolerance tối đa quanh thời điểm đó. Không chọn tolerance sau khi thấy kết quả; không dùng quote sau cutoff làm feature. Khóa ngưỡng up/flat/down theo tick/precision và mục đích phân tích trước đánh giá. Missing endpoint hoặc stale quá mức là target không đánh giá được, **không** là flat/no-change. Không áp lịch phiên cổ phiếu cho vàng; không bù quote thiếu để tạo label hoặc tăng sample count.

### Features và chống leakage

Features thử ở mức nhỏ: lag/return/volatility của gold series, spread, XAU và FX chỉ khi có quyền và căn thời gian, news/entity/event được công bố **và project đã quan sát** trước cutoff. Ghi tuổi nguồn và coverage từng feature. Dữ liệu macro sửa lại chỉ dùng vintage đã biết tại thời điểm đó; [FRED real-time periods](https://fred.stlouisfed.org/docs/api/fred/realtime_period.html) minh họa phân biệt thông tin đã biết trong quá khứ với dữ liệu mới nhất, không chứng minh FRED có dữ liệu Việt Nam cần thiết.

Fit preprocessing, missing-data policy, feature selection, hyperparameters và calibration chỉ trên train fold. Dùng walk-forward theo thời gian, purge/gap cho label horizon chồng lấn (7 ngày), holdout gần nhất chưa dùng để tune; báo cáo riêng sản phẩm và các regime thị trường. [TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html) tránh train tương lai/test quá khứ và yêu cầu equally spaced samples để fold duration so sánh được; quote vàng không đều cần split theo khoảng thời gian và quy tắc gap riêng, không chỉ dùng số row. Không shuffle hoặc lấy bản sửa mới nhất để giả lập biết trước.

### Baseline, metrics và quyết định

So baseline đơn giản trước: class frequency fit trên train, no-change/persistence với xác suất hợp lệ, momentum theo ngưỡng khóa; sau đó logistic nhỏ hoặc small tree với regularization. Không dùng LLM làm probability oracle. Cùng target, cutoff, coverage và folds cho mọi model/baseline; nếu đổi coverage phải báo cả tập chung và tập riêng.

Metrics: balanced accuracy, macro-F1 và confusion matrix cho class imbalance; Brier score, log loss, reliability plot và uncertainty cho xác suất; coverage/missing targets/source age và kết quả theo sản phẩm/regime. [scikit-learn calibration](https://scikit-learn.org/stable/modules/calibration.html) mô tả reliability và proper scoring rules; Brier giảm đơn độc không chứng minh calibration tốt hơn vì score còn phản ánh discrimination. Không quyết định chỉ bằng accuracy hoặc backtest PnL. Dùng confidence intervals/ước lượng uncertainty phù hợp chuỗi thời gian, ghi sample size hiệu dụng và target horizon overlap.

Trước mở holdout, preregister minimum sample count/coverage, số regime, mức cải thiện so baseline có ý nghĩa và cách tính confidence interval dựa trên audit lịch sử và variance baseline. Không đặt số năm tùy tiện rồi tuyên bố “đủ dữ liệu”, không tune ngưỡng để đạt pass. Dùng holdout một lần cho quyết định; vòng sửa model tiếp theo cần holdout độc lập hoặc đánh dấu nghiên cứu exploratory.

Shadow forecast **8–12 tuần và đủ target đã trưởng thành** theo ngưỡng preregistered, giữ prediction/version/input snapshot trước endpoint để audit. Không đánh giá nhãn chưa mature; elapsed time không thay số mẫu, coverage, calibration hoặc evidence cải thiện baseline. Công sức thiết lập/đánh giá nằm ở P5, thời gian chờ shadow có thể kéo dài lịch và không cộng vào phép tính giờ roadmap. Giá bán tăng không bảo đảm lợi nhuận khi phải mua ở sell và bán ở buy, còn spread/chi phí.

### Bàn giao chắc chắn, xác suất có điều kiện

Bàn giao P5 luôn có target definition, data/right audit, sample/coverage report, baseline/model comparison, failure cases, reproducible evaluation và quyết định. Chỉ hiển thị probabilities khi quyền training/display, lịch sử/coverage, leakage audit, holdout improvement/uncertainty, calibration và shadow đều đạt tiêu chí khóa trước. UI khi đó cần up/flat/down probabilities, target quote side/product/region, horizon/cutoff/as-of, source age, coverage, uncertainty và model version; không tự sinh lời khuyên giao dịch.

Nếu thiếu quyền/lịch sử, split không an toàn, không có edge, calibration kém hoặc shadow chưa đủ thì báo **insufficient evidence** và giữ dashboard mô tả. Ghi điều kiện mở lại cụ thể: nguồn có quyền/backfill được xác minh, thêm mature observations/regimes, sửa lỗi leakage/quality, hypothesis mới với evaluation độc lập. Đây là một kết quả nghiên cứu hợp lệ, không được đổi thành xác suất bịa để hoàn tất demo.

## Xếp hạng tính năng mở rộng

| Ưu tiên | Giá trị / mức | Phụ thuộc và giới hạn |
|---|---|---|
| 1 | Source quality FR-17/18 — bắt buộc | Provenance, as-of/collectedAt, gap/revision/freshness xuyên P1–P4; admin UI rộng tách task. Không coi receipt success là source health. |
| 2 | Alert threshold/spread FR-14 — kế tiếp | In-app sau P4; dedup, cooldown, ownership, suppress stale/unknown. External messages cần task/authorization riêng. |
| 3 | Event calendar/related news FR-09/10 — kế tiếp | Nguồn/ngày/timezone, planned vs actual, human review; không gắn causation. |
| 4 | Domestic/world reference gap — kế tiếp có điều kiện | Quyền gold/FX, aligned timestamp, quote side, units và purity. Chênh lệch tham chiếu không là lợi nhuận arbitrage có thể thực hiện. |
| 5 | Cited research assistant — kế tiếp | Sau AI gate, retrieval trên nội dung có quyền, citation/abstain/budget; không tư vấn cá nhân. |
| 6 | Compare/correlation FR-16/12 — sau đó | Returns và thời gian overlap, timezone, N, missingness; không chỉ corr levels hoặc tuyên bố nhân quả. |
| 7 | Rule anomaly FR-13 — sau đó; portfolio/heatmap/realtime — xa hơn | Threshold/baseline/coverage cần validation; heatmap cần coverage rộng, realtime cần nguồn/quyền/cadence phù hợp. Không mở hết một lúc. |

Không thêm dependency, skill hoặc service chỉ vì được đề cập trong nghiên cứu. Skills đã cài có thể hỗ trợ tác vụ cụ thể theo [SKILLS_BY_FR.md](SKILLS_BY_FR.md), không cấp quyền dữ liệu hoặc thay kiểm định. Mỗi task tiếp theo cần scope nhỏ, checks phù hợp, independent review và bảo toàn design system hiện có.
