# MarketPulse VN
## Vietnam Market Intelligence & Event Impact Platform

**Loại dự án:** Personal Portfolio / Full-stack / Data Engineering  
**Core stack:** MERN (MongoDB, Express.js, React, Node.js)  
**Mở rộng:** Python data collector, Redis, BullMQ, WebSocket, AI/LLM  
**Thị trường mục tiêu:** Việt Nam  
**Phiên bản tài liệu:** 1.0 — 23/09/2026

---

# 1. Tổng quan đề tài

MarketPulse VN là nền tảng tổng hợp và phân tích dữ liệu thị trường Việt Nam theo thời gian.

Thay vì chỉ hiển thị giá cổ phiếu như một ứng dụng chứng khoán thông thường, hệ thống kết hợp:

- Chứng khoán Việt Nam.
- VN-Index và các chỉ số thị trường.
- Giá vàng.
- Tỷ giá ngoại tệ.
- Lãi suất.
- Một số hàng hóa quan trọng.
- Tin tức kinh tế.
- Các sự kiện có khả năng tác động tới thị trường.

Mục tiêu chính của hệ thống là trả lời ba câu hỏi:

1. **Thị trường hiện đang xảy ra chuyện gì?**
2. **Tài sản/ngành/cổ phiếu nào đang biến động bất thường?**
3. **Sự kiện hoặc tin tức nào có thể liên quan đến biến động đó?**

Ví dụ:

> FTSE nâng hạng thị trường Việt Nam → hệ thống tạo sự kiện → theo dõi VN-Index, thanh khoản, khối ngoại và các nhóm cổ phiếu trước/sau sự kiện → hiển thị mức độ biến động trên Event Timeline.

MarketPulse VN **không phải ứng dụng tư vấn đầu tư và không đưa ra khuyến nghị mua/bán**.

---

# 2. Vấn đề cần giải quyết

Thông tin thị trường Việt Nam hiện thường bị phân tán:

- Giá cổ phiếu nằm trên các nền tảng chứng khoán.
- Giá vàng nằm ở các website khác.
- Tỷ giá và lãi suất nằm ở nguồn khác.
- Tin tức kinh tế nằm trên nhiều báo.
- Người dùng phải tự ghép dữ liệu với sự kiện để hiểu nguyên nhân biến động.

MarketPulse VN tập trung các dữ liệu này vào một hệ thống thống nhất.

Luồng tư duy của hệ thống:

```text
Market Data
     +
Macro Data
     +
News
     ↓
Normalization
     ↓
Event Detection
     ↓
Market Analytics
     ↓
Dashboard / Alerts / Event Impact
```

---

# 3. Mục tiêu dự án

## 3.1 Mục tiêu sản phẩm

Xây dựng một dashboard giúp người dùng:

- Theo dõi thị trường Việt Nam.
- Theo dõi nhiều loại tài sản trong cùng một giao diện.
- Tìm kiếm cổ phiếu.
- Xem dữ liệu lịch sử.
- Theo dõi watchlist.
- Xem heatmap thị trường.
- Phát hiện biến động bất thường.
- Theo dõi tin tức liên quan đến từng mã.
- Xem timeline các sự kiện kinh tế.
- Phân tích tác động của sự kiện lên giá và thanh khoản.
- Tạo cảnh báo theo điều kiện.

## 3.2 Mục tiêu kỹ thuật

Project cần thể hiện được:

- MERN full-stack.
- Authentication / authorization.
- REST API.
- WebSocket realtime.
- Data ingestion.
- Scheduled jobs.
- Queue processing.
- Cache.
- MongoDB Time Series.
- Data normalization.
- Aggregation.
- Analytics.
- Visualization.
- Event-driven architecture.
- AI integration.
- Testing.
- CI/CD.
- Docker.
- Observability.

---

# 4. Đối tượng sử dụng

## 4.1 Guest

Có thể:

- Xem tổng quan thị trường.
- Search mã cổ phiếu.
- Xem dữ liệu cơ bản.
- Xem tin tức.
- Xem Event Timeline.

