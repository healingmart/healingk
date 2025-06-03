// api/alltourism.js (v3.0 - 완전 버전)

// 📝 설정 상수
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
    },
    AREA_MAP: {
        '1': '서울', '2': '인천', '3': '대전', '4': '대구', '5': '광주',
        '6': '부산', '7': '울산', '8': '세종', '31': '경기', '32': '강원',
        '33': '충북', '34': '충남', '35': '경북', '36': '경남', '37': '전북',
        '38': '전남', '39': '제주'
    },
    CATEGORY_MAP: {
        'A01': '자연', 'A02': '인문(문화/예술/역사)', 'A03': '레포츠',
        'A04': '쇼핑', 'A05': '음식', 'B02': '숙박'
    }
};

// 🎯 메인 핸들러
module.exports = async function handler(req, res) {
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

// 🔒 CORS 설정
function setCorsHeaders(res, req) {
    const allowedOrigins = process.env.NODE_ENV === 'production' 
        ? (process.env.ALLOWED_ORIGINS?.split(',') || ['https://yourdomain.com'])
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
        enhancedSearch = 'true'
    } = query;
    
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
    
    // 다중 API 통합 검색
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
    
    // 숨은 보석 점수 계산 및 메타데이터 추가
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

// 🔍 관광공사 API 검색 (기존 함수 복원)
async function searchTourismAPI(apiKey, params) {
    const searchUrl = buildSearchUrl(apiKey, params);
    
    if (params.debug) {
        console.log(`검색 URL: ${searchUrl}`);
    }

    const startTime = Date.now();
    const response = await fetch(searchUrl);
    const data = await response.json();
    const searchTime = Date.now() - startTime;
    
    const resultCode = data.resultCode || data.response?.header?.resultCode;
    
    if (resultCode !== '0' && resultCode !== '0000') {
        throw new Error(`데이터 조회 실패: ${data.response?.header?.resultMsg || '알 수 없는 오류'}`);
    }

    const items = data.response?.body?.items?.item || [];
    const itemList = Array.isArray(items) ? items : items ? [items] : [];
    
    // 기본 데이터 매핑
    const tourismData = itemList.map(item => {
        let mapx = null;
        let mapy = null;
        
        if (item.mapx && item.mapx !== '' && item.mapx !== '0') {
            const parsedX = parseFloat(item.mapx);
            if (!isNaN(parsedX) && parsedX !== 0) {
                mapx = parsedX;
            }
        }
        
        if (item.mapy && item.mapy !== '' && item.mapy !== '0') {
            const parsedY = parseFloat(item.mapy);
            if (!isNaN(parsedY) && parsedY !== 0) {
                mapy = parsedY;
            }
        }
        
        return {
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            title: item.title,
            addr1: item.addr1,
            addr2: item.addr2 || null,
            tel: item.tel || null,
            firstimage: item.firstimage || null,
            firstimage2: item.firstimage2 || null,
            mapx: mapx,
            mapy: mapy,
            mlevel: item.mlevel || null,
            areacode: item.areacode || null,
            sigungucode: item.sigungucode || null,
            cat1: item.cat1 || null,
            cat2: item.cat2 || null,
            cat3: item.cat3 || null,
            readcount: parseInt(item.readcount) || 0,
            modifiedtime: item.modifiedtime || null,
            zipcode: item.zipcode || null,
            createdtime: item.createdtime || null,
            booktour: item.booktour || null,
            source: 'tourism'
        };
    });

    return {
        items: tourismData,
        totalCount: data.response?.body?.totalCount || tourismData.length,
        performance: { searchTime }
    };
}

// 🔍 다중 API 검색
async function searchMultipleAPIs(tourismResults, params) {
    try {
        const promises = [];
        
        // 카카오 로컬 API
        if (process.env.KAKAO_REST_API_KEY && params.hasUserLocation) {
            promises.push(searchKakaoLocal(params));
        }
        
        // 네이버 지역검색 API
        if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET) {
            promises.push(searchNaverLocal(params));
        }
        
        const results = await Promise.allSettled(promises);
        const kakaoResults = results[0]?.status === 'fulfilled' ? results[0].value : [];
        const naverResults = results[1]?.status === 'fulfilled' ? results[1].value : [];
        
        return mergeSearchResults(tourismResults, {
            kakao: kakaoResults,
            naver: naverResults
        });
        
    } catch (error) {
        console.error('다중 API 검색 오류:', error);
        return tourismResults;
    }
}

