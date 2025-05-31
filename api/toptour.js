// toptour.js
 
// 여행지 데이터 배열 (상세 정보 추가)
const places = [
    {
        id: "seoul",
        name: "1. 서울 (Seoul)",
        description: "대한민국의 수도이자 천만 인구가 살아가는 메가시티. 전통과 현대가 공존하는 매력적인 도시입니다. 고궁, 쇼핑, 미식, 문화 체험 등 다양한 즐길 거리가 있습니다.",
        image: "https://placehold.co/800x400/FF6347/FFFFFF?text=서울+N서울타워+이미지", // 실제 이미지 URL로 교체하세요
        details: {
            recommendedActivities: [
                "경복궁, 창덕궁 등 고궁 투어하며 역사 체험하기",
                "N서울타워에서 서울 전경 감상하기",
                "명동, 홍대에서 쇼핑과 길거리 음식 즐기기",
                "인사동에서 전통 공예품 구경 및 찻집 방문하기",
                "한강 공원에서 자전거 타기 또는 피크닉 즐기기"
            ],
            tips: [
                "대중교통(지하철, 버스)이 매우 잘 되어 있어 이동이 편리합니다.",
                "T머니 교통카드를 구입하면 편리하게 이용 가능합니다.",
                "인기 명소는 미리 예약하거나 평일에 방문하는 것이 좋습니다.",
                "계절별 축제 정보를 확인하고 방문 계획을 세워보세요."
            ],
            bestTimeToVisit: "봄(4-5월), 가을(9-10월)"
        }
    },
    {
        id: "busan",
        name: "2. 부산 (Busan)",
        description: "대한민국 제2의 도시이자 아름다운 해변을 자랑하는 항구 도시. 신선한 해산물, 활기찬 시장, 독특한 문화 예술 공간이 매력적입니다.",
        image: "https://placehold.co/800x400/4682B4/FFFFFF?text=부산+해운대+이미지",
        details: {
            recommendedActivities: [
                "해운대, 광안리 해수욕장에서 해수욕 및 해변 산책하기",
                "감천문화마을의 알록달록한 골목길 탐방하기",
                "자갈치시장에서 싱싱한 해산물 맛보기",
                "태종대에서 다누비 열차 타고 절경 감상하기",
                "국제시장, BIFF 광장 구경하기"
            ],
            tips: [
                "여름철 해수욕장은 매우 붐비므로 아침 일찍 방문하는 것이 좋습니다.",
                "부산국제영화제(BIFF) 기간에는 다양한 영화 관련 행사가 열립니다.",
                "씨앗호떡, 돼지국밥 등 부산 대표 음식을 꼭 맛보세요."
            ],
            bestTimeToVisit: "봄(4-5월), 여름(6-8월 해수욕), 가을(9-10월)"
        }
    },
    {
        id: "jeju",
        name: "3. 제주도 (Jeju Island)",
        description: "화산 활동으로 형성된 아름다운 섬. 유네스코 세계자연유산에 등재된 곳으로, 독특한 자연 경관과 문화를 자랑합니다.",
        image: "https://placehold.co/800x400/32CD32/FFFFFF?text=제주도+성산일출봉+이미지",
        details: {
            recommendedActivities: [
                "한라산 등반 또는 둘레길 걷기",
                "성산일출봉에서 일출 감상하기",
                "협재, 중문 등 아름다운 해변에서 휴식하기",
                "올레길 따라 제주 자연 만끽하기",
                "오설록 티 뮤지엄, 카멜리아힐 등 테마파크 방문하기"
            ],
            tips: [
                "렌터카를 이용하면 섬 전체를 편리하게 둘러볼 수 있습니다.",
                "날씨 변화가 잦으니, 가벼운 외투와 우산을 준비하는 것이 좋습니다.",
                "흑돼지, 해물뚝배기, 고기국수 등 제주 특색 음식을 즐겨보세요.",
                "항공권과 숙소는 미리 예약하는 것이 좋습니다."
            ],
            bestTimeToVisit: "연중 어느 때나 좋지만, 특히 봄(4-5월 유채꽃), 가을(9-10월 단풍)"
        }
    },
    {
        id: "gyeongju",
        name: "4. 경주 (Gyeongju)",
        description: "신라 천년의 역사를 간직한 '지붕 없는 박물관'. 불국사, 석굴암, 첨성대 등 수많은 문화유산이 도시 전체에 펼쳐져 있습니다.",
        image: "https://placehold.co/800x400/FFD700/000000?text=경주+불국사+이미지",
        details: {
            recommendedActivities: [
                "불국사, 석굴암(사전 예약 필수) 방문하기",
                "동궁과 월지(안압지) 야경 감상하기",
                "첨성대와 대릉원(천마총) 일대 산책하기",
                "황리단길에서 한옥 카페 및 아기자기한 상점 구경하기",
                "경주 국립박물관에서 신라 유물 관람하기"
            ],
            tips: [
                "자전거를 대여하여 주요 유적지를 둘러보는 것도 좋은 방법입니다.",
                "한복을 대여해 입고 고즈넉한 분위기를 즐겨보세요.",
                "경주빵, 찰보리빵 등 지역 특산물을 맛보세요."
            ],
            bestTimeToVisit: "봄(4-5월 벚꽃), 가을(9-10월)"
        }
    },
    {
        id: "jeonju",
        name: "5. 전주 (Jeonju)",
        description: "한옥마을로 유명한, 한국의 전통미를 느낄 수 있는 도시. 맛있는 음식과 고즈넉한 한옥의 정취가 어우러진 곳입니다.",
        image: "https://placehold.co/800x400/8A2BE2/FFFFFF?text=전주+한옥마을+이미지",
        details: {
            recommendedActivities: [
                "전주 한옥마을 골목길 거닐며 한옥 체험하기",
                "경기전, 오목대 방문하기",
                "한복 대여하고 인생샷 남기기",
                "전주 비빔밥, 콩나물국밥 등 향토 음식 맛보기",
                "남부시장에서 야시장(금, 토 운영) 즐기기"
            ],
            tips: [
                "주말에는 한옥마을에 관광객이 많으니, 여유롭게 즐기려면 평일 방문을 고려해보세요.",
                "전동성당도 아름다운 건축물로 유명합니다.",
                "수제 초코파이는 전주의 명물 중 하나입니다."
            ],
            bestTimeToVisit: "봄(4-5월), 가을(9-10월)"
        }
    },
    {
        id: "seoraksan",
        name: "6. 설악산 국립공원 (Seoraksan National Park)",
        description: "사계절 아름다운 풍경을 자랑하는 대한민국 대표 명산. 기암괴석과 맑은 계곡, 다양한 동식물이 서식하는 자연의 보고입니다.",
        image: "https://placehold.co/800x400/00CED1/FFFFFF?text=설악산+울산바위+이미지",
        details: {
            recommendedActivities: [
                "케이블카 타고 권금성 오르기",
                "비선대, 금강굴 등 계곡 트레킹하기",
                "울산바위, 대청봉 등 다양한 난이도의 등산 코스 도전하기",
                "신흥사 방문하기",
                "백담사 계곡에서 휴식하기"
            ],
            tips: [
                "등산 시에는 반드시 편안한 신발과 복장을 착용하세요.",
                "계절에 따라 입산 통제 구간이 있을 수 있으니 사전에 확인하세요.",
                "가을 단풍 시즌에는 매우 인기가 많습니다."
            ],
            bestTimeToVisit: "가을(9-10월 단풍), 여름(7-8월 계곡), 봄(4-5월 야생화)"
        }
    },
    {
        id: "andong",
        name: "7. 안동 (Andong)",
        description: "한국 정신문화의 수도로 불리며, 하회마을 등 전통적인 유교 문화가 잘 보존되어 있는 곳입니다. 고택에서의 하룻밤은 특별한 경험을 선사합니다.",
        image: "https://placehold.co/800x400/FFA07A/000000?text=안동+하회마을+이미지",
        details: {
            recommendedActivities: [
                "안동 하회마을 방문하여 전통 가옥과 생활 모습 보기",
                "하회별신굿탈놀이 관람하기 (공연 시간 확인)",
                "병산서원, 도산서원 등 유서 깊은 서원 방문하기",
                "월영교 야경 감상하기",
                "안동찜닭, 간고등어 등 지역 음식 맛보기"
            ],
            tips: [
                "하회마을은 실제 주민이 거주하는 공간이므로 예의를 지켜주세요.",
                "고택 체험(숙박)을 통해 특별한 추억을 만들 수 있습니다.",
                "안동 국제탈춤페스티벌 기간에 방문하면 더욱 풍성한 볼거리를 즐길 수 있습니다."
            ],
            bestTimeToVisit: "봄(4-5월), 가을(9-10월)"
        }
    },
    {
        id: "suncheon",
        name: "8. 순천만 국가정원 & 습지 (Suncheon Bay)",
        description: "아름다운 정원과 광활한 갈대밭이 펼쳐진 생태 관광지. 다양한 철새들의 낙원이자 자연의 아름다움을 만끽할 수 있는 곳입니다.",
        image: "https://placehold.co/800x400/20B2AA/FFFFFF?text=순천만+갈대밭+이미지",
        details: {
            recommendedActivities: [
                "순천만 국가정원 세계 각국의 정원 관람하기",
                "스카이큐브 타고 순천만 습지로 이동하기",
                "순천만 습지 갈대밭 탐방로 걷기 및 용산 전망대에서 일몰 감상하기",
                "낙안읍성 민속마을 방문하기",
                "드라마 촬영지(오픈세트장) 구경하기"
            ],
            tips: [
                "순천만 습지는 특히 해 질 녘 풍경이 아름답습니다.",
                "봄에는 철쭉, 여름에는 연꽃, 가을에는 갈대와 핑크뮬리가 장관을 이룹니다.",
                "통합 입장권을 구매하면 국가정원과 습지를 모두 이용할 수 있습니다."
            ],
            bestTimeToVisit: "봄(4-5월 꽃), 가을(10-11월 갈대)"
        }
    },
    {
        id: "damyang",
        name: "9. 담양 (Damyang)",
        description: "푸르른 대나무숲 '죽녹원'과 아름다운 메타세쿼이아길로 유명한 힐링 여행지입니다. 자연 속에서 여유로운 시간을 보낼 수 있습니다.",
        image: "https://placehold.co/800x400/98FB98/000000?text=담양+죽녹원+이미지",
        details: {
            recommendedActivities: [
                "죽녹원에서 대나무숲 산책하며 힐링하기",
                "메타세쿼이아 가로수길 걷거나 자전거 타기",
                "관방제림 따라 산책하기",
                "소쇄원 방문하여 한국 전통 정원의 아름다움 느끼기",
                "대통밥, 떡갈비 등 담양 특색 음식 맛보기"
            ],
            tips: [
                "죽녹원은 아침 일찍 방문하면 더욱 한적하게 즐길 수 있습니다.",
                "메타세쿼이아길은 계절마다 다른 매력을 보여줍니다.",
                "자전거 대여소가 잘 되어 있어 이용하기 편리합니다."
            ],
            bestTimeToVisit: "봄(4-5월 신록), 여름(6-8월 푸르름), 가을(9-10월 단풍)"
        }
    },
    {
        id: "tongyeong",
        name: "10. 통영 (Tongyeong)",
        description: "한려수도의 아름다운 섬들을 조망할 수 있는 '동양의 나폴리'. 신선한 해산물과 다양한 액티비티, 예술적인 감성이 넘치는 도시입니다.",
        image: "https://placehold.co/800x400/ADD8E6/000000?text=통영+미륵산+케이블카+이미지",
        details: {
            recommendedActivities: [
                "미륵산 케이블카 타고 한려수도 조망하기",
                "통영 루지 체험하기",
                "동피랑 벽화마을, 서피랑 공원 구경하기",
                "중앙시장에서 활어회, 꿀빵 등 맛보기",
                "이순신 공원, 달아공원 방문하기"
            ],
            tips: [
                "루지는 인기가 많으니 미리 예약하거나 오전에 방문하는 것이 좋습니다.",
                "통영은 굴 요리가 유명하니 제철에 꼭 맛보세요.",
                "유람선을 타고 주변 섬(소매물도, 비진도 등)을 둘러보는 것도 추천합니다."
            ],
            bestTimeToVisit: "봄(4-5월), 가을(9-10월)"
        }
    }
];