Không thể:

- Tạo watchlist.
- Tạo alert.
- Lưu portfolio.
- Cá nhân hóa dashboard.

## 4.2 Registered User

Có toàn bộ quyền Guest và:

- Watchlist.
- Alerts.
- Portfolio mô phỏng.
- Dashboard cá nhân.
- Theo dõi danh sách tài sản yêu thích.

## 4.3 Admin

Có thể:

- Quản lý nguồn dữ liệu.
- Theo dõi ingestion jobs.
- Quản lý event.
- Merge event trùng.
- Chỉnh sửa event được AI tạo.
- Theo dõi lỗi collector.
- Theo dõi API usage/rate limit.

---

# 5. Phạm vi dữ liệu

## 5.1 Chứng khoán

Ưu tiên:

- HOSE.
- HNX.
- UPCOM.

Dữ liệu:

- Symbol.
- Company.
- Exchange.
- Sector.
- Open.
- High.
- Low.
- Close.
- Volume.
- Change.
- Change %.
- Historical OHLCV.
- Intraday data nếu nguồn hỗ trợ.

Các index:

- VN-Index.
- VN30.
- HNX-Index.
- HNX30.
- UPCOM-Index.

---

# 6. Tài sản ngoài chứng khoán

## 6.1 Gold

Theo dõi:

- Giá mua.
- Giá bán.
- Spread.
- Lịch sử giá.

Có thể mở rộng:

- SJC.
- Vàng nhẫn.
- Giá vàng thế giới.

## 6.2 Foreign Exchange

Tối thiểu:

- USD/VND.
- EUR/VND.
- JPY/VND.

## 6.3 Interest Rate

- Policy rate.
- Interbank rate.
- Deposit rate.
- Lending rate.

## 6.4 Commodities

Có thể thêm:

- WTI crude oil.
- Brent.
- Gasoline.
- Steel.
- Fertilizer.

---

# 7. Functional Requirements

# FR-01 Authentication

Hệ thống phải hỗ trợ:

- Register.
- Login.
- Logout.
- Refresh token.
- Forgot password.
- Reset password.

Optional:

- Google OAuth.
- GitHub OAuth.

Security:

- Password hashing.
- Access token.
- Refresh token rotation.
- Rate limiting.
- Device/session management.

---

# FR-02 Market Overview Dashboard

Dashboard phải hiển thị:

- VN-Index.
- VN30.
- HNX-Index.
- UPCOM.
- Giá vàng.
- USD/VND.
- Market breadth.

Market breadth:

- Số mã tăng.
- Số mã giảm.
- Số mã đứng giá.

Ngoài ra:

- Total trading volume.
- Total trading value.
- Top gainers.
- Top losers.
- Highest volume.
- Most active stocks.

---

# FR-03 Stock Search

Người dùng có thể search:

```text
FPT
Vingroup
VCB
Vietcombank
```

Search phải hỗ trợ:

- Symbol.
- Company name.
- Fuzzy search.
- Recent search.
- Search suggestion.

---

# FR-04 Stock Detail

Route:

```text
/stocks/:symbol
```

Ví dụ:

```text
/stocks/FPT
```

Trang phải có:

## Price

- Current price.
- Open.
- High.
- Low.
- Previous close.
- Volume.
- Change.
- Change %.

## Chart

Timeframes:

- 1D.
- 5D.
- 1M.
- 3M.
- 6M.
- 1Y.
- 5Y.

Chart:

- Candlestick.
- Line.
- Volume.

Indicators optional:

- SMA.
- EMA.
- RSI.
- MACD.

## Information

- Company.
- Industry.
- Exchange.

## Related News

Các tin có liên quan tới:

- Symbol.
- Company.
- Sector.

## Related Events

Ví dụ:

```text
Government policy
Interest rate change
Index reclassification
Earnings announcement
Corporate action
```

---

# FR-05 Market Heatmap

Hiển thị các cổ phiếu dưới dạng heatmap.

Màu/kích thước có thể biểu diễn:

- % change.
- Market capitalization.
- Volume.

Filter:

- Exchange.
- Sector.
- VN30.
- Watchlist.

---

# FR-06 Watchlist

User có thể:

- Create watchlist.
- Rename.
- Delete.
- Add asset.
- Remove asset.

Ví dụ:

```text
My Watchlist

FPT
VCB
HPG
VNM
Gold
USD/VND
```

Watchlist dashboard hiển thị:

- Price.
- Change.
- Change %.
- Mini chart.
- Latest news.
- Active alert.

---

# FR-07 Market News

Hệ thống thu thập tin kinh tế/tài chính.

Thông tin lưu:

```text
title
url
source
publishedAt
language
summary
entities
symbols
sectors
eventType
sentiment
```

Filter:

- Stocks.
- Gold.
- FX.
- Macro.
- Sector.
- Company.

---

# FR-08 AI News Analysis

AI pipeline:

```text
Article
   ↓
Clean
   ↓
Entity Extraction
   ↓
Category Classification
   ↓
Ticker Mapping
   ↓
Event Extraction
   ↓
Summary
```

AI có thể tạo:

- Summary.
- Category.
- Companies mentioned.
- Related stock symbols.
- Sector.
- Event type.

Ví dụ:

```json
{
  "eventType": "INTEREST_RATE",
  "entities": ["State Bank of Vietnam"],
  "sectors": ["Banking", "Real Estate"],
  "summary": "..."
}
```

Lưu ý:

AI chỉ dùng để phân loại/tóm tắt dữ liệu.

Không nên đưa feature:

```text
AI recommends BUY FPT
AI predicts tomorrow's price
```

vào MVP.

---

# FR-09 Event Timeline

Một trong các feature quan trọng nhất.

Timeline hiển thị:

```text
Date
│
├── Economic Event
├── Corporate Event
├── Regulation
├── Interest Rate
├── Market Reclassification
└── Global Event
```

Ví dụ event:

```text
FTSE Vietnam Market Reclassification
Fed Rate Decision
SBV Interest Rate Change
Major Earnings Release
Oil Price Shock
```

User có thể click vào event để mở Event Detail.

---

# FR-10 Event Detail

Event detail gồm:

- Name.
- Description.
- Source.
- Date.
- Category.
- Related assets.
- Related stocks.
- Related sectors.
- Related news.

Quan trọng nhất:

## Market reaction

Ví dụ:

```text
VN-Index
T-30 → Event → T+30

Return
Volume
Volatility
```

---

# FR-11 Event Impact Analysis

Đây là feature giúp project khác biệt với stock dashboard thông thường.

System tính:

## Price Return

```text
Return = (Price_after - Price_before) / Price_before
```

Intervals:

```text
T-30
T-7
T-1
T
T+1
T+7
T+30
```

## Volume Change

So sánh:

```text
Volume trước event
vs
Volume sau event
```

## Volatility

Có thể tính:

- Standard deviation.
- Historical volatility.

## Abnormal Movement

Ví dụ:

```text
Stock return: +7%
VN-Index: +1%

Excess movement ≈ +6%
```

Mục tiêu không phải chứng minh quan hệ nhân quả.

UI phải dùng wording:

```text
Associated market movement
Market reaction around event
```

không dùng:

```text
Event X caused stock Y to rise
```

---

# FR-12 Correlation Explorer

Cho phép người dùng chọn hai chuỗi dữ liệu.

Ví dụ:

```text
VNINDEX vs USD/VND
VNINDEX vs Gold
HPG vs Steel
Oil vs GAS
USD/VND vs Gold
```

Output:

- Chart overlay.
- Rolling correlation.
- Correlation coefficient.

Time window:

- 30D.
- 90D.
- 1Y.
- 3Y.

---

# FR-13 Anomaly Detection

System phát hiện:

## Price anomaly

```text
price change > threshold
```

## Volume anomaly

Ví dụ:

```text
Volume today > 2 × 20-day average
```

## Volatility anomaly

Ví dụ:

```text
Volatility > historical percentile threshold
```

Output:

```text
FPT

Price +5.2%
Volume 2.4× avg
```

Sau đó hệ thống tìm news/events liên quan.

---

# FR-14 Smart Alerts

User tạo alert.

## Price

```text
FPT > 150000
```

## Percent change

```text
VCB change > 5%
```

## Volume

```text
Volume > 2x MA20
```

## Gold

```text
SJC > threshold
```

## FX

```text
USD/VND > threshold
```

Delivery MVP:

- In-app notification.

Advanced:

- Email.
- Telegram.
- Push Notification.

---

# FR-15 Portfolio Simulator

Không giao dịch tiền thật.

User nhập:

```text
Buy FPT
100 shares
Price: 120000
```

System tính:

- Cost.
- Current value.
- Profit/Loss.
- Profit/Loss %.

Dashboard:

```text
Total value
Total profit
Asset allocation
Performance
```

Mục tiêu:

- Thể hiện domain logic.
- Không cần tích hợp broker trading trong MVP.

---

# FR-16 Compare Assets

User chọn tối đa 5 asset.

Ví dụ:

```text
VNINDEX
FPT
Gold
USD/VND
Oil
```

Normalize:

```text
Starting value = 100
```

→ so sánh performance theo thời gian.

---

# FR-17 Data Source Management

Admin dashboard hiển thị:

```text
SSI API       Healthy
VNStock       Healthy
News Collector Healthy
GDELT         Healthy
```

Thông tin:

- Last sync.
- API latency.
- Error count.
- Rate limit.
- Last successful ingestion.

---

# FR-18 Data Ingestion Monitoring

Admin xem các job:

```text
market-price-sync
daily-ohlcv-sync
gold-sync
fx-sync
news-sync
event-processing
```

Status:

```text
QUEUED
RUNNING
SUCCESS
FAILED
RETRYING
```

Cho phép:

- Retry job.
- View error.
- View duration.

---

# 8. Data Sources

## 8.1 SSI FastConnect

Có thể sử dụng cho:

- Market data.
- Historical data.
- Realtime stream.

SSI có:

- REST API.
- WebSocket.
- Authentication.
- SDK.

Không nên tích hợp Trading API thật trong MVP.

Project chỉ cần Market Data.

---

# 8.2 Vnstock

Rất phù hợp giai đoạn prototype.

Có dữ liệu:

- Stocks.
- Index.
- OHLCV.
- Gold.
- FX.
- Interest rate.
- Macro.
- Commodities.

Vì thư viện chủ yếu Python nên kiến trúc đề xuất:

```text
Python Collector
      ↓
Normalization
      ↓
MongoDB
      ↓
Node API
```

Không gọi Python trực tiếp từ React.

---

# 8.3 GDELT

Có thể dùng cho News/Event ingestion.

GDELT cung cấp:

- News search.
- JSON API.
- Multilingual news monitoring.
- Event dataset.
- Frequent updates.

Pipeline:

```text
GDELT
 ↓
News Collector
 ↓
Deduplicate
 ↓
AI Classification
 ↓
Ticker Mapping
 ↓
MongoDB
```

---

# 9. Kiến trúc hệ thống

```text
                     ┌─────────────────┐
                     │      React      │
                     │     Frontend    │
                     └────────┬────────┘
                              │
                       HTTPS / WS
                              │
                     ┌────────▼────────┐
                     │ Express / Node  │
                     │   API Gateway   │
                     └───────┬─────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
             ▼               ▼                ▼
          Redis           BullMQ          MongoDB
           Cache           Queue
                                              │
                           ┌──────────────────┤
                           │                  │
                           ▼                  ▼
                    Analytics Engine     Event Engine
                           ▲                  ▲
                           │                  │
            ┌──────────────┼──────────────────┐
            │              │                  │
            ▼              ▼                  ▼
       SSI Collector   Vnstock Collector   News Collector
       Node/Python       Python             Node/Python
                                              │
                                             GDELT
```

---

# 10. Service Breakdown

