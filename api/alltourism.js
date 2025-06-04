// ===== TourAPI 4.0 v4.3 완전 구현 시스템 =====

// 설정 및 상수
const SUPPORTED_OPERATIONS = [
    'areaCode', 'categoryCode', 'areaBasedList', 'locationBasedList', 
    'searchKeyword', 'searchFestival', 'searchStay', 'detailCommon', 
    'detailIntro', 'detailInfo', 'detailImage', 'areaBasedSyncList',
    'detailPetTour', 'ldongCode', 'lclsSystmCode'
];

const SECURITY_CONFIG = {
    allowedOrigins: [
        'https://your-blog.com',
        'https://www.your-blog.com', 
        'https://your-travel-site.com',
        'http://localhost:3000',
        'http://localhost:8080'
    ],
    allowedApiKeys: process.env.ALLOWED_API_KEYS ? 
        process.env.ALLOWED_API_KEYS.split(',') : []
};

// 콘텐츠 타입 매핑 (매뉴얼 기준)
const CONTENT_TYPE_MAP = {
    '12': '관광지',
    '14': '문화시설', 
    '15': '축제/공연/행사',
    '25': '여행코스',
    '28': '레포츠',
    '32': '숙박',
    '38': '쇼핑',
    '39': '음식점'
};

// 지역 코드 매핑 (매뉴얼 기준)
const AREA_CODE_MAP = {
    '1': '서울', '2': '인천', '3': '대전', '4': '대구', '5': '광주',
    '6': '부산', '7': '울산', '8': '세종', '31': '경기', '32': '강원',
    '33': '충북', '34': '충남', '35': '경북', '36': '경남', '37': '전북',
    '38': '전남', '39': '제주'
};

// 간단한 LRU 캐시 구현
class SimpleCache {
    constructor() {
        this.cache = new Map();
        this.maxSize = 1000;
        this.ttl = 30 * 60 * 1000; // 30분
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        item.accessed = Date.now();
        return item.data;
    }

    set(key, data) {
        if (this.cache.size >= this.maxSize) {
            // LRU 삭제
            let oldestKey = null;
            let oldestTime = Date.now();
            
            for (const [k, v] of this.cache.entries()) {
                if (v.accessed < oldestTime) {
                    oldestTime = v.accessed;
                    oldestKey = k;
                }
            }
            
            if (oldestKey) {
                this.cache.delete(oldestKey);
            }
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            accessed: Date.now()
        });
    }

    clear() {
        this.cache.clear();
    }

    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxSize
        };
    }
}

const cache = new SimpleCache();

// 보안 검증
function checkSecurity(req, res) {
    const origin = req.headers.origin;
    
    if (origin && SECURITY_CONFIG.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (SECURITY_CONFIG.allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
        throw new Error('허용되지 않은 Origin입니다');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, X-Request-ID');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    
    // 보안 헤더 추가
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // API 키 검증 (선택적)
    if (SECURITY_CONFIG.allowedApiKeys.length > 0) {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || !SECURITY_CONFIG.allowedApiKeys.includes(apiKey)) {
            throw new Error('유효하지 않은 API 키입니다');
        }
    }
}

// HTTP 요청 함수 (재시도 포함)
async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'HealingK-TourAPI/4.3.0',
                    'Accept': 'application/json,application/xml'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            console.warn(`🔄 API 요청 재시도 ${i + 1}/${maxRetries}: ${error.message}`);
            
            if (i === maxRetries - 1) throw error;
            
            // 지수 백오프
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
        }
    }
}

// API 응답 검증
function validateApiResponse(data, operation) {
    if (!data) {
        throw new Error('API 응답이 없습니다');
    }
    
    const resultCode = data.resultCode || data.response?.header?.resultCode;
    
    if (resultCode !== '0' && resultCode !== '0000') {
        const errorMessage = data.response?.header?.resultMsg || '알 수 없는 오류';
        throw new Error(`${operation} API 오류: ${errorMessage} (코드: ${resultCode})`);
    }
    
    return true;
}

// 아이템 추출
function extractItems(data) {
    const items = data.response?.body?.items?.item || data.items?.item || [];
    return Array.isArray(items) ? items : items ? [items] : [];
}