let currentPlaceIndex = 0;

// DOM 요소를 즉시 찾지 않고, DOM 로드 후 초기화 함수에서 찾도록 변경
let tourImage, tourPlaceName, tourDescription, prevBtn, nextBtn, tourProgress, quickNavItemsContainer;
let tourRecommendedActivities, tourTips, tourBestTimeToVisit; // 상세 정보를 표시할 요소 추가

// 장소 정보를 화면에 표시하는 함수
function displayPlace(index) {
    if (index < 0 || index >= places.length) return;

    const place = places[index];
    tourImage.src = place.image;
    tourImage.alt = place.name + " 이미지";
    tourPlaceName.textContent = place.name;
    tourDescription.textContent = place.description;

    // 상세 정보 표시
    if (place.details) {
        tourRecommendedActivities.innerHTML = place.details.recommendedActivities.map(activity => `<li>${activity}</li>`).join('');
        tourTips.innerHTML = place.details.tips.map(tip => `<li>${tip}</li>`).join('');
        tourBestTimeToVisit.textContent = place.details.bestTimeToVisit || "정보 없음";
    } else { // 혹시 details 객체가 없는 경우를 대비
        tourRecommendedActivities.innerHTML = '<li>정보 없음</li>';
        tourTips.innerHTML = '<li>정보 없음</li>';
        tourBestTimeToVisit.textContent = "정보 없음";
    }


    tourProgress.textContent = `${index + 1} / ${places.length}`;

    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === places.length - 1;

    updateQuickNavActiveState(index);
}

