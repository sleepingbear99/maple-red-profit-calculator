export type ProductComponent = {
  id: string;
  name: string;
  quantity: number;
};

export type ProductCategory =
  | "basic"
  | "random"
  | "coupon"
  | "job"
  | "boss";

export type ProductSubcategory =
  | "utility"
  | "ring"
  | "transferScroll"
  | "prism"
  | "royal"
  | "lunaCrystal"
  | "wonderberry"
  | "boutique"
  | "hair"
  | "face"
  | "mixCoupon"
  | "genderChange"
  | "adventurer"
  | "cygnus"
  | "heroes"
  | "resistance"
  | "demon"
  | "nova"
  | "flora"
  | "anima"
  | "transcendent"
  | "friendsWorld"
  | "bossSet";

export type ProductTag =
  | "multiPack"
  | "best"
  | "boss"
  | "allJob"
  | "illustrationCollection"
  | "mileage30";

export type ProductStatus =
  | "active"
  | "ended"
  | "upcoming"
  | "paused"
  | "unavailable"
  | "unknown";

export type ProductStatusSource = "manual" | "automatic";

export type CatalogProduct = {
  id: string;
  name: string;
  category: ProductCategory;
  subcategory?: ProductSubcategory;
  cashPrice: number;
  mileage30Eligible: boolean;
  tags: ProductTag[];
  status: ProductStatus;
  saleStartAt?: string;
  saleEndAt?: string;
  statusSource: ProductStatusSource;
  components: ProductComponent[];
  excludedComponents: ProductComponent[];
  checkedAt: string;
};

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  basic: "기본",
  random: "확률형",
  coupon: "쿠폰",
  job: "직업 코디",
  boss: "보스 코디",
};

export const SUBCATEGORY_LABELS: Record<ProductSubcategory, string> = {
  utility: "편의",
  ring: "반지",
  transferScroll: "전승 스크롤",
  prism: "프리즘",
  royal: "로얄",
  lunaCrystal: "루나 크리스탈",
  wonderberry: "원더베리",
  boutique: "부티크",
  hair: "헤어",
  face: "성형",
  mixCoupon: "믹스 쿠폰",
  genderChange: "성별 변경",
  adventurer: "모험가",
  cygnus: "시그너스",
  heroes: "영웅",
  resistance: "레지스탕스",
  demon: "데몬",
  nova: "노바",
  flora: "레프",
  anima: "아니마",
  transcendent: "초월자",
  friendsWorld: "프렌즈 월드",
  bossSet: "보스 세트",
};

export const PRODUCT_TAG_LABELS: Record<ProductTag, string> = {
  multiPack: "10개 묶음",
  best: "BEST",
  boss: "보스",
  allJob: "전 직업",
  illustrationCollection: "일러스트 컬렉션",
  mileage30: "마일30",
};

export const SUBCATEGORY_OPTIONS: Record<ProductCategory, ProductSubcategory[]> = {
  basic: ["utility", "ring", "transferScroll", "prism"],
  random: ["royal", "lunaCrystal", "wonderberry", "boutique"],
  coupon: ["hair", "face", "mixCoupon", "genderChange"],
  job: ["adventurer", "cygnus", "heroes", "resistance", "demon", "nova", "flora", "anima", "transcendent", "friendsWorld"],
  boss: ["bossSet"],
};

type ComponentInput = string | readonly [name: string, quantity: number];
type ProductOptions = {
  subcategory?: ProductSubcategory;
  mileage30Eligible?: boolean;
  tags?: readonly ProductTag[];
  status?: ProductStatus;
  components?: readonly ComponentInput[];
  excludedComponents?: readonly ComponentInput[];
};

const CHECKED_AT = "2026-08-23";

function normalizeComponents(productId: string, values: readonly ComponentInput[]) {
  return values.map((value, index) => ({
    id: `${productId}-component-${index + 1}`,
    name: typeof value === "string" ? value : value[0],
    quantity: typeof value === "string" ? 1 : value[1],
  }));
}

function product(
  id: string,
  name: string,
  category: CatalogProduct["category"],
  cashPrice: number,
  options: ProductOptions = {},
): CatalogProduct {
  const mileage30Eligible = options.mileage30Eligible ?? false;
  const tags = Array.from(new Set<ProductTag>([
    ...(options.tags ?? []),
    ...(mileage30Eligible ? ["mileage30" as const] : []),
  ]));
  return {
    id,
    name,
    category,
    subcategory: options.subcategory,
    cashPrice,
    mileage30Eligible,
    tags,
    status: options.status ?? "active",
    statusSource: "manual",
    components: normalizeComponents(id, options.components ?? [name]),
    excludedComponents: normalizeComponents(`${id}-excluded`, options.excludedComponents ?? []),
    checkedAt: CHECKED_AT,
  };
}

const JOB_SUBCATEGORY_BY_LABEL = {
  "모험가": "adventurer",
  "시그너스": "cygnus",
  "영웅": "heroes",
  "레지스탕스": "resistance",
  "데몬": "demon",
  "노바": "nova",
  "레프": "flora",
  "아니마": "anima",
  "초월자": "transcendent",
  "프렌즈 월드": "friendsWorld",
} as const satisfies Record<string, ProductSubcategory>;

