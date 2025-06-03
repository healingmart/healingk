// api/alltourism.js (v3.0 - 다중 API 통합 및 구조 개선)

// 📝 설정 상수 분리
const CONFIG = {
    API: {
        TOURISM_BASE_URL: 'https://apis.data.go.kr/B551011/KorService2',
        KAKAO_BASE_URL: 'https://dapi.kakao.com/v2/local',
        NAVER_BASE_URL: 'https://openapi.naver.com/v1/search'
    },
    DEFAULTS: {
        NUM_OF_ROWS: '10',
        PAGE_NO: '1',
        DETAILED_COUNT: '5',
        SORT_BY: 'readcount',
        SORT_ORDER: 'desc',
        DEFAULT_RADIUS_KM: 50,
        MAX_DISTANCE_KM: 20000,
        EARTH_RADIUS_KM: 6371
    },
    CONTENT_TYPES: {
        '12': { name: '관광지', weight: 15 },
        '14': { name: '문화시설', weight: 12 },
        '15': { name: '축제/공연/행사', weight: 10 },
        '25': { name: '여행코스', weight: 8 },
        '28': { name: '레포츠', weight: 10 },
        '32': { name: '숙박', weight: 20 },
        '38': { name: '쇼핑', weight: 12 },
        '39': { name: '음식점', weight: 25 }
    },
    COMPLETENESS_WEIGHTS: {
        overview: 25,
        tel: 15,
        homepage: 10,
        usetime: 10,
        parking: 5,
        usefee: 5,
        infocenter: 5,
        images: 5,
        intro_base: 20,
        intro_specific: 25
    },
    HIDDEN_GEM_FACTORS: {
        LOW_REVIEW_COUNT: { threshold: 100, score: 30 },
        HIGH_RATING: { threshold: 4.0, score: 25 },
        LOCAL_VISITOR_RATIO: { threshold: 0.7, score: 20 },
        ACCESSIBILITY: { distance: 500, score: 15 },
        PRICE_VALUE: { score: 10 }
    }
};

// 🎯 메인 핸들러 (간소화)
module.exports = async function handler(req, res) {
    // CORS 설정 (환경별 분기)
    setCorsHeaders(res, req);
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const searchParams = parseAndValidateParams(req.query);
        const searchResults = await executeEnhancedSearch(searchParams);
        const response = await buildResponse(searchResults, searchParams);
        
        return res.status(200).json(response);

    } catch (error) {
        console.error('관광 정보 API 오류:', error);
        return res.status(500).json(buildErrorResponse(error));
    }
};

// 🔒 CORS 설정 (환경별)
function setCorsHeaders(res, req) {
    const allowedOrigins = process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com', 'https://www.yourdomain.com']
        : ['*'];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// 📊 파라미터 파싱 및 검증
function parseAndValidateParams(query) {
    const { 
        keyword = '', 
        contentTypeId = '', 
        areaCode = '', 
        sigunguCode = '',
        numOfRows = CONFIG.DEFAULTS.NUM_OF_ROWS,
        pageNo = CONFIG.DEFAULTS.PAGE_NO,
        detailed = 'true',
        detailedCount = CONFIG.DEFAULTS.DETAILED_COUNT,
        sortBy = CONFIG.DEFAULTS.SORT_BY,
        sortOrder = CONFIG.DEFAULTS.SORT_ORDER,
        includeImages = 'true',
        userLat = '',
        userLng = '',
        radius = '',
        debug = 'false',
        enhancedSearch = 'true'  // 🆕 다중 API 사용 여부
    } = query;
    
    // 사용자 위치 검증
    const hasUserLocation = userLat && userLng && 
        userLat.trim() !== '' && userLng.trim() !== '' &&
        !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng));
    
    const radiusKm = radius && !isNaN(parseFloat(radius)) ? parseFloat(radius) : null;
    
    return {
        keyword, contentTypeId, areaCode, sigunguCode,
        numOfRows: parseInt(numOfRows),
        pageNo: parseInt(pageNo),
        detailed: detailed === 'true',
        detailedCount: parseInt(detailedCount),
        sortBy, sortOrder,
        includeImages: includeImages === 'true',
        enhancedSearch: enhancedSearch === 'true',
        hasUserLocation,
        userLocation: hasUserLocation ? {
            lat: parseFloat(userLat),
            lng: parseFloat(userLng)
        } : null,
        radiusKm,
        debug: debug === 'true'
    };
}