// 🗺️ 카카오 로컬 API 검색
async function searchKakaoLocal(params) {
    const kakaoKey = process.env.KAKAO_REST_API_KEY;
    if (!kakaoKey) return [];
    
    const { userLocation, radiusKm } = params;
    const radius = radiusKm ? Math.min(radiusKm * 1000, 20000) : 5000;
    
    const url = `${CONFIG.API.KAKAO_BASE_URL}/search/keyword.json` +
        `?query=제주맛집&x=${userLocation.lng}&y=${userLocation.lat}&radius=${radius}&sort=distance`;
    
    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `KakaoAK ${kakaoKey}` }
        });
        
        if (!response.ok) {
            throw new Error(`카카오 API 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        return data.documents?.map(place => ({
            title: place.place_name,
            addr1: place.road_address_name || place.address_name,
            tel: place.phone || null,
            mapx: parseFloat(place.x),
            mapy: parseFloat(place.y),
            contentTypeId: '39',
            contentId: `kakao_${place.id}`,
            source: 'kakao',
            kakaoId: place.id,
            category: place.category_name,
            placeUrl: place.place_url,
            distance: parseFloat(place.distance) / 1000,
            isEnhanced: true
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
        
        if (!response.ok) {
            throw new Error(`네이버 API 오류: ${response.status}`);
        }
        
        const data = await response.json();
        
        return data.items?.map(place => ({
            title: place.title.replace(/<[^>]*>/g, ''),
            addr1: place.address,
            tel: place.telephone || null,
            mapx: null,
            mapy: null,
            contentTypeId: '39',
            contentId: `naver_${Date.now()}_${Math.random()}`,
            source: 'naver',
            category: place.category,
            description: place.description?.replace(/<[^>]*>/g, ''),
            link: place.link,
            isEnhanced: true
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
    
    // 카카오 결과 통합
    kakao.forEach(kakaoPlace => {
        const isDuplicate = merged.some(existing => 
            existing.mapx && existing.mapy &&
            Math.abs(existing.mapx - kakaoPlace.mapx) < 0.001 &&
            Math.abs(existing.mapy - kakaoPlace.mapy) < 0.001
        );
        
        if (!isDuplicate) {
            merged.push(kakaoPlace);
        }
    });
    
    // 네이버 결과 통합
    naver.forEach(naverPlace => {
        const isDuplicate = merged.some(existing => 
            similarity(existing.title, naverPlace.title) > 0.8
        );
        
        if (!isDuplicate) {
            merged.push(naverPlace);
        }
    });
    
    return {
        ...tourismResults,
        items: merged,
        enhancedCount: kakao.length + naver.length
    };
}

// 📏 거리 계산 및 필터링
async function calculateDistancesAndFilter(results, params) {
    const { userLocation, radiusKm, debug } = params;
    let distanceCalculated = 0;
    let distanceErrors = 0;
    
    // 거리 계산
    const itemsWithDistance = results.items.map((item, index) => {
        if (item.mapx && item.mapy) {
            try {
                const distance = calculateDistance(
                    userLocation.lat, 
                    userLocation.lng, 
                    item.mapy, 
                    item.mapx
                );
                
                if (distance !== null && !isNaN(distance) && distance >= 0) {
                    distanceCalculated++;
                    return { ...item, distance: Math.round(distance * 100) / 100 };
                } else {
                    distanceErrors++;
                    return { ...item, distance: null };
                }
            } catch (error) {
                distanceErrors++;
                if (debug) {
                    console.error(`거리 계산 예외 (${item.title}):`, error.message);
                }
                return { ...item, distance: null };
            }
        } else {
            return { ...item, distance: null };
        }
    });
    
    // 반경 필터링
    let filteredItems = itemsWithDistance;
    if (radiusKm && radiusKm > 0) {
        const beforeFilter = itemsWithDistance.length;
        const itemsWithValidDistance = itemsWithDistance.filter(item => item.distance !== null);
        const itemsWithoutDistance = itemsWithDistance.filter(item => item.distance === null);
        
        const filteredWithDistance = itemsWithValidDistance.filter(item => item.distance <= radiusKm);
        
        if (filteredWithDistance.length === 0 && radiusKm <= CONFIG.DEFAULTS.DEFAULT_RADIUS_KM) {
            filteredItems = itemsWithoutDistance.slice(0, Math.min(params.numOfRows, 10));
        } else {
            filteredItems = filteredWithDistance;
        }
        
        if (debug) {
            console.log(`반경 필터링 (${radiusKm}km): ${beforeFilter} → ${filteredItems.length}`);
        }
    }
    
    return {
        ...results,
        items: filteredItems,
        distanceStats: { calculated: distanceCalculated, errors: distanceErrors }
    };
}

// 🔢 거리 계산 함수 (Haversine)
function calculateDistance(lat1, lon1, lat2, lon2) {
    try {
        const latitude1 = Number(lat1);
        const longitude1 = Number(lon1);
        const latitude2 = Number(lat2);
        const longitude2 = Number(lon2);
        
        if (isNaN(latitude1) || isNaN(longitude1) || isNaN(latitude2) || isNaN(longitude2)) {
            return null;
        }
        
        if (latitude1 < -90 || latitude1 > 90 || latitude2 < -90 || latitude2 > 90) {
            return null;
        }
        
        if (longitude1 < -180 || longitude1 > 180 || longitude2 < -180 || longitude2 > 180) {
            return null;
        }
        
        const R = CONFIG.DEFAULTS.EARTH_RADIUS_KM;
        const dLat = (latitude2 - latitude1) * Math.PI / 180;
        const dLon = (longitude2 - longitude1) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(latitude1 * Math.PI / 180) * Math.cos(latitude2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        if (isNaN(distance) || distance < 0 || distance > CONFIG.DEFAULTS.MAX_DISTANCE_KM) {
            return null;
        }
        
        return distance;
        
    } catch (error) {
        return null;
    }
}

// 🔧 검색 URL 구성
function buildSearchUrl(apiKey, params) {
    const { keyword, contentTypeId, areaCode, sigunguCode, numOfRows, pageNo } = params;
    
    let baseUrl;
    let searchUrl;
    
    if (keyword) {
        baseUrl = `${CONFIG.API.TOURISM_BASE_URL}/searchKeyword2`;
        searchUrl = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&keyword=${encodeURIComponent(keyword)}&numOfRows=${numOfRows}&pageNo=${pageNo}`;
    } else {
        baseUrl = `${CONFIG.API.TOURISM_BASE_URL}/areaBasedList2`;
        searchUrl = `${baseUrl}?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&numOfRows=${numOfRows}&pageNo=${pageNo}`;
    }
    
    if (contentTypeId) searchUrl += `&contentTypeId=${contentTypeId}`;
    if (areaCode) searchUrl += `&areaCode=${areaCode}`;
    if (sigunguCode) searchUrl += `&sigunguCode=${sigunguCode}`;
    
    return searchUrl;
}

