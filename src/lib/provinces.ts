// Thailand province catalog + region rollup — client copy of
// worker/src/provinces.ts. Kept in sync by convention (the source of
// truth is shared via this duplication; the worker enforces validity
// server-side via isValidProvinceCode anyway).
//
// See worker/src/provinces.ts for rationale on codes + region grouping.

export type Region =
  | 'north'
  | 'northeast'
  | 'central'
  | 'east'
  | 'west'
  | 'south';

export const REGION_LABELS_TH: Record<Region, string> = {
  north: 'ภาคเหนือ',
  northeast: 'ภาคตะวันออกเฉียงเหนือ',
  central: 'ภาคกลาง',
  east: 'ภาคตะวันออก',
  west: 'ภาคตะวันตก',
  south: 'ภาคใต้',
};

export type Province = {
  code: string;
  nameTh: string;
  nameEn: string;
  region: Region;
};

export const PROVINCES: Province[] = [
  { code: '50', nameTh: 'เชียงใหม่',     nameEn: 'Chiang Mai',     region: 'north' },
  { code: '57', nameTh: 'เชียงราย',      nameEn: 'Chiang Rai',     region: 'north' },
  { code: '52', nameTh: 'ลำปาง',         nameEn: 'Lampang',        region: 'north' },
  { code: '51', nameTh: 'ลำพูน',         nameEn: 'Lamphun',        region: 'north' },
  { code: '56', nameTh: 'พะเยา',         nameEn: 'Phayao',         region: 'north' },
  { code: '54', nameTh: 'แพร่',          nameEn: 'Phrae',          region: 'north' },
  { code: '55', nameTh: 'น่าน',          nameEn: 'Nan',            region: 'north' },
  { code: '58', nameTh: 'แม่ฮ่องสอน',    nameEn: 'Mae Hong Son',   region: 'north' },
  { code: '53', nameTh: 'อุตรดิตถ์',      nameEn: 'Uttaradit',      region: 'north' },

  { code: '40', nameTh: 'ขอนแก่น',       nameEn: 'Khon Kaen',      region: 'northeast' },
  { code: '30', nameTh: 'นครราชสีมา',    nameEn: 'Nakhon Ratchasima', region: 'northeast' },
  { code: '41', nameTh: 'อุดรธานี',      nameEn: 'Udon Thani',     region: 'northeast' },
  { code: '42', nameTh: 'เลย',           nameEn: 'Loei',           region: 'northeast' },
  { code: '43', nameTh: 'หนองคาย',       nameEn: 'Nong Khai',      region: 'northeast' },
  { code: '44', nameTh: 'มหาสารคาม',     nameEn: 'Maha Sarakham',  region: 'northeast' },
  { code: '45', nameTh: 'ร้อยเอ็ด',      nameEn: 'Roi Et',         region: 'northeast' },
  { code: '46', nameTh: 'กาฬสินธุ์',     nameEn: 'Kalasin',        region: 'northeast' },
  { code: '47', nameTh: 'สกลนคร',        nameEn: 'Sakon Nakhon',   region: 'northeast' },
  { code: '48', nameTh: 'นครพนม',        nameEn: 'Nakhon Phanom',  region: 'northeast' },
  { code: '49', nameTh: 'มุกดาหาร',      nameEn: 'Mukdahan',       region: 'northeast' },
  { code: '31', nameTh: 'บุรีรัมย์',     nameEn: 'Buriram',        region: 'northeast' },
  { code: '32', nameTh: 'สุรินทร์',      nameEn: 'Surin',          region: 'northeast' },
  { code: '33', nameTh: 'ศรีสะเกษ',      nameEn: 'Sisaket',        region: 'northeast' },
  { code: '34', nameTh: 'อุบลราชธานี',   nameEn: 'Ubon Ratchathani', region: 'northeast' },
  { code: '35', nameTh: 'ยโสธร',         nameEn: 'Yasothon',       region: 'northeast' },
  { code: '36', nameTh: 'ชัยภูมิ',       nameEn: 'Chaiyaphum',     region: 'northeast' },
  { code: '37', nameTh: 'อำนาจเจริญ',    nameEn: 'Amnat Charoen',  region: 'northeast' },
  { code: '38', nameTh: 'บึงกาฬ',        nameEn: 'Bueng Kan',      region: 'northeast' },
  { code: '39', nameTh: 'หนองบัวลำภู',   nameEn: 'Nong Bua Lamphu', region: 'northeast' },

  { code: '10', nameTh: 'กรุงเทพมหานคร', nameEn: 'Bangkok',        region: 'central' },
  { code: '11', nameTh: 'สมุทรปราการ',   nameEn: 'Samut Prakan',   region: 'central' },
  { code: '12', nameTh: 'นนทบุรี',       nameEn: 'Nonthaburi',     region: 'central' },
  { code: '13', nameTh: 'ปทุมธานี',      nameEn: 'Pathum Thani',   region: 'central' },
  { code: '14', nameTh: 'พระนครศรีอยุธยา', nameEn: 'Phra Nakhon Si Ayutthaya', region: 'central' },
  { code: '15', nameTh: 'อ่างทอง',       nameEn: 'Ang Thong',      region: 'central' },
  { code: '16', nameTh: 'ลพบุรี',        nameEn: 'Lopburi',        region: 'central' },
  { code: '17', nameTh: 'สิงห์บุรี',     nameEn: 'Sing Buri',      region: 'central' },
  { code: '18', nameTh: 'ชัยนาท',        nameEn: 'Chai Nat',       region: 'central' },
  { code: '19', nameTh: 'สระบุรี',       nameEn: 'Saraburi',       region: 'central' },
  { code: '20', nameTh: 'ชลบุรี',        nameEn: 'Chonburi',       region: 'east' },
  { code: '60', nameTh: 'นครสวรรค์',     nameEn: 'Nakhon Sawan',   region: 'central' },
  { code: '61', nameTh: 'อุทัยธานี',     nameEn: 'Uthai Thani',    region: 'central' },
  { code: '62', nameTh: 'กำแพงเพชร',     nameEn: 'Kamphaeng Phet', region: 'central' },
  { code: '63', nameTh: 'ตาก',           nameEn: 'Tak',            region: 'west' },
  { code: '64', nameTh: 'สุโขทัย',       nameEn: 'Sukhothai',      region: 'central' },
  { code: '65', nameTh: 'พิษณุโลก',      nameEn: 'Phitsanulok',    region: 'central' },
  { code: '66', nameTh: 'พิจิตร',        nameEn: 'Phichit',        region: 'central' },
  { code: '67', nameTh: 'เพชรบูรณ์',     nameEn: 'Phetchabun',     region: 'central' },
  { code: '70', nameTh: 'ราชบุรี',       nameEn: 'Ratchaburi',     region: 'west' },
  { code: '73', nameTh: 'นครปฐม',        nameEn: 'Nakhon Pathom',  region: 'central' },
  { code: '74', nameTh: 'สมุทรสาคร',     nameEn: 'Samut Sakhon',   region: 'central' },
  { code: '75', nameTh: 'สมุทรสงคราม',   nameEn: 'Samut Songkhram', region: 'central' },
  { code: '76', nameTh: 'เพชรบุรี',      nameEn: 'Phetchaburi',    region: 'west' },
  { code: '77', nameTh: 'ประจวบคีรีขันธ์', nameEn: 'Prachuap Khiri Khan', region: 'west' },

  { code: '21', nameTh: 'ระยอง',         nameEn: 'Rayong',         region: 'east' },
  { code: '22', nameTh: 'จันทบุรี',      nameEn: 'Chanthaburi',    region: 'east' },
  { code: '23', nameTh: 'ตราด',          nameEn: 'Trat',           region: 'east' },
  { code: '24', nameTh: 'ฉะเชิงเทรา',    nameEn: 'Chachoengsao',   region: 'east' },
  { code: '25', nameTh: 'ปราจีนบุรี',    nameEn: 'Prachinburi',    region: 'east' },
  { code: '26', nameTh: 'นครนายก',       nameEn: 'Nakhon Nayok',   region: 'east' },
  { code: '27', nameTh: 'สระแก้ว',       nameEn: 'Sa Kaeo',        region: 'east' },

  { code: '71', nameTh: 'กาญจนบุรี',     nameEn: 'Kanchanaburi',   region: 'west' },
  { code: '72', nameTh: 'สุพรรณบุรี',    nameEn: 'Suphan Buri',    region: 'central' },

  { code: '80', nameTh: 'นครศรีธรรมราช',  nameEn: 'Nakhon Si Thammarat', region: 'south' },
  { code: '81', nameTh: 'กระบี่',        nameEn: 'Krabi',          region: 'south' },
  { code: '82', nameTh: 'พังงา',         nameEn: 'Phang Nga',      region: 'south' },
  { code: '83', nameTh: 'ภูเก็ต',        nameEn: 'Phuket',         region: 'south' },
  { code: '84', nameTh: 'สุราษฎร์ธานี',  nameEn: 'Surat Thani',    region: 'south' },
  { code: '85', nameTh: 'ระนอง',         nameEn: 'Ranong',         region: 'south' },
  { code: '86', nameTh: 'ชุมพร',         nameEn: 'Chumphon',       region: 'south' },
  { code: '90', nameTh: 'สงขลา',         nameEn: 'Songkhla',       region: 'south' },
  { code: '91', nameTh: 'สตูล',          nameEn: 'Satun',          region: 'south' },
  { code: '92', nameTh: 'ตรัง',          nameEn: 'Trang',          region: 'south' },
  { code: '93', nameTh: 'พัทลุง',        nameEn: 'Phatthalung',    region: 'south' },
  { code: '94', nameTh: 'ปัตตานี',       nameEn: 'Pattani',        region: 'south' },
  { code: '95', nameTh: 'ยะลา',          nameEn: 'Yala',           region: 'south' },
  { code: '96', nameTh: 'นราธิวาส',      nameEn: 'Narathiwat',     region: 'south' },
];

const BY_CODE = new Map(PROVINCES.map((p) => [p.code, p]));

export function findProvince(code: string | null | undefined): Province | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

export function regionOf(code: string | null | undefined): Region | null {
  const p = findProvince(code);
  return p ? p.region : null;
}

export const PROVINCES_BY_REGION: Record<Region, Province[]> = (() => {
  const groups: Record<Region, Province[]> = {
    north: [], northeast: [], central: [], east: [], west: [], south: [],
  };
  for (const p of PROVINCES) groups[p.region].push(p);
  for (const r of Object.keys(groups) as Region[]) {
    groups[r].sort((a, b) => a.nameTh.localeCompare(b.nameTh, 'th'));
  }
  return groups;
})();
