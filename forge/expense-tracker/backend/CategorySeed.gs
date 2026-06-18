// =============================================================================
// CATEGORY_SEED — default categories loaded into the sheet on first use.
// Edit this list to change what categories are seeded into a fresh install.
// After editing, delete all rows in the 'categories' sheet and reload the app.
//
// Columns: [transaction_type, major_category, minor_category, description]
// tag_keywords (col 5) left blank for seeded rows — add via the UI as needed.
// Descriptions are used for RAG-based category suggestion.
// =============================================================================

const CATEGORY_SEED = [
  // money-in
  ['money-in', 'Salary', 'Monthly pay',      'Regular monthly salary or wages received from an employer'],
  ['money-in', 'Salary', 'Bonus',            'One-off performance, annual, or signing bonus from an employer'],
  ['money-in', 'Salary', 'Commission',       'Sales commission or incentive pay earned on top of base salary'],
  ['money-in', 'Salary', 'Overtime',         'Additional pay for hours worked beyond the standard working week'],

  ['money-in', 'Freelance / Self-employed', 'Client payment', 'Payment received from a client for freelance or contract work delivered'],
  ['money-in', 'Freelance / Self-employed', 'Consulting',     'Fees received for professional advisory or consulting services'],
  ['money-in', 'Freelance / Self-employed', 'Royalties',      'Royalty income from intellectual property, books, music, software licences, or patents'],

  ['money-in', 'Business', 'Sales revenue',  'Revenue from selling goods or products as part of a business'],
  ['money-in', 'Business', 'Service income', 'Income from providing services as part of a business operation'],

  ['money-in', 'Investments', 'Dividends',        'Dividend income distributed by shares, ETFs, or investment funds'],
  ['money-in', 'Investments', 'Interest earned',  'Interest received on savings accounts, fixed deposits, bonds, or cash ISAs'],
  ['money-in', 'Investments', 'Capital gains',    'Profit realised from selling an investment asset above its original purchase price'],
  ['money-in', 'Investments', 'Rental income',    'Rent received from tenants for a residential or commercial property'],

  ['money-in', 'Refunds & reimbursements', 'Tax refund',           'Tax refund received from HMRC or another tax authority after overpaying tax'],
  ['money-in', 'Refunds & reimbursements', 'Work reimbursement',   'Expense reimbursement from an employer for work-related costs such as travel or equipment'],
  ['money-in', 'Refunds & reimbursements', 'Purchase refund',      'Refund received for a returned, cancelled, or overcharged purchase'],
  ['money-in', 'Refunds & reimbursements', 'Cashback & rewards',   'Cashback, reward points, or credit card rewards redeemed as a cash credit'],

  ['money-in', 'Borrowing', 'Loan received',            'Funds received as a personal or business loan from a bank or financial institution'],
  ['money-in', 'Borrowing', 'Credit drawn',             'Cash or credit drawn from a credit card, overdraft, or revolving credit facility'],
  ['money-in', 'Borrowing', 'Money from friend/family', 'Money borrowed informally from a friend or family member'],

  ['money-in', 'Gifts & other', 'Gift received',  'Cash or monetary gift received from a person for a birthday, wedding, or other occasion'],
  ['money-in', 'Gifts & other', 'Sale of asset',  'Proceeds from selling a personal asset such as a car, phone, furniture, or equipment'],
  ['money-in', 'Gifts & other', 'Other income',   'Any other income that does not fit into the categories above'],

  ['money-in', 'Adjustments', 'Balance correction', 'Upward correction to reconcile the app balance with the actual account balance at EOD or EOM'],

  // money-out
  ['money-out', 'Housing', 'Rent',                   'Monthly rent paid to a landlord or letting agent for residential accommodation'],
  ['money-out', 'Housing', 'Mortgage',               'Monthly mortgage repayment of principal and interest to a bank or building society'],
  ['money-out', 'Housing', 'Council/Property tax',   'Council tax paid to the local authority or property tax for a home'],
  ['money-out', 'Housing', 'Repairs & maintenance',  'Cost of repairs, maintenance work, or home improvements carried out on a property'],
  ['money-out', 'Housing', 'Home insurance',         'Buildings or contents insurance premium for a residential property'],

  ['money-out', 'Utilities', 'Electricity',   'Electricity bill payment to an energy supplier'],
  ['money-out', 'Utilities', 'Gas',           'Gas bill payment to an energy supplier for heating and cooking'],
  ['money-out', 'Utilities', 'Water',         'Water and sewage bill payment to a water utility provider'],
  ['money-out', 'Utilities', 'Internet',      'Monthly broadband or fibre internet subscription fee'],
  ['money-out', 'Utilities', 'Mobile/Phone',  'Mobile phone contract, SIM-only plan, or pay-as-you-go top-up'],
  ['money-out', 'Utilities', 'Streaming/TV',  'TV licence fee or streaming subscription such as Netflix, Disney+, or Spotify'],

  ['money-out', 'Food', 'Groceries',         'Supermarket or grocery store shopping for food, drink, and household essentials'],
  ['money-out', 'Food', 'Eating out',        'Restaurant, café, pub meal, or dining out expense'],
  ['money-out', 'Food', 'Takeaway/Delivery', 'Food delivery or takeaway order from a restaurant or delivery app'],
  ['money-out', 'Food', 'Coffee & snacks',   'Coffee shop, bakery, or small food and drink purchase on the go'],

  ['money-out', 'Transport', 'Fuel',                 'Petrol, diesel, or electric vehicle charging cost for a personal vehicle'],
  ['money-out', 'Transport', 'Public transport',     'Train, bus, tube, tram, or other public transport fare or season ticket'],
  ['money-out', 'Transport', 'Taxi/Rideshare',       'Taxi, Uber, Bolt, or rideshare journey cost'],
  ['money-out', 'Transport', 'Vehicle insurance',    'Car, van, or motorcycle insurance premium payment'],
  ['money-out', 'Transport', 'Vehicle maintenance',  'Car servicing, MOT, tyre replacement, or other vehicle repair and upkeep costs'],
  ['money-out', 'Transport', 'Parking & tolls',      'Parking fees, congestion charge, ULEZ charge, or road toll payments'],

  ['money-out', 'Health', 'Doctor/Medical',   'GP visit, hospital appointment, or private medical consultation fee'],
  ['money-out', 'Health', 'Pharmacy',         'Prescription charges, over-the-counter medication, or pharmacy purchases'],
  ['money-out', 'Health', 'Dental',           'Dental check-up, treatment, tooth extraction, or dental plan payment'],
  ['money-out', 'Health', 'Optical',          'Eye test, prescription glasses, sunglasses, or contact lenses'],
  ['money-out', 'Health', 'Health insurance', 'Private medical or dental insurance premium'],
  ['money-out', 'Health', 'Fitness/Gym',      'Gym membership, fitness class, personal training, or sports equipment purchase'],

  ['money-out', 'Shopping', 'Clothing',         'Clothing, shoes, boots, or fashion accessories purchase'],
  ['money-out', 'Shopping', 'Electronics',      'Electronic devices, gadgets, laptops, phones, or accessories'],
  ['money-out', 'Shopping', 'Household goods',  'Kitchen items, cleaning supplies, bedding, or other household consumables'],
  ['money-out', 'Shopping', 'Personal care',    'Toiletries, skincare, haircare, grooming products, or cosmetics'],
  ['money-out', 'Shopping', 'Furniture',        'Furniture, large household items, soft furnishings, or home décor'],

  ['money-out', 'Entertainment', 'Subscriptions',    'Digital subscriptions for software, apps, cloud storage, or online services'],
  ['money-out', 'Entertainment', 'Events & movies',  'Cinema tickets, theatre, concerts, comedy shows, or live event tickets'],
  ['money-out', 'Entertainment', 'Hobbies',          'Spending on personal hobbies, crafts, gaming, or recreational activities'],
  ['money-out', 'Entertainment', 'Books & media',    'Books, ebooks, audiobooks, magazines, or digital media purchases'],
  ['money-out', 'Entertainment', 'Sports',           'Sports activities, club membership, equipment, or match or event tickets'],

  ['money-out', 'Travel', 'Flights',           'Airline tickets for domestic or international flights'],
  ['money-out', 'Travel', 'Accommodation',     'Hotel, Airbnb, hostel, or other accommodation costs during travel'],
  ['money-out', 'Travel', 'Local transport',   'Taxis, trains, car hire, or local transport used at a travel destination'],
  ['money-out', 'Travel', 'Activities',        'Tours, attractions, excursions, day trips, or experiences at a destination'],
  ['money-out', 'Travel', 'Travel insurance',  'Travel insurance policy purchased for a specific trip or annually'],

  ['money-out', 'Education', 'Tuition & fees',    'University tuition fees, course enrollment fees, or professional exam fees'],
  ['money-out', 'Education', 'Courses',            'Online or in-person course, bootcamp, workshop, or professional training cost'],
  ['money-out', 'Education', 'Books & supplies',   'Textbooks, stationery, academic materials, or educational supplies'],

  ['money-out', 'Family & dependents', 'Childcare',      'Nursery fees, childminder costs, or after-school and holiday care'],
  ['money-out', 'Family & dependents', 'School fees',    'Private or independent school tuition fees and related charges'],
  ['money-out', 'Family & dependents', 'Family support', 'Regular or one-off financial support sent to a family member'],
  ['money-out', 'Family & dependents', 'Pet care',       'Vet bills, pet food, grooming, pet insurance, or boarding costs'],

  ['money-out', 'Debt & finance', 'Loan repayment',       'Monthly repayment instalment on a personal loan, car finance, or business loan'],
  ['money-out', 'Debt & finance', 'Credit card payment',  'Payment to clear or reduce a credit card balance'],
  ['money-out', 'Debt & finance', 'Interest & charges',   'Interest charges, late payment fees, or penalty charges from a lender'],
  ['money-out', 'Debt & finance', 'Bank fees',            'Monthly account fees, overdraft charges, or bank service charges'],

  ['money-out', 'Insurance', 'Life insurance',    'Life insurance or term assurance premium to protect dependents'],
  ['money-out', 'Insurance', 'General insurance', 'Other insurance not covered elsewhere such as gadget, income protection, or pet insurance'],

  ['money-out', 'Taxes', 'Income tax',   'Income tax or self-assessment tax payment made to HMRC'],
  ['money-out', 'Taxes', 'Other taxes',  'VAT, capital gains tax, stamp duty land tax, or any other tax payment'],

  ['money-out', 'Gifts & donations', 'Gift given',        'Cash or monetary gift given to a friend or family member for an occasion'],
  ['money-out', 'Gifts & donations', 'Charity/Donation',  'Charitable donation, sponsorship, or fundraising contribution'],

  ['money-out', 'Lending', 'Money lent to friend/family', 'Money lent informally to a friend or family member, expected to be returned'],

  ['money-out', 'Other', 'Cash spending',   'Cash withdrawn and spent on purchases without a specific category recorded'],
  ['money-out', 'Other', 'Miscellaneous',   'One-off or irregular expense that does not fit any other category'],
  ['money-out', 'Other', 'Uncategorised',   'Expense not yet categorised; to be reviewed and assigned a proper category later'],

  ['money-out', 'Adjustments', 'Balance correction', 'Downward correction to reconcile the app balance with the actual account balance at EOD or EOM'],

  // money-transfer
  ['money-transfer', 'Between own accounts', 'Account to account', 'Transfer of funds between two of your own bank or financial accounts'],
  ['money-transfer', 'Between own accounts', 'To savings',         'Moving money from a current or spending account into a savings account'],
  ['money-transfer', 'Between own accounts', 'From savings',       'Moving money from a savings account back into a current or spending account'],

  ['money-transfer', 'Cross-border', 'UK to India',   'International bank transfer sent from the UK to an account in India'],
  ['money-transfer', 'Cross-border', 'India to UK',   'International bank transfer sent from India to an account in the UK'],

  ['money-transfer', 'Currency exchange', 'FX conversion', 'Foreign currency exchange or FX conversion between two currencies'],

  ['money-transfer', 'Cash', 'ATM withdrawal', 'Cash withdrawn from an ATM or bank branch'],
  ['money-transfer', 'Cash', 'Cash deposit',   'Cash deposited into a bank account at an ATM, branch, or post office'],

  ['money-transfer', 'Card payment', 'Pay credit card', 'Payment made from a bank account to settle a credit card bill'],

  ['money-transfer', 'Investments', 'To investment',   'Transfer of funds into an investment account, stocks and shares ISA, or portfolio'],
  ['money-transfer', 'Investments', 'From investment', 'Withdrawal of funds from an investment account or portfolio into a bank account'],
  ['money-transfer', 'Investments', 'To pension',      'Contribution transferred into a pension, SIPP, or retirement savings account'],
];