// 📊 정렬 함수
function sortTourismData(data, sortBy, sortOrder) {
    return data.sort((a, b) => {
        let aVal, bVal;
        
        switch (sortBy) {
            case 'distance':
                aVal = a.distance !== null && a.distance !== undefined ? a.distance : 999999;
                bVal = b.distance !== null && b.distance !== undefined ? b.distance : 999999;
                break;
            case 'hiddenGemScore':
                aVal = a.hiddenGemScore || 0;
                bVal = b.hiddenGemScore || 0;
                break;
            case 'modifiedtime':
                aVal = a.modifiedtime || '0';
                bVal = b.modifiedtime || '0';
                break;
            case 'readcount':
            default:
                aVal = a.readcount || 0;
                bVal = b.readcount || 0;
                break;
        }
        
        if (sortOrder === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });
}

// 🎯 상세 정보 수집
async function enrichWithDetailedInfo(apiKey, items, params) {
    const maxDetailed = Math.min(params.detailedCount, items.length, 10);
    const detailedItems = items.slice(0, maxDetailed);
    
    const detailedPromises = detailedItems.map(async (item, index) => {
        try {
            if (item.contentId && !item.contentId.includes('_')) {
                const detailInfo = await getEnhancedDetailedInfo(
                    apiKey, 
                    item.contentId, 
                    item.contentTypeId, 
                    { includeImages: params.includeImages }
                );
                return { ...item, detailed: detailInfo };
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

// 📋 상세 정보 수집 (기존 함수)
async function getEnhancedDetailedInfo(apiKey, contentId, contentTypeId, options = {}) {
    try {
        const urls = [
            `${CONFIG.API.TOURISM_BASE_URL}/detailCommon2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}`,
            `${CONFIG.API.TOURISM_BASE_URL}/detailIntro2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&contentTypeId=${contentTypeId}`
        ];
        
        if (options.includeImages) {
            urls.push(`${CONFIG.API.TOURISM_BASE_URL}/detailImage2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=HealingK&_type=json&contentId=${contentId}&imageYN=Y`);
        }
        
        const responses = await Promise.all(urls.map(url => fetch(url)));
        const dataArray = await Promise.all(responses.map(res => res.json()));
        
        const [commonData, introData, imageData] = dataArray;
        
        let detailed = { 
            completeness: 20,
            hasError: false,
            type: CONFIG.CONTENT_TYPES[contentTypeId]?.name || '기타',
            collectedAt: new Date().toISOString()
        };
        
        // 공통 정보 처리
        const commonCode = commonData.resultCode || commonData.response?.header?.resultCode;
        if (commonCode === '0' || commonCode === '0000') {
            const commonItem = commonData.response?.body?.items?.item || commonData.items?.item || commonData.item;
            if (commonItem) {
                const itemData = Array.isArray(commonItem) ? commonItem[0] : commonItem;
                detailed.common = {
                    overview: itemData.overview || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage?.replace(/<[^>]*>/g, '') || null,
                    usetime: itemData.usetime || null,
                    parking: itemData.parking || null,
                    usefee: itemData.usefee || null,
                    restdate: itemData.restdate || null,
                    infocenter: itemData.infocenter || null
                };
                
                detailed.completeness += calculateCommonCompleteness(detailed.common);
            }
        }
        
        // 소개 정보 처리
        const introCode = introData.resultCode || introData.response?.header?.resultCode;
        if (introCode === '0' || introCode === '0000') {
            const introItem = introData.response?.body?.items?.item || introData.items?.item || introData.item;
            if (introItem) {
                const itemData = Array.isArray(introItem) ? introItem[0] : introItem;
                detailed.intro = buildIntroData(contentTypeId, itemData);
                detailed.completeness += calculateIntroCompleteness(contentTypeId, detailed.intro);
            }
        }
        
        // 이미지 정보 처리
        if (options.includeImages && imageData) {
            const imageCode = imageData.resultCode || imageData.response?.header?.resultCode;
            if (imageCode === '0' || imageCode === '0000') {
                const imageItems = imageData.response?.body?.items?.item || [];
                const imageList = Array.isArray(imageItems) ? imageItems : [imageItems];
                detailed.images = imageList.map(img => ({
                    originimgurl: img.originimgurl,
                    smallimageurl: img.smallimageurl,
                    cpyrhtDivCd: img.cpyrhtDivCd,
                    imgname: img.imgname,
                    serialnum: img.serialnum
                })).filter(img => img.originimgurl);
                
                if (detailed.images.length > 0) detailed.completeness += CONFIG.COMPLETENESS_WEIGHTS.images;
            }
        }
        
        detailed.completeness = Math.min(detailed.completeness, 100);
        return detailed;
        
    } catch (error) {
        return { 
            completeness: 20, 
            hasError: true, 
            error: error.message,
            type: CONFIG.CONTENT_TYPES[contentTypeId]?.name || '기타'
        };
    }
}

// 📊 완성도 계산 함수들
function calculateCommonCompleteness(common) {
    let score = 0;
    const weights = CONFIG.COMPLETENESS_WEIGHTS;
    
    if (common.overview) score += weights.overview;
    if (common.tel) score += weights.tel;
    if (common.homepage) score += weights.homepage;
    if (common.usetime) score += weights.usetime;
    if (common.parking) score += weights.parking;
    if (common.usefee) score += weights.usefee;
    if (common.infocenter) score += weights.infocenter;
    
    return score;
}

function calculateIntroCompleteness(contentTypeId, intro) {
    let score = CONFIG.COMPLETENESS_WEIGHTS.intro_base;
    
    if (contentTypeId === '39' && intro) { // 음식점
        if (intro.treatMenu) score += 15;
        if (intro.openTime) score += 5;
        if (intro.firstMenu) score += 5;
    } else if (contentTypeId === '32' && intro) { // 숙박
        if (intro.roomCount) score += 10;
        if (intro.checkIn) score += 5;
        if (intro.roomType) score += 5;
        if (intro.subfacility) score += 5;
    } else if (contentTypeId === '12' && intro) { // 관광지
        if (intro.expguide) score += 10;
        if (intro.heritage1 && intro.heritage1 !== '0') score += 10;
        if (intro.useseason) score += 5;
    }
    
    return Math.min(score, CONFIG.COMPLETENESS_WEIGHTS.intro_specific);
}

// 🏗️ 소개 정보 구성
function buildIntroData(contentTypeId, itemData) {
    const baseIntro = { type: CONFIG.CONTENT_TYPES[contentTypeId]?.name || '기타' };
    
    if (contentTypeId === '39') { // 음식점
        return {
            ...baseIntro,
            treatMenu: itemData.treatmenu || null,
            openTime: itemData.opentimefood || null,
            restDate: itemData.restdatefood || null,
            firstMenu: itemData.firstmenu || null,
            smoking: itemData.smoking || null,
            packing: itemData.packing || null,
            seat: itemData.seat || null
        };
    } else if (contentTypeId === '32') { // 숙박
        return {
            ...baseIntro,
            roomCount: itemData.roomcount || null,
            checkIn: itemData.checkintime || null,
            checkOut: itemData.checkouttime || null,
            roomType: itemData.roomtype || null,
            accomount: itemData.accomount || null,
            subfacility: itemData.subfacility || null
        };
    } else if (contentTypeId === '12') { // 관광지
        return {
            ...baseIntro,
            expguide: itemData.expguide || null,
            heritage1: itemData.heritage1 || null,
            heritage2: itemData.heritage2 || null,
            heritage3: itemData.heritage3 || null,
            useseason: itemData.useseason || null
        };
    }
    
    return baseIntro;
}

// 📊 숨은 보석 점수 계산
function calculateHiddenGemScore(place, contentTypeId) {
    let score = 0;
    
    // 기본 점수 (콘텐츠 타입별)
    score += CONFIG.CONTENT_TYPES[contentTypeId]?.weight || 10;
    
    // 전화번호 있음 (실제 운영 중)
    if (place.tel) score += 15;
    
    // 외부 API 출처 (관광공사 미등록)
    if (place.source && place.source !== 'tourism') score += 20;
    
    // 접근성 (시내에서 떨어진 곳)
    if (place.distance && place.distance > 3) score += 10;
    
    // 상세 정보 완성도
    if (place.detailed?.completeness > 70) score += 10;
    
    // 이미지 있음
    if (place.firstimage) score += 5;
    
    // 운영시간 정보 있음
    if (place.detailed?.intro?.openTime || place.detailed?.intro?.treatMenu) score += 10;
    
    // 최근 수정됨
    if (place.modifiedtime) {
        const modifiedDate = new Date(place.modifiedtime);
        const now = new Date();
        const daysDiff = (now - modifiedDate) / (1000 * 60 * 60 * 24);
        if (daysDiff < 365) score += 5; // 1년 이내 수정
    }
    
    return Math.min(score, 100);
}

// 🏷️ 카테고리 정보
function getCategoryInfo(cat1, cat2, cat3) {
    return {
        main: CONFIG.CATEGORY_MAP[cat1] || '기타',
        cat1, cat2, cat3
    };
}

// 🗺️ 지역 정보
function getAreaInfo(areaCode, sigunguCode) {
    return {
        area: CONFIG.AREA_MAP[areaCode] || '기타',
        areaCode,
        sigunguCode
    };
}

// 🔍 유사도 계산
function similarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
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

function buildDetailStats(items) {
    const detailedItems = items.filter(item => item.detailed);
    const successfulDetails = detailedItems.filter(item => !item.detailed?.hasError);
    
    return {
        totalItems: items.length,
        detailedItems: detailedItems.length,
        successfulDetails: successfulDetails.length,
        failedDetails: detailedItems.length - successfulDetails.length,
        avgCompleteness: successfulDetails.length > 0 
            ? Math.round(successfulDetails.reduce((sum, item) => sum + item.detailed.completeness, 0) / successfulDetails.length)
            : 0
    };
}

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
