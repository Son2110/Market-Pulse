import { useEffect, useRef, useState } from "react";
import { CollectionStatusError, collectionStatusErrorMessage, deliveryStatuses, fetchObservedCollectionStatus, type DeliveryStatus, type ObservedCollectionStatus as Response } from "./observed-collection-status.js";
import type { ObservedRange } from "./observed-detail.js";

const labels: Record<DeliveryStatus, string> = { accepted: "Đã tiếp nhận", queued: "Đang chờ xử lý", running: "Đang xử lý", success: "Xử lý thành công", failure: "Xử lý thất bại", unknown: "Chưa xác định" };
const date = (value: string) => value.split("-").reverse().join("/");
const rangeText = (range: ObservedRange) => `${date(range.from)} – ${date(range.to)}`;
type State = { status: "loading" } | { status: "loaded"; response: Response } | { status: "error"; message: string; retry: boolean };
export default function ObservedCollectionStatus({ range }: { range: ObservedRange }) {
  const [state, setState] = useState<State>({ status: "loading" }); const [attempt, setAttempt] = useState(0); const requestId = useRef(0);
  const { from, to } = range;
  useEffect(() => {
    const id = ++requestId.current; const controller = new AbortController(); setState({ status: "loading" });
    void fetchObservedCollectionStatus("FPT", { from, to }, controller.signal).then(response => {
      if (id === requestId.current && !controller.signal.aborted) setState({ status: "loaded", response });
    }).catch((error: unknown) => {
      if (id !== requestId.current || controller.signal.aborted) return;
      setState({ status: "error", message: collectionStatusErrorMessage(error), retry: !(error instanceof CollectionStatusError && error.kind === "invalid") });
    });
    return () => { requestId.current += 1; controller.abort(); };
  }, [from, to, attempt]);
  const meta = state.status === "loaded" ? state.response.meta : null;
  return <section className="detail-card collection-status-card" aria-labelledby="collection-status-heading" aria-busy={state.status === "loading"}>
    <div className="detail-section-heading"><div><h2 id="collection-status-heading">Trạng thái thu thập trong khoảng đã chọn</h2><p className="small muted">FPT · KBS · Dữ liệu ngày · VND · Múi giờ tài sản: Việt Nam (UTC+7), Asia/Ho_Chi_Minh</p></div></div>
    <p className="reference-note collection-status-notice"><strong>Dữ liệu và trạng thái không được đọc cùng một thời điểm.</strong> Lần đọc trạng thái độc lập từ các quan sát và đợt thu thập đã lưu có thể khác lịch sử đang hiển thị.</p>
    {state.status === "loading" ? <p className="collection-status-state" role="status">Đang tải trạng thái thu thập…</p>
      : state.status === "error" ? <div className="collection-status-state"><p role="alert">{state.message}</p>{state.retry && <button className="secondary-button" type="button" onClick={() => setAttempt(value => value + 1)}>Thử lại trạng thái thu thập</button>}</div>
        : meta && <div role="status">
          {meta.status === "no_stored_bars" && <p className="collection-status-state">Không có quan sát đã lưu được chọn trong khoảng này. Điều này không xác nhận nguồn KBS không có dữ liệu.</p>}
          <dl className="collection-status-summary"><div><dt>Số quan sát được chọn trong lần đọc trạng thái</dt><dd>{meta.selectedCandleCount}</dd></div><div><dt>Khoảng yêu cầu của lần đọc trạng thái</dt><dd>{rangeText(meta.requestedRange)}</dd></div><div><dt>Khoảng trả về của lần đọc trạng thái</dt><dd>{meta.returnedRange ? rangeText(meta.returnedRange) : "Không có quan sát"}</dd></div></dl>
          <dl className="collection-status-counts">{deliveryStatuses.map(status => <div key={status}><dt>{labels[status]}</dt><dd>{meta.candleCountsByDeliveryStatus[status]}</dd></div>)}</dl>
          <p className="small muted collection-status-explanation">Các số đếm trong lần đọc trạng thái là số quan sát theo trạng thái đợt thu thập được tham chiếu, không phải số đợt xử lý. “Chưa xác định” không đồng nghĩa thất bại. Xử lý thành công không xác nhận giá hiện tại, độ mới, độ phủ thị trường hoặc tình trạng hoạt động của nguồn.</p>
          <dl className="collection-status-times"><div><dt>Khoảng thời điểm thu thập trong lần đọc trạng thái (múi giờ gốc)</dt><dd>{meta.collectedAtRange ? <><span>{meta.collectedAtRange.from}</span><span>đến {meta.collectedAtRange.to}</span></> : "Không có quan sát"}</dd></div></dl>
          <p className="small muted collection-status-explanation">Thời điểm thu thập không phải thời điểm quan sát từ nguồn. Thời điểm quan sát từ nguồn, độ mới và độ đầy đủ: chưa xác định. Lịch phiên: chưa xác minh.</p>
        </div>}
  </section>;
}