// 🚀 향상된 검색 실행
async function executeEnhancedSearch(params) {
    const startTime = Date.now();
    const apiKey = getApiKey();
    
    // 기본 관광공사 API 검색
    const tourismResults = await searchTourismAPI(apiKey, params);
    
    // 다중 API 통합 검색 (enhancedSearch 옵션 활성화 시)
    let enhancedResults = tourismResults;
    if (params.enhancedSearch && params.contentTypeId === '39') {
        enhancedResults = await searchMultipleAPIs(tourismResults, params);
    }
    
    // 거리 계산 및 필터링
    if (params.hasUserLocation) {
        enhancedResults = await calculateDistancesAndFilter(enhancedResults, params);
    }
    
    // 정렬
    enhancedResults.items = sortTourismData(enhancedResults.items, params.sortBy, params.sortOrder);
    
    // 상세 정보 수집
    if (params.detailed && enhancedResults.items.length > 0) {
        enhancedResults.items = await enrichWithDetailedInfo(
            apiKey, 
            enhancedResults.items, 
            params
        );
    }
    
    // 숨은 보석 점수 계산
    enhancedResults.items = enhancedResults.items.map(item => ({
        ...item,
        hiddenGemScore: calculateHiddenGemScore(item, params.contentTypeId),
        categoryInfo: getCategoryInfo(item.cat1, item.cat2, item.cat3),
        areaInfo: getAreaInfo(item.areacode, item.sigungucode),
        typeName: CONFIG.CONTENT_TYPES[item.contentTypeId]?.name || '기타'
    }));
    
    enhancedResults.performance = {
        ...enhancedResults.performance,
        totalTime: Date.now() - startTime
    };
    
    return enhancedResults;
}

// 🔍 다중 API 검색 (맛집 전용)
async function searchMultipleAPIs(tourismResults, params) {
    try {
        const promises = [];
        
        // 카카오 로컬 API (전화번호, 운영시간, 리뷰 등)
        if (process.env.KAKAO_REST_API_KEY && params.hasUserLocation) {
            promises.push(searchKakaoLocal(params));
        }
        
        // 네이버 지역검색 API (추가 정보)
        if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
            promises.push(searchNaverLocal(params));
        }
        
        const [kakaoResults, naverResults] = await Promise.allSettled(promises);
        
        // 결과 통합 및 중복 제거
        return mergeSearchResults(tourismResults, {
            kakao: kakaoResults?.value || [],
            naver: naverResults?.value || []
        });
        
    } catch (error) {
        console.error('다중 API 검색 오류:', error);
        return tourismResults; // 기본 결과 반환
    }
}