## frontend

```text
apps/web
```

React application.

## api

```text
apps/api
```

Express REST API.

## worker

```text
apps/worker
```

BullMQ background jobs.

## collector

```text
services/collector
```

Python data ingestion.

## analytics

```text
services/analytics
```

Có thể nằm chung với worker ở MVP.

---

# 11. MongoDB Collections

## users

```json
{
  "_id": "...",
  "email": "...",
  "passwordHash": "...",
  "role": "USER",
  "createdAt": "..."
}
```

## assets

```json
{
  "symbol": "FPT",
  "name": "FPT Corporation",
  "type": "STOCK",
  "exchange": "HOSE",
  "sector": "Technology"
}
```

## market_prices

Nên dùng MongoDB Time Series.

```json
{
  "timestamp": "...",
  "meta": {
    "symbol": "FPT",
    "market": "HOSE",
    "interval": "1d"
  },
  "open": 100,
  "high": 110,
  "low": 99,
  "close": 108,
  "volume": 1000000
}
```

## macro_series

```json
{
  "timestamp": "...",
  "meta": {
    "series": "USDVND"
  },
  "value": 26000
}
```

## news

```json
{
  "title": "...",
  "source": "...",
  "url": "...",
  "publishedAt": "...",
  "summary": "...",
  "symbols": ["FPT"],
  "sectors": ["Technology"],
  "eventType": "CORPORATE",
  "embedding": []
}
```

## events

```json
{
  "name": "...",
  "type": "MARKET_RECLASSIFICATION",
  "date": "...",
  "description": "...",
  "symbols": [],
  "sectors": [],
  "sources": []
}
```

## event_impacts

```json
{
  "eventId": "...",
  "asset": "VNINDEX",
  "window": "T+7",
  "return": 0.03,
  "volumeChange": 0.25,
  "volatilityChange": 0.1
}
```

## watchlists

```json
{
  "userId": "...",
  "name": "Main",
  "assets": ["FPT", "VCB", "GOLD"]
}
```

## alerts

```json
{
  "userId": "...",
  "asset": "FPT",
  "metric": "PRICE",
  "operator": ">",
  "value": 150000,
  "enabled": true
}
```

## portfolios

```json
{
  "userId": "...",
  "name": "Demo Portfolio"
}
```

## transactions

```json
{
  "portfolioId": "...",
  "symbol": "FPT",
  "type": "BUY",
  "quantity": 100,
  "price": 120000,
  "date": "..."
}
```

---

# 12. REST API Design

## Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
```

## Assets

```text
GET /api/assets
GET /api/assets/search?q=fpt
GET /api/assets/:symbol
```

## Market

```text
GET /api/market/overview
GET /api/market/heatmap
GET /api/market/movers
```

## Price

```text
GET /api/assets/:symbol/quote
GET /api/assets/:symbol/history
```

Example:

```text
GET /api/assets/FPT/history?interval=1d&range=1y
```

## News

```text
GET /api/news
GET /api/news/:id
GET /api/assets/:symbol/news
```

## Events

```text
GET /api/events
GET /api/events/:id
GET /api/events/:id/impact
```

## Correlation

```text
GET /api/analytics/correlation
```

Example:

```text
?assets=VNINDEX,USDVND&range=1y
```

## Watchlists

```text
GET    /api/watchlists
POST   /api/watchlists
PATCH  /api/watchlists/:id
DELETE /api/watchlists/:id
```

## Alerts

```text
GET    /api/alerts
POST   /api/alerts
PATCH  /api/alerts/:id
DELETE /api/alerts/:id
```

## Portfolio

```text
GET  /api/portfolios
POST /api/portfolios