type JobSubcategoryLabel = keyof typeof JOB_SUBCATEGORY_BY_LABEL;

function job(
  id: string,
  name: string,
  subcategory: JobSubcategoryLabel,
  cashPrice: number,
  components: readonly ComponentInput[],
  excludedComponents: readonly ComponentInput[] = [],
) {
  return product(id, name, "job", cashPrice, { subcategory: JOB_SUBCATEGORY_BY_LABEL[subcategory], components, excludedComponents });
}

function boss(
  id: string,
  name: string,
  cashPrice: number,
  components: readonly ComponentInput[],
  excludedComponents: readonly ComponentInput[] = [],
) {
  return product(id, name, "boss", cashPrice, { subcategory: "bossSet", components, excludedComponents });
}

const BASIC_AND_RANDOM_PRODUCTS: CatalogProduct[] = [
  product("basic-01", "플래티넘 카르마의 가위", "basic", 5900, { subcategory: "utility", mileage30Eligible: true }),
  product("basic-02", "혈맹의 반지", "basic", 5900, { subcategory: "ring" }),
  product("basic-03", "마네킹", "basic", 18900, { subcategory: "utility" }),
  product("basic-04", "추가옵션 전승 스크롤", "basic", 49000, { subcategory: "transferScroll" }),
  product("basic-05", "잠재능력 전승스크롤", "basic", 99000, { subcategory: "transferScroll" }),
  product("basic-06", "컬러링 프리즘", "basic", 5900, { subcategory: "prism", mileage30Eligible: true }),
  product("basic-07", "컬러링 프리즘 프로", "basic", 25000, { subcategory: "prism", mileage30Eligible: true }),
  product("basic-08", "무기 이펙트 프리즘", "basic", 15000, { subcategory: "prism", mileage30Eligible: true }),
  product("random-01", "메이플 로얄 스타일", "random", 2200, { subcategory: "royal" }),
  product("random-02", "루나 크리스탈", "random", 3900, { subcategory: "lunaCrystal" }),
  product("random-03", "스페셜 루나 크리스탈", "random", 3900, { subcategory: "lunaCrystal" }),
  product("random-04", "위습의 원더베리", "random", 5400, { subcategory: "wonderberry" }),
  product("random-05", "위습의 원더베리 11개", "random", 54000, { subcategory: "wonderberry", components: [["위습의 원더베리", 11]] }),
  product("bundle-01", "부티크 기프트", "random", 3300, { subcategory: "boutique", status: "ended" }),
  product("bundle-02", "부티크 기프트 10개", "random", 33000, { subcategory: "boutique", tags: ["multiPack"], status: "ended", components: [["부티크 기프트", 10]] }),
];

const COUPON_PRODUCTS: CatalogProduct[] = [
  product("coupon-01", "프리미엄 헤어쿠폰", "coupon", 5500, { subcategory: "hair", mileage30Eligible: true }),
  product("coupon-02", "프리미엄 성형쿠폰", "coupon", 3500, { subcategory: "face", mileage30Eligible: true }),
  product("coupon-03", "상반기 BEST 프리미엄 헤어 쿠폰", "coupon", 5500, { subcategory: "hair", mileage30Eligible: true, tags: ["best"] }),
  product("coupon-04", "상반기 BEST 프리미엄 성형 쿠폰", "coupon", 3500, { subcategory: "face", mileage30Eligible: true, tags: ["best"] }),
  product("coupon-05", "보스 헤어 쿠폰", "coupon", 5500, { subcategory: "hair", tags: ["boss"] }),
  product("coupon-06", "보스 성형 쿠폰", "coupon", 3500, { subcategory: "face", tags: ["boss"] }),
  product("coupon-07", "전 직업 헤어 쿠폰", "coupon", 3500, { subcategory: "hair", tags: ["allJob"] }),
  product("coupon-08", "전 직업 성형 쿠폰", "coupon", 2500, { subcategory: "face", tags: ["allJob"] }),
  product("coupon-09", "전 직업 일러스트 컬렉션 헤어 쿠폰", "coupon", 5500, { subcategory: "hair", tags: ["allJob", "illustrationCollection"] }),
  product("coupon-10", "성별 변경 쿠폰", "coupon", 15000, { subcategory: "genderChange" }),
  product("coupon-11", "커스텀 믹스 컬러렌즈 쿠폰", "coupon", 24000, { subcategory: "mixCoupon" }),
  product("coupon-12", "커스텀 믹스염색 쿠폰", "coupon", 48000, { subcategory: "mixCoupon" }),
];