// 기본 아이템 처리 (매뉴얼 v4.3 기준)
function processBasicItem(item) {
    const mapx = item.mapx && item.mapx !== '' && item.mapx !== '0' ? parseFloat(item.mapx) : null;
    const mapy = item.mapy && item.mapy !== '' && item.mapy !== '0' ? parseFloat(item.mapy) : null;

    return {
        contentId: item.contentid,
        contentTypeId: item.contenttypeid,
        title: item.title,
        addr1: item.addr1 || null,
        addr2: item.addr2 || null,
        zipcode: item.zipcode || null,
        tel: item.tel || null,
        firstimage: item.firstimage || null,
        firstimage2: item.firstimage2 || null,
        cpyrhtDivCd: item.cpyrhtDivCd || null,
        mapx: mapx,
        mapy: mapy,
        mlevel: item.mlevel || null,
        areacode: item.areacode || null,
        sigungucode: item.sigungucode || null,
        cat1: item.cat1 || null,
        cat2: item.cat2 || null,
        cat3: item.cat3 || null,
        createdtime: item.createdtime || null,
        modifiedtime: item.modifiedtime || null,
        // v4.3 신규 필드들
        lDongRegnCd: item.lDongRegnCd || null,
        lDongSignguCd: item.lDongSignguCd || null,
        lclsSystm1: item.lclsSystm1 || null,
        lclsSystm2: item.lclsSystm2 || null,
        lclsSystm3: item.lclsSystm3 || null,
        // 메타데이터
        typeName: CONTENT_TYPE_MAP[item.contenttypeid] || '기타',
        areaName: AREA_CODE_MAP[item.areacode] || '기타'
    };
}

// 거리 계산 (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    try {
        const R = 6371; // 지구 반지름 (km)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    } catch {
        return null;
    }
}

// ===== API 핸들러 함수들 (매뉴얼 완전 준수) =====

// 1. 지역코드 조회
async function handleAreaCode(apiKey, params) {
    const { areaCode = '', numOfRows = '100', pageNo = '1' } = params;
    const cacheKey = `areaCode:${areaCode}:${numOfRows}:${pageNo}`;
    
    let cached = cache.get(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const url = `https://apis.data.go.kr/B551011/KorService2/areaCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}${areaCode ? `&areaCode=${areaCode}` : ''}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'areaCode');

    const items = extractItems(data);
    const result = {
        data: items.map(item => ({
            code: item.code,
            name: item.name,
            rnum: item.rnum
        })),
        metadata: {
            operation: 'areaCode',
            totalCount: data.response?.body?.totalCount || items.length
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// 2. 서비스분류코드 조회
async function handleCategoryCode(apiKey, params) {
    const { contentTypeId = '', cat1 = '', cat2 = '', cat3 = '', numOfRows = '100', pageNo = '1' } = params;
    const cacheKey = `categoryCode:${contentTypeId}:${cat1}:${cat2}:${cat3}:${numOfRows}:${pageNo}`;
    
    let cached = cache.get(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    let url = `https://apis.data.go.kr/B551011/KorService2/categoryCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}`;
    
    if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'categoryCode');

    const items = extractItems(data);
    const result = {
        data: items.map(item => ({
            code: item.code,
            name: item.name,
            rnum: item.rnum
        })),
        metadata: {
            operation: 'categoryCode',
            contentTypeId,
            totalCount: data.response?.body?.totalCount || items.length
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// 3. 지역기반 관광정보 조회 (매뉴얼 v4.3 완전 준수)
async function handleAreaBasedList(apiKey, params) {
    const {
        numOfRows = '10', pageNo = '1', arrange = 'C',
        contentTypeId = '', areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
        lDongRegnCd = '', lDongSignguCd = '',
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = '',
        userLat = '', userLng = '', radius = ''
    } = params;

    const cacheKey = `areaBasedList:${JSON.stringify({
        numOfRows, pageNo, arrange, contentTypeId, areaCode, sigunguCode,
        cat1, cat2, cat3, modifiedtime, lDongRegnCd, lDongSignguCd,
        lclsSystm1, lclsSystm2, lclsSystm3
    })}`;
    
    let cached = cache.get(cacheKey);
    if (cached && !userLat && !userLng) {
        return { ...cached, fromCache: true };
    }

    let url = `https://apis.data.go.kr/B551011/KorService2/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}`;
    
    // 매뉴얼에 따른 모든 파라미터 추가
    if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;
    if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
    if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'areaBasedList');

    const items = extractItems(data);
    let processedItems = items.map(item => processBasicItem(item));

    // 거리 계산 및 정렬
    if (userLat && userLng && userLat.trim() !== '' && userLng.trim() !== '') {
        const userLatNum = parseFloat(userLat);
        const userLngNum = parseFloat(userLng);
        
        processedItems = processedItems.map(item => {
            if (item.mapx && item.mapy) {
                const distance = calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                return { ...item, distance: distance ? Math.round(distance * 100) / 100 : null };
            }
            return { ...item, distance: null };
        });

        // 반경 필터링
        if (radius && !isNaN(parseFloat(radius))) {
            const radiusKm = parseFloat(radius);
            processedItems = processedItems.filter(item => 
                item.distance === null || item.distance <= radiusKm
            );
        }

        // 거리순 정렬
        processedItems.sort((a, b) => {
            const distA = a.distance !== null ? a.distance : 999999;
            const distB = b.distance !== null ? b.distance : 999999;
            return distA - distB;
        });
    }

    const result = {
        data: {
            items: processedItems,
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows),
                hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
            }
        },
        metadata: {
            operation: 'areaBasedList',
            searchParams: { contentTypeId, areaCode, sigunguCode, cat1, cat2, cat3 },
            itemCount: processedItems.length
        }
    };

    if (!userLat && !userLng) {
        cache.set(cacheKey, result);
    }
    
    return result;
}