POST /api/portfolios/:id/transactions
GET  /api/portfolios/:id/performance
```

---

# 13. WebSocket Events

Client subscribe:

```text
subscribe:asset:FPT
subscribe:index:VNINDEX
subscribe:watchlist:{id}
```

Server event:

```json
{
  "event": "PRICE_UPDATE",
  "symbol": "FPT",
  "price": 150000,
  "changePercent": 1.5,
  "timestamp": "..."
}
```

---

# 14. Caching Strategy

Redis cache:

```text
quote:FPT
market:overview
market:movers
asset:FPT
```

TTL:

```text
Realtime quote: seconds
Market overview: seconds
Company metadata: hours/day
Historical query: minutes
```

---

# 15. Background Jobs

BullMQ queues:

```text
market-data
news
analytics
notifications
```

Jobs:

```text
sync-market-data
sync-daily-history
sync-gold
sync-fx
sync-macro
sync-news
classify-news
generate-event
calculate-event-impact
calculate-market-anomalies
process-alerts
```

---

# 16. Deduplication

News có thể bị duplicate từ nhiều nguồn.

Fingerprint:

```text
hash(
 normalized_title
 + domain
 + publish_date
)
```

Có thể nâng cao:

```text
embedding similarity
```

để phát hiện nhiều bài viết nói về cùng một sự kiện.

---

# 17. Event Generation

Event có thể đến từ:

## Manual

Admin tạo.

## Rule-based

Ví dụ:

```text
SBV + rate + change
→ INTEREST_RATE_EVENT
```

## AI-based

LLM nhận:

```text
headline
summary
entities
```

Trả:

```json
{
  "isEvent": true,
  "eventType": "MONETARY_POLICY",
  "entities": [],
  "affectedSectors": []
}
```

Event AI tạo phải có:

```text
status = PENDING_REVIEW
```

trước khi public trong giai đoạn đầu.

---

# 18. Analytics

## Daily Return

```text
Rt = (Pt - Pt-1) / Pt-1
```

## Moving Average

```text
MA20
MA50
MA200
```

## Volume Ratio

```text
Current Volume / Avg Volume 20D
```

## Volatility

Standard deviation của daily returns.

## Rolling Correlation

Ví dụ:

```text
corr(
 VNINDEX returns,
 USD/VND returns,
 window=30
)
```

---

# 19. UI Pages

Public:

```text
/
 /market
 /stocks
 /stocks/:symbol
 /gold
 /fx
 /events
 /events/:id
 /news
 /compare
```

Authenticated:

```text
/dashboard
/watchlists
/alerts
/portfolio
/settings
```

Admin:

```text
/admin
/admin/data-sources
/admin/jobs
/admin/events
```

---

# 20. Dashboard Layout

```text
┌────────────────────────────────────────────┐
│ VNINDEX      GOLD       USD/VND      VN30 │
├────────────────────────────────────────────┤
│                                            │
│            VNINDEX CHART                   │
│                                            │
├──────────────────────┬─────────────────────┤
│ Market Heatmap       │ Market Movers       │
├──────────────────────┼─────────────────────┤
│ Latest Events        │ Latest News         │
├──────────────────────┴─────────────────────┤
│ Unusual Market Activity                    │
└────────────────────────────────────────────┘
```

---

# 21. Non-Functional Requirements

## Performance

API thông thường:

```text
P95 < 500 ms
```

Các query analytics phức tạp:

```text
< 2 seconds
```

khi cache hit/miss hợp lý.

## Availability

Mục tiêu portfolio:

```text
99%+
```

## Reliability

Collector phải hỗ trợ:

```text
Retry
Exponential backoff
Circuit breaker
Rate limit handling
```

## Security

- HTTPS.
- JWT.
- Refresh token rotation.
- Password hashing.
- Input validation.
- Mongo injection protection.
- XSS protection.
- CORS configuration.
- Rate limiting.
- Secret management.

---

# 22. Observability

Log:

```text
requestId
service
job
source
duration
status
error
```

Metrics:

```text
API latency
Collector latency
Queue depth
Job failures
Data freshness
WebSocket connections
```

Có thể dùng:

- OpenTelemetry.
- Prometheus.
- Grafana.
- Sentry.

---

# 23. Testing

## Unit Test

- Analytics.
- Return calculation.
- Correlation.
- Alert conditions.
- Data normalization.

## Integration Test

- API.
- MongoDB.
- Redis.
- Queue.

## E2E

Playwright:

```text
Login
Search FPT
Open stock
Add watchlist
Create alert
```

---

# 24. Suggested Tech Stack

## Frontend

```text
React
TypeScript
Vite
TanStack Query
Zustand
TailwindCSS
TradingView Lightweight Charts
```

## Backend

```text
Node.js
Express
TypeScript
Zod
BullMQ
Socket.IO / ws
Redis
```

## Database

```text
MongoDB
MongoDB Time Series Collections
```

## Data

```text
Python
Pandas
vnstock
```

## AI

Optional:

```text
Gemini / OpenAI / local LLM
```

Use cases:

- News summarization.
- Event classification.
- Entity extraction.

Không dùng LLM cho numeric analytics nếu có thể tính deterministic bằng code.

---

# 25. Repository Structure

Đề xuất monorepo:

```text
marketpulse-vn/