// 다음 장소로 이동하는 함수
function nextPlace() {
    if (currentPlaceIndex < places.length - 1) {
        currentPlaceIndex++;
        displayPlace(currentPlaceIndex);
    }
}

// 이전 장소로 이동하는 함수
function prevPlace() {
    if (currentPlaceIndex > 0) {
        currentPlaceIndex--;
        displayPlace(currentPlaceIndex);
    }
}

// 특정 장소로 바로 이동하는 함수
function jumpToPlace(index) {
    currentPlaceIndex = index;
    displayPlace(currentPlaceIndex);
}

// 빠른 이동 버튼 생성 함수
function createQuickNavItems() {
    places.forEach((place, index) => {
        const item = document.createElement('span');
        item.classList.add('quick-nav-item');
        const placeKoreanName = place.name.substring(place.name.indexOf(' ') + 1, place.name.indexOf('(') -1 ).trim();
        item.textContent = `${index + 1}. ${placeKoreanName}`;
        item.setAttribute('data-index', index);
        item.addEventListener('click', () => jumpToPlace(index));
        quickNavItemsContainer.appendChild(item);
    });
}

// 빠른 이동 버튼 활성 상태 업데이트 함수
function updateQuickNavActiveState(activeIndex) {
    const items = quickNavItemsContainer.querySelectorAll('.quick-nav-item');
    items.forEach((item, index) => {
        if (index === activeIndex) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// DOM이 로드된 후 실행될 초기화 함수
function initTour() {
    // DOM 요소 가져오기
    tourImage = document.getElementById('tour-image');
    tourPlaceName = document.getElementById('tour-place-name');
    tourDescription = document.getElementById('tour-description');
    prevBtn = document.getElementById('prev-btn');
    nextBtn = document.getElementById('next-btn');
    tourProgress = document.getElementById('tour-progress');
    quickNavItemsContainer = document.getElementById('quick-nav-items');

    // 상세 정보 표시를 위한 DOM 요소
    tourRecommendedActivities = document.getElementById('tour-recommended-activities');
    tourTips = document.getElementById('tour-tips');
    tourBestTimeToVisit = document.getElementById('tour-best-time-to-visit');


    // 요소들이 모두 로드되었는지 확인
    if (!tourImage || !prevBtn || !quickNavItemsContainer || !tourRecommendedActivities || !tourTips || !tourBestTimeToVisit) {
        console.error("Tour DOM elements not found. Script might be loaded before DOM or IDs are incorrect. Check all getElementById calls.");
        return;
    }

    // 이벤트 리스너 등록
    prevBtn.addEventListener('click', prevPlace);
    nextBtn.addEventListener('click', nextPlace);

    // 초기 장소 표시 및 빠른 이동 버튼 생성
    createQuickNavItems();
    displayPlace(currentPlaceIndex);

    // 키보드 화살표 키로 네비게이션
    document.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
            prevPlace();
        } else if (event.key === 'ArrowRight') {
            nextPlace();
        }
    });
}

// DOMContentLoaded 이벤트가 발생하면 initTour 함수 실행
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTour);
} else {
    initTour();
}
