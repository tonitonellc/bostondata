// Configuration for the Explore Map aggregation.
//
// Two classes of datasets:
//   coordType: 'text' | 'numeric' — the record already carries lat/lon columns,
//     so we can filter by the visible map area server-side (fast + accurate).
//   geocode: true — the record only has an address, so we fetch a small recent
//     sample and geocode it best-effort as a secondary overlay.
//
// `view` is the in-app hash route for that dataset's explorer page, used by the
// pin detail panel's "View in explorer" link.

const val = (v) => (v === null || v === undefined || v === '' || v === 'NULL' ? null : String(v))

// Native-coordinate datasets — aggregated by map bounds server-side.
export const COORDINATE_DATASETS = [
  {
    key: 'crime',
    label: 'Crime',
    view: 'crime',
    endpoint: '/api/boston-crime',
    resourceId: 'b973d8cb-eeb2-4e7e-99da-c92938efc9c0',
    color: '#e11d48',
    latField: 'Lat',
    lonField: 'Long',
    coordType: 'text',
    title: (r) => val(r.OFFENSE_DESCRIPTION) || 'Crime report',
    subtitle: (r) => val(r.STREET),
    details: (r) => [
      ['Offense', val(r.OFFENSE_DESCRIPTION)],
      ['Street', val(r.STREET)],
      ['District', val(r.DISTRICT)],
      ['Occurred', val(r.OCCURRED_ON_DATE)],
    ],
  },
  {
    key: 'threeoneone',
    label: '311 Requests',
    view: 'threeoneone',
    endpoint: '/api/boston-311',
    resourceId: '254adca6-64ab-4c5c-9fc0-a6da622be185',
    color: '#2563eb',
    latField: 'latitude',
    lonField: 'longitude',
    coordType: 'text',
    title: (r) => val(r.case_topic) || val(r.service_name) || '311 Request',
    subtitle: (r) => val(r.full_address) || val(r.neighborhood),
    details: (r) => [
      ['Topic', val(r.case_topic)],
      ['Service', val(r.service_name)],
      ['Status', val(r.case_status)],
      ['Neighborhood', val(r.neighborhood)],
      ['Opened', val(r.open_date)],
    ],
  },
  {
    key: 'cannabis',
    label: 'Cannabis',
    view: 'cannabis',
    endpoint: '/api/boston-cannabis',
    resourceId: '5de268d6-e3a5-4f5c-b43a-0d293b377b50',
    color: '#16a34a',
    latField: 'latitude',
    lonField: 'longitude',
    coordType: 'text',
    title: (r) => val(r.app_business_name) || val(r.app_dba_name) || 'Cannabis facility',
    subtitle: (r) => val(r.facility_address),
    details: (r) => [
      ['Business', val(r.app_business_name)],
      ['DBA', val(r.app_dba_name)],
      ['License type', val(r.lt_license_type)],
      ['Status', val(r.app_license_status)],
      ['Address', val(r.facility_address)],
    ],
  },
  {
    key: 'permits',
    label: 'Building Permits',
    view: 'permits',
    endpoint: '/api/boston-permits',
    resourceId: '6ddcd912-32a0-43df-9908-63574f8c7e77',
    color: '#d97706',
    latField: 'y_latitude',
    lonField: 'x_longitude',
    coordType: 'numeric',
    title: (r) => val(r.permittypedescr) || val(r.worktype) || 'Building permit',
    subtitle: (r) => [val(r.address), val(r.city)].filter(Boolean).join(', '),
    details: (r) => [
      ['Type', val(r.permittypedescr)],
      ['Work', val(r.worktype)],
      ['Description', val(r.description)],
      ['Status', val(r.status)],
      ['Address', [val(r.address), val(r.city)].filter(Boolean).join(', ') || null],
      ['Issued', val(r.issued_date)],
    ],
  },
  {
    key: 'violations',
    label: 'Code Violations',
    view: 'violations',
    endpoint: '/api/boston-violations',
    resourceId: '90ed3816-5e70-443c-803d-9a71f44470be',
    color: '#7c3aed',
    latField: 'latitude',
    lonField: 'longitude',
    coordType: 'text',
    title: (r) => val(r.description) || 'Code violation',
    subtitle: (r) =>
      [val(r.violation_street), val(r.violation_city)].filter(Boolean).join(', '),
    details: (r) => [
      ['Description', val(r.description)],
      ['Code', val(r.code)],
      ['Status', val(r.status)],
      [
        'Address',
        [val(r.violation_stno), val(r.violation_street), val(r.violation_suffix), val(r.violation_city)]
          .filter(Boolean)
          .join(' ') || null,
      ],
      ['Status date', val(r.status_dttm)],
    ],
  },
]