// 🗺️ 카카오 로컬 API 검색
async function searchKakaoLocal(params) {
    const kakaoKey = process.env.KAKAO_REST_API_KEY;
    if (!kakaoKey) return [];
    
    const { userLocation, radiusKm } = params;
    const radius = radiusKm ? Math.min(radiusKm * 1000, 20000) : 5000; // 미터 단위
    
    const url = `${CONFIG.API.KAKAO_BASE_URL}/search/keyword.json` +
        `?query=제주맛집&x=${userLocation.lng}&y=${userLocation.lat}&radius=${radius}&sort=distance`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${kakaoKey}` }
        });
        
        const data = await response.json();
        
        return data.documents?.map(place => ({
            title: place.place_name,
            addr1: place.road_address_name || place.address_name,
            tel: place.phone || null,
            mapx: parseFloat(place.x), // 경도
            mapy: parseFloat(place.y), // 위도
            contentTypeId: '39',
            source: 'kakao',
            kakaoId: place.id,
            category: place.category_name,
            placeUrl: place.place_url,
            distance: parseFloat(place.distance) / 1000 // km 변환
        })) || [];
        
    } catch (error) {
        console.error('카카오 API 오류:', error);
        return [];
    }
}

// 🔍 네이버 지역검색 API
async function searchNaverLocal(params) {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) return [];
    
    const query = `제주맛집`;
    const url = `${CONFIG.API.NAVER_BASE_URL}/local.json?query=${encodeURIComponent(query)}&display=20&sort=comment`;
    
    try {
        const response = await fetch(url, {
            headers: {
                'X-Naver-Client-Id': clientId,
                'X-Naver-Client-Secret': clientSecret
            }
        });
        
        const data = await response.json();
        
        return data.items?.map(place => ({
            title: place.title.replace(/<[^>]*>/g, ''),
            addr1: place.address,
            tel: place.telephone || null,
            mapx: null, // 네이버 API는 좌표 제공 안함
            mapy: null,
            contentTypeId: '39',
            source: 'naver',
            category: place.category,
            description: place.description?.replace(/<[^>]*>/g, ''),
            link: place.link
        })) || [];
        
    } catch (error) {
        console.error('네이버 API 오류:', error);
        return [];
    }
}

// 🔗 검색 결과 통합
function mergeSearchResults(tourismResults, externalResults) {
    const merged = [...tourismResults.items];
    const { kakao = [], naver = [] } = externalResults;
    
    // 카카오 결과 통합 (좌표 기반 중복 제거)
    kakao.forEach(kakaoPlace => {
        const isDuplicate = merged.some(existing => 
            existing.mapx && existing.mapy &&
            Math.abs(existing.mapx - kakaoPlace.mapx) < 0.001 &&
            Math.abs(existing.mapy - kakaoPlace.mapy) < 0.001
        );
        
        if (!isDuplicate) {
            merged.push({
                ...kakaoPlace,
                contentId: `kakao_${kakaoPlace.kakaoId}`,
                isEnhanced: true
            });
        }
    });
    
    // 네이버 결과 통합 (제목 기반 중복 제거)
    naver.forEach(naverPlace => {
        const isDuplicate = merged.some(existing => 
            similarity(existing.title, naverPlace.title) > 0.8
        );
        
        if (!isDuplicate) {
            merged.push({
                ...naverPlace,
                contentId: `naver_${Date.now()}_${Math.random()}`,
                isEnhanced: true
            });
        }
    });
    
    return {
        ...tourismResults,
        items: merged,
        enhancedCount: kakao.length + naver.length
    };
}

// 📊 숨은 보석 점수 계산 (개선된 버전)
function calculateHiddenGemScore(place, contentTypeId) {
    let score = 0;
    const factors = CONFIG.HIDDEN_GEM_FACTORS;
    
    // 기본 점수 (콘텐츠 타입별 가중치)
    score += CONFIG.CONTENT_TYPES[contentTypeId]?.weight || 10;
    
    // 리뷰 수 vs 평점 비율 (숨은 보석의 핵심 지표)
    if (place.reviewCount && place.rating) {
        if (place.reviewCount < factors.LOW_REVIEW_COUNT.threshold && 
            place.rating > factors.HIGH_RATING.threshold) {
            score += factors.LOW_REVIEW_COUNT.score;
        }
    }
    
    // 전화번호 있음 (실제 운영 중인 곳)
    if (place.tel) score += 15;
    
    // 관광공사 미등록 (진짜 숨은 곳)
    if (place.source && place.source !== 'tourism') score += 20;
    
    // 접근성 (대중교통에서 떨어진 곳)
    if (place.distance && place.distance > 3) score += 10;
    
    // 상세 정보 완성도
    if (place.detailed?.completeness > 70) score += 10;
    
    // 이미지 있음
    if (place.firstimage) score += 5;
    
    // 운영시간 정보 있음
    if (place.detailed?.intro?.openTime) score += 10;
    
    return Math.min(score, 100);
}

// 🎯 상세 정보 수집 (모듈화)
async function enrichWithDetailedInfo(apiKey, items, params) {
    const maxDetailed = Math.min(params.detailedCount, items.length, 10);
    const detailedItems = items.slice(0, maxDetailed);
    
    const detailedPromises = detailedItems.map(async (item, index) => {
        try {
            // 관광공사 API 상세 정보
            if (item.contentId && !item.contentId.includes('_')) {
                const detailInfo = await getEnhancedDetailedInfo(
                    apiKey, 
                    item.contentId, 
                    item.contentTypeId, 
                    { includeImages: params.includeImages }
                );
                return { ...item, detailed: detailInfo };
            }
            
            // 외부 API 상세 정보 (카카오, 네이버)
            if (item.source === 'kakao' && item.kakaoId) {
                const kakaoDetail = await getKakaoPlaceDetail(item.kakaoId);
                return { 
                    ...item, 
                    detailed: buildExternalDetailInfo(kakaoDetail, 'kakao')
                };
            }
            
            return item;
            
        } catch (error) {
            console.error(`상세 정보 수집 실패 (${item.contentId}):`, error.message);
            return {
                ...item,
                detailed: { 
                    error: error.message, 
                    completeness: 20,
                    hasError: true,
                    type: CONFIG.CONTENT_TYPES[item.contentTypeId]?.name || '기타'
                }
            };
        }
    });
    
    const detailedResults = await Promise.all(detailedPromises);
    return [...detailedResults, ...items.slice(maxDetailed)];
}

// 🏷️ 완성도 계산 (설정 기반)
function calculateCompleteness(commonData, introData, imageData) {
    let score = 20; // 기본 점수
    const weights = CONFIG.COMPLETENESS_WEIGHTS;
    
    // 공통 정보 점수
    if (commonData?.overview) score += weights.overview;
    if (commonData?.tel) score += weights.tel;
    if (commonData?.homepage) score += weights.homepage;
    if (commonData?.usetime) score += weights.usetime;
    if (commonData?.parking) score += weights.parking;
    if (commonData?.usefee) score += weights.usefee;
    if (commonData?.infocenter) score += weights.infocenter;
    
    // 소개 정보 점수
    if (introData) score += weights.intro_base;
    
    // 이미지 점수
    if (imageData?.length > 0) score += weights.images;
    
    return Math.min(score, 100);
}

// 🔍 유사도 계산 (제목 중복 검사용)
function similarity(str1, str2) {
    const normalize = (str) => str.toLowerCase().replace(/[^가-힣a-z0-9]/g, '');
    const s1 = normalize(str1);
    const s2 = normalize(str2);
    
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
}

// 🔑 API 키 가져오기
function getApiKey() {
    const apiKey = process.env.TOURISM_API_KEY || 
                   process.env.TOUR_API_KEY || 
                   process.env.JEONBUK_API_KEY;
    
    if (!apiKey) {
        throw new Error('API 키가 설정되지 않았습니다');
    }
    
    return apiKey;
}

// 🏗️ 응답 구성
async function buildResponse(searchResults, searchParams) {
    const response = {
        success: true,
        data: {
            items: searchResults.items,
            totalCount: searchResults.totalCount || searchResults.items.length,
            pageNo: searchParams.pageNo,
            numOfRows: searchParams.numOfRows,
            hasNext: (searchParams.pageNo * searchParams.numOfRows) < 
                    (searchResults.totalCount || searchResults.items.length),
            resultInfo: buildResultInfo(searchResults.items),
            enhancedInfo: searchParams.enhancedSearch ? {
                multiApiUsed: true,
                enhancedCount: searchResults.enhancedCount || 0,
                hiddenGemAvgScore: calculateAverageHiddenGemScore(searchResults.items)
            } : null
        },
        searchParams: {
            ...searchParams,
            userLocation: searchParams.hasUserLocation ? searchParams.userLocation : null
        },
        performance: searchResults.performance,
        timestamp: new Date().toISOString(),
        version: '3.0.0'
    };
    
    // 상세 정보 통계 추가
    if (searchParams.detailed) {
        response.data.detailStats = buildDetailStats(searchResults.items);
    }
    
    return response;
}

// 📊 결과 정보 구성
function buildResultInfo(items) {
    return {
        actualCount: items.length,
        detailedCount: items.filter(item => item.detailed).length,
        withImages: items.filter(item => item.firstimage).length,
        withCoordinates: items.filter(item => item.mapx && item.mapy).length,
        withDistance: items.filter(item => item.distance !== undefined && item.distance !== null).length,
        withPhone: items.filter(item => item.tel).length,
        avgHiddenGemScore: calculateAverageHiddenGemScore(items),
        enhancedItems: items.filter(item => item.isEnhanced).length
    };
}

// 🎯 평균 숨은 보석 점수 계산
function calculateAverageHiddenGemScore(items) {
    if (items.length === 0) return 0;
    
    const scores = items
        .filter(item => item.hiddenGemScore !== undefined)
        .map(item => item.hiddenGemScore);
    
    return scores.length > 0 
        ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length)
        : 0;
}

// ❌ 에러 응답 구성
function buildErrorResponse(error) {
    return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date().toISOString(),
        version: '3.0.0'
    };
}

// 기존 함수들 (거리 계산, 정렬, 상세 정보 등)은 그대로 유지...
// (calculateDistance, sortTourismData, getEnhancedDetailedInfo, etc.)