const DEMON_PRODUCTS: CatalogProduct[] = [
  job("demon-01", "데몬 슬레이어 패키지(남)", "데몬", 12900, ["데몬 슬레이어 슈트(남)", "데몬 슬레이어 슈즈", "데몬 슬레이어 엑스", "데몬 슬레이어 윙"]),
  job("demon-02", "데몬 슬레이어 패키지(여)", "데몬", 15900, ["데몬 슬레이어 머리띠(여)", "데몬 슬레이어 슈트(여)", "데몬 슬레이어 슈즈", "데몬 슬레이어 엑스", "데몬 슬레이어 윙"]),
  job("demon-03", "데몬 어벤져 패키지(남)", "데몬", 12900, ["데몬 어벤져 슈트(남)", "데몬 어벤져 슈즈", "데몬 어벤져 데스페라도", "데몬 어벤져 윙"]),
  job("demon-04", "데몬 어벤져 패키지(여)", "데몬", 15900, ["데몬 어벤져 머리띠(여)", "데몬 어벤져 슈트(여)", "데몬 어벤져 슈즈", "데몬 어벤져 데스페라도", "데몬 어벤져 윙"]),
];

const RESISTANCE_PRODUCTS: CatalogProduct[] = [
  job("resistance-01", "레지스탕스 블래스터 패키지(남)", "레지스탕스", 12900, ["레지스탕스 블래스터 헤어밴드(남)", "레지스탕스 블래스터 슈트(남)", "레지스탕스 블래스터 슈즈(남)", "레지스탕스 블래스터 건틀렛 리볼버"]),
  job("resistance-02", "레지스탕스 블래스터 패키지(여)", "레지스탕스", 12900, ["레지스탕스 블래스터 헤어핀(여)", "레지스탕스 블래스터 슈트(여)", "레지스탕스 블래스터 슈즈(여)", "레지스탕스 블래스터 건틀렛 리볼버"]),
  job("resistance-03", "레지스탕스 배틀메이지 패키지(남)", "레지스탕스", 12900, ["레지스탕스 배틀메이지 고글", "레지스탕스 배틀메이지 슈트(남)", "레지스탕스 배틀메이지 슈즈", "레지스탕스 배틀메이지 스태프"]),
  job("resistance-04", "레지스탕스 배틀메이지 패키지(여)", "레지스탕스", 12900, ["레지스탕스 배틀메이지 고글", "레지스탕스 배틀메이지 슈트(여)", "레지스탕스 배틀메이지 슈즈", "레지스탕스 배틀메이지 스태프"]),
  job("resistance-05", "레지스탕스 와일드헌터 패키지(남)", "레지스탕스", 12900, ["레지스탕스 와일드헌터 헤어핀", "레지스탕스 와일드헌터 슈트(남)", "레지스탕스 와일드헌터 슈즈", "레지스탕스 와일드헌터 석궁"], ["레지스탕스 와일드헌터 글러브"]),
  job("resistance-06", "레지스탕스 와일드헌터 패키지(여)", "레지스탕스", 12900, ["레지스탕스 와일드헌터 헤어핀", "레지스탕스 와일드헌터 슈트(여)", "레지스탕스 와일드헌터 슈즈", "레지스탕스 와일드헌터 석궁"], ["레지스탕스 와일드헌터 글러브"]),
  job("resistance-07", "레지스탕스 제논 패키지(남)", "레지스탕스", 12900, ["레지스탕스 제논 이어피스", "레지스탕스 제논 슈트(남)", "레지스탕스 제논 슈즈", "레지스탕스 제논 에너지소드"], ["레지스탕스 제논 얼굴장식"]),
  job("resistance-08", "레지스탕스 제논 패키지(여)", "레지스탕스", 12900, ["레지스탕스 제논 이어피스", "레지스탕스 제논 슈트(여)", "레지스탕스 제논 슈즈", "레지스탕스 제논 에너지소드"], ["레지스탕스 제논 얼굴장식"]),
  job("resistance-09", "레지스탕스 메카닉 패키지(남)", "레지스탕스", 12900, ["레지스탕스 메카닉 바이저", "레지스탕스 메카닉 슈트(남)", "레지스탕스 메카닉 슈즈", "레지스탕스 메카닉 건"]),
  job("resistance-10", "레지스탕스 메카닉 패키지(여)", "레지스탕스", 12900, ["레지스탕스 메카닉 바이저", "레지스탕스 메카닉 슈트(여)", "레지스탕스 메카닉 슈즈", "레지스탕스 메카닉 건"]),
];