// Address-only datasets — geocoded best-effort as a secondary overlay.
export const GEOCODE_DATASETS = [
  {
    key: 'food',
    label: 'Food Inspections',
    view: 'food',
    endpoint: '/api/boston-food',
    resourceId: '4582bec6-2b4f-4f9e-bc55-cbaa73117f4c',
    color: '#0891b2',
    geocode: true,
    orderBy: 'resultdttm',
    address: (r) => [val(r.address), val(r.city), val(r.state)].filter(Boolean).join(', '),
    title: (r) => val(r.businessname) || 'Food establishment',
    subtitle: (r) => val(r.address),
    details: (r) => [
      ['Business', val(r.businessname)],
      ['Result', val(r.result)],
      ['Violation', val(r.violdesc)],
      ['Address', [val(r.address), val(r.city)].filter(Boolean).join(', ') || null],
      ['Date', val(r.resultdttm)],
    ],
  },
  {
    key: 'fire',
    label: 'Fire Incidents',
    view: 'fire',
    endpoint: '/api/boston-fire',
    resourceId: '91a38b1f-8439-46df-ba47-a30c48845e06',
    color: '#dc2626',
    geocode: true,
    orderBy: 'alarm_date',
    address: (r) =>
      [
        [val(r.street_number), val(r.street_prefix), val(r.street_name), val(r.street_type)]
          .filter(Boolean)
          .join(' '),
        val(r.neighborhood) || 'Boston',
        'MA',
        val(r.zip),
      ]
        .filter(Boolean)
        .join(', '),
    title: (r) => val(r.incident_description) || 'Fire incident',
    subtitle: (r) =>
      [val(r.street_number), val(r.street_name), val(r.street_type)].filter(Boolean).join(' '),
    details: (r) => [
      ['Incident', val(r.incident_description)],
      ['Property', val(r.property_description)],
      ['Neighborhood', val(r.neighborhood)],
      ['Date', val(r.alarm_date)],
    ],
  },
  {
    key: 'stops',
    label: 'Police Stops',
    view: 'stops',
    endpoint: '/api/boston-frisk',
    resourceId: '060526ca-ab4e-4da5-997c-1a4460bde5fd',
    color: '#475569',
    geocode: true,
    orderBy: 'contact_date',
    address: (r) => {
      const street = val(r.street)
      if (!street) return null
      return [street, val(r.city) || 'Boston', 'MA', val(r.zip)].filter(Boolean).join(', ')
    },
    title: (r) => val(r.circumstance) || 'Police stop',
    subtitle: (r) => val(r.street),
    details: (r) => [
      ['Circumstance', val(r.circumstance)],
      ['Basis', val(r.basis)],
      ['Street', val(r.street)],
      ['Date', val(r.contact_date)],
    ],
  },
  {
    key: 'entertainment',
    label: 'Entertainment',
    view: 'entertainment',
    endpoint: '/api/boston-entertainment',
    resourceId: 'eb683641-e358-4c2c-95de-c84f32c09147',
    color: '#db2777',
    geocode: true,
    orderBy: 'issued',
    address: (r) =>
      [val(r.address), val(r.city) || 'Boston', val(r.state) || 'MA', val(r.zip)]
        .filter(Boolean)
        .join(', '),
    title: (r) => val(r.dba_name) || val(r.business_name) || 'Entertainment license',
    subtitle: (r) => val(r.address),
    details: (r) => [
      ['Business', val(r.dba_name) || val(r.business_name)],
      ['License type', val(r.license_type)],
      ['Status', val(r.status)],
      ['Address', val(r.address)],
      ['Issued', val(r.issued)],
    ],
  },
]

export const ALL_DATASETS = [...COORDINATE_DATASETS, ...GEOCODE_DATASETS]

// Default view: a small area of Boston centered near Boston Common.
export const DEFAULT_CENTER = [42.3554, -71.0655]
export const DEFAULT_ZOOM = 15
