export interface StockReferenceEntry {
  symbol: string;
  companyName: string;
  aliases: readonly string[];
  officialSources: readonly string[];
  reviewedOn: string;
}

const REVIEWED_ON = "2026-09-29";

export const STOCK_REFERENCE_CATALOG: readonly StockReferenceEntry[] = [
  {
    symbol: "FPT",
    companyName: "Công ty Cổ phần FPT",
    aliases: ["FPT"],
    officialSources: ["https://fpt.com/vi/nha-dau-tu/thong-tin-co-phieu"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "VCB",
    companyName: "Ngân hàng TMCP Ngoại thương Việt Nam",
    aliases: ["Vietcombank"],
    officialSources: ["https://www.vietcombank.com.vn/Ve-Vietcombank"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "HPG",
    companyName: "Công ty Cổ phần Tập đoàn Hòa Phát",
    aliases: ["Hòa Phát"],
    officialSources: [
      "https://www.hoaphat.com.vn/gioi-thieu",
      "https://file.hoaphat.com.vn/hoaphat-com-vn/2025/11/20251029-hpg-cbtt-ket-qua-kinh-doanh-quy-3-2025.pdf",
    ],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "VNM",
    companyName: "Công ty Cổ phần Sữa Việt Nam",
    aliases: ["Vinamilk"],
    officialSources: ["https://www.vinamilk.com.vn/static/uploads/documents/bcqt/1706611805_20240130_-_VNM_-_Bao_cao_QTCT_31.12_-_CBTT_1.pdf"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "SSI",
    companyName: "Công ty Cổ phần Chứng khoán SSI",
    aliases: ["SSI"],
    officialSources: ["https://www.ssi.com.vn/quan-he-nha-dau-tu/cong-bo-thong-tin/chi-tiet/cong-bo-bao-cao-thuong-nien-bao-cao-phat-trien-ben-vung-nam-2024"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "VIC",
    companyName: "Tập đoàn Vingroup – Công ty CP",
    aliases: ["Vingroup"],
    officialSources: ["https://ircdn.vingroup.net/storage/Uploads/0_Quan%20he%20co%20dong/0_Vingroup_2025/T8/20250802%20-%20VIC%20-%20CBTT%20phe%20duyet%20chu%20truong%20dau%20tu%20Du%20an%20Nam%20Do%20Son.pdf"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "VHM",
    companyName: "Công ty Cổ phần Vinhomes",
    aliases: ["Vinhomes"],
    officialSources: ["https://vinhomes.vn/vi/ir"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "MSN",
    companyName: "Công ty Cổ phần Tập đoàn Masan",
    aliases: ["Masan"],
    officialSources: ["https://www.masangroup.com/vi/news/press-releases/masan-agm-2026-the-great-connectivity-unlocking-a-new-growth-cycle/"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "MWG",
    companyName: "Công ty Cổ phần Đầu tư Thế Giới Di Động",
    aliases: ["Thế Giới Di Động"],
    officialSources: ["https://mwg.vn/gioi-thieu"],
    reviewedOn: REVIEWED_ON,
  },
  {
    symbol: "BID",
    companyName: "Ngân hàng TMCP Đầu tư và Phát triển Việt Nam",
    aliases: ["BIDV"],
    officialSources: ["https://bidv.com.vn/wps/wcm/connect/8d98f575-acee-42a9-9b46-9990bd04a121/20260110%2B-%2BBID%2B-%2BCBTT%2BTB149%2BThong%2Bbao%2Bchao%2Bban%2Btrai%2Bphieu%2Bra%2Bcong%2Bchung%2B%28Dot%2B1%29.pdf?CACHEID=ROOTWORKSPACE-8d98f575-acee-42a9-9b46-9990bd04a121-pKCRg-i&MOD=AJPERES"],
    reviewedOn: REVIEWED_ON,
  },
];
