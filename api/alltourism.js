// ===== 설정 및 상수 =====
const SUPPORTED_OPERATIONS = [
    'search', 'areaBasedList', 'locationBasedList', 'searchKeyword',
    'searchFestival', 'searchStay', 'detailCommon', 'detailIntro',
    'detailInfo', 'detailImage', 'detailPetTour', 'areaCode',
    'categoryCode', 'ldongCode', 'lclsSystmCode', 'areaBasedSyncList',
    'getAllData', 'popularDestinations', 'recommendations'
];

const SECURITY_CONFIG = {
    allowedOrigins: [
        'https://your-blog.com',
        'https://www.your-blog.com',
        'https://your-travel-site.com',
        'http://localhost:3000', // 개발용
        'http://localhost:8080'  // 개발용
    ],
    allowedApiKeys: process.env.ALLOWED_API_KEYS ? 
        process.env.ALLOWED_API_KEYS.split(',') : [],
    rateLimit: {
        windowMs: 15 * 60 * 1000,
        maxRequests: 1000
    }
};

// ===== 간단한 캐시 구현 =====
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
        
        return item.data;
    }

    set(key, data) {
        if (this.cache.size >= this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        
        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }
}

const cache = new SimpleCache();

// ===== 보안 미들웨어 =====
function checkSecurity(req, res) {
    // CORS 설정
    const origin = req.headers.origin;
    
    if (origin && SECURITY_CONFIG.allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (SECURITY_CONFIG.allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
        throw new Error('허용되지 않은 Origin입니다');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Referer 검증
    const referer = req.headers.referer || req.headers.referrer;
    if (referer && !isValidReferer(referer)) {
        throw new Error('허용되지 않은 Referer입니다');
    }

    // API 키 검증 (선택적)
    if (SECURITY_CONFIG.allowedApiKeys.length > 0) {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey || !SECURITY_CONFIG.allowedApiKeys.includes(apiKey)) {
            throw new Error('유효하지 않은 API 키입니다');
        }
    }
}

function isValidReferer(referer) {
    try {
        const url = new URL(referer);
        return SECURITY_CONFIG.allowedOrigins.some(origin => {
            if (origin === '*') return true;
            const allowedUrl = new URL(origin);
            return url.hostname === allowedUrl.hostname;
        });
    } catch {
        return false;
    }
}

// ===== 유틸리티 함수들 =====
function calculateDistance(lat1, lon1, lat2, lon2) {
    try {
        const R = 6371;
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

async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, {
                timeout: 10000,
                headers: { 'User-Agent': 'HealingK-TourAPI/5.0.0' }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
    }
}

function validateApiResponse(data, operation) {
    const resultCode = data.resultCode || data.response?.header?.resultCode;
    
    if (resultCode !== '0' && resultCode !== '0000') {
        const errorMessage = data.response?.header?.resultMsg || '알 수 없는 오류';
        throw new Error(`${operation} API 오류: ${errorMessage}`);
    }
}

function extractItems(data) {
    const items = data.response?.body?.items?.item || data.items?.item || [];
    return Array.isArray(items) ? items : items ? [items] : [];
}

function processBasicItem(item) {
    return {
        contentId: item.contentid,
        contentTypeId: item.contenttypeid,
        title: item.title,
        addr1: item.addr1 || null,
        addr2: item.addr2 || null,
        tel: item.tel || null,
        firstimage: item.firstimage || null,
        firstimage2: item.firstimage2 || null,
        mapx: parseFloat(item.mapx) || null,
        mapy: parseFloat(item.mapy) || null,
        areacode: item.areacode || null,
        sigungucode: item.sigungucode || null,
        cat1: item.cat1 || null,
        cat2: item.cat2 || null,
        cat3: item.cat3 || null,
        readcount: parseInt(item.readcount) || 0,
        modifiedtime: item.modifiedtime || null,
        typeName: getContentTypeName(item.contenttypeid)
    };
}

function getContentTypeName(contentTypeId) {
    const typeMap = {
        '12': '관광지', '14': '문화시설', '15': '축제/공연/행사',
        '25': '여행코스', '28': '레포츠', '32': '숙박',
        '38': '쇼핑', '39': '음식점'
    };
    return typeMap[contentTypeId] || '기타';
}

// ===== API 핸들러 함수들 =====
async function handleAreaBasedSearch(apiKey, params) {
    const cacheKey = `area:${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, metadata: { ...cached.metadata, fromCache: true } };

    const {
        numOfRows = '10', pageNo = '1', arrange = 'C',
        contentTypeId = '', areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '', detailed = 'false',
        userLat = '', userLng = '', radius = ''
    } = params;

    const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2';
    let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}`;
    
    if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;

    const startTime = Date.now();
    const response = await fetchWithRetry(url);
    const data = await response.json();
    const searchTime = Date.now() - startTime;

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
            searchParams: params,
            performance: { searchTime, itemCount: processedItems.length }
        }
    };

    cache.set(cacheKey, result);
    return result;
}

