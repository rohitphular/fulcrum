export const VALID_TX_TYPES = ['money-in', 'money-out', 'money-transfer'];

export const state = {
  transactions:  [],
  categories:    [],
  accounts:      [],
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

  txSort:    { col: 'date', dir: 'desc' },
  txPage:    1,
  txPerPage: 50,

  charts:        {},
  catDrillMajor: null,

  catFilter:    'all',
  catAddOpen:   false,
  catEditRow:   null,
  catDeleteRow: null,
};