// 4. 위치기반 관광정보 조회
async function handleLocationBasedList(apiKey, params) {
    const {
        numOfRows = '10', pageNo = '1', arrange = 'E',
        contentTypeId = '', mapX, mapY, radius,
        areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
        lDongRegnCd = '', lDongSignguCd = '',
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = ''
    } = params;

    if (!mapX || !mapY || !radius) {
        throw new Error('위치기반 검색에는 mapX, mapY, radius가 필수입니다');
    }

    let url = `https://apis.data.go.kr/B551011/KorService2/locationBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&mapX=${mapX}&mapY=${mapY}&radius=${radius}`;
    
    if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;
    if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
    if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'locationBasedList');

    const items = extractItems(data);
    const processedItems = items.map(item => ({
        ...processBasicItem(item),
        dist: parseFloat(item.dist) || null // API에서 제공하는 거리
    }));

    return {
        data: {
            items: processedItems,
            searchCenter: {
                lat: parseFloat(mapY),
                lng: parseFloat(mapX),
                radius: parseFloat(radius)
            },
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows)
            }
        },
        metadata: {
            operation: 'locationBasedList',
            searchParams: { mapX, mapY, radius, contentTypeId },
            itemCount: processedItems.length
        }
    };
}

// 5. 키워드 검색 조회
async function handleSearchKeyword(apiKey, params) {
    const {
        numOfRows = '10', pageNo = '1', arrange = 'C',
        keyword, areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '',
        lDongRegnCd = '', lDongSignguCd = '',
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = '',
        userLat = '', userLng = '', radius = ''
    } = params;

    if (!keyword || keyword.trim() === '') {
        throw new Error('키워드 검색에는 keyword가 필수입니다');
    }

    let url = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&keyword=${encodeURIComponent(keyword)}`;
    
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
    if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'searchKeyword');

    const items = extractItems(data);
    let processedItems = items.map(item => processBasicItem(item));

    // 거리 계산 (키워드 검색에서도 위치 정보가 있으면 적용)
    if (userLat && userLng && userLat.trim() !== '' && userLng.trim() !== '') {
        const userLatNum = parseFloat(userLat);
        const userLngNum = parseFloat(userLng);
        
        processedItems = processedItems.map(item => {
            if (item.mapx && item.mapy) {
                const distance = calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                return { ...item, distance: distance ? Math.round(distance * 100) / 100 : null };
            }
            return { ...item, distance: null };
        });

        processedItems.sort((a, b) => {
            const distA = a.distance !== null ? a.distance : 999999;
            const distB = b.distance !== null ? b.distance : 999999;
            return distA - distB;
        });
    }

    return {
        data: {
            items: processedItems,
            searchKeyword: keyword,
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows)
            }
        },
        metadata: {
            operation: 'searchKeyword',
            searchParams: { keyword, areaCode, cat1 },
            itemCount: processedItems.length
        }
    };
}

// 6. 행사정보 조회
async function handleSearchFestival(apiKey, params) {
    const {
        numOfRows = '10', pageNo = '1', arrange = 'C',
        eventStartDate, eventEndDate = '',
        areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
        lDongRegnCd = '', lDongSignguCd = '',
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = ''
    } = params;

    if (!eventStartDate) {
        throw new Error('행사정보 조회에는 eventStartDate가 필수입니다');
    }

    let url = `https://apis.data.go.kr/B551011/KorService2/searchFestival2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&eventStartDate=${eventStartDate}`;
    
    if (eventEndDate) url += `&eventEndDate=${eventEndDate}`;
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;
    if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
    if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'searchFestival');

    const items = extractItems(data);
    const processedItems = items.map(item => ({
        ...processBasicItem(item),
        eventstartdate: item.eventstartdate,
        eventenddate: item.eventenddate,
        progresstype: item.progresstype || null,
        festivaltype: item.festivaltype || null
    }));

    return {
        data: {
            items: processedItems,
            eventPeriod: {
                startDate: eventStartDate,
                endDate: eventEndDate || null
            },
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows)
            }
        },
        metadata: {
            operation: 'searchFestival',
            searchParams: { eventStartDate, eventEndDate, areaCode },
            itemCount: processedItems.length
        }
    };
}