async function handleLocationBasedSearch(apiKey, params) {
    const { mapX, mapY, radius } = params;
    
    if (!mapX || !mapY || !radius) {
        throw new Error('위치기반 검색에는 mapX, mapY, radius가 필수입니다');
    }

    const cacheKey = `location:${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, metadata: { ...cached.metadata, fromCache: true } };

    const {
        numOfRows = '10', pageNo = '1', arrange = 'E',
        contentTypeId = '', areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = ''
    } = params;

    const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2';
    let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&mapX=${mapX}&mapY=${mapY}&radius=${radius}`;
    
    if (contentTypeId) url += `&contentTypeId=${contentTypeId}`;
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;

    const startTime = Date.now();
    const response = await fetchWithRetry(url);
    const data = await response.json();
    const searchTime = Date.now() - startTime;

    validateApiResponse(data, 'locationBasedList');

    const items = extractItems(data);
    const processedItems = items.map(item => ({
        ...processBasicItem(item),
        dist: parseFloat(item.dist) || null
    }));

    const result = {
        data: {
            items: processedItems,
            pagination: {
                totalCount: data.response?.body?.totalCount || processedItems.length,
                pageNo: parseInt(pageNo),
                numOfRows: parseInt(numOfRows),
                hasNext: (parseInt(pageNo) * parseInt(numOfRows)) < (data.response?.body?.totalCount || 0)
            },
            searchCenter: {
                lat: parseFloat(mapY),
                lng: parseFloat(mapX),
                radius: parseFloat(radius)
            }
        },
        metadata: {
            operation: 'locationBasedList',
            searchParams: params,
            performance: { searchTime, itemCount: processedItems.length }
        }
    };

    cache.set(cacheKey, result);
    return result;
}

async function handleKeywordSearch(apiKey, params) {
    const { keyword } = params;
    
    if (!keyword || keyword.trim() === '') {
        throw new Error('키워드 검색에는 keyword가 필수입니다');
    }

    const cacheKey = `keyword:${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, metadata: { ...cached.metadata, fromCache: true } };

    const {
        numOfRows = '10', pageNo = '1', arrange = 'C',
        areaCode = '', sigunguCode = '',
        cat1 = '', cat2 = '', cat3 = '',
        userLat = '', userLng = '', radius = ''
    } = params;

    const baseUrl = 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2';
    let url = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}&arrange=${arrange}&keyword=${encodeURIComponent(keyword)}`;
    
    if (areaCode) url += `&areaCode=${areaCode}`;
    if (sigunguCode) url += `&sigunguCode=${sigunguCode}`;
    if (cat1) url += `&cat1=${cat1}`;
    if (cat2) url += `&cat2=${cat2}`;
    if (cat3) url += `&cat3=${cat3}`;

    const startTime = Date.now();
    const response = await fetchWithRetry(url);
    const data = await response.json();
    const searchTime = Date.now() - startTime;

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

        // 거리순 정렬 (관련도와 거리의 조합)
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
            },
            searchKeyword: keyword
        },
        metadata: {
            operation: 'searchKeyword',
            searchParams: params,
            performance: { searchTime, itemCount: processedItems.length }
        }
    };

    cache.set(cacheKey, result);
    return result;
}

