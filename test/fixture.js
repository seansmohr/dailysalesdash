'use strict';
// Synthetic rows shaped like the "Production Sheet" tab. Used by tests and DEMO_MODE=1.
const header = ['Email', ' Agent', 'Client', 'Carrier', 'State', 'Product', 'Premium',
  'Projected Rev', 'Revenue', 'Projected Commission', 'Confirmed Commission', 'App Date'];
const r = (agent, product, premium, rev, date) =>
  [`${agent.toLowerCase()}@example.com`, agent, 'Test Client', 'Aetna', 'CA', product, premium, rev, '', '', '', date];

module.exports = {
  today: '2026-11-05',
  rows: [
    header,
    r('Sai', 'CHS', '$95.65', '$1,147.80', '11/2/26'),
    r('Sean', 'CHS', '$151.50', '$1,818.00', '11/3/26'),
    r('Sai', 'MA', '$0.00', '$451.00', '11/3/26'),
    r('Sai', 'CHS', '$91.82', '$1,046.75', '11/3/2026'),
    r('James ', 'PDP', '$9.30', '$0.00', '10/30/26'),
    r('Sai', 'CHS', '$97.79', '$1,173.48', '11/5/26'),
    r('Sai', 'HHC', '$132.53', '$556.63', '11/5/26'),
    r('Sean', 'MA', '$0.00', '$363.00', '11/5/26'),
    r('Sean', 'DVH', '$65.38', '$447.20', '11/5/26'),
    r('james', 'Med Supp', '$184.50', '$154.98', '11/5/26'),
    ['', '', '', '', '', '', '', '', '', '$0.00', '$0.00'],
  ],
};
