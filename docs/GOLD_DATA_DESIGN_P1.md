# Thiết kế kỹ thuật tổng hợp dữ liệu vàng Việt Nam — Phase P1

**Ngày lập tài liệu:** 15/10/2026<br>
**Trạng thái thiết kế ngày 15/10:** Hoàn thành nghiên cứu và thiết kế kỹ thuật P1.1–P1.4; cập nhật implementation P1.2 và P1.3A ngày 16/10 ở dưới. Cổng live source chưa mở.<br>
**Phạm vi:** Đặc tả kiến trúc, data contract, fixture, mô hình lưu trữ MongoDB, quy tắc collector, API đọc dữ liệu và kế hoạch triển khai từng bước cho luồng dữ liệu vàng Việt Nam (vàng miếng SJC và nhẫn trơn 9999) theo [PRD](PRD.md), [ROADMAP](ROADMAP.md) và kết quả khảo sát nguồn tại [GOLD_SOURCE_AUDIT.md](GOLD_SOURCE_AUDIT.md).

**Trạng thái hiện hành · 18/10/2026:** P1.2/P1.3A/P1.4 synthetic đã có trên
`main`; P1.4 merge [PR #35](https://github.com/Son2110/Market-Pulse/pull/35) tại
`cebfede2724d97f43ed2a33e4a565d567472b9d4`, với
[Application CI](https://github.com/Son2110/Market-Pulse/actions/runs/39060311421)
và [Documentation CI](https://github.com/Son2110/Market-Pulse/actions/runs/39060311438)
thành công. Các trạng thái pending hoặc “triển khai được ngay” có ngày cũ bên
dưới giữ bối cảnh lịch sử; P1.4 chỉ API, chưa có gold UI/collector thật.
[Quyết định kiến trúc A1](SYSTEM_ARCHITECTURE.md) yêu cầu A4 trước collector tự
động và retention theo quyền nguồn; mô tả revision “vĩnh viễn” trong thiết kế
ban đầu không cho phép lưu vô hạn nội dung thật/toàn văn. Hiện chưa có retention
tự động cho synthetic raw/revision; quyền nguồn thật/public/AI/training vẫn đóng.

---

## P1.4 stored read implementation · 16/10/2026

P1.3A đã merge qua PR #34; các ghi nhận pending P1.3A ở dưới là lịch sử.
P1.4 đã có hai API synthetic opt-in với flag `GOLD_READS_ENABLED=false` mặc định,
không cần ingestion secret/init. Hợp đồng thực thi và giới hạn được ghi tại
[local gold read API](LOCAL_DEVELOPMENT.md#optional-stored-synthetic-gold-read-api).
Response là `{data: [rows], metadata}`; unit tường minh dùng `vnd_per_tael` hoặc
`vnd_per_chi`, giữ precision và provenance. History chọn đúng series kể cả region
JSON null, đọc winning snapshots theo chronology UTC microsecond; latest đọc
projection có ưu tiên verified riêng. Cả hai không repair projection hoặc fallback.

Page/count chia sẻ một aggregation facet, `maxTimeMS=1000`, không disk spilling;
đây không phải HTTP deadline hay snapshot isolation. Explain query representative
đã dùng index `asset_reference_history`; không thêm index. Read validate singleton
canonical contract, asset/row hash, dataset và projection ordering, whitelist lồng
nhau, trả 503 an toàn khi dữ liệu chọn bị hỏng. Full local checks và review/CI
được ghi trong [roadmap](ROADMAP.md). Ngày 16/10/2026, review độc lập GPT-6 Astra
chấp thuận không có finding, chạy đạt 14 focused checks (gồm năm integration
MongoDB), không skip. CI remote P1.4 vẫn còn chờ.
Không thêm UI, collector thật, cache hoặc thay ngữ nghĩa ingestion; quyền nguồn
thật/public/training vẫn chưa được mở. Thiết kế tương lai bên dưới giữ bối cảnh.

## P1.2 contract implementation · 16/10/2026

Đã triển khai riêng [schema gold-quotes-v1](../packages/schemas/gold-quotes-v1.schema.json),
[fixture synthetic](../fixtures/gold/README.md), validator Python offline và golden
tests Python/Node dùng RFC 8785/SHA-256. Phần này ghi trạng thái P1.2;
implementation storage/worker P1.3A và bằng chứng local hiện hành được ghi riêng
ngay bên dưới. Collector nguồn thật, read API và UI vẫn là thiết kế tương lai.

P1.2 dùng envelope đóng `schemaVersion`, `dataset`, `observations`; provider và
provenance là `marketpulse-fixture`, URL thuộc `marketpulse.invalid`, SJC/PNJ là
brand sản phẩm riêng. Freshness luôn `fixture / unknown`. Timestamps trong `time`
bắt buộc UTC sáu chữ số phần giây; `qualityFlags.sourceTimestampStatus` và
`regionStatus` mô tả tình huống giả lập, không xác minh nguồn thật. `requestedRegion`
không chứng minh `region`; ngày tham chiếu dùng UTC+7 từ source time, hoặc collection
khi source unknown. Decimal string tối đa 128 ký tự, số học chính xác trong giới hạn
này, phép đổi đơn vị và null sides được kiểm tra. Hash content chỉ chứa projection
kinh tế ở mục D; URL/adapter/quality/collection metadata không tham gia.

Quy tắc identity hiện hành tại mục A dùng JSON null và snapshot key có prefix;
unknown fetch mới tạo snapshot mới, replay giữ collection time gốc. Validator chỉ
kiểm tra cấu trúc, số học và identity trong payload; không thể chứng minh upstream
đã công bố đồng thời hai phía. Future adapter phải xác minh pairing, giữ riêng
snapshot của các phía lệch thời điểm. Không mở cổng nguồn thật hoặc public/training.

## P1.3A ingestion/storage implementation · 16/10/2026

Đã triển khai [validator Node](../apps/api/src/gold-contract.ts) và
[GoldStore](../apps/api/src/gold-store.ts) vào internal delivery/outbox/worker hiện
có, giữ schema gold `1.0.0`, không thêm dependency hoặc collector nguồn thật.
Envelope có `observations` được kiểm tra riêng; envelope trộn stock/gold bị từ chối.
Schema MongoDB giải quyết reference lồng nhau và điều kiện product/brand; decimal
vẫn là string, timestamp UTC giữ sáu chữ số, precision phép tính riêng là 300.

Bốn collection dùng tên ở mục 3.2; record đầy đủ nằm trong trường `record`.
`gold_assets` chứa định nghĩa series bất biến, không chứa requested region;
revision giữ **toàn bộ observation đầu tiên** và `firstDeliveryId` bất biến.
Projection snapshot và latest dùng `contentDigest`, `collectedOrder`,
`sourceOrder`, `sourceVerified`, `deliveryId`; các tên `winningContentDigest` và
`latestObservationOrder` ở ví dụ thiết kế bên dưới là tên minh họa cũ.
Index triển khai là unique `(snapshotId, contentDigest)` trên revision và
`(assetId, record.time.referenceDate)` trên snapshot; latest dùng `_id` asset.
Index/filter cho read API sẽ được đánh giá ở P1.4 theo truy vấn thực tế.

Snapshot tối đa theo `(collectedOrder, contentDigest)`; latest tối đa theo
`(sourceVerified, sourceOrder, collectedOrder, contentDigest)`. Mọi lần nhận lại
revision vẫn thử cả hai projection. Equal tuple giữ nguyên toàn bộ document.
Receipt xác nhận số asset khác nhau và số observation xử lý đủ ba bước; fixture
có ba asset, 11 observation. Không có transaction nhiều document hoặc retention
tự động; crash có thể để projection chậm hơn revision đến khi replay.

Đã đạt local: 177 Node unit, 36 integration MongoDB/Redis (chín gold),
44 Python contract (17 gold), 29 collector tests, hai fixture validators,
lint/typecheck/build và docs checks. Corpus chung 138 mutation kiểm tra Python/Node.
Integration dùng HTTP thật, race/upsert, A→B→A, replay so toàn bộ document,
timestamp nguồn cũ đến muộn, unknown/verified và kill worker sau revision,
snapshot, success. Chờ review độc lập và CI remote. Collector P1.3B, read API
P1.4, UI, quyền nguồn thật/public/training chưa được mở; các mục tương ứng bên
dưới vẫn là thiết kế tương lai. Xem [hợp đồng storage hiện hành](INGESTION.md#synthetic-gold-storage-and-ordering).

Review GPT-6 Astra độc lập ngày 16/10 chạy đạt chín gold integration tests và tìm
thấy một lỗi parity whitespace giữa Python/JavaScript (U+0085 và U+FEFF).
Đã sửa schema bằng tập whitespace tường minh ở đầu/cuối region, thêm tám mutation
đã tính lại identity cho `region`/`requestedRegion`, nâng corpus lên 138 case.
Focused Node/Python gold checks sau sửa đạt; chờ reviewer kiểm tra lại và CI remote.
Các con số full suite ở trên là bằng chứng worker trước lần sửa tập trung này.

## 1. Tổng quan kiến trúc dữ liệu vàng P1

Dự án MarketPulse VN kế thừa kiến trúc xử lý dữ liệu bất biến và bền vững đã được chứng minh trong hệ thống ingestion cổ phiếu hiện có:
```
[Nguồn dữ liệu / Synthetic Fixture]
               │
               ▼
   [Python Ingestion CLI / Adapter] (Validation RFC 8785, Opt-in, Timeout hữu hạn)
               │ (HTTP POST với Bearer INGESTION_SECRET)
               ▼
   [Internal API Delivery Boundary] (Express 202, Acknowledged insert w:1, j:true)
               │ (Durable raw receipt trong MongoDB `ingestion_deliveries`)
               ▼
         [BullMQ Queue] (Redis job ID xác định)
               │
               ▼
      [Node.js Ingestion Worker] (Xử lý tuần tự, idempotent, revision tracking)
               │
               ├──► `gold_assets` (Immutable asset definition)
               ├──► `gold_quote_revisions` (Lịch sử bất biến mọi lần cập nhật / audit revisions)
               ├──► `gold_quote_snapshots` (Durable canonical snapshot series / winning projection per snapshotId)
               └──► `gold_quotes_latest` (Projection giá hiện hành của asset phục vụ truy vấn latest)
                               │
                               ▼
            [Public/Stored Read API] (`/api/gold/quotes/latest` đọc từ `latest`, `/history` đọc từ `snapshots`)
```

### Nguyên tắc thiết kế cốt lõi
1. **Không ép vàng thành OHLC cổ phiếu:** Giá vàng mua/bán của nhà niêm yết là biểu giá 2 chiều (two-sided quotes), không có volume giao dịch khớp lệnh thực tế và không có chu kỳ phiên đóng/mở cửa như sàn chứng khoán. Không tạo volume giả hoặc ép thành nến OHLC.
2. **Không gộp sản phẩm khác biệt thành một chuỗi chung:** Vàng miếng SJC và nhẫn trơn 9999 là hai sản phẩm khác nhau về thương hiệu, cung-cầu, tính thanh khoản và biên độ giá. Hai sản phẩm phải có identity riêng biệt và lưu trữ độc lập.
3. **Phân định rạch ròi giữa thời gian thu thập và thời gian công bố:** `collectedAt` (thời điểm hệ thống ghi nhận) không bao giờ được thay thế cho `sourceAsOf` (thời điểm nhà niêm yết phát hành giá). Khi nguồn thiếu timestamp, `sourceAsOf` phải là `null`.
4. **Phân định khu vực yêu cầu và khu vực áp dụng:** `requestedRegion` (tham số dropdown người dùng/collector gửi đi) phải tách riêng khỏi `region` (khu vực thực tế mà bảng giá áp dụng). Khi chưa xác minh được tính gắn kết khu vực, `region` của dữ liệu thật phải là `null`.
5. **Độc lập hoàn toàn giữa fixture và dữ liệu thật:** Mọi thử nghiệm trong quá trình phát triển và CI chỉ sử dụng synthetic fixture có nhãn rõ ràng: `SYNTHETIC FIXTURE — NOT MARKET DATA`. Không đưa dữ liệu thật vào repository hoặc CI khi chưa có giấy phép.

---

## 2. P1.2 — Thiết kế Contract và Synthetic Fixture

### 2.1. Định danh và Cấu trúc Data Contract (Schema v1 cho Vàng)

Hợp đồng dữ liệu vàng (`gold-quotes-v1`) được thiết kế riêng biệt, độc lập với contract cổ phiếu `observed-candles-v2`. Thiết kế áp dụng mô hình **Bản ghi Biểu giá Hai chiều (Two-Sided Quote Snapshot Model)** nhằm phản ánh trung thực bản chất giao dịch vàng vật chất tại Việt Nam: nhà niêm yết công bố đồng thời giá mua vào và bán ra cho một sản phẩm tại cùng một thời điểm.

#### A. Cấu trúc Định danh (Series Identity vs. Snapshot Identity)
Để tránh xung đột định danh giữa giá mua và giá bán, hệ thống phân tách rạch ròi 2 cấp độ danh tính:

1. **Chuỗi sản phẩm (Series / Asset Identity — `assetId`):**
   Định danh bất biến cho một cặp sản phẩm - nhà niêm yết - khu vực cụ thể:
   $$\text{assetId} = \text{SHA-256}(\text{JCS}([\text{"gold_asset"}, \text{provider}, \text{brand}, \text{product}, \text{purity}, \text{region}]))$$
   Khu vực chưa xác minh dùng JSON `null`, không dùng chuỗi `"null"`.
   Trong đó:
   - `provider` (string): Mã nhà niêm yết công bố giá (ví dụ: `"PNJ"`, `"SJC"`, `"DOJI"`).
   - `brand` (string): Thương hiệu sản phẩm thực tế (ví dụ: vàng miếng do PNJ niêm yết thì `provider: "PNJ"`, nhưng `brand: "SJC"`; nhẫn trơn PNJ thì `brand: "PNJ"`).
   - `product` (string): Mã định danh chuẩn hóa của dòng sản phẩm:
     - `"gold_bar_sjc"`: Vàng miếng SJC (chuẩn 1 lượng, 10 lượng, 1 kg).
     - `"plain_ring_9999"`: Nhẫn tròn trơn 99,99% (loại 1 chỉ, 2 chỉ, 5 chỉ).
   - `purity` (string): Độ tinh khiết kim loại (ví dụ: `"999.9"` cho vàng 99,99% / 24K).
   - `region` (string | null): Khu vực địa lý thực tế mà biểu giá áp dụng (ví dụ: `"Hồ Chí Minh"`, `"Hà Nội"`). **Bắt buộc nhận giá trị `null`** nếu nguồn chưa chứng minh được sự phân tách giá theo vùng.

2. **Bản ghi Quan sát Snapshot (Observation Snapshot Identity — `snapshotId`):**
   Mỗi lần nhà niêm yết phát hành biểu giá mới cho một chuỗi sản phẩm sẽ tạo ra một snapshot có định danh duy nhất:
   $$\text{snapshotId} = \text{SHA-256}(\text{JCS}([\text{assetId}, \text{snapshotKey}]))$$
   Trong đó `snapshotKey` được xác định theo nguyên tắc:
   - Nếu nguồn có `sourceAsOf` hợp lệ: `snapshotKey` là `source:<sourceAsOf>` với UTC sáu chữ số phần giây (ví dụ `source:2026-10-15T06:50:00.000000Z`).
   - Nếu `sourceAsOf: null`: `snapshotKey` là `observation:<collectedAt>` với cùng định dạng UTC sáu chữ số. Mỗi fetch mới tạo snapshot riêng dù giá không đổi; replay giữ nguyên `collectedAt` ban đầu. Không suy luận nhóm quan sát theo giá hoặc thêm trường first-observed. Prefix tách hai miền thời gian để tránh va chạm khi source và collection có cùng timestamp.

3. **Cấu trúc dữ liệu Giá trong Snapshot (`gold_quote_snapshot`):**
   - `buy` (string canonical decimal | null): Giá mua vào của nhà niêm yết tính theo đơn vị canonical `VND/lượng`. Bắt buộc là số dương (`> 0`) hoặc `null`. Nhận `null` nếu nhà niêm yết tạm ngừng mua.
   - `sell` (string canonical decimal | null): Giá bán ra của nhà niêm yết tính theo đơn vị canonical `VND/lượng`. Bắt buộc là số dương (`> 0`) hoặc `null`. Nhận `null` nếu nhà niêm yết tạm ngừng bán.
   - `spread` (string canonical decimal có dấu | null): Hiệu số `sell - buy` tính theo đơn vị canonical `VND/lượng`.
   - **Tách biệt ràng buộc buy/sell khỏi spread & Xử lý số 0 chuẩn hóa:**
     - `buy` và `sell` chỉ nhận số dương (`> 0`): Pattern `^(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?)$` hoặc `null`. Định nghĩa số dương bao gồm cả số có phần nguyên bằng 0 (như `"0.5"`, `"0.001"`) lẫn phần nguyên $\ge 1$ (như `"100000000"`, `"100000000.5"`). Tuyệt đối không chấp nhận số 0, số âm, dấu cộng `+`, số mũ, khoảng trắng hay số 0 thừa đầu/cuối.
     - `spread` là chuỗi số thập phân có dấu: Pattern `^(?:0|-?(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?))$` hoặc `null`.
     - **Quy định các giá trị spread cho phép:**
       1. Số 0 chuẩn hóa duy nhất: `"0"`. **Tuyệt đối từ chối `"-0"` hoặc `"-0.0"`**.
       2. Số dương hoặc âm có phần nguyên bằng 0: ví dụ `"0.5"`, `"-0.5"`, `"0.001"`.
       3. Số nguyên hoặc thập phân canonical khác: ví dụ `"3000000"`, `"-2000000"`.
     - **Tiếp tục từ chối nghiêm ngặt:** `"-0"`, `"-0.0"`, số mũ (scientific notation), dấu cộng `+`, khoảng trắng, số 0 thừa phía trước (như `"01"`), và số 0 thừa cuối phần thập phân (như `"1.50"`).
     - **Ví dụ kiểm chứng số học:**
       - `buy = "100000000"`, `sell = "100000000.5"` $\implies$ `spread = "0.5"`.
       - Đảo hai giá: `buy = "100000000.5"`, `sell = "100000000"` $\implies$ `spread = "-0.5"` kèm `qualityFlags.priceIntegrity: "spread_inverted"`.
     - `spread` **chỉ được phép tính toán khi cả `buy` và `sell` cùng xuất hiện đồng thời trong cùng một snapshot phát hành**. Nếu một trong hai phía là `null`, `spread` bắt buộc phải là `null`.
     - Khi `sell >= buy`: `spread` là chuỗi số không âm (ví dụ `"3000000"`, `"0.5"`, `"0"`).
     - Khi `sell < buy` (dị thường thị trường hoặc lỗi nguồn): Hệ thống giữ nguyên giá trị gốc trung thực của `buy` và `sell`, tính toán `spread` ra giá trị âm (ví dụ `"-2000000"`, `"-0.5"`), và gán cờ chất lượng `priceIntegrity: "spread_inverted"`. Validator chấp nhận lưu trữ bản ghi này để phục vụ audit/giám sát, không tự động sửa hay loại bỏ.
     - **Tuyệt đối cấm ghép nối lệch thời điểm:** Không bao giờ được phép lấy giá mua tại thời điểm $t_1$ ghép với giá bán tại thời điểm $t_2$ để tính spread nhân tạo.
     - *Trường hợp nguồn tách biệt luồng mua và bán (Unbundled Sides):* Nếu nguồn phát hành riêng rẽ luồng giá mua và bán tại các thời điểm khác nhau, hệ thống lưu dưới dạng các snapshot khuyết một phía độc lập (`buy: "..."`, `sell: null`, `spread: null` hoặc ngược lại), mỗi bản ghi có `snapshotId` riêng theo mốc thời gian của chính nó, không cạnh tranh đè sai dữ liệu.

#### B. Giá trị số và Chuẩn hóa Đơn vị Canonical Duy nhất
Để loại trừ hoàn toàn rủi ro sai lệch 10 lần (1 lượng = 10 chỉ), dự án quy định **chỉ có duy nhất một đơn vị canonical lưu trữ trong toàn bộ hợp đồng và cơ sở dữ liệu nội bộ**:

- **Tiền tệ (`currency`):** Bắt buộc là `"VND"`.
- **Đơn vị canonical lưu trữ (`canonicalUnit`):** Cố định duy nhất là `"vnd_per_tael"` (VND/lượng).
- **Định dạng số học:**
  - `buy`, `sell`: Chuỗi số thập phân dương chuẩn tắc (pattern `^(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?)$`).
  - `spread`: Chuỗi số thập phân có dấu chuẩn tắc (pattern `^(?:0|-?(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?))$`), số 0 bắt buộc duy nhất là `"0"`, nghiêm cấm `"-0"`.
  - Tuyệt đối không dùng kiểu số thực dấu phẩy động (`float`/`double`) trong contract và storage để tránh lỗi làm tròn nhị phân.
- **Bảo toàn Provenance và Dữ liệu gốc để kiểm toán phép đổi:**
  Mọi bản ghi bắt buộc lưu kèm giá trị và đơn vị gốc của nguồn:
  - `originalBuy` (string | null): Giá mua thô từ nguồn (ví dụ `"14030"`).
  - `originalSell` (string | null): Giá bán thô từ nguồn (ví dụ `"14330"`).
  - `originalUnit` (string): Đơn vị niêm yết thô của nguồn:
    - `"thousand_vnd_per_chi"` (nghìn VND/chỉ — ví dụ PNJ, DOJI).
    - `"thousand_vnd_per_tael"` (nghìn VND/lượng — ví dụ SJC).
    - `"vnd_per_tael"` (VND/lượng).
  - `conversionFactor` (string): Hệ số nhân quy đổi sang `VND/lượng`:
    - Với `thousand_vnd_per_chi`: Nhân `10000` (vì $14.030 \times 1.000 \times 10 = 140.300.000$).
    - Với `thousand_vnd_per_tael`: Nhân `1000` (vì $140.300 \times 1.000 = 140.300.000$).
    - Với `vnd_per_tael`: Nhân `1`.
- **Hệ số quy đổi khối lượng chuẩn:**
  - 1 lượng (cây) = 10 chỉ = 37,5 gam.
  - 1 chỉ = 3,75 gam = 0,1 lượng.
  - Tham chiếu quốc tế: 1 troy ounce = 31,1034768 gam theo NIST (≈ 8,29426 chỉ; 1 chỉ ≈ 0,120565 troy oz).
- **Quy tắc đầu ra API:** API mặc định trả về đơn vị canonical `vnd_per_tael`. Chỉ thực hiện chuyển đổi sang `vnd_per_chi` khi client truyền tham số tường minh `?unit=vnd_per_chi` (chia 10 tại tầng API presentation, giữ chuỗi decimal).

#### C. Quản lý thời gian, Provenance và Chất lượng
- `sourceAsOf` (string ISO 8601 UTC | null): Thời điểm nguồn công bố giá. Nếu nguồn cung cấp chuỗi giờ địa phương (ví dụ `"13:50 15/10/2026"`), adapter phải parse chính xác theo múi giờ `Asia/Ho_Chi_Minh` và chuyển đổi sang UTC ISO 8601. Nếu nguồn rỗng (như blog PNJ), trường này bắt buộc là `null`.
- `collectedAt` (string ISO 8601 UTC microsecond): Thời điểm hệ thống collector thực hiện nhận bản ghi.
- `requestedRegion` (string | null): Ghi nhận tham số khu vực mà collector gửi đi trong request (nếu có), phân biệt với `region`.
- `qualityFlags`:
  - `sourceTimestampStatus`: `"verified"` | `"unknown"`.
  - `regionStatus`: `"verified"` | `"unverified"` | `"not_applicable"`.
  - `priceIntegrity`: `"valid"` | `"spread_inverted"` (bán thấp hơn mua). Giá mua/bán âm bị từ chối; không có cờ boolean trùng nghĩa.
- `provenance`:
  - `provider`: Tên nguồn (ví dụ `"PNJ"`, `"SJC"`, `"marketpulse-fixture"`).
  - `sourceUrl`: URL cụ thể đã thu thập.
  - `adapterVersion`: Phiên bản mã nguồn collector adapter.
  - `schemaVersion`: `"1.0.0"`.

#### D. Định nghĩa Hàm băm Nội dung (`contentDigest`) và Vai trò của `collectedAt`
Nhằm bảo toàn tính toàn vẹn kinh tế và khả năng khử trùng lặp (deduplication) nội dung, hệ thống phân định tuyệt đối giữa nội dung kinh tế của báo giá và thời gian quan sát kỹ thuật:

1. **Các trường BẮT BUỘC tham gia vào `contentDigest` (Canonical Economic Payload):**
   `contentDigest` là chữ ký hàm băm SHA-256 tính trên chuỗi JSON chuẩn hóa (RFC 8785 JCS) chứa các thuộc tính kinh tế cốt lõi của báo giá:
   $$\text{contentDigest} = \text{SHA-256}(\text{JCS}(\{ \text{assetId}, \text{sourceAsOf}, \text{quotes}, \text{provenance} \}))$$
   - `assetId`: Định danh chuỗi sản phẩm.
   - `sourceAsOf`: Thời điểm nhà niêm yết phát hành giá (hoặc `null`).
   - `quotes`: `{ buy, sell, spread, currency, unit }`.
   - `provenance`: `{ provider, originalBuy, originalSell, originalUnit, conversionFactor }`.
2. **Các trường TUYỆT ĐỐI KHÔNG tham gia vào `contentDigest`:**
   - `collectedAt`: Đây là metadata đo lường kỹ thuật của hệ thống quan sát (ingestion observation time), không phải thuộc tính kinh tế của biểu giá do nhà niêm yết phát hành.
   - `collectedOrder`: Chuỗi chuẩn hóa của `collectedAt`.
   - `deliveryId` / `firstDeliveryId`: Mã định danh giao nhận nội bộ.
   - `adapterVersion`: Phiên bản mã nguồn collector.
   - `qualityFlags`: Các cờ đánh giá của hệ thống nạp.
   - **Lưu ý thiết kế:** Tuyệt đối không đưa `collectedAt` vào `contentDigest` chỉ để né tránh hiện tượng nội dung quay lại (flip-flop). Đưa `collectedAt` vào hash sẽ phá vỡ hoàn toàn nguyên tắc dedup nội dung và biến mọi lượt polling định kỳ thành một revision mới giả mạo, làm phình to cơ sở dữ liệu và sai lệch lịch sử audit.
3. **Vai trò Kỹ thuật của `collectedAt` và `collectedOrder`:**
   - `collectedAt` là dấu thời gian ISO 8601 UTC microsecond ghi nhận thời điểm collector cào được dữ liệu.
   - `collectedOrder` là chuỗi chuẩn hóa từ `collectedAt` dùng để so sánh thứ tự từ điển (lexicographical comparison) thời gian quan sát.
   - `collectedOrder` xác định thứ tự quan sát giữa các lần thu thập, dự kiến lưu vào `latestObservationOrder` của projection. Với source time unknown, giá trị UTC chuẩn hóa của `collectedAt` còn tham gia snapshot key có prefix `observation:`; nó luôn bị loại khỏi `contentDigest`.

### 2.2. Danh mục Tình huống Synthetic Fixture và Tiêu chí Validation

Để phục vụ phát triển P1.2 và P1.3 mà không cần gọi mạng ra bên ngoài, bộ fixture tổng hợp (`fixtures/gold/mp-gold-synthetic.json`) được thiết kế hoàn toàn bằng **dữ liệu giả lập tách biệt khỏi dữ liệu quan sát thực tế** (giá tổng hợp khác biệt có chủ đích so với mẫu PNJ thực tế ngày 15/10/2026 để tránh nhầm lẫn với dữ liệu thị trường):

1. **Kịch bản cơ sở hợp lệ (Happy Path — SJC & Nhẫn trơn tổng hợp):**
   - Vàng miếng SJC (`gold_bar_sjc`): Buy `"138500000"` VND/lượng, Sell `"141500000"` VND/lượng; Spread `"3000000"` VND/lượng; có `sourceAsOf` hợp lệ, `region: "Hồ Chí Minh"`.
   - Nhẫn trơn 9999 (`plain_ring_9999`): Buy `"137000000"` VND/lượng, Sell `"140000000"` VND/lượng; Spread `"3000000"` VND/lượng.
   - Toàn bộ bản ghi gắn nhãn: `SYNTHETIC FIXTURE — NOT MARKET DATA`.
2. **Kịch bản khuyết một phía (Single-Sided Quote):**
   - Tạm ngừng mua: `buy: null`, `sell: "141500000"`, `spread: null`.
   - Kiểm tra hệ thống: Schema chấp nhận bản ghi; không tự tính spread; API hiển thị đúng `buy: null`.
3. **Kịch bản thiếu timestamp nguồn (`sourceAsOf: null`):**
   - Mô phỏng trường hợp như nguồn blog PNJ thực tế. `sourceAsOf` là `null`, `sourceTimestampStatus: "unknown"`, `collectedAt` có giá trị microsecond đầy đủ.
   - Kiểm tra hệ thống: Pipeline chấp nhận lưu trữ snapshot quan sát, nhưng API gán cờ `sourceTimestampStatus: "unknown"`, không cấp nhãn verified freshness.
4. **Kịch bản khu vực chưa xác minh (`region: null`):**
   - `region` là `null`, `requestedRegion: "11"` (Hà Nội), `regionStatus: "unverified"`.
   - Kiểm tra hệ thống: Không cho phép query filter `region=Hà Nội` khớp với bản ghi này nếu client đòi hỏi strictly verified region.
5. **Kịch bản số học biên và dị thường (Negative / Edge Cases):**
   - Giá chứa số mũ scientific (`"1.4e7"`), số 0 ở đầu (`"014030"`), hoặc ký tự dấu phẩy chưa chuẩn hóa: **Validator phải từ chối (Reject)**.
   - Giá `buy` hoặc `sell` bằng 0 hoặc số âm: **Validator từ chối ngay tại biên**.
   - Biểu diễn số 0 của spread sai quy cách (như `"-0"` hoặc `"-0.0"`): **Validator từ chối (Reject)**.
   - Giá có phần nguyên bằng 0 và spread nhỏ: `buy = "100000000"`, `sell = "100000000.5"` $\implies$ `spread = "0.5"`: **Validator chấp nhận**.
   - Đảo hai giá: `buy = "100000000.5"`, `sell = "100000000"` $\implies$ `spread = "-0.5"`: **Validator chấp nhận**, ghi nhận cờ `qualityFlags.priceIntegrity: "spread_inverted"`.
   - Giá mua lớn hơn giá bán (Spread đảo ngược, ví dụ Buy 142.000.000, Sell 140.000.000): **Validator chấp nhận**, ghi nhận `spread: "-2000000"`, phát hiện `qualityFlags.priceIntegrity: "spread_inverted"`, không tự động hoán đổi giá trị.
6. **Kịch bản sửa đổi, Replay và Đính chính (Revisions, Deduplication & Updates):**
   - *Lần 1 (09:00 phát hành lần đầu):* Nguồn phát hành biểu giá sáng `sourceAsOf: "09:00"` (Buy 138.500.000, Sell 141.500.000) -> Ghi nhận **Snapshot 1** (Revision 1 của Snapshot 1).
   - *Lần 2 (09:00 replay):* Cùng payload lúc 09:00 được submit lại -> Idempotent replay, không tạo revision mới, giữ nguyên Snapshot 1.
   - *Lần 3 (09:00 đính chính sửa sai):* Nguồn phát hành bản sửa lỗi cho biểu giá 09:00 (cùng `snapshotId` nhưng Buy sửa thành 138.600.000) -> Ghi nhận **Revision 2 của Snapshot 1**; winning revision của Snapshot 1 trong `gold_quote_snapshots` cập nhật lên Revision 2 (không bị coi thành 2 đợt biến động giá).
   - *Lần 4 (14:00 phát hành biểu giá mới):* Nguồn công bố biểu giá chiều `sourceAsOf: "14:00"` (Buy 139.000.000, Sell 142.000.000) -> Đây là mốc thời gian thị trường mới, ghi nhận **Snapshot 2** độc lập trong ngày; projection `gold_quotes_latest` cập nhật lên Snapshot 2. Lịch sử lưu cả Snapshot 1 và Snapshot 2.
7. **Kịch bản nội dung quay lại trong cùng Snapshot (Content Oscillation A → B → A):**
   - Trong cùng `snapshotId` có `sourceAsOf` xác định (ví dụ mốc 09:00):
     - *Lần 1 (09:00 thu thập nội dung A):* Ghi Revision 1 (A) vào `gold_quote_revisions` (`collectedAt: 09:00`); `gold_quote_snapshots` và `gold_quotes_latest` cùng chọn A (`latestObservationOrder: 09:00`).
     - *Lần 2 (10:00 thu thập nội dung B):* Ghi Revision 2 (B) vào `gold_quote_revisions` (`collectedAt: 10:00`); `gold_quote_snapshots` và `gold_quotes_latest` cập nhật B vì 10:00 > 09:00 (`latestObservationOrder: 10:00`).
     - *Lần 3 (11:00 thu thập lại nội dung A):* `contentDigest(A)` đã tồn tại $\implies$ Dedup hoàn toàn vào bản ghi Revision 1 (A) ban đầu, không tạo revision thứ 3 và không sửa đổi trường `collectedAt` 09:00 của bản ghi immutable. Worker chạy pipeline cập nhật cho `gold_quote_snapshots` và `gold_quotes_latest`: vì `latestObservationOrder` mới (11:00) > 10:00 $\implies$ cả hai collection projection cùng cập nhật winning revision thành A!
   - *Kiểm tra hệ thống:* `gold_quote_revisions` chỉ có đúng **2 revision nội dung** (A và B); sau khi hoàn tất xử lý, `GET /api/gold/quotes/history` và `GET /api/gold/quotes/latest` **cùng hội tụ về nội dung A**.


---

## 3. P1.3 — Thiết kế Collector và Lưu trữ Lịch sử MongoDB

### 3.1. Thiết kế Adapter Collector Python (Kiến trúc tối thiểu)
Kế thừa cấu trúc của `services/collector/collector/vnstock_adapter.py` và `transport.py`:
- **Tên module dự kiến:** `services/collector/collector/gold_adapter.py` và `gold_cli.py`.
- **Cơ chế Opt-in an toàn:** Adapter nguồn thật mặc định tắt; chỉ kích hoạt khi có cờ tường minh: `--enable-gold-provider --provider=sjc` hoặc cấu hình biến môi trường `GOLD_COLLECTOR_ENABLED=true`.
- **Cadence và Giới hạn tốc độ (Rate Limiting):**
  - Vì bảng giá vàng trong nước chỉ thay đổi từ vài lần đến vài chục lần mỗi ngày trong các đợt biến động mạnh, tần suất lấy mẫu tối đa được giới hạn: tối thiểu 15–30 phút một lần (không bao giờ polling liên tục theo giây).
  - Timeout mạng: Giới hạn tối đa 15 giây cho mỗi HTTP request; không tự động retry khi gặp lỗi `HTTP 4xx` (Bad Request / Forbidden).
  - Backoff hữu hạn: Khi gặp lỗi mạng kết nối hoặc `HTTP 5xx`, chỉ retry tối đa 2 lần với khoảng cách exponential backoff (2s, 5s), sau đó dừng và ghi log lỗi có mã an toàn (`provider_timeout`, `provider_unavailable`), không in payload thô hay secret.

### 3.2. Mô hình Tài liệu MongoDB và Index

Hệ thống phân tách thành 4 collection chuyên biệt kế thừa kiến trúc bền vững của `ObservedStore`:

```
┌────────────────────────────────────────────────────────┐
│ Collection: `gold_assets`                              │
│ _id = assetId                                          │
│ Lưu thông tin định danh bất biến của chuỗi sản phẩm    │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Collection: `gold_quote_revisions`                     │
│ _id = SHA-256([snapshotId, contentDigest])             │
│ Unique Index: { snapshotId: 1, contentDigest: 1 }      │
│ Lưu append-only các revision nội dung bất biến         │
│ (Không bao giờ sửa timestamp ban đầu, bảo toàn audit)  │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Collection: `gold_quote_snapshots`                     │
│ _id = snapshotId (Mỗi snapshot chỉ có đúng 1 document) │
│ Projection winning revision bền vững của từng snapshot │
│ Lưu thứ tự quan sát: `latestObservationOrder`          │
│ Index: { "assetId": 1, "referenceDate": 1,             │
│          "latestObservationOrder": 1 }                 │
│ Phục vụ trực tiếp API `/api/gold/quotes/history`       │
└────────────────────────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Collection: `gold_quotes_latest`                       │
│ _id = assetId (Mỗi asset chỉ có đúng 1 document)       │
│ Projection nguyên tử biểu giá hiện hành của sản phẩm   │
│ Index: { "provider": 1, "product": 1 }                 │
│ Phục vụ trực tiếp API `/api/gold/quotes/latest`        │
└────────────────────────────────────────────────────────┘
```

#### A. Ngữ nghĩa Định danh: Chuỗi sản phẩm (`assetId`), Snapshot (`snapshotId`), và Ngày tham chiếu (`referenceDate`)
Để không làm mất ngữ nghĩa thị trường vàng vật chất, thiết kế phân định rõ ranh giới giữa các khái niệm:

1. **Không sao chép mô hình nến EOD chứng khoán:**
   Chứng khoán niêm yết đóng cửa với đúng 1 cây nến mỗi ngày giao dịch (`barId = SHA-256(symbol, tradingDate)`). Nhưng với thị trường vàng trong nước, một ngày có thể có nhiều lần điều chỉnh giá (intraday price ticks / updates, ví dụ 08:30, 09:15, 11:30, 14:00).
   - **Quan sát mới (New Observation):** Mỗi lần nguồn phát hành biểu giá mới trong ngày là một observation độc lập, mang `snapshotId` riêng, được lưu liên tiếp vào `gold_quote_revisions` để bảo toàn toàn bộ lịch sử biến động giá trong ngày.
   - **Bản sửa đổi (Revision):** Chỉ phát sinh khi nguồn phát hành bản sửa lỗi/đính chính cho chính snapshot tại thời điểm công bố đó (cùng `snapshotId` nhưng `contentDigest` thay đổi), hoặc khi hệ thống replay lại cùng một payload (`contentDigest` trùng khớp).
2. **Khóa tài liệu `gold_quotes_latest`:**
   - Khóa duy nhất là `_id = assetId` (định danh chuỗi sản phẩm: provider, brand, product, purity, region).
   - **Tuyệt đối không đưa `tradingDate` vào `_id` của `gold_quotes_latest`**: Projection này đại diện cho "biểu giá hiện hành của sản phẩm", không bị phân cắt nhân tạo theo ngày.
3. **Ngày tham chiếu lọc lịch sử (`referenceDate`):**
   - Người dùng và API truy vấn lịch sử theo khoảng ngày `from` và `to` (lịch dương, múi giờ Việt Nam `Asia/Ho_Chi_Minh`, UTC+7).
   - Quy tắc xác định `referenceDate`:
     - Nếu nguồn có `sourceAsOf` hợp lệ: `referenceDate` được tính bằng ngày lịch (`YYYY-MM-DD`) của `sourceAsOf` khi chuyển về múi giờ `Asia/Ho_Chi_Minh`. Gán cờ `referenceDateType: "source_date"`.
     - Nếu `sourceAsOf: null`: **Tuyệt đối không giả lập `sourceAsOf` bằng `collectedAt`**. Trường `sourceAsOf` bắt buộc giữ nguyên giá trị `null`. Để hỗ trợ truy vấn lọc theo ngày, hệ thống tính trường `referenceDate` dựa trên ngày lịch của `collectedAt` theo múi giờ `Asia/Ho_Chi_Minh`, đồng thời gán cờ tường minh: `referenceDateType: "collected_date"`, `sourceTimestampStatus: "unknown"`.

#### B. Quy tắc Ordering và Chống Ghi Đè Xác Định (Precedence & Out-of-Order Rules)
Hệ thống phân định nghiêm ngặt giữa hai trục thời gian:
- **Thời gian thị trường (Market Time):** `sourceAsOf` (thời điểm nhà niêm yết công bố giá).
- **Thời gian thu thập (Ingestion Time):** `collectedAt` / `collectedOrder` (thời điểm hệ thống quan sát).
- **Nguyên tắc bất biến:** Một bản ghi không có thời gian nguồn (`sourceAsOf: null`) **tuyệt đối không được tuyên bố là mới hơn theo thời gian thị trường** so với một bản ghi có `sourceAsOf` đã xác minh.

Phân xử cập nhật `gold_quotes_latest` theo 2 chế độ nguồn:
1. **Chế độ Nguồn có Timestamp Xác minh (Verified Source Timestamp Mode):**
   - Áp dụng bộ sắp thứ tự: $$\text{MarketOrderingTuple} = (\text{sourceAsOfUTC}, \text{collectedOrderUTC}, \text{contentDigest})$$
   - Bản ghi có `sourceAsOf` lớn hơn sẽ cập nhật projection.
   - Quote cũ đến muộn (có `sourceAsOf` nhỏ hơn) **bị từ chối cập nhật vào `latest`**, dù nó có `collectedAt` lớn hơn (đến sau).
   - Nếu cùng `sourceAsOf`: Bản ghi thu thập sau (`collectedOrder` lớn hơn) sẽ cập nhật. Phân xử hòa bằng thứ tự từ điển của `contentDigest`.
2. **Chế độ Nguồn Thiếu Timestamp (Unknown Source Timestamp Mode):**
   - Áp dụng bộ sắp thứ tự: $$\text{ObservationOrderingTuple} = (\text{collectedOrderUTC}, \text{contentDigest})$$
   - Bản ghi có `collectedOrder` lớn hơn sẽ cập nhật projection.
   - Projection trong trường hợp này chỉ đại diện cho: **"Bản ghi quan sát được thu thập mới nhất"** (`latest_collected_observation`), với cờ `sourceTimestampStatus: "unknown"` và `freshness: "unknown"`.
3. **Quy tắc phân xử khi nguồn chuyển giao trạng thái (Giao thoa có/không có timestamp):**
   - *Nguồn đang có timestamp bỗng mất timestamp (lỗi upstream):* Bản ghi `sourceAsOf: null` **tuyệt đối không được ghi đè** lên bản ghi đang có `sourceAsOf` hợp lệ trong `gold_quotes_latest`. Bản ghi này vẫn được lưu đầy đủ vào `gold_quote_revisions` để bảo toàn lịch sử quan sát thô.
   - *Nguồn trước đây không có timestamp nay được bổ sung timestamp:* Bản ghi mới có `sourceAsOf` xác minh được **được phép ghi đè** lên bản ghi `sourceAsOf: null` cũ để nâng projection lên trạng thái verified.
4. **Cơ chế Cập nhật Nguyên tử theo Nguyên mẫu `ObservedStore`:**
   Để tránh triệt để lỗi `MongoServerError: E11000 duplicate key error` khi dùng `upsert: true` với query filter có điều kiện ordering, thiết kế áp dụng mô hình hai tầng projection nguyên tử kế thừa từ `apps/api/src/observed-store.ts`:
   - **Match duy nhất bằng Identity:** Bộ lọc tìm kiếm của `updateOne` **chỉ chứa duy nhất khóa identity**:
     - Cho snapshot projection (`gold_quote_snapshots`): `{ _id: projection.snapshotId }`.
     - Cho asset latest projection (`gold_quotes_latest`): `{ _id: projection.assetId }`.
     Tuyệt đối không đưa điều kiện ordering vào query filter khi thực hiện upsert.
   - **Quyết định Giữ/Thay thế Nguyên tử bên trong Update Pipeline:**
     Toàn bộ điều kiện ordering và so sánh thời gian được thực hiện nguyên tử bên trong MongoDB aggregation update pipeline sử dụng `$replaceWith` và `$cond`:
     ```javascript
     // 1. Pipeline cập nhật nguyên tử cho gold_quote_snapshots (_id: snapshotId)
     const snapshotPipeline = [
       {
         $replaceWith: {
           $cond: [
             {
               $or: [
                 // Khởi tạo tài liệu mới
                 { $eq: [{ $type: "$latestObservationOrder" }, "missing"] },
                 // Lần quan sát mới hơn theo thời gian ghi nhận (collectedOrder)
                 { $lt: ["$latestObservationOrder", projection.latestObservationOrder] },
                 // Cùng mốc quan sát: phân xử hòa xác định bằng thứ tự từ điển contentDigest
                 {
                   $and: [
                     { $eq: ["$latestObservationOrder", projection.latestObservationOrder] },
                     { $lt: ["$winningContentDigest", projection.winningContentDigest] }
                   ]
                 }
               ]
             },
             { $literal: projection },
             "$$ROOT" // Giữ nguyên toàn bộ tài liệu hiện tại nếu không thỏa điều kiện
           ]
         }
       }
     ];

     // 2. Pipeline cập nhật nguyên tử cho gold_quotes_latest (_id: assetId)
     const latestPipeline = [
       {
         $replaceWith: {
           $cond: [
             <Biểu_thức_ordering_thị_trường_và_quan_sát>,
             { $literal: projection },
             "$$ROOT"
           ]
         }
       }
     ];
     ```
     - Khi snapshot gửi đến có thứ tự cũ hơn hoặc bằng snapshot hiện có: `$cond` trả về `"$$ROOT"`, MongoDB không thay đổi dữ liệu (`modifiedCount: 0`). Đây là trường hợp hợp lệ hoàn toàn bình thường, worker hoàn tất thành công mà không báo lỗi.
     - Khi snapshot gửi đến có thứ tự mới hơn: `$cond` thay thế toàn bộ tài liệu bằng `projection`.
   - **Xử lý Race Condition khi Hai Worker đồng thời tạo Projection đầu tiên:**
     Khi tài liệu chưa từng tồn tại, nếu hai worker xử lý đồng thời hai delivery khác nhau cho cùng một `snapshotId` hoặc `assetId`:
     - Worker nhanh hơn thực hiện `updateOne({ _id: key }, pipeline, { upsert: true })` thành công và tạo document.
     - Worker chậm hơn chạy lệnh với `{ upsert: true }` sẽ gặp lỗi `MongoServerError: E11000 duplicate key error` do xung đột `_id`.
     - **Xử lý lỗi chính xác, không nuốt lỗi:**
       ```javascript
       try {
         await collection.updateOne({ _id: key }, pipeline, { upsert: true });
       } catch (error) {
         // Không nuốt mọi lỗi: Chỉ xử lý riêng mã lỗi duplicate key E11000
         if (!isDuplicateKeyError(error)) throw error;
         // Tài liệu đã được tạo bởi worker song song; retry ngay lập tức KHÔNG CÓ upsert
         await collection.updateOne({ _id: key }, pipeline);
       }
       ```
     - Trong lần gọi lại không có `upsert`, tài liệu đã tồn tại, pipeline chạy so sánh nguyên tử và cập nhật an toàn. Cả hai worker đều hoàn thành hợp lệ mà không làm hỏng delivery.

#### C. Idempotence, Replay và Phục hồi Lỗi (Crash Recovery)
Kế thừa trực tiếp nguyên tắc xử lý của `ObservedStore.persist` trong `apps/api/src/observed-store.ts`:

1. **Quy trình xử lý ba bước bắt buộc cho mỗi snapshot:**
   - **Bước 1 — Lưu Revision Bất biến vào `gold_quote_revisions` (Immutable Insert):**
     Worker thực hiện `insertOne` vào `gold_quote_revisions` với `_id = SHA-256([snapshotId, contentDigest])`.
     Nếu gặp lỗi trùng khóa (`MongoServerError` code 11000): worker đọc lại bản ghi hiện có và kiểm tra `contentDigest`. Nếu `contentDigest` khớp hoàn toàn, xác nhận đây là idempotent duplicate an toàn.
     **NGUYÊN TẮC BẤT BIẾN:**
     - Giữ nguyên vẹn tài liệu revision ban đầu, **tuyệt đối không sửa đổi trường `collectedAt` hoặc timestamp của bản ghi immutable** để che giấu lịch sử hay phục vụ dedup giả tạo.
     - **KHÔNG ĐƯỢC RETURN HOẶC NO-OP BỎ QUA BƯỚC 2 VÀ BƯỚC 3 KHI REVISION ĐÃ TỒN TẠI!** Mọi lượt thu thập (kể cả khi nội dung lặp lại) đều phải thúc đẩy các projection tiến lên theo thứ tự quan sát thực tế.
   - **Bước 2 — Cập nhật Snapshot Projection nguyên tử vào `gold_quote_snapshots`:**
     Sau Bước 1, worker **LUÔN LUÔN TIẾP TỤC** thực thi câu lệnh update pipeline vào `gold_quote_snapshots` (`_id: snapshotId`).
     Điều này đảm bảo: Nếu nội dung quay lại (ví dụ A lúc 09:00 $\rightarrow$ B lúc 10:00 $\rightarrow$ A lúc 11:00), `latestObservationOrder` mới (11:00) sẽ cập nhật winning revision của snapshot đó thành A, giải quyết triệt để sự phân kỳ giữa history và latest mà không cần sửa revision cũ.
   - **Bước 3 — Cập nhật Asset Latest Projection nguyên tử vào `gold_quotes_latest`:**
     Worker tiếp tục thực thi câu lệnh update pipeline vào `gold_quotes_latest` (`_id: assetId`). Đảm bảo biểu giá hiện hành của asset luôn phản ánh biểu giá mới nhất theo quy tắc ordering xác định.
2. **Cơ chế Phục hồi khi Worker dừng giữa chừng (Crashed Worker Recovery):**
   - *Tình huống sự cố:* Worker dừng đột ngột (killed, SIGTERM, crash container, hoặc hook ném ngoại lệ) tại các điểm:
     - *Điểm ngắt 1:* Sau khi ghi revision ở Bước 1, trước khi kịp cập nhật `gold_quote_snapshots` ở Bước 2.
     - *Điểm ngắt 2:* Sau khi cập nhật `gold_quote_snapshots` ở Bước 2, trước khi kịp cập nhật `gold_quotes_latest` ở Bước 3.
   - *Phục hồi:* Khi BullMQ retry job hoặc worker khởi động lại quét outbox reconcile delivery:
     - Bước 1 phát hiện revision đã tồn tại với cùng digest -> chấp nhận idempotent duplicate an toàn và **tiếp tục chuyển sang Bước 2**.
     - Bước 2 thực thi update pipeline -> `gold_quote_snapshots` được cập nhật/khôi phục lên trạng thái winning xác định.
     - Bước 3 thực thi update pipeline -> `gold_quotes_latest` được cập nhật/khôi phục lên biểu giá mới nhất.
     - Delivery được đánh dấu hoàn tất (`success`), đưa toàn bộ hệ thống về trạng thái nhất quán hoàn toàn mà không sinh rác hay trùng lặp dữ liệu.
3. **Các Trường hợp Hợp lệ Không Làm Delivery Failed:**
   Hệ thống coi các tình huống sau là hợp lệ và ghi nhận delivery `success`, không đánh dấu failure chỉ vì projection không cần thay đổi:
   - *Replay bằng nhau:* Cùng payload submit lại, revision được dedup, cả 2 projection giữ nguyên `$$ROOT`, delivery `success`.
   - *Snapshot cũ đến muộn:* Revision được lưu vào lịch sử, projection giữ nguyên bản ghi mới hơn, delivery `success`.
   - *Unknown đến sau verified:* Snapshot `sourceAsOf: null` đến sau snapshot verified, revision được lưu, projection giữ nguyên bản ghi verified, delivery `success`.
   - *Hai worker ghi đồng thời lần đầu:* Race condition được bắt và retry không upsert, cả hai delivery đều `success`.
   - *Crash giữa các bước ghi:* Replay khôi phục cả hai projection thành công, delivery `success`.
4. **Tiêu chí Nghiệm thu Worker & Storage (5 Acceptance Scenarios):**
   1. *Nội dung dao động trong cùng Snapshot (A → B → A):*
      - Thu thập A lúc 09:00 $\rightarrow$ Thu thập B lúc 10:00 $\rightarrow$ Thu thập lại A lúc 11:00.
      - `gold_quote_revisions` chỉ có đúng **2 revision nội dung** (A và B); timestamp ban đầu của A (`collectedAt: 09:00`) được giữ nguyên vẹn.
      - `gold_quote_snapshots` và `gold_quotes_latest` cùng chọn nội dung A (vì `latestObservationOrder` 11:00 > 10:00).
      - Sau khi hoàn tất xử lý hoặc recovery, cả `GET /api/gold/quotes/history` và `GET /api/gold/quotes/latest` cùng hội tụ về nội dung A.
   2. *Replay cùng delivery không đổi kết quả:*
      - Submit cùng 1 synthetic delivery 2 lần; số lượng revision không tăng; cả hai projection `snapshots` và `latest` giữ nguyên `"$$ROOT"` (`modifiedCount: 0`); cả 2 delivery trả về `success`.
   3. *Delivery đến sai thứ tự (Out-of-order deliveries):*
      - Delivery B (10:00) đến sau delivery A (11:00) do trễ mạng hoặc hàng đợi.
      - Khi xử lý B (10:00): Revision B được ghi vào `gold_quote_revisions`, nhưng pipeline tại Bước 2 và 3 thấy `latestObservationOrder` (10:00) < tài liệu hiện tại (11:00) $\rightarrow$ giữ nguyên `"$$ROOT"` (giữ A).
      - Cả history và latest vẫn chọn A. Trạng thái winning hoàn toàn phụ thuộc vào mốc thời gian quan sát ghi nhận trong delivery (`collectedAt`), tuyệt đối không bị ảnh hưởng bởi thời điểm worker thực thi.
   4. *Khởi tạo đồng thời (Concurrent initial upsert):*
      - Hai tiến trình cùng gọi persist cho cùng một asset/snapshot mới; một bên bắt `E11000` và retry không upsert; cả hai thành công và DB giữ trạng thái nhất quán.
   5. *Phục hồi worker bị ngắt (Crash recovery):*
      - Hook `afterRevision` ném lỗi hoặc kill tiến trình sau Bước 1 hoặc sau Bước 2; restart worker và replay delivery; xác nhận revision không nhân đôi, cả hai projection cập nhật đúng snapshot mới nhất, delivery hoàn tất `success`.
5. **Batch lỗi một phần và Outbox Reconcile:**
   - Các dòng hợp lệ đã ghi trước khi xảy ra lỗi/conflict được giữ nguyên (không rollback ngầm); receipt ghi nhận số lượng bản ghi thực tế đã xác nhận. Một batch lỗi một phần không bao giờ báo trạng thái `success` toàn bộ.
   - Worker khởi động lại quét tối đa 100 delivery chưa hoàn thành trong `ingestion_deliveries` để tái tạo job BullMQ trong giới hạn 3 lần thử.


---

## 4. P1.4 — Thiết kế API và Kiểm soát Chất lượng

### 4.1. Nguyên tắc Read API
- **API chỉ đọc dữ liệu đã lưu trữ (Stored Reads Only):** Tuyệt đối không thực hiện bất kỳ lệnh gọi mạng nào tới provider trong luồng request/response của API.
- **Tách biệt Route:** Đường dẫn được tách riêng khỏi candle chứng khoán:
  - `GET /api/gold/quotes/latest`: Đọc giá niêm yết mới nhất của các sản phẩm vàng.
  - `GET /api/gold/quotes/history`: Đọc lịch sử giá theo khoảng thời gian và sản phẩm cụ thể.
- **Kiểm soát Truy cập:** Tương tự `OBSERVED_READS_ENABLED`, luồng đọc dữ liệu vàng được bảo vệ bởi cờ cấu hình `GOLD_READS_ENABLED` (mặc định là `false` khi chưa có dữ liệu/quyền).

### 4.2. Đặc tả Chi tiết Endpoints

#### Endpoint 1: `GET /api/gold/quotes/latest`
- **Query Parameters:**
  - `provider` (optional, string): Lọc theo nhà niêm yết (ví dụ `PNJ`, `SJC`).
  - `product` (optional, string): `"gold_bar_sjc"` hoặc `"plain_ring_9999"`.
  - `region` (optional, string): Mặc định không lọc nếu nguồn là `null`.
  - `unit` (optional, enum: `["vnd_per_tael", "vnd_per_chi"]`): Mặc định là `"vnd_per_tael"` (VND/lượng). Nếu chọn `"vnd_per_chi"`, API presentation chia 10 cho các giá trị decimal.
- **Response Format (HTTP 200):**
  ```json
  {
    "data": [
      {
        "identity": {
          "provider": "PNJ",
          "brand": "SJC",
          "product": "gold_bar_sjc",
          "purity": "999.9",
          "region": null
        },
        "quotes": {
          "buy": "140300000",
          "sell": "143300000",
          "spread": "3000000",
          "currency": "VND",
          "unit": "vnd_per_tael"
        },
        "time": {
          "referenceDate": "2026-10-15",
          "referenceDateType": "collected_date",
          "sourceAsOf": null,
          "sourceTimestampStatus": "unknown",
          "collectedAt": "2026-10-15T09:08:09.123456Z",
          "timezone": "Asia/Ho_Chi_Minh"
        },
        "provenance": {
          "source": "PNJ",
          "originalBuy": "14030",
          "originalSell": "14330",
          "originalUnit": "thousand_vnd_per_chi",
          "conversionFactor": "10000",
          "adapterVersion": "1.0.0",
          "schemaVersion": "1.0.0"
        }
      }
    ],
    "metadata": {
      "count": 1,
      "freshness": "unknown",
      "completeness": "partial"
    }
  }
  ```

#### Endpoint 2: `GET /api/gold/quotes/history`
- **Nguyên tắc Dữ liệu: Đọc Trực tiếp Chuỗi Snapshot Đã Gộp Revision Thắng Bền vững (`gold_quote_snapshots`):**
  - Endpoint truy vấn trực tiếp từ collection **`gold_quote_snapshots`**, trong đó **mỗi `snapshotId` chỉ tồn tại đúng một document lưu trữ trạng thái winning projection** được cập nhật bởi worker theo cùng một bộ quy tắc ordering với `gold_quotes_latest`.
  - **Hội tụ Thứ tự giữa History và Latest (Eventual Projection Convergence):**
    - **Cập nhật nguyên tử từng document:** Mỗi document trong `gold_quote_snapshots` và `gold_quotes_latest` đều được cập nhật nguyên tử độc lập qua update aggregation pipeline.
    - **Lệch tạm thời trong quá trình xử lý:** Do các collection được worker ghi nhận tuần tự (Bước 2 cập nhật snapshot projection, Bước 3 cập nhật latest projection), trạng thái giữa history và latest có thể lệch tạm thời khi worker đang trong quá trình thực thi giữa các bước hoặc khi xảy ra sự cố/crash.
    - **Hội tụ theo cùng quy tắc ordering:** Cả hai collection đều áp dụng cùng bộ quy tắc so sánh thứ tự quan sát (`latestObservationOrder`). Khi worker hoàn tất toàn bộ pipeline xử lý hoặc sau khi tiến trình recovery hoàn tất replay, các projection hội tụ về cùng một trạng thái chuẩn xác (ví dụ trong kịch bản A $\rightarrow$ B $\rightarrow$ A, cả history và latest đều hội tụ về nội dung A).
  - **Mục tiêu kinh tế:** Ngăn chặn việc một snapshot bị đính chính sửa sai làm xuất hiện cả 2 bản ghi (bản cũ sai và bản mới sửa) trong cùng chuỗi lịch sử, khiến biểu đồ hoặc người dùng hiểu nhầm rằng thị trường có hai đợt biến động giá riêng biệt.
  - **Tách bạch Audit Revisions:** Toàn bộ lịch sử các revision nội dung bất biến được lưu trữ vĩnh viễn trong `gold_quote_revisions`. Nếu cần tra cứu kiểm toán nội bộ, hệ thống hỗ trợ tùy chọn riêng `?include_revisions=true` (hoặc route kiểm toán nội bộ riêng). Trong luồng đọc dữ liệu thị trường mặc định, API chỉ đọc chuỗi snapshot chuẩn tắc từ `gold_quote_snapshots`.
- **Thứ tự Sắp xếp (Ordering) Ổn định của Lịch sử:**
  Chuỗi snapshot từ `gold_quote_snapshots` được sắp xếp theo trật tự thời gian xác định:
  - Với snapshot có `sourceAsOf` hợp lệ: Sắp xếp tăng dần theo `sourceAsOfUTC`.
  - Với snapshot có `sourceAsOf: null`: Sắp xếp tăng dần theo `latestObservationOrderUTC`.
  - Tie-break duy nhất khi các mốc thời gian bằng nhau: Sắp xếp tăng dần theo thứ tự từ điển của `_id` (`snapshotId`).
- **Quy trình Phân trang (Pagination) và Thống kê Nhất quán:**
  - **Thực thi trực tiếp trên Collection `gold_quote_snapshots`:**
    1. Lọc theo chuỗi sản phẩm: `{ assetId: resolvedAssetId }`.
    2. Lọc theo khoảng ngày tham chiếu: `{ referenceDate: { $gte: from, $lte: to } }`.
    3. Sắp xếp chuỗi snapshot theo quy tắc ordering ổn định ở trên.
    4. Thực hiện phân trang trên index: `skip = (page - 1) * limit`, `take = limit`.
  - **Ngữ nghĩa thống kê:**
    - `totalRecords`: Tổng số snapshot thị trường duy nhất trong khoảng ngày (`await db.collection("gold_quote_snapshots").countDocuments(filter)`), không bị nhân đôi bởi các bản ghi đính chính hay lượt cào lại.
    - `count`: Số lượng snapshot trả về trong trang hiện hành.
    - `totalPages`: $\lceil \text{totalRecords} / \text{limit} \rceil$.
    - `hasMore`: `true` nếu `page < totalPages`, ngược lại `false`.
- **Query Parameters bắt buộc và Định danh Chuỗi Rõ Ràng (Strict Series Selection):**
  Để bảo đảm tính toàn vẹn kinh tế, query history bắt buộc resolve về một `assetId` duy nhất; **tuyệt đối không cho phép query mơ hồ dẫn đến việc gom các biến thể sản phẩm, thương hiệu hoặc khu vực khác nhau vào cùng một mảng chuỗi thời gian**:
  - `provider` (required, string): `"PNJ"` | `"SJC"`.
  - `product` (required, string): `"gold_bar_sjc"` | `"plain_ring_9999"`.
  - `brand` (optional, string): Mặc định theo canonical brand của sản phẩm tại nhà niêm yết (ví dụ tại PNJ: `gold_bar_sjc` có brand `SJC`, `plain_ring_9999` có brand `PNJ`). Nếu client truyền, bắt buộc phải khớp chính xác.
  - `purity` (optional, string): Mặc định `"999.9"`.
  - `region` (optional, string): Mặc định `null` cho các nguồn chưa xác minh khu vực.
  - Khoảng ngày truy vấn:
    - `from` (required): Định dạng `YYYY-MM-DD`.
    - `to` (required): Định dạng `YYYY-MM-DD`.
    - Giới hạn khoảng ngày: Tối đa 31 ngày trong một request (`to - from <= 31 days`).
  - Giới hạn số bản ghi và Phân trang (Result Cap & Pagination cho dữ liệu Intraday):
    - `limit` (optional, integer): Số lượng snapshot tối đa trả về trong một trang. Mặc định `100`, tối đa `500`.
    - `page` (optional, integer): Số thứ tự trang (bắt đầu từ 1, mặc định 1).
  - Đơn vị hiển thị:
    - `unit` (optional, enum: `["vnd_per_tael", "vnd_per_chi"]`): Mặc định `"vnd_per_tael"`.
- **Response Format (HTTP 200):**
  ```json
  {
    "data": [
      {
        "snapshotId": "a1b2c3d4...",
        "quotes": {
          "buy": "140300000",
          "sell": "143300000",
          "spread": "3000000",
          "currency": "VND",
          "unit": "vnd_per_tael"
        },
        "time": {
          "referenceDate": "2026-10-15",
          "referenceDateType": "collected_date",
          "sourceAsOf": null,
          "sourceTimestampStatus": "unknown",
          "collectedAt": "2026-10-15T09:08:09.123456Z",
          "timezone": "Asia/Ho_Chi_Minh"
        },
        "provenance": {
          "originalBuy": "14030",
          "originalSell": "14330",
          "originalUnit": "thousand_vnd_per_chi",
          "conversionFactor": "10000"
        }
      }
    ],
    "metadata": {
      "series": {
        "provider": "PNJ",
        "brand": "SJC",
        "product": "gold_bar_sjc",
        "purity": "999.9",
        "region": null
      },
      "count": 1,
      "totalRecords": 1,
      "page": 1,
      "totalPages": 1,
      "hasMore": false,
      "freshness": "unknown",
      "completeness": "partial"
    }
  }
  ```
- **Xử lý Ngữ nghĩa và Dị thường:**
  - **Không có dữ liệu trong khoảng ngày (No Data / Empty):** Trả về HTTP 200 với mảng `data: []` và metadata `count: 0`. Không tự nội suy hoặc bịa đặt giá các ngày nghỉ/ngày thiếu.
  - **Dị thường Spread Âm và Khuyết Phía:**
    - `spread` chỉ được tính toán khi cả `buy` và `sell` cùng tồn tại tại cùng một snapshot cập nhật đồng thời. Nếu thiếu một chiều giá: `spread: null`.
    - Nếu giá bán thấp hơn giá mua (`sell < buy`): Giữ nguyên số liệu gốc của `buy` và `sell`, tính ra `spread` âm (ví dụ `"-2000000"`), và gán cờ `qualityFlags.priceIntegrity: "spread_inverted"` trong quality flags.
    - Giá trị số 0 của spread luôn được chuẩn hóa duy nhất là `"0"`, tuyệt đối không chấp nhận `"-0"`.
  - **Tách bạch Ingestion Success khỏi Source Freshness:** Một HTTP delivery được worker ghi nhận thành công chỉ chứng minh rằng bản ghi đã được nạp an toàn vào DB nội bộ; **không đồng nghĩa** dữ liệu ngoài thị trường là fresh. Trường `freshness` luôn phản ánh trung thực trạng thái của nguồn.
  - **Lỗi truy vấn / Hệ thống:** Query sai tham số hoặc vượt giới hạn 31 ngày / 500 records trả về HTTP 400 (`invalid_query`); không tìm thấy sản phẩm trả về HTTP 404 (`product_not_found`); mất kết nối database hoặc quá thời gian timeout (1.000 ms) trả về HTTP 503 (`gold_history_unavailable`).

---

## 5. Chiến lược Kiểm thử và Đảm bảo Chất lượng

Kế thừa toàn diện hạ tầng kiểm thử sẵn có của dự án:
1. **Contract Tests (Python & Node.js):**
   - Viết các test case đối chiếu chéo (Cross-language golden tests) kiểm tra serialization chuẩn RFC 8785 và tính nhất quán của hàm băm `SHA-256` cho `contentDigest`.
   - Kiểm tra định dạng canonical decimal string cho đơn vị duy nhất `vnd_per_tael`: `buy` và `sell` phải là số dương (`> 0`) hoặc `null` (pattern `^(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?)$`). Cho phép số có phần nguyên bằng 0 như `"0.5"`, `"0.001"`; từ chối `"0"`, `"-0"`, số âm, số mũ, dấu cộng, khoảng trắng, số 0 thừa đầu/cuối.
   - Kiểm tra định dạng `spread`: Pattern `^(?:0|-?(?:0\.[0-9]*[1-9]|[1-9][0-9]*(?:\.[0-9]*[1-9])?))$` hoặc `null`. Cho phép `"0"`, số dương hoặc âm có phần nguyên bằng 0 (như `"0.5"`, `"-0.5"`, `"0.001"`), số nguyên hoặc thập phân canonical khác (như `"3000000"`, `"-2000000"`).
   - Kiểm tra các test case kiểm chứng số học:
     - `buy = "100000000"`, `sell = "100000000.5"` $\implies$ `spread = "0.5"`.
     - `buy = "100000000.5"`, `sell = "100000000"` $\implies$ `spread = "-0.5"` kèm cờ `qualityFlags.priceIntegrity: "spread_inverted"`.
     - Từ chối nghiêm ngặt `"-0"`, `"-0.0"`, `"+0.5"`, `"01"`, `"1.50"`, số mũ scientific.
   - Contract kiểm tra `spread = sell - buy` khi có đủ 2 phía; `spread = null` khi thiếu một phía. Future adapter tests phải từ chối ghép hai thời điểm nguồn khác nhau; validator payload không chứng minh upstream pairing.
2. **Unit Tests (API & Store):**
   - Kiểm tra hàm chuyển đổi đơn vị presentation (`vnd_per_tael` chia 10 thành `vnd_per_chi` trên chuỗi số thập phân).
   - Kiểm tra logic phân xử ordering hai chế độ (verified sourceAsOf vs. unknown sourceAsOf; quote cũ đến muộn không đè quote mới; bản ghi unknown không đè bản ghi verified).
   - Kiểm tra validation của `parseGoldHistoryQuery` (yêu cầu định danh chuỗi rõ ràng, giới hạn 31 ngày, giới hạn phân trang `limit` tối đa 500).
   - Kiểm tra `contentDigest`: xác nhận hash không chứa `collectedAt` và các trường metadata quan sát.
3. **Integration Tests (MongoDB & Redis thật):**
   - Kiểm tra luồng xử lý 3 bước: delivery $\rightarrow$ `gold_quote_revisions` $\rightarrow$ `gold_quote_snapshots` $\rightarrow$ `gold_quotes_latest`.
   - **Kịch bản Nghiệm thu Worker & Storage (5 Acceptance Scenarios):**
     1. *Nội dung dao động trong cùng Snapshot (A → B → A):* Submit A (09:00) $\rightarrow$ B (10:00) $\rightarrow$ A (11:00); `gold_quote_revisions` chỉ có đúng 2 revision nội dung (A và B); timestamp ban đầu của A được giữ nguyên; sau khi hoàn tất xử lý hoặc recovery, cả `gold_quote_snapshots` và `gold_quotes_latest` cùng hội tụ về nội dung A.
     2. *Replay cùng delivery không đổi kết quả:* Submit cùng 1 synthetic fixture 2 lần; số lượng revision không tăng; cả 2 projection giữ nguyên `"$$ROOT"`; cả 2 delivery trả về `success`.
     3. *Delivery đến sai thứ tự (Out-of-order deliveries):* Submit snapshot cũ đến sau snapshot mới; revision được lưu đầy đủ; projection giữ nguyên bản ghi có mốc quan sát mới hơn ghi nhận trong delivery; delivery thành công.
     4. *Khởi tạo đồng thời (Concurrent initial upsert):* Hai tiến trình cùng gọi persist cho cùng một asset/snapshot mới; một bên bắt E11000 và retry không upsert; cả hai thành công và DB giữ trạng thái nhất quán.
     5. *Phục hồi worker bị ngắt (Crash recovery):* Hook `afterRevision` giả lập crash sau Bước 1 hoặc sau Bước 2; restart worker và replay delivery; xác nhận revision không nhân đôi, cả 2 collection projection cập nhật đúng snapshot mới nhất, delivery hoàn tất `success`.
4. **Không chạy provider calls trong CI:** Toàn bộ automated test suite trên GitHub Actions chỉ chạy với synthetic fixture, không bao giờ gửi request ra mạng ngoài.

---

## 6. Kế hoạch Triển khai Chi tiết sau Research (P1 Implementation Roadmap)

Sau khi giai đoạn nghiên cứu và thiết kế hoàn tất, công việc triển khai thực tế được chia thành các task nhỏ, làm tuần tự một task tại một thời điểm:

```
[Hoàn tất Research & Design]
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ Task P1.2: Contract vàng & Synthetic Fixture           │
│ Branch: `feat/fr-18-gold-contract-1`                   │
│ • Tạo `packages/schemas/gold-quotes-v1.schema.json`    │
│ • Tạo fixture `fixtures/gold/mp-gold-synthetic.json`   │
│ • Viết validator script & unit tests kiểm tra decimal  │
│ • Không phụ thuộc mạng, CI pass 100%                   │
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ Task P1.3A: Ingestion Pipeline & MongoDB Storage       │
│ Branch: `feat/fr-18-gold-storage-2`                    │
│ • Tích hợp schema v1 vào internal ingestion API        │
│ • Tạo collections: `gold_assets`, revisions,           │
│   `gold_quote_snapshots`, `gold_quotes_latest`         │
│ • Hiện thực logic replay idempotent và ordering tuple  │
│ • Integration tests MongoDB/Redis với synthetic fixture│
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ Task P1.4: Stored Read API & Quality Controls          │
│ Branch: `feat/fr-02-gold-history-1`                    │
│ • Hiện thực `GET /api/gold/quotes/latest` & `/history` │
│ • Kiểm soát cờ `GOLD_READS_ENABLED`, giới hạn 31 ngày  │
│ • Bảo toàn decimal, xử lý empty/spread dị thường       │
│ • Unit & integration tests API                         │
└────────────────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ Task P1.3B: Collector Nguồn Thật (CÓ ĐIỀU KIỆN MỞ LẠI) │
│ Branch: `feat/fr-18-gold-collector-3`                  │
│ • CHỈ MỞ KHI: Có văn bản thỏa thuận/giấy phép chính    │
│   thức và xác minh được phương thức truy cập máy.      │
│ • Hiện thực adapter opt-in có rate limit, timeout      │
└────────────────────────────────────────────────────────┘
```

### Bảng phân định Khả thi ngay vs. Bị chặn bởi Quyền dữ liệu

| Hạng mục công việc | Trạng thái kỹ thuật | Khả năng triển khai hiện tại | Điều kiện mở lại / Yêu cầu tiên quyết |
|---|---|---|---|
| **P1.2 Contract & Fixture** | Thiết kế hoàn tất | **Triển khai được ngay** bằng synthetic fixture | Không có; hoàn toàn offline. |
| **P1.3A Ingestion & Storage** | Đã triển khai local 16/10; chờ review độc lập và CI remote | Synthetic fixture; HTTP/outbox/worker và bốn collection, kiểm thử replay/crash | Không mở collector nguồn thật, read API hoặc UI. |
| **P1.4 Stored Read API** | Thiết kế hoàn tất | **Triển khai được ngay** trên dữ liệu fixture đã lưu | Không có; đọc dữ liệu nội bộ đã lưu. |
| **P1.3B Collector Nguồn Thật** | Đã khảo sát 3 nguồn | **TẠM CHẶN (Blocked)** | 1. Thỏa thuận cấp phép bằng văn bản từ nhà cung cấp.<br>2. Xác minh phương thức truy cập máy ổn định.<br>3. Xác minh tính gắn kết khu vực và timestamp. |
| **Public Deployment & Training** | Đã phân tích pháp lý | **TẠM CHẶN (Blocked)** | Có hợp đồng thương mại cho phép tái phân phối và huấn luyện AI; tuân thủ chính sách robots SJC. |

### Ước lượng công sức cập nhật
- **Thời gian thực hiện các task kỹ thuật khả thi (P1.2, P1.3A, P1.4):** Khoảng 16–24 giờ làm việc tuần tự (tương đương 1,5–2 tuần theo nhịp 10–15 giờ/tuần).
- **Thời gian chờ quyền dữ liệu thật (P1.3B / Public):** Không tính vào giờ lập trình; phụ thuộc hoàn toàn vào tiến trình đàm phán pháp lý bên ngoài của chủ dự án.

---

## 7. Kết luận Bàn giao Thiết kế

Tài liệu thiết kế này đóng gói toàn bộ nghiên cứu và giải pháp kiến trúc cho phase P1 của MarketPulse VN trong phạm vi khảo sát hiện tại. Mọi giải pháp kỹ thuật về data contract hai chiều, đơn vị canonical thống nhất `VND/lượng`, cơ chế phục hồi crash projection theo nguyên mẫu `ObservedStore`, và lộ trình triển khai tuần tự đều được xây dựng trung thực với quan sát thực tế; các khía cạnh pháp lý của nguồn dữ liệu thật vẫn là `unknown` và được bảo vệ nghiêm ngặt bằng cơ chế chặn kỹ thuật của dự án.
