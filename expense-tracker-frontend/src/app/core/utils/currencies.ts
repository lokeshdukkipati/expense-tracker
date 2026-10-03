export interface CurrencyInfo {
  code: string;
  name: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'INR', name: 'Indian Rupee' }, { code: 'USD', name: 'US Dollar' }, { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' }, { code: 'AED', name: 'UAE Dirham' }, { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'AUD', name: 'Australian Dollar' }, { code: 'CAD', name: 'Canadian Dollar' }, { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CHF', name: 'Swiss Franc' }, { code: 'CNY', name: 'Chinese Yuan' }, { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' }, { code: 'SAR', name: 'Saudi Riyal' }, { code: 'QAR', name: 'Qatari Riyal' },
  { code: 'ZAR', name: 'South African Rand' }, { code: 'BRL', name: 'Brazilian Real' }, { code: 'MXN', name: 'Mexican Peso' },
  { code: 'SEK', name: 'Swedish Krona' }, { code: 'NOK', name: 'Norwegian Krone' }, { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' }, { code: 'THB', name: 'Thai Baht' }, { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'IDR', name: 'Indonesian Rupiah' }, { code: 'PHP', name: 'Philippine Peso' }, { code: 'KRW', name: 'South Korean Won' },
  { code: 'TRY', name: 'Turkish Lira' }, { code: 'NPR', name: 'Nepalese Rupee' }, { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'BDT', name: 'Bangladeshi Taka' }, { code: 'PKR', name: 'Pakistani Rupee' },
];

export const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }));
