// Shapes returned by the API, as the browser sees them (dates as strings).
export type OrderMaterial = { id: string; filamentId: string | null; name: string; color: string; grams: number; pricePerKg: number };
export type OrderService = { id: string; name: string; cost: number; mode: string; price: number };

export type Order = {
  id: string; number: string; name: string; status: string; paid: boolean; advanceReceived: number; advanceReceivedOn: boolean;
  tips: number; tipsReceived: boolean; trackingNumber: string; saleDate: string; dueDate: string | null; tags: string; notes: string;
  source: string; personalUse: boolean; clientId: string | null; printerId: string | null; dryerId: string | null; modelId: string | null; printTimeMin: number;
  quantity: number; assemblyQuantity: number;
  costMaterial: number; costElectricity: number; costPrinter: number; costDryer: number; costLabor: number; costConsumables: number;
  costPostprocessing: number; costPackaging: number; costDelivery: number; costWarehouse: number; costOther: number; totalCost: number;
  discountPct: number; discountAmount: number; taxRegimeId: string | null; taxAmount: number; marketplaceFeeId: string | null;
  marketplaceFee: number; acquiringFee: number; salePrice: number; revenue: number; profit: number; netProfit: number; marginPct: number;
  materialDeducted: boolean; statusDates: string; slicerFileUrl: string | null; calcInput: string;
  createdAt: string;
  client: { id: string; name: string } | null;
  printer: { id: string; model: string; internalName: string } | null;
  materials: OrderMaterial[];
  services: OrderService[];
};

export type Filament = {
  id: string; name: string; brand: string; type: string; modifier: string | null; purchaseLink: string | null; spoolPrice: number;
  spoolWeightG: number; spoolCount: number; usedFromSpoolG: number; colors: string[]; photoUrl: string | null;
  lowStockThresholdG: number | null; pricePerKg: number; stockG: number; lastsDays: number | null;
};

export type Client = {
  id: string; name: string; phone: string; email: string; address: string; source: string; discountPct: number; categoryId: string | null;
  category?: { name: string } | null; photoUrl: string | null; telegram: string; contactPerson: string; signer: string; companyName: string;
  taxId: string; note: string; ordersCount: number; completedAmount: number; level: string;
};

export type Model = {
  id: string; name: string; photoUrl: string | null; fileUrl: string | null; sourceLink: string; groupId: string | null;
  group?: { name: string } | null; printTimeMin: number; extraCosts: number; pricePerPiece: number | null; complexity: string;
  sellAsProduct: boolean; productDescription: string; materialPerPieceG: number;
  filaments: { id: string; filamentId: string | null; grams: number; filament: { name: string; colors: string } | null }[];
};

export const printerName = (p: { model: string; internalName: string } | null | undefined) => (p ? p.internalName || p.model : "—");