const CYGNUS_PRODUCTS: CatalogProduct[] = [
  job("cygnus-01", "빛의 기사단장 미하일 패키지", "시그너스", 13000, ["기사단장 미하일 투구", "기사단장 미하일 아머", "기사단장 미하일 부츠", "기사단장 미하일 소드"], ["기사단장 미하일 방패", "기사단장 미하일 이펙트"]),
  job("cygnus-02", "불의 기사단장 오즈 패키지(남)", "시그너스", 13000, ["기사단장 오즈 햇", "기사단장 오즈 로브(남)", "기사단장 오즈 부츠", "기사단장 오즈 스태프"], ["기사단장 오즈 이펙트"]),
  job("cygnus-03", "불의 기사단장 오즈 패키지(여)", "시그너스", 13000, ["기사단장 오즈 햇", "기사단장 오즈 로브(여)", "기사단장 오즈 부츠", "기사단장 오즈 스태프"], ["기사단장 오즈 이펙트"]),
  job("cygnus-04", "바람의 기사단장 이리나 패키지(남)", "시그너스", 13000, ["기사단장 이리나 크라운", "기사단장 이리나 슈트(남)", "기사단장 이리나 슈즈(남)", "기사단장 이리나 보우"], ["기사단장 이리나 이펙트"]),
  job("cygnus-05", "바람의 기사단장 이리나 패키지(여)", "시그너스", 13000, ["기사단장 이리나 크라운", "기사단장 이리나 슈트(여)", "기사단장 이리나 슈즈(여)", "기사단장 이리나 보우"], ["기사단장 이리나 이펙트"]),
  job("cygnus-06", "어둠의 기사단장 이카르트 패키지(남)", "시그너스", 13000, ["기사단장 이카르트 가면", "기사단장 이카르트 슈트(남)", "기사단장 이카르트 부츠", "기사단장 이카르트 표창"], ["기사단장 이카르트 이펙트"]),
  job("cygnus-07", "어둠의 기사단장 이카르트 패키지(여)", "시그너스", 13000, ["기사단장 이카르트 가면", "기사단장 이카르트 슈트(여)", "기사단장 이카르트 부츠", "기사단장 이카르트 표창"], ["기사단장 이카르트 이펙트"]),
  job("cygnus-08", "번개의 기사단장 호크아이 패키지(남)", "시그너스", 13000, ["기사단장 호크아이 햇", "기사단장 호크아이 슈트(남)", "기사단장 호크아이 부츠", "기사단장 호크아이 너클"], ["기사단장 호크아이 이펙트"]),
  job("cygnus-09", "번개의 기사단장 호크아이 패키지(여)", "시그너스", 13000, ["기사단장 호크아이 햇", "기사단장 호크아이 슈트(여)", "기사단장 호크아이 부츠", "기사단장 호크아이 너클"], ["기사단장 호크아이 이펙트"]),
  job("cygnus-10", "책사 나인하트 패키지", "시그너스", 13000, ["책사 나인하트 모노클", "책사 나인하트 로브", "책사 나인하트 슈즈", "책사 나인하트 도서"], ["책사 나인하트 이펙트"]),
  job("cygnus-11", "여제 시그너스 패키지(여)", "시그너스", 13000, ["여제 시그너스 써클릿", "여제 시그너스 드레스(여)", "여제 시그너스 슈즈", "신수의 부름"], ["여제 시그너스 케이프", "여제 시그너스 이펙트"]),
];

const HERO_PRODUCTS: CatalogProduct[] = [
  job("hero-01", "영웅 아란 패키지(남)", "영웅", 10000, ["영웅 아란 아머(남)", "영웅 아란 부츠", "영웅 아란 폴암"]),
  job("hero-02", "영웅 아란 패키지(여)", "영웅", 10000, ["영웅 아란 아머(여)", "영웅 아란 부츠", "영웅 아란 폴암"]),
  job("hero-03", "영웅 은월 패키지(남)", "영웅", 10000, ["영웅 은월 슈트(남)", "영웅 은월 부츠", "영웅 은월 너클"]),
  job("hero-04", "영웅 은월 패키지(여)", "영웅", 10000, ["영웅 은월 슈트(여)", "영웅 은월 부츠", "영웅 은월 너클"]),
  job("hero-05", "영웅 루미너스 패키지(남)", "영웅", 10000, ["영웅 루미너스 로브(남)", "영웅 루미너스 부츠", "영웅 루미너스 샤이닝로드"]),
  job("hero-06", "영웅 루미너스 패키지(여)", "영웅", 10000, ["영웅 루미너스 로브(여)", "영웅 루미너스 부츠", "영웅 루미너스 샤이닝로드"]),
  job("hero-07", "영웅 에반 패키지(남)", "영웅", 10000, ["영웅 에반 로브(남)", "영웅 에반 부츠", "영웅 에반 스태프"], ["영웅 에반 골든윙즈"]),
  job("hero-08", "영웅 에반 패키지(여)", "영웅", 10000, ["영웅 에반 로브(여)", "영웅 에반 부츠", "영웅 에반 스태프"], ["영웅 에반 골든윙즈"]),
  job("hero-09", "영웅 메르세데스 패키지(남)", "영웅", 10000, ["영웅 메르세데스 슈트(남)", "영웅 메르세데스 슈즈(남)", "영웅 메르세데스 듀얼보우건"], ["영웅 메르세데스 핀"]),
  job("hero-10", "영웅 메르세데스 패키지(여)", "영웅", 10000, ["영웅 메르세데스 슈트(여)", "영웅 메르세데스 슈즈(여)", "영웅 메르세데스 듀얼보우건"], ["영웅 메르세데스 핀"]),
  job("hero-11", "영웅 팬텀 패키지(남)", "영웅", 10000, ["영웅 팬텀 슈트(남)", "영웅 팬텀 부츠", "영웅 팬텀 케인"], ["영웅 팬텀 햇"]),
  job("hero-12", "영웅 팬텀 패키지(여)", "영웅", 10000, ["영웅 팬텀 슈트(여)", "영웅 팬텀 부츠", "영웅 팬텀 케인"], ["영웅 팬텀 햇"]),
];