apps/
 ├── web/
 ├── api/
 └── worker/

services/
 ├── collector/
 └── analytics/

packages/
 ├── shared/
 ├── schemas/
 ├── eslint-config/
 └── tsconfig/

infra/
 ├── docker/
 └── monitoring/

docs/
 ├── PRD.md
 ├── ARCHITECTURE.md
 ├── DATABASE.md
 ├── API.md
 ├── DATA_PIPELINE.md
 └── ROADMAP.md
```

---

# 26. MVP Scope

MVP không nên làm tất cả feature ngay.

## MVP 1 — Market Core

Phải hoàn thành:

- Auth.
- Asset search.
- Stock detail.
- OHLCV chart.
- VN-Index.
- Market overview.
- Gold.
- USD/VND.
- Watchlist.
- Data ingestion.
- MongoDB Time Series.
- Redis cache.

---

# 27. MVP 2 — Intelligence

Sau khi core ổn định:

- News ingestion.
- AI news classification.
- Event Timeline.
- Event Detail.
- Event Impact Analysis.
- Anomaly Detection.

Đây là giai đoạn tạo điểm khác biệt lớn nhất cho project.

---

# 28. MVP 3 — Personalization

- Alerts.
- Portfolio simulator.
- Compare assets.
- Correlation explorer.
- Custom dashboard.

---

# 29. Advanced Phase

Sau MVP:

## Data Engineering

- Kafka/Redpanda.
- Stream processing.
- Data warehouse.
- ClickHouse.
- dbt.
- Airflow/Dagster.

## AI

- Semantic news search.
- Similar event search.
- Event clustering.
- RAG.

Ví dụ:

```text
Search:
"những lần SBV thay đổi lãi suất gần đây"

→ events
→ charts
→ market reaction
```

## Analytics

- Sector rotation.
- Beta.
- Sharpe Ratio.
- Drawdown.
- Rolling volatility.
- Market regime detection.

---

# 30. Features không nên đưa vào MVP

Không cần:

- Real-money trading.
- Broker order execution.
- AI stock prediction.
- Social network.
- Copy trading.
- Crypto.
- Mobile application.
- Microservices quá sớm.

Lý do:

Scope sẽ quá lớn và làm giảm khả năng hoàn thành project.

---

# 31. Điểm khác biệt của project

Một stock dashboard thông thường:

```text
API
 ↓
Chart
```

MarketPulse:

```text
Multiple Data Sources
       ↓
Data Pipeline
       ↓
Normalization
       ↓
Time-Series Database
       ↓
Analytics
       ↓
News / Events
       ↓
Event Impact
       ↓