async function handleDetailCommon(apiKey, params) {
    const { contentId } = params;

    if (!contentId) {
        throw new Error('공통정보 조회에는 contentId가 필수입니다');
    }

    const cacheKey = `detail:${contentId}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, metadata: { ...cached.metadata, fromCache: true } };

    const url = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`;

    const startTime = Date.now();
    const response = await fetchWithRetry(url);
    const data = await response.json();
    const searchTime = Date.now() - startTime;

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
        overview: item.overview || null,
        typeName: getContentTypeName(item.contenttypeid)
    };

    const result = {
        data: processedItem,
        metadata: {
            operation: 'detailCommon',
            contentId,
            performance: { searchTime }
        }
    };

    cache.set(cacheKey, result);
    return result;
}

// 간단한 추천 시스템
async function handleRecommendations(apiKey, params) {
    const {
        contentId = '',
        areaCode = '',
        contentTypeId = '',
        userLat = '',
        userLng = '',
        limit = '10'
    } = params;

    const cacheKey = `recommendations:${JSON.stringify(params)}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, metadata: { ...cached.metadata, fromCache: true } };

    // 기본 검색으로 데이터 가져오기
    const searchParams = {
        numOfRows: '50',
        pageNo: '1',
        arrange: 'R', // 인기순
        areaCode,
        contentTypeId
    };

    const searchResult = await handleAreaBasedSearch(apiKey, searchParams);
    let items = searchResult.data.items;

    // 현재 아이템 제외
    if (contentId) {
        items = items.filter(item => item.contentId !== contentId);
    }

    // 거리 기반 정렬 (위치 정보가 있는 경우)
    if (userLat && userLng) {
        const userLatNum = parseFloat(userLat);
        const userLngNum = parseFloat(userLng);
        
        items = items.map(item => {
            if (item.mapx && item.mapy) {
                const distance = calculateDistance(userLatNum, userLngNum, item.mapy, item.mapx);
                return { ...item, distance: distance ? Math.round(distance * 100) / 100 : null };
            }
            return { ...item, distance: null };
        });

        // 거리와 인기도 조합 점수
        items = items.map(item => {
            let score = item.readcount || 0;
            
            // 거리 보너스 (가까울수록 높은 점수)
            if (item.distance !== null) {
                if (item.distance <= 5) score += 1000;
                else if (item.distance <= 15) score += 500;
                else if (item.distance <= 30) score += 200;
            }
            
            return { ...item, recommendationScore: score };
        });

        items.sort((a, b) => b.recommendationScore - a.recommendationScore);
    }

    const recommendations = items.slice(0, parseInt(limit));

    const result = {
        data: {
            recommendations,
            algorithm: 'location_popularity_hybrid',
            explanation: userLat && userLng ? 
                '위치와 인기도를 종합적으로 고려한 추천' : 
                '인기도 기반 추천'
        },
        metadata: {
            operation: 'recommendations',
            searchParams: params,
            recommendationCount: recommendations.length,
            performance: { searchTime: 0 }
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

        const { operation = 'search', ...params } = req.method === 'GET' ? req.query : req.body;
        
        const apiKey = process.env.TOURISM_API_KEY || process.env.TOUR_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ 
                success: false, 
                message: 'API 키가 설정되지 않았습니다',
                code: 'MISSING_API_KEY'
            });
        }

        console.log(`🚀 TourAPI 요청: ${operation}`, { 
            params: Object.keys(params),
            timestamp: new Date().toISOString()
        });

        let result;

        // 오퍼레이션별 라우팅
        switch (operation) {
            case 'search':
            case 'areaBasedList':
                result = await handleAreaBasedSearch(apiKey, params);
                break;
            case 'locationBasedList':
                result = await handleLocationBasedSearch(apiKey, params);
                break;
            case 'searchKeyword':
                result = await handleKeywordSearch(apiKey, params);
                break;
            case 'detailCommon':
                result = await handleDetailCommon(apiKey, params);
                break;
            case 'recommendations':
                result = await handleRecommendations(apiKey, params);
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
                    timestamp: new Date().toISOString()
                },
                version: '5.0.0',
                apiVersion: 'TourAPI 4.0 Enhanced'
            }
        });

    } catch (error) {
        console.error('🚨 TourAPI 오류:', error);
        
        return res.status(error.message.includes('허용되지 않은') ? 403 : 500).json({
            success: false,
            message: error.message,
            code: error.code || 'INTERNAL_SERVER_ERROR',
            operation: req.query.operation || req.body?.operation,
            timestamp: new Date().toISOString()
        });
    }
};