const ADVENTURER_PRODUCTS: CatalogProduct[] = [
  job("adventurer-01", "모험가 히어로 패키지", "모험가", 10000, ["모험가 히어로 아머", "모험가 히어로 부츠", "모험가 히어로 소드"]),
  job("adventurer-02", "모험가 팔라딘 패키지", "모험가", 10000, ["모험가 팔라딘 아머", "모험가 팔라딘 부츠", "모험가 팔라딘 해머"]),
  job("adventurer-03", "모험가 다크나이트 패키지", "모험가", 10000, ["모험가 다크나이트 아머", "모험가 다크나이트 부츠", "모험가 다크나이트 스피어"]),
  job("adventurer-04", "모험가 불독 패키지(남)", "모험가", 10000, ["모험가 불독 로브(남)", "모험가 불독 부츠(남)", "모험가 불독 완드"]),
  job("adventurer-05", "모험가 불독 패키지(여)", "모험가", 10000, ["모험가 불독 로브(여)", "모험가 불독 부츠(여)", "모험가 불독 완드"]),
  job("adventurer-06", "모험가 썬콜 패키지(남)", "모험가", 10000, ["모험가 썬콜 로브(남)", "모험가 썬콜 부츠(남)", "모험가 썬콜 스태프"]),
  job("adventurer-07", "모험가 썬콜 패키지(여)", "모험가", 10000, ["모험가 썬콜 로브(여)", "모험가 썬콜 부츠(여)", "모험가 썬콜 스태프"]),
  job("adventurer-08", "모험가 비숍 패키지(남)", "모험가", 10000, ["모험가 비숍 로브(남)", "모험가 비숍 부츠(남)", "모험가 비숍 완드"]),
  job("adventurer-09", "모험가 비숍 패키지(여)", "모험가", 10000, ["모험가 비숍 로브(여)", "모험가 비숍 부츠(여)", "모험가 비숍 완드"]),
  job("adventurer-10", "모험가 보우마스터 패키지(남)", "모험가", 10000, ["모험가 보우마스터 슈트(남)", "모험가 보우마스터 부츠", "모험가 보우마스터 활"]),
  job("adventurer-11", "모험가 보우마스터 패키지(여)", "모험가", 10000, ["모험가 보우마스터 슈트(여)", "모험가 보우마스터 부츠", "모험가 보우마스터 활"]),
  job("adventurer-12", "모험가 신궁 패키지(남)", "모험가", 10000, ["모험가 신궁 슈트(남)", "모험가 신궁 부츠", "모험가 신궁 석궁"]),
  job("adventurer-13", "모험가 신궁 패키지(여)", "모험가", 10000, ["모험가 신궁 슈트(여)", "모험가 신궁 부츠", "모험가 신궁 석궁"]),
  job("adventurer-14", "모험가 패스파인더 패키지", "모험가", 10000, ["모험가 패스파인더 슈트", "모험가 패스파인더 부츠", "모험가 패스파인더 활"]),
  job("adventurer-15", "모험가 나이트로드 패키지(남)", "모험가", 10000, ["모험가 나이트로드 슈트", "모험가 나이트로드 부츠", "모험가 나이트로드 표창"], ["모험가 나이트로드 헤어밴드(남)"]),
  job("adventurer-16", "모험가 나이트로드 패키지(여)", "모험가", 10000, ["모험가 나이트로드 슈트", "모험가 나이트로드 부츠", "모험가 나이트로드 표창"], ["모험가 나이트로드 헤어밴드(여)"]),
  job("adventurer-17", "모험가 듀얼블레이드 패키지", "모험가", 10000, ["모험가 듀얼블레이드 슈트", "모험가 듀얼블레이드 부츠", "모험가 듀얼블레이드 단검"]),
  job("adventurer-18", "모험가 섀도어 패키지", "모험가", 10000, ["모험가 섀도어 슈트", "모험가 섀도어 부츠", "모험가 섀도어 단검"]),
  job("adventurer-19", "모험가 캐논슈터 패키지(남)", "모험가", 10000, ["모험가 캐논슈터 슈트(남)", "모험가 캐논슈터 부츠", "모험가 캐논슈터 캐논"]),
  job("adventurer-20", "모험가 캐논슈터 패키지(여)", "모험가", 10000, ["모험가 캐논슈터 슈트(여)", "모험가 캐논슈터 부츠", "모험가 캐논슈터 캐논"]),
  job("adventurer-21", "모험가 바이퍼 패키지(남)", "모험가", 10000, ["모험가 바이퍼 갑옷(남)", "모험가 바이퍼 부츠", "모험가 바이퍼 너클"]),
  job("adventurer-22", "모험가 바이퍼 패키지(여)", "모험가", 10000, ["모험가 바이퍼 갑옷(여)", "모험가 바이퍼 부츠", "모험가 바이퍼 너클"]),
  job("adventurer-23", "모험가 캡틴 패키지(남)", "모험가", 10000, ["모험가 캡틴 갑옷(남)", "모험가 캡틴 부츠(남)", "모험가 캡틴 건"]),
  job("adventurer-24", "모험가 캡틴 패키지(여)", "모험가", 10000, ["모험가 캡틴 갑옷(여)", "모험가 캡틴 부츠(여)", "모험가 캡틴 건"]),
];

