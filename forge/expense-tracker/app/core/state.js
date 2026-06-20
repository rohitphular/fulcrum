export const VALID_TX_TYPES = ['money-in', 'money-out', 'money-transfer'];

export const state = {
  transactions:  [],
  categories:    [],
  accounts:      [],
  accountMap:    {},   // { 'acc-001': account }  — keyed by account id
  rates:         [],
  rateMap:       {},   // { GBP: 1, INR: 105, … }  units per 1 GBP
  quoteCurrency: 'GBP',

  dateRange:  'this_month',
  customFrom: '',
  customTo:   '',

  filters: {
    types:    [],
    accounts: [],
    major:    [],
    minor:    [],
    country:  '',
    method:   '',
    tag:      '',
    search:   '',
  },

  txSort:    { col: 'transaction_date_utc', dir: 'desc' },
  txPage:    1,
  txPerPage: 50,

  charts:        {},
  catDrillMajor: null,

  catFilter:       'all',
  catActiveFilter: 'active',
  catAddOpen:   false,
  catViewRow:   null,
  catEditRow:   null,
  catDeleteRow: null,

  rateAddOpen:        false,
  rateEditCurrency:   null,
  rateDeleteCurrency: null,

  accountSchema:      null,  // { types, liability_types, loan_types, investment_sub_types, mortgage_sub_types }
  transactionSchema:  null,  // { types, categorisation_fields, transfer_fields }
  categorySchema:     null,  // { types, account_types }

  accAddOpen:   false,
  accEditRow:   null,
  accDeleteRow: null,

  txEditRow:    null,
  txDeleteRow:  null,
};