Realtime Dashboard
```

Điểm mạnh portfolio:

1. MERN.
2. Financial domain.
3. Real-time data.
4. Data engineering.
5. Time-series data.
6. Event-driven processing.
7. Analytics.
8. AI có use case hợp lý.
9. System design.
10. Production-oriented architecture.

---

# 32. Definition of Done cho MVP

Project MVP được xem là hoàn thành khi:

- User đăng ký/login được.
- Search được stock.
- Mở stock detail được.
- Có historical chart.
- Market dashboard hoạt động.
- Có VN-Index.
- Có Gold.
- Có USD/VND.
- User tạo watchlist được.
- Data collector chạy định kỳ.
- Dữ liệu được normalize.
- MongoDB Time Series hoạt động.
- Redis cache hoạt động.
- Backend có test.
- Frontend có E2E test.
- Docker Compose chạy toàn bộ project.
- CI chạy test/build.
- Deploy frontend/backend.
- README có architecture diagram.
- API có OpenAPI documentation.

---

# 33. Tiêu chí thành công của portfolio

Khi recruiter mở project trong 5 phút phải nhìn thấy:

## Trong 30 giây

Dashboard đẹp và có dữ liệu thật.

## Trong 2 phút

Search FPT → candlestick → news → event.

## Trong 3 phút

Event page cho thấy market reaction.

## Trong 5 phút

README cho thấy:

```text
WebSocket
Redis
Queue
MongoDB Time Series
Data Pipeline
AI Event Processing
Testing
Docker
CI/CD
```

Đây mới là giá trị chính của project.

---

# 34. Nguồn nghiên cứu / kỹ thuật

## SSI FastConnect Developer Portal

Market data, REST API, WebSocket và SDK:

https://developers.ssi.com.vn/

https://developers.ssi.com.vn/docs/getting-started/overview

https://developers.ssi.com.vn/docs/faq/market-data

## Vnstock

Documentation:

https://vnstocks.com/docs/vnstock

Macro / Commodity:

https://vnstocks.com/docs/vnstock-data/macro-layer-v3

## GDELT

News/event data:

https://gdeltproject.org/data.html

DOC API:

https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/

## MongoDB Time Series

https://www.mongodb.com/docs/manual/core/timeseries-collections/

## TradingView Lightweight Charts

https://www.tradingview.com/lightweight-charts/

---

# 35. Quyết định kiến trúc quan trọng

## Quyết định 1

**MERN là core application nhưng không ép toàn bộ ingestion phải dùng JavaScript.**

Python được phép dùng ở Data Collector vì ecosystem tài chính/data mạnh hơn.

## Quyết định 2

**Không phụ thuộc vào một nguồn dữ liệu duy nhất.**

Tạo interface:

```ts
interface MarketDataProvider {
  getQuote(symbol: string): Promise<Quote>;
  getHistory(symbol: string, range: Range): Promise<Candle[]>;
}
```

Provider:

```text
SSIProvider
VnstockProvider
MockProvider
```

→ dễ thay datasource.

## Quyết định 3

**Không để React gọi trực tiếp datasource bên thứ ba.**

Luôn:

```text
React
 ↓
MarketPulse API
 ↓
Cache / Database
 ↓
Provider
```

## Quyết định 4

**Dữ liệu thô và dữ liệu normalized phải tách biệt.**

Pipeline:

```text
RAW
 ↓
NORMALIZED
 ↓
ANALYTICS
```

Điều này cho phép sửa normalization mà không cần download toàn bộ dữ liệu lại.

---

# 36. Tên project

Tên khuyến nghị:

**MarketPulse VN**

Subtitle:

> Event-driven Market Intelligence Platform for Vietnam

Alternative:

- VietMarket Radar.
- VN Market Lens.
- MarketScope VN.
- VietFin Pulse.

`MarketPulse VN` dễ hiểu nhất khi recruiter nhìn repository.

---

# 37. README one-liner

> MarketPulse VN is an event-driven Vietnamese market intelligence platform that ingests, normalizes and analyzes equities, gold, FX, macroeconomic data and financial news to detect unusual market activity and visualize market reactions around real-world events.

---

# 38. Hướng phát triển dài hạn

Nếu project tiếp tục phát triển sau portfolio:

```text
Market Intelligence
        ↓
Research Platform
        ↓
Portfolio Analytics
        ↓
Financial Data Platform
```

Có thể phát triển thành nền tảng nghiên cứu dữ liệu tài chính thay vì một website xem giá.