const NOVA_PRODUCTS: CatalogProduct[] = [
  job("nova-01", "노바 카이저 패키지", "노바", 12900, ["노바 카이저 투구", "노바 카이저 갑옷", "노바 카이저 갑화", "노바 카이저 카이세리움"]),
  job("nova-02", "노바 카인 패키지", "노바", 9900, ["노바 카인 제복", "노바 카인 군화", "노바 카인 브레스 슈터"], ["노바 카인 마스크"]),
  job("nova-03", "노바 카데나 패키지", "노바", 9900, ["노바 카데나 슈트", "노바 카데나 슈즈", "노바 카데나 체인"]),
  job("nova-04", "노바 엔젤릭버스터 패키지(여)", "노바", 12900, ["노바 엔젤릭버스터 슈트(여)", "노바 엔젤릭버스터 부츠(여)", "노바 엔젤릭버스터 소울 슈터", "노바 엔젤릭버스터 윙"]),
];

const LEF_PRODUCTS: CatalogProduct[] = [
  job("lef-01", "레프 아델 패키지", "레프", 9900, ["레프 아델 제복", "레프 아델 부츠", "레프 아델 튜너"]),
  job("lef-02", "레프 일리움 패키지", "레프", 15900, ["레프 일리움 헤어핀", "레프 일리움 슈트", "레프 일리움 슈즈", "레프 일리움 건틀렛", "레프 일리움 윙"], ["레프 일리움 마스크"]),
  job("lef-03", "레프 칼리 패키지", "레프", 12900, ["레프 칼리 보닛", "레프 칼리 제복", "레프 칼리 신발", "레프 칼리 차크람"]),
  job("lef-04", "레프 아크 패키지(남)", "레프", 9900, ["레프 아크 제복(남)", "레프 아크 군화", "레프 아크 스펙터 핸드"]),
  job("lef-05", "레프 아크 패키지(여)", "레프", 9900, ["레프 아크 제복(여)", "레프 아크 군화", "레프 아크 스펙터 핸드"]),
];

const ANIMA_PRODUCTS: CatalogProduct[] = [
  job("anima-01", "아니마 렌 패키지(남)", "아니마", 12900, ["아니마 렌 귀(남)", "아니마 렌 백운포(남)", "아니마 렌 백혜(남)", "아니마 렌 장검"]),
  job("anima-02", "아니마 렌 패키지(여)", "아니마", 12900, ["아니마 렌 귀(여)", "아니마 렌 백운포(여)", "아니마 렌 백혜(여)", "아니마 렌 장검"]),
  job("anima-03", "아니마 라라 패키지(남)", "아니마", 12900, ["아니마 라라 뿔", "아니마 라라 비단옷(남)", "아니마 라라 당혜(남)", "아니마 라라 지팡이"]),
  job("anima-04", "아니마 라라 패키지(여)", "아니마", 12900, ["아니마 라라 뿔", "아니마 라라 비단옷(여)", "아니마 라라 당혜(여)", "아니마 라라 지팡이"]),
  job("anima-05", "아니마 호영 패키지(남)", "아니마", 15900, ["아니마 호영 귀", "아니마 호영 도사복(남)", "아니마 호영 신발", "아니마 호영 흑운선", "아니마 호영 망토"]),
  job("anima-06", "아니마 호영 패키지(여)", "아니마", 15900, ["아니마 호영 귀", "아니마 호영 도사복(여)", "아니마 호영 신발", "아니마 호영 흑운선", "아니마 호영 망토"]),
];

const OTHER_JOB_PRODUCTS: CatalogProduct[] = [
  job("transcendent-01", "초월자 제로 패키지(남)", "초월자", 9900, ["초월자 제로 알파 슈트(남)", "초월자 제로 슈즈", "초월자 제로 알파 라즐리"]),
  job("transcendent-02", "초월자 제로 패키지(여)", "초월자", 9900, ["초월자 제로 베타 슈트(여)", "초월자 제로 슈즈", "초월자 제로 베타 라피스"]),
  job("friends-01", "프렌즈 월드 키네시스 패키지(남)", "프렌즈 월드", 9900, ["프렌즈 월드 키네시스 교복(남)", "프렌즈 월드 키네시스 신발", "프렌즈 월드 키네시스 ESP 리미터"]),
  job("friends-02", "프렌즈 월드 키네시스 패키지(여)", "프렌즈 월드", 9900, ["프렌즈 월드 키네시스 교복(여)", "프렌즈 월드 키네시스 신발", "프렌즈 월드 키네시스 ESP 리미터"]),
];

