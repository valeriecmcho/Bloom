export const formatAmountToCentavos = (phpAmount: number): number => {
  return Math.round(phpAmount * 100);
};

export const formatCentavosToPhp = (centavos: number): string => {
  return '₱' + (centavos / 100).toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const getPaymentMethodLabel = (method: string): string => {
  const labels: Record<string, string> = {
    gcash: 'GCash',
    paymaya: 'Maya',
    card: 'Credit / Debit Card',
    qrph: 'QR Ph',
    billease: 'BillEase',
    dob: 'Online Banking',
    dob_ubp: 'UnionBank Online',
    dob_bdo: 'BDO Online',
    dob_bpi: 'BPI Online',
    dob_chinabank: 'China Bank Online',
    dob_metrobank: 'Metrobank Online',
    dob_pnb: 'PNB Online',
    dob_rcbc: 'RCBC Online',
    grab_pay: 'GrabPay',
  };
  return labels[method] || method || 'Online Payment';
};