// 7. 숙박정보 조회
async function handleSearchStay(apiKey, params) {
    const {
        numOfRows = '10', pageNo = '1', arrange = 'C',
        areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '', modifiedtime = '',
        lDongRegnCd = '', lDongSignguCd = '',
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = ''
    } = params;

    let url = `https://apis.data.go.kr/B551011/KorService2/searchStay2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}`;
    
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;
    if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
    if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'searchStay');

    const items = extractItems(data);
    const processedItems = items.map(item => processBasicItem(item));

    return {
        data: {
            items: processedItems,
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows)
            }
        },
        metadata: {
            operation: 'searchStay',
            searchParams: { areaCode, cat1 },
            itemCount: processedItems.length
        }
    };
}

// 8. 공통정보 조회
async function handleDetailCommon(apiKey, params) {
    const { contentId } = params;

    if (!contentId) {
        throw new Error('공통정보 조회에는 contentId가 필수입니다');
    }

    const cacheKey = `detailCommon:${contentId}`;
    let cached = cache.get(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'detailCommon');

    const items = extractItems(data);
    if (items.length === 0) {
        throw new Error('데이터를 찾을 수 없습니다');
    }

    const item = items[0];
    const processedItem = {
        contentId: item.contentid,
        contentTypeId: item.contenttypeid,
        title: item.title,
        createdtime: item.createdtime,
        modifiedtime: item.modifiedtime,
        tel: item.tel || null,
        telname: item.telname || null,
        homepage: item.homepage?.replace(/<[^>]*>/g, '') || null,
        firstimage: item.firstimage || null,
        firstimage2: item.firstimage2 || null,
        cpyrhtDivCd: item.cpyrhtDivCd || null,
        areacode: item.areacode,
        sigungucode: item.sigungucode,
        cat1: item.cat1,
        cat2: item.cat2,
        cat3: item.cat3,
        addr1: item.addr1,
        addr2: item.addr2 || null,
        zipcode: item.zipcode || null,
        mapx: parseFloat(item.mapx) || null,
        mapy: parseFloat(item.mapy) || null,
        mlevel: item.mlevel || null,
        overview: item.overview || null,
        // v4.3 신규 필드들
        lDongRegnCd: item.lDongRegnCd || null,
        lDongSignguCd: item.lDongSignguCd || null,
        lclsSystm1: item.lclsSystm1 || null,
        lclsSystm2: item.lclsSystm2 || null,
        lclsSystm3: item.lclsSystm3 || null,
        // 메타데이터
        typeName: CONTENT_TYPE_MAP[item.contenttypeid] || '기타',
        areaName: AREA_CODE_MAP[item.areacode] || '기타'
    };

    const result = {
        data: processedItem,
        metadata: {
            operation: 'detailCommon',
            contentId
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// 9. 소개정보 조회 (매뉴얼 완전 준수)
async function handleDetailIntro(apiKey, params) {
    const { contentId, contentTypeId } = params;

    if (!contentId || !contentTypeId) {
        throw new Error('소개정보 조회에는 contentId와 contentTypeId가 필수입니다');
    }

    const cacheKey = `detailIntro:${contentId}:${contentTypeId}`;
    let cached = cache.get(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    const url = `https://apis.data.go.kr/B551011/KorService2/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'detailIntro');

    const items = extractItems(data);
    if (items.length === 0) {
        throw new Error('데이터를 찾을 수 없습니다');
    }

    const item = items[0];
    
    // 매뉴얼에 따른 contentTypeId별 처리
    let processedItem = {
        contentId: item.contentid,
        contentTypeId: item.contenttypeid,
        typeName: CONTENT_TYPE_MAP[contentTypeId] || '기타'
    };

    // 타입별 상세 정보 매핑 (매뉴얼 v4.3 기준)
    switch (contentTypeId) {
        case '12': // 관광지
            processedItem = {
                ...processedItem,
                accomcount: item.accomcount || null,
                chkbabycarriage: item.chkbabycarriage || null,
                chkcreditcard: item.chkcreditcard || null,
                chkpet: item.chkpet || null,
                expagerange: item.expagerange || null,
                expguide: item.expguide || null,
                heritage1: item.heritage1 || null,
                heritage2: item.heritage2 || null,
                heritage3: item.heritage3 || null,
                infocenter: item.infocenter || null,
                opendate: item.opendate || null,
                parking: item.parking || null,
                restdate: item.restdate || null,
                useseason: item.useseason || null,
                usetime: item.usetime || null
            };
            break;

        case '14': // 문화시설
            processedItem = {
                ...processedItem,
                accomcountculture: item.accomcountculture || null,
                chkbabycarriageculture: item.chkbabycarriageculture || null,
                chkcreditcardculture: item.chkcreditcardculture || null,
                chkpetculture: item.chkpetculture || null,
                discountinfo: item.discountinfo || null,
                infocenterculture: item.infocenterculture || null,
                parkingculture: item.parkingculture || null,
                parkingfee: item.parkingfee || null,
                restdateculture: item.restdateculture || null,
                usefee: item.usefee || null,
                usetimeculture: item.usetimeculture || null,
                scale: item.scale || null,
                spendtime: item.spendtime || null
            };
            break;

        case '15': // 행사/공연/축제
            processedItem = {
                ...processedItem,
                agelimit: item.agelimit || null,
                bookingplace: item.bookingplace || null,
                discountinfofestival: item.discountinfofestival || null,
                eventenddate: item.eventenddate || null,
                eventhomepage: item.eventhomepage || null,
                eventplace: item.eventplace || null,
                eventstartdate: item.eventstartdate || null,
                festivalgrade: item.festivalgrade || null,
                placeinfo: item.placeinfo || null,
                playtime: item.playtime || null,
                program: item.program || null,
                spendtimefestival: item.spendtimefestival || null,
                sponsor1: item.sponsor1 || null,
                sponsor1tel: item.sponsor1tel || null,
                sponsor2: item.sponsor2 || null,
                sponsor2tel: item.sponsor2tel || null,
                subevent: item.subevent || null,
                usetimefestival: item.usetimefestival || null
            };
            break;

        case '32': // 숙박
            processedItem = {
                ...processedItem,
                accomcountlodging: item.accomcountlodging || null,
                checkintime: item.checkintime || null,
                checkouttime: item.checkouttime || null,
                chkcooking: item.chkcooking || null,
                foodplace: item.foodplace || null,
                infocenterlodging: item.infocenterlodging || null,
                parkinglodging: item.parkinglodging || null,
                pickup: item.pickup || null,
                roomcount: item.roomcount || null,
                reservationlodging: item.reservationlodging || null,
                reservationurl: item.reservationurl || null,
                roomtype: item.roomtype || null,
                scalelodging: item.scalelodging || null,
                subfacility: item.subfacility || null,
                barbecue: item.barbecue || null,
                beauty: item.beauty || null,
                beverage: item.beverage || null,
                bicycle: item.bicycle || null,
                campfire: item.campfire || null,
                fitness: item.fitness || null,
                karaoke: item.karaoke || null,
                publicbath: item.publicbath || null,
                publicpc: item.publicpc || null,
                sauna: item.sauna || null,
                seminar: item.seminar || null,
                sports: item.sports || null,
                refundregulation: item.refundregulation || null
            };
            break;

        case '39': // 음식점
            processedItem = {
                ...processedItem,
                chkcreditcardfood: item.chkcreditcardfood || null,
                discountinfofood: item.discountinfofood || null,
                firstmenu: item.firstmenu || null,
                infocenterfood: item.infocenterfood || null,
                kidsfacility: item.kidsfacility || null,
                lcnsno: item.lcnsno || null,
                opendatefood: item.opendatefood || null,
                opentimefood: item.opentimefood || null,
                packing: item.packing || null,
                parkingfood: item.parkingfood || null,
                reservationfood: item.reservationfood || null,
                restdatefood: item.restdatefood || null,
                scalefood: item.scalefood || null,
                seat: item.seat || null,
                smoking: item.smoking || null,
                treatmenu: item.treatmenu || null
            };
            break;

        // 다른 타입들도 매뉴얼에 따라 추가 가능
        default:
            // 매뉴얼에 명시되지 않은 타입은 기본 정보만
            break;
    }

    const result = {
        data: processedItem,
        metadata: {
            operation: 'detailIntro',
            contentId,
            contentTypeId,
            typeName: CONTENT_TYPE_MAP[contentTypeId] || '기타'
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// 10. 반복정보 조회
async function handleDetailInfo(apiKey, params) {
    const { contentId, contentTypeId } = params;

    if (!contentId || !contentTypeId) {
        throw new Error('반복정보 조회에는 contentId와 contentTypeId가 필수입니다');
    }

    const url = `https://apis.data.go.kr/B551011/KorService2/detailInfo2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'detailInfo');

    const items = extractItems(data);
    
    // 매뉴얼에 따른 contentTypeId별 처리
    const processedItems = items.map(item => {
        if (contentTypeId === '32') { // 숙박 - 객실정보
            return {
                contentId: item.contentid,
                contentTypeId: item.contenttypeid,
                type: 'room',
                roomcode: item.roomcode || null,
                roomtitle: item.roomtitle || null,
                roomsize1: item.roomsize1 || null,
                roomsize2: item.roomsize2 || null,
                roomcount: item.roomcount || null,
                roombasecount: item.roombasecount || null,
                roommaxcount: item.roommaxcount || null,
                roomoffseasonminfee1: item.roomoffseasonminfee1 || null,
                roomoffseasonminfee2: item.roomoffseasonminfee2 || null,
                roompeakseasonminfee1: item.roompeakseasonminfee1 || null,
                roompeakseasonminfee2: item.roompeakseasonminfee2 || null,
                roomintro: item.roomintro || null,
                // 객실 시설 정보들
                roombathfacility: item.roombathfacility || null,
                roombath: item.roombath || null,
                roomhometheater: item.roomhometheater || null,
                roomaircondition: item.roomaircondition || null,
                roomtv: item.roomtv || null,
                roompc: item.roompc || null,
                roomcable: item.roomcable || null,
                roominternet: item.roominternet || null,
                roomrefrigerator: item.roomrefrigerator || null,
                roomtoiletries: item.roomtoiletries || null,
                roomsofa: item.roomsofa || null,
                roomcook: item.roomcook || null,
                roomtable: item.roomtable || null,
                roomhairdryer: item.roomhairdryer || null,
                // 객실 이미지들
                roomimg1: item.roomimg1 || null,
                roomimg1alt: item.roomimg1alt || null,
                cpyrhtDivCd1: item.cpyrhtDivCd1 || null,
                roomimg2: item.roomimg2 || null,
                roomimg2alt: item.roomimg2alt || null,
                cpyrhtDivCd2: item.cpyrhtDivCd2 || null,
                roomimg3: item.roomimg3 || null,
                roomimg3alt: item.roomimg3alt || null,
                cpyrhtDivCd3: item.cpyrhtDivCd3 || null,
                roomimg4: item.roomimg4 || null,
                roomimg4alt: item.roomimg4alt || null,
                cpyrhtDivCd4: item.cpyrhtDivCd4 || null,
                roomimg5: item.roomimg5 || null,
                roomimg5alt: item.roomimg5alt || null,
                cpyrhtDivCd5: item.cpyrhtDivCd5 || null
            };
        } else if (contentTypeId === '25') { // 여행코스 - 코스정보
            return {
                contentId: item.contentid,
                contentTypeId: item.contenttypeid,
                type: 'course',
                subcontentid: item.subcontentid || null,
                subname: item.subname || null,
                subdetailoverview: item.subdetailoverview || null,
                subdetailimg: item.subdetailimg || null,
                subdetailalt: item.subdetailalt || null,
                subnum: item.subnum || null
            };
        } else { // 기타 - 일반 반복정보
            return {
                contentId: item.contentid,
                contentTypeId: item.contenttypeid,
                type: 'general',
                fldgubun: item.fldgubun || null,
                infoname: item.infoname || null,
                infotext: item.infotext || null,
                serialnum: item.serialnum || null
            };
        }
    });

    return {
        data: processedItems,
        metadata: {
            operation: 'detailInfo',
            contentId,
            contentTypeId,
            typeName: CONTENT_TYPE_MAP[contentTypeId] || '기타',
            itemCount: processedItems.length
        }
    };
}

// 11. 이미지정보 조회
async function handleDetailImage(apiKey, params) {
    const { contentId, imageYN = 'Y' } = params;

    if (!contentId) {
        throw new Error('이미지정보 조회에는 contentId가 필수입니다');
    }

    const url = `https://apis.data.go.kr/B551011/KorService2/detailImage2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&imageYN=${imageYN}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'detailImage');

    const items = extractItems(data);
    const processedItems = items.map(item => ({
        contentId: item.contentid,
        originimgurl: item.originimgurl,
        smallimageurl: item.smallimageurl,
        cpyrhtDivCd: item.cpyrhtDivCd || null,
        imgname: item.imgname || null,
        serialnum: item.serialnum || null
    }));

    return {
        data: processedItems,
        metadata: {
            operation: 'detailImage',
            contentId,
            imageYN,
            imageCount: processedItems.length
        }
    };
}

// 12. 동기화 목록 조회
async function handleAreaBasedSyncList(apiKey, params) {
    const {
        numOfRows = '10', pageNo = '1', showflag = '1',
        modifiedtime = '', arrange = 'C',
        contentTypeId = '', areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '',
        lDongRegnCd = '', lDongSignguCd = '',
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = '',
        oldContentid = ''
    } = params;

    let url = `https://apis.data.go.kr/B551011/KorService2/areaBasedSyncList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&showflag=${showflag}&arrange=${arrange}`;
    
    if (modifiedtime) url += `&modifiedtime=${modifiedtime}`;
    if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;
    if (lDongSignguCd) url += `&lDongSignguCd=${lDongSignguCd}`;
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;
    if (oldContentid) url += `&oldContentid=${oldContentid}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'areaBasedSyncList');

    const items = extractItems(data);
    const processedItems = items.map(item => ({
        ...processBasicItem(item),
        showflag: item.showflag,
        // v4.3 신규 필드들 포함됨
    }));

    return {
        data: {
            items: processedItems,
            syncInfo: {
                showflag: showflag === '1' ? '표출' : '비표출',
                modifiedtime: modifiedtime || 'all'
            },
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows)
            }
        },
        metadata: {
            operation: 'areaBasedSyncList',
            searchParams: params,
            itemCount: processedItems.length
        }
    };
}

// 13. 반려동물 여행정보 조회 (v4.1 신규)
async function handleDetailPetTour(apiKey, params) {
    const { contentId = '' } = params;

    const url = `https://apis.data.go.kr/B551011/KorService2/detailPetTour2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json${contentId ? `&contentId=${contentId}` : ''}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'detailPetTour');

    const items = extractItems(data);
    const processedItems = items.map(item => ({
        contentId: item.contentid,
        petTursmInfo: item.petTursmInfo || null,
        relaAcdntRiskMtr: item.relaAcdntRiskMtr || null,
        acmpyTypeCd: item.acmpyTypeCd || null,
        relaPosesFclty: item.relaPosesFclty || null,
        relaFrnshPrdlst: item.relaFrnshPrdlst || null,
        etcAcmpyInfo: item.etcAcmpyInfo || null,
        relaPurcPrdlst: item.relaPurcPrdlst || null,
        acmpyPsblCpam: item.acmpyPsblCpam || null,
        relaRntlPrdlst: item.relaRntlPrdlst || null,
        acmpyNeedMtr: item.acmpyNeedMtr || null
    }));

    return {
        data: processedItems,
        metadata: {
            operation: 'detailPetTour',
            contentId: contentId || 'all',
            petInfoCount: processedItems.length
        }
    };
}

// 14. 법정동코드 조회 (v4.3 신규)
async function handleLdongCode(apiKey, params) {
    const {
        lDongRegnCd = '', lDongListYn = 'N',
        numOfRows = '1000', pageNo = '1'
    } = params;

    const cacheKey = `ldongCode:${lDongRegnCd}:${lDongListYn}:${numOfRows}:${pageNo}`;
    let cached = cache.get(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    let url = `https://apis.data.go.kr/B551011/KorService2/ldongCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&lDongListYn=${lDongListYn}`;
    
    if (lDongRegnCd) url += `&lDongRegnCd=${lDongRegnCd}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'ldongCode');

    const items = extractItems(data);
    const processedItems = items.map(item => {
        if (lDongListYn === 'Y') {
            return {
                lDongRegnCd: item.lDongRegnCd,
                lDongRegnNm: item.lDongRegnNm,
                lDongSignguCd: item.lDongSignguCd,
                lDongSignguNm: item.lDongSignguNm,
                rnum: item.rnum
            };
        } else {
            return {
                code: item.code,
                name: item.name,
                rnum: item.rnum
            };
        }
    });

    const result = {
        data: processedItems,
        metadata: {
            operation: 'ldongCode',
            lDongRegnCd: lDongRegnCd || 'all',
            listMode: lDongListYn === 'Y',
            codeCount: processedItems.length
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// 15. 분류체계코드 조회 (v4.3 신규)
async function handleLclsSystmCode(apiKey, params) {
    const {
        lclsSystm1 = '', lclsSystm2 = '', lclsSystm3 = '',
        lclsSystmListYn = 'N', numOfRows = '1000', pageNo = '1'
    } = params;

    const cacheKey = `lclsSystmCode:${lclsSystm1}:${lclsSystm2}:${lclsSystm3}:${lclsSystmListYn}:${numOfRows}:${pageNo}`;
    let cached = cache.get(cacheKey);
    if (cached) return { ...cached, fromCache: true };

    let url = `https://apis.data.go.kr/B551011/KorService2/lclsSystmCode2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&lclsSystmListYn=${lclsSystmListYn}`;
    
    if (lclsSystm1) url += `&lclsSystm1=${lclsSystm1}`;
    if (lclsSystm2) url += `&lclsSystm2=${lclsSystm2}`;
    if (lclsSystm3) url += `&lclsSystm3=${lclsSystm3}`;

    const response = await fetchWithRetry(url);
    const data = await response.json();
    validateApiResponse(data, 'lclsSystmCode');

    const items = extractItems(data);
    const processedItems = items.map(item => {
        if (lclsSystmListYn === 'Y') {
            return {
                lclsSystm1Cd: item.lclsSystm1Cd,
                lclsSystm1Nm: item.lclsSystm1Nm,
                lclsSystm2Cd: item.lclsSystm2Cd,
                lclsSystm2Nm: item.lclsSystm2Nm,
                lclsSystm3Cd: item.lclsSystm3Cd,
                lclsSystm3Nm: item.lclsSystm3Nm,
                rnum: item.rnum
            };
        } else {
            return {
                code: item.code,
                name: item.name,
                rnum: item.rnum
            };
        }
    });

    const result = {
        data: processedItems,
        metadata: {
            operation: 'lclsSystmCode',
            searchParams: { lclsSystm1, lclsSystm2, lclsSystm3 },
            listMode: lclsSystmListYn === 'Y',
            codeCount: processedItems.length
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// ===== 메인 핸들러 =====
module.exports = async function handler(req, res) {
    const startTime = Date.now();
    
    try {
        // 보안 검사
        checkSecurity(req, res);
        
        if (req.method === 'OPTIONS') {
            return res.status(200).end();
        }

        const { operation = 'areaBasedList', ...params } = req.method === 'GET' ? req.query : req.body;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다',
                code: 'MISSING_API_KEY'
            });
        }

        console.log(`🚀 TourAPI v4.3 요청: ${operation}`, { 
            params: Object.keys(params),
            timestamp: new Date().toISOString(),
            userAgent: req.headers['user-agent']
        });

        let result;

        // 매뉴얼 v4.3에 따른 오퍼레이션 라우팅
        switch (operation) {
            case 'areaCode':
                result = await handleAreaCode(apiKey, params);
                break;
            case 'categoryCode':
                result = await handleCategoryCode(apiKey, params);
                break;
            case 'areaBasedList':
            case 'search': // 호환성을 위한 별칭
                result = await handleAreaBasedList(apiKey, params);
                break;
            case 'locationBasedList':
                result = await handleLocationBasedList(apiKey, params);
                break;
            case 'searchKeyword':
                result = await handleSearchKeyword(apiKey, params);
                break;
            case 'searchFestival':
                result = await handleSearchFestival(apiKey, params);
                break;
            case 'searchStay':
                result = await handleSearchStay(apiKey, params);
                break;
            case 'detailCommon':
                result = await handleDetailCommon(apiKey, params);
                break;
            case 'detailIntro':
                result = await handleDetailIntro(apiKey, params);
                break;
            case 'detailInfo':
                result = await handleDetailInfo(apiKey, params);
                break;
            case 'detailImage':
                result = await handleDetailImage(apiKey, params);
                break;
            case 'areaBasedSyncList':
                result = await handleAreaBasedSyncList(apiKey, params);
                break;
            case 'detailPetTour':
                result = await handleDetailPetTour(apiKey, params);
                break;
            case 'ldongCode':
                result = await handleLdongCode(apiKey, params);
                break;
            case 'lclsSystmCode':
                result = await handleLclsSystmCode(apiKey, params);
                break;
            default:
                return res.status(400).json({
                    success: false,
                    message: `지원하지 않는 오퍼레이션: ${operation}`,
                    supportedOperations: SUPPORTED_OPERATIONS,
                    code: 'UNSUPPORTED_OPERATION'
                });
        }

        const totalTime = Date.now() - startTime;
        
        return res.status(200).json({
            success: true,
            operation,
            data: result.data,
            metadata: {
                ...result.metadata,
                performance: {
                    ...result.metadata?.performance,
                    totalTime,
                    timestamp: new Date().toISOString(),
                    fromCache: result.fromCache || false
                },
                version: '4.3.0',
                apiVersion: 'TourAPI 4.0 v4.3',
                cacheStats: cache.getStats()
            }
        });

    } catch (error) {
        console.error('🚨 TourAPI v4.3 오류:', error);
        
        const statusCode = error.message.includes('허용되지 않은') ? 403 : 500;
        
        return res.status(statusCode).json({
            success: false,
            message: error.message,
            code: error.code || 'INTERNAL_SERVER_ERROR',
            operation: req.query.operation || req.body?.operation,
            timestamp: new Date().toISOString(),
            version: '4.3.0'
        });
    }
};