const BOSS_PRODUCTS: CatalogProduct[] = [
  boss("boss-01", "유피테르 패키지(남)", 9400, ["유피테르 슈트(남)", "유피테르 슈즈", "유피테르 기계 팔"], ["유피테르 귀고리"]),
  boss("boss-02", "유피테르 패키지(여)", 9400, ["유피테르 슈트(여)", "유피테르 슈즈", "유피테르 기계 팔"], ["유피테르 귀고리"]),
  boss("boss-03", "찬란한 흉성 패키지(남)", 14900, ["찬란한 흉성 헤일로", "찬란한 흉성 슈트(남)", "찬란한 흉성 슈즈", "찬란한 흉성의 힘", "찬란한 흉성 케이프"]),
  boss("boss-04", "찬란한 흉성 패키지(여)", 14900, ["찬란한 흉성 헤일로", "찬란한 흉성 슈트(여)", "찬란한 흉성 슈즈", "찬란한 흉성의 힘", "찬란한 흉성 케이프"]),
  boss("boss-05", "최초의 대적자 패키지(남)", 10000, ["최초의 대적자 후드", "최초의 대적자 슈트(남)", "최초의 대적자 슈즈", "최초의 대적자 망토"]),
  boss("boss-06", "최초의 대적자 패키지(여)", 10000, ["최초의 대적자 후드", "최초의 대적자 슈트(여)", "최초의 대적자 슈즈", "최초의 대적자 망토"]),
  boss("boss-07", "발드릭스 패키지", 14900, ["발드릭스 투구", "발드릭스 갑옷", "발드릭스 슈즈", "발드릭스 할버드", "발드릭스 망토"], ["발드릭스 장갑"]),
  boss("boss-08", "매그너스 패키지", 14900, ["매그너스 혼", "매그너스 갑옷", "매그너스 슈즈", "매그너스의 카이세리움", "매그너스 날개"], ["매그너스 장갑"]),
  boss("boss-09", "아카이럼 패키지", 14900, ["아카이럼의 문양", "아카이럼 로브", "아카이럼 슈즈", "아카이럼 완드", "아카이럼 스네이크"], ["아카이럼 수염"]),
  boss("boss-10", "다크 시그너스 패키지(남)", 14900, ["다크 시그너스 써클릿", "다크 시그너스 슈트(남)", "다크 시그너스 슈즈", "다크 시그너스의 신수", "다크 시그너스 엠블럼"]),
  boss("boss-11", "다크 시그너스 패키지(여)", 14900, ["다크 시그너스 써클릿", "다크 시그너스 드레스(여)", "다크 시그너스 링", "다크 시그너스의 신수", "다크 시그너스 엠블럼"]),
  boss("boss-12", "데미안 패키지", 14900, ["데미안의 낙인", "데미안 슈트", "데미안 슈즈", "파멸의 검", "파멸의 날개"], ["파멸의 안대"]),
  boss("boss-13", "윌 패키지", 14900, ["윌의 마크", "윌 로브", "윌 슈즈", "윌의 마도서", "트루 윌"]),
  boss("boss-14", "진 힐라 패키지(남)", 14900, ["진 힐라 가발", "진 힐라 다크 슈트(남)", "진 힐라 슈즈", "진 힐라의 낫", "고통의 속박"]),
  boss("boss-15", "진 힐라 패키지(여)", 14900, ["진 힐라 가발", "진 힐라 블랙 슈트(여)", "진 힐라 롱 부츠", "진 힐라의 낫", "고통의 속박"]),
  boss("boss-16", "듄켈 패키지", 14900, ["듄켈 투구", "듄켈 갑옷", "듄켈 슈즈", "듄켈의 대검", "듄켈 망토"], ["듄켈 장갑"]),
  boss("boss-17", "검은 마법사 패키지", 14900, ["검은 마법사 후드", "검은 마법사 로브", "잠식된 발걸음", "파괴와 창조의 기사", "창세의 힘"]),
  boss("boss-18", "선택받은 세렌 패키지", 14900, ["세렌 헤일로", "세렌 갑옷", "세렌 슈즈", "신성검 아소르", "세렌의 날개"], ["천족의 날개귀"]),
  boss("boss-19", "카링 패키지(남)", 14900, ["카링 비단 모자", "카링 비단옷(남)", "카링 비단신", "죽음의 손아귀", "카링의 악기"]),
  boss("boss-20", "카링 패키지(여)", 14900, ["카링 비단 모자", "카링 비단 치마(여)", "카링 비단신", "죽음의 손아귀", "카링의 악기"]),
  boss("boss-21", "익스트림 빅풋 패키지", 14900, ["빅풋 탈", "빅풋 슈트", "빅풋 슈즈", "빅풋 플레임", "빅풋 갑주"], ["파워풀 빅풋"]),
  boss("boss-22", "림보 패키지", 14900, ["림보 탈", "림보 슈트", "림보 슈즈", "도달한 진리", "오염된 근원"], ["림보 글러브"]),
];

