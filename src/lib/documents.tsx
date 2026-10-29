// Client documents: numbering and PDF layout (main doc 6.12, layout per section 14).
import { Document as Pdf, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { db, parseJson } from "./db";
import { dateUS } from "./format";
import { get } from "./storage";

export const DOC_TYPES = {
  quote: { prefix: "QT", title: "Commercial proposal" },
  invoice: { prefix: "INV", title: "Invoice" },
  receipt: { prefix: "RC", title: "Payment receipt" },
  delivery_note: { prefix: "DN", title: "Delivery note" },
  contract: { prefix: "CT", title: "Contract" },
  completion_act: { prefix: "AC", title: "Certificate of completion" },
} as const;
export type DocType = keyof typeof DOC_TYPES;

export type DocItem = { name: string; qty: number; price: number; vatPct: number };
export type DocData = { date: string; items: DocItem[]; notes: string };

export function totals(items: DocItem[]) {
  const net = items.reduce((a, i) => a + i.qty * i.price, 0);
  const vat = items.reduce((a, i) => a + i.qty * i.price * (i.vatPct / 100), 0);
  return { net, vat, total: net + vat };
}

/** QT-2026-0001: counter per type, reset every year. */
export async function nextNumber(workshopId: string, type: DocType, year: number) {
  const prefix = `${DOC_TYPES[type].prefix}-${year}-`;
  const last = await db.document.findFirst({ where: { workshopId, number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  const n = last ? parseInt(last.number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// Helvetica (built into PDF) covers € £ $ ¥ but not every currency sign; fall back to the ISO code.
const PDF_SYMBOLS: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", JPY: "¥", CNY: "¥" };
const fmt = (x: number, currency: string) => {
  const v = (Math.round((x + Number.EPSILON) * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return PDF_SYMBOLS[currency] ? `${v} ${PDF_SYMBOLS[currency]}` : `${v} ${currency}`;
};

const s = StyleSheet.create({
  page: { padding: 40, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  logo: { width: 90, height: 50, objectFit: "contain", marginBottom: 6 },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  muted: { color: "#666" },
  bold: { fontFamily: "Helvetica-Bold" },
  block: { marginTop: 24 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#999", paddingBottom: 4, marginTop: 24, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#ddd", paddingVertical: 5 },
  cName: { flex: 1 },
  cNum: { width: 60, textAlign: "right" },
  totals: { marginTop: 12, marginLeft: "auto", width: 220 },
  sign: { marginTop: 48, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  signImg: { width: 120, height: 50, objectFit: "contain" },
});

async function dataUri(workshopId: string, url: string | null) {
  if (!url) return null;
  try {
    const f = await get(workshopId, url);
    return `data:${f.type};base64,${f.bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function renderDocumentPdf(workshopId: string, id: string) {
  const doc = await db.document.findFirst({ where: { id, workshopId }, include: { client: true, order: { select: { number: true } } } });
  if (!doc) return null;
  const [company, settings] = await Promise.all([
    db.companyDetails.findUnique({ where: { workshopId } }),
    db.settings.findUnique({ where: { workshopId } }),
  ]);
  const currency = settings?.currency ?? "EUR";
  const data = parseJson<DocData>(doc.data, { date: doc.createdAt.toISOString(), items: [], notes: "" });
  const t = totals(data.items);
  const [logo, signature] = await Promise.all([dataUri(workshopId, company?.logoUrl ?? null), dataUri(workshopId, company?.signatureUrl ?? null)]);
  const c = doc.client;
  const title = DOC_TYPES[doc.type as DocType]?.title ?? "Document";

  const pdf = (
    <Pdf title={`${title} ${doc.number}`}>
      <Page size="A4" style={s.page}>
        <View style={s.row}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            {logo && <Image src={logo} style={s.logo} />}
            <Text style={s.bold}>{company?.companyName || "Your workshop"}</Text>
            {company?.taxId ? <Text>Tax ID {company.taxId}</Text> : null}
            {company?.address ? <Text>{company.address}</Text> : null}
            {company?.phone ? <Text>{company.phone}</Text> : null}
            {company?.email ? <Text>{company.email}</Text> : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={s.h1}>{title}</Text>
            <Text style={s.bold}>{doc.number}</Text>
            <Text style={s.muted}>Date {dateUS(data.date)}</Text>
            {doc.order ? <Text style={s.muted}>Order #{doc.order.number}</Text> : null}
          </View>
        </View>

        <View style={s.block}>
          <Text style={[s.muted, { marginBottom: 2 }]}>{doc.type === "delivery_note" ? "Deliver to" : "Bill to"}</Text>
          <Text style={s.bold}>{c ? c.companyName || c.name : "—"}</Text>
          {c?.companyName && c.name !== c.companyName ? <Text>{c.name}</Text> : null}
          {c?.taxId ? <Text>Tax ID {c.taxId}</Text> : null}
          {c?.address ? <Text>{c.address}</Text> : null}
          {c?.email ? <Text>{c.email}</Text> : null}
          {c?.phone ? <Text>{c.phone}</Text> : null}
        </View>

        <View style={s.th}>
          <Text style={s.cName}>Item</Text>
          <Text style={s.cNum}>Qty</Text>
          {doc.type !== "delivery_note" && <Text style={s.cNum}>Price</Text>}
          {doc.type !== "delivery_note" && <Text style={s.cNum}>VAT</Text>}
          {doc.type !== "delivery_note" && <Text style={s.cNum}>Amount</Text>}
        </View>
        {data.items.map((i, k) => (
          <View key={k} style={s.tr} wrap={false}>
            <Text style={s.cName}>{i.name}</Text>
            <Text style={s.cNum}>{i.qty}</Text>
            {doc.type !== "delivery_note" && <Text style={s.cNum}>{fmt(i.price, currency)}</Text>}
            {doc.type !== "delivery_note" && <Text style={s.cNum}>{i.vatPct}%</Text>}
            {doc.type !== "delivery_note" && <Text style={s.cNum}>{fmt(i.qty * i.price * (1 + i.vatPct / 100), currency)}</Text>}
          </View>
        ))}

        {doc.type !== "delivery_note" && (
          <View style={s.totals}>
            <View style={s.row}><Text>Subtotal</Text><Text>{fmt(t.net, currency)}</Text></View>
            <View style={s.row}><Text>VAT</Text><Text>{fmt(t.vat, currency)}</Text></View>
            <View style={[s.row, { marginTop: 4, borderTopWidth: 1, paddingTop: 4 }]}><Text style={s.bold}>Total</Text><Text style={s.bold}>{fmt(t.total, currency)}</Text></View>
          </View>
        )}

        {doc.type === "invoice" && company?.bankAccount ? (
          <View style={s.block}>
            <Text style={s.bold}>Payment details</Text>
            {company.bankName ? <Text>{company.bankName}</Text> : null}
            <Text>Account {company.bankAccount}</Text>
            {company.bic ? <Text>BIC {company.bic}</Text> : null}
          </View>
        ) : null}
        {doc.type === "receipt" ? <Text style={s.block}>Received with thanks: {fmt(t.total, currency)}</Text> : null}
        {data.notes ? <Text style={[s.block, s.muted]}>{data.notes}</Text> : null}

        <View style={s.sign}>
          <View>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image, not an HTML img */}
            {signature && <Image src={signature} style={s.signImg} />}
            <Text style={{ borderTopWidth: 0.5, paddingTop: 2, width: 180 }}>{company?.signer || "Signature"}</Text>
            {company?.signerTitle ? <Text style={s.muted}>{company.signerTitle}</Text> : null}
          </View>
          {doc.type === "delivery_note" || doc.type === "completion_act" ? (
            <Text style={{ borderTopWidth: 0.5, paddingTop: 2, width: 180 }}>Received by</Text>
          ) : null}
        </View>
      </Page>
    </Pdf>
  );
  return { buffer: await renderToBuffer(pdf), number: doc.number };
}