const JOB_PRODUCTS = [
  ...ADVENTURER_PRODUCTS,
  ...CYGNUS_PRODUCTS,
  ...HERO_PRODUCTS,
  ...RESISTANCE_PRODUCTS,
  ...DEMON_PRODUCTS,
  ...NOVA_PRODUCTS,
  ...LEF_PRODUCTS,
  ...ANIMA_PRODUCTS,
  ...OTHER_JOB_PRODUCTS,
];

export const CURRENT_PRODUCTS: CatalogProduct[] = [
  ...BASIC_AND_RANDOM_PRODUCTS,
  ...COUPON_PRODUCTS,
  ...JOB_PRODUCTS,
  ...BOSS_PRODUCTS,
];

export const INITIAL_DATA_COUNTS = {
  currentProducts: CURRENT_PRODUCTS.length,
  basicProducts: CURRENT_PRODUCTS.filter((item) => item.category === "basic").length,
  randomProducts: CURRENT_PRODUCTS.filter((item) => item.category === "random").length,
  jobProducts: JOB_PRODUCTS.length,
  bossProducts: BOSS_PRODUCTS.length,
  basicAndRandomProducts: BASIC_AND_RANDOM_PRODUCTS.length,
  couponProducts: COUPON_PRODUCTS.length,
};

function validateInitialCatalog() {
  const expectedJobs = {
    adventurer: 24,
    cygnus: 11,
    heroes: 12,
    resistance: 10,
    demon: 4,
    nova: 4,
    flora: 5,
    anima: 6,
    transcendent: 2,
    friendsWorld: 2,
  } as const;
  const actualJobs = Object.fromEntries(
    Object.keys(expectedJobs).map((key) => [key, JOB_PRODUCTS.filter((item) => item.subcategory === key).length]),
  );
  const differences = Object.entries(expectedJobs)
    .filter(([key, count]) => actualJobs[key] !== count)
    .map(([key, count]) => `${SUBCATEGORY_LABELS[key as keyof typeof expectedJobs]}: ${actualJobs[key] ?? 0}/${count}`);
  if (differences.length) throw new Error(`직업 코디 수량 불일치: ${differences.join(", ")}`);
  if (INITIAL_DATA_COUNTS.jobProducts !== 80) throw new Error(`직업 코디 합계 불일치: ${INITIAL_DATA_COUNTS.jobProducts}/80`);
  if (INITIAL_DATA_COUNTS.bossProducts !== 22) throw new Error(`보스 코디 합계 불일치: ${INITIAL_DATA_COUNTS.bossProducts}/22`);
  if (INITIAL_DATA_COUNTS.basicProducts !== 8) throw new Error(`기본 상품 합계 불일치: ${INITIAL_DATA_COUNTS.basicProducts}/8`);
  if (INITIAL_DATA_COUNTS.randomProducts !== 7) throw new Error(`확률형 상품 합계 불일치: ${INITIAL_DATA_COUNTS.randomProducts}/7`);
  if (INITIAL_DATA_COUNTS.basicAndRandomProducts !== 15) throw new Error(`기본·확률형 합계 불일치: ${INITIAL_DATA_COUNTS.basicAndRandomProducts}/15`);
  if (INITIAL_DATA_COUNTS.couponProducts !== 12) throw new Error(`쿠폰 합계 불일치: ${INITIAL_DATA_COUNTS.couponProducts}/12`);
  if (INITIAL_DATA_COUNTS.currentProducts !== 129) throw new Error(`현재 판매 상품 합계 불일치: ${INITIAL_DATA_COUNTS.currentProducts}/129`);
  if (CURRENT_PRODUCTS.filter((item) => item.mileage30Eligible).length !== 8) throw new Error("마일리지 30% 가능 상품은 8개여야 합니다.");
  if (CURRENT_PRODUCTS.some((item) => item.checkedAt !== CHECKED_AT)) throw new Error("초기 상품의 확인일이 올바르지 않습니다.");
  if (CURRENT_PRODUCTS.some((item) => item.status !== "active" && !["bundle-01", "bundle-02"].includes(item.id))) throw new Error("초기 상품의 판매 상태가 올바르지 않습니다.");
  if (CURRENT_PRODUCTS.filter((item) => ["bundle-01", "bundle-02"].includes(item.id)).some((item) => item.status !== "ended")) throw new Error("부티크 기프트의 판매 종료 상태가 올바르지 않습니다.");
  if (CURRENT_PRODUCTS.some((item) => item.name === "블레어 살롱 헤어 쿠폰")) throw new Error("판매 종료 상품이 현재 판매 목록에 포함되었습니다.");
  const ids = new Set(CURRENT_PRODUCTS.map((item) => item.id));
  if (ids.size !== CURRENT_PRODUCTS.length) throw new Error("중복 상품 ID가 있습니다.");
}

validateInitialCatalog();
