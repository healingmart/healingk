// api/alltourism.js (v4.0 - 다중 소스 통합 검증 시스템)

// 📊 설정 상수
const CONFIG = {
    API: {
        TOURISM_BASE_URL: 'https://apis.data.go.kr/B551011/KorService2',
        KAKAO_BASE_URL: 'https://dapi.kakao.com/v2/local',
        NAVER_BASE_URL: 'https://openapi.naver.com/v1/search',
        GOOGLE_BASE_URL: 'https://maps.googleapis.com/maps/api/place'
    },
    TRUST_LEVELS: {
        PLATINUM: { minScore: 90, minSources: 4, badge: '💎', label: '플래티넘' },
        GOLD: { minScore: 80, minSources: 3, badge: '🥇', label: '골드' },
        SILVER: { minScore: 65, minSources: 2, badge: '🥈', label: '실버' },
        BRONZE: { minScore: 40, minSources: 1, badge: '🥉', label: '브론즈' },
        UNVERIFIED: { minScore: 0, minSources: 0, badge: '❓', label: '미검증' }
    },
    SOURCE_WEIGHTS: {
        tourism: { weight: 25, icon: '🏛️', name: '한국관광공사' },
        kakao: { weight: 30, icon: '🗺️', name: '카카오맵' },
        naver: { weight: 25, icon: '📱', name: '네이버' },
        google: { weight: 20, icon: '🌐', name: '구글맵' }
    },
    BONUS_SCORES: {
        hasPhone: 10,
        hasHours: 8,
        recentReview: 7,
        highRating: 5,
        multiplePhotos: 5
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
        const multiSourceResults = await executeMultiSourceSearch(searchParams);
        const response = await buildEnhancedResponse(multiSourceResults, searchParams);
        
        return res.status(200).json(response);

    } catch (error) {
        console.error('다중 소스 검색 API 오류:', error);
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

// 📊 파라미터 파싱
function parseAndValidateParams(query) {
    const {
        keyword = '',
        contentTypeId = '',
        areaCode = '39', // 제주도 기본
        userLat = '',
        userLng = '',
        radius = '10',
        trustLevel = 'all',
        sortBy = 'trustScore',
        sortOrder = 'desc',
        numOfRows = '20',
        includeAllSources = 'true',
        debug = 'false'
    } = query;
    
    const hasUserLocation = userLat && userLng && 
        !isNaN(parseFloat(userLat)) && !isNaN(parseFloat(userLng));
    
    return {
        keyword,
        contentTypeId,
        areaCode,
        hasUserLocation,
        userLocation: hasUserLocation ? {
            lat: parseFloat(userLat),
            lng: parseFloat(userLng)
        } : { lat: 33.5133, lng: 126.5294 }, // 제주시청 기본
        radiusKm: parseFloat(radius),
        trustLevel,
        sortBy,
        sortOrder,
        numOfRows: parseInt(numOfRows),
        includeAllSources: includeAllSources === 'true',
        debug: debug === 'true'
    };
}

// 🚀 다중 소스 통합 검색
async function executeMultiSourceSearch(params) {
    const startTime = Date.now();
    
    console.log('🔍 다중 소스 검색 시작:', {
        location: params.userLocation,
        radius: params.radiusKm,
        contentType: params.contentTypeId
    });
    
    // 모든 소스에서 병렬 검색
    const searchPromises = [];
    
    // 한국관광공사 API
    if (process.env.TOURISM_API_KEY) {
        searchPromises.push(
            searchTourismAPI(params).catch(err => {
                console.error('관광공사 API 오류:', err.message);
                return { source: 'tourism', data: [], error: err.message };
            })
        );
    }
    
    // 카카오 로컬 API
    if (process.env.KAKAO_REST_API_KEY && params.includeAllSources) {
        searchPromises.push(
            searchKakaoAPI(params).catch(err => {
                console.error('카카오 API 오류:', err.message);
                return { source: 'kakao', data: [], error: err.message };
            })
        );
    }
    
    // 네이버 지역검색 API
    if (process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET && params.includeAllSources) {
        searchPromises.push(
            searchNaverAPI(params).catch(err => {
                console.error('네이버 API 오류:', err.message);
                return { source: 'naver', data: [], error: err.message };
            })
        );
    }
    
    // 구글 Places API
    if (process.env.GOOGLE_PLACES_API_KEY && params.includeAllSources) {
        searchPromises.push(
            searchGoogleAPI(params).catch(err => {
                console.error('구글 API 오류:', err.message);
                return { source: 'google', data: [], error: err.message };
            })
        );
    }
    
    const searchResults = await Promise.allSettled(searchPromises);
    
    // 결과 정리
    const sourceData = {};
    const errors = {};
    
    searchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
            const { source, data, error } = result.value;
            sourceData[source] = data || [];
            if (error) errors[source] = error;
        }
    });
    
    console.log('📊 소스별 결과 수집:', Object.entries(sourceData).map(([k,v]) => `${k}: ${v.length}개`));
    
    // 데이터 통합 및 검증
    const integratedPlaces = await integrateAndVerifyData(sourceData, params);
    
    // 신뢰도 점수 계산
    const verifiedPlaces = integratedPlaces.map(place => ({
        ...place,
        ...calculateTrustScore(place),
        aiSummary: generateAISummary(place)
    }));
    
    // 필터링 및 정렬
    const filteredPlaces = filterByTrustLevel(verifiedPlaces, params.trustLevel);
    const sortedPlaces = sortPlaces(filteredPlaces, params.sortBy, params.sortOrder);
    
    return {
        places: sortedPlaces.slice(0, params.numOfRows),
        totalFound: sortedPlaces.length,
        sourceStats: calculateSourceStats(sourceData),
        performance: {
            totalTime: Date.now() - startTime,
            sourcesUsed: Object.keys(sourceData).length,
            errors
        }
    };
}

// 🏛️ 한국관광공사 API 검색
async function searchTourismAPI(params) {
    const apiKey = process.env.TOURISM_API_KEY;
    if (!apiKey) throw new Error('관광공사 API 키 없음');
    
    let searchUrl;
    if (params.keyword) {
        searchUrl = `${CONFIG.API.TOURISM_BASE_URL}/searchKeyword2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=TrustGuide&_type=json&keyword=${encodeURIComponent(params.keyword)}&numOfRows=50&pageNo=1`;
    } else {
        searchUrl = `${CONFIG.API.TOURISM_BASE_URL}/areaBasedList2?serviceKey=${apiKey}&MobileOS=ETC&MobileApp=TrustGuide&_type=json&areaCode=${params.areaCode}&numOfRows=50&pageNo=1`;
    }
    
    if (params.contentTypeId) searchUrl += `&contentTypeId=${params.contentTypeId}`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    const resultCode = data.resultCode || data.response?.header?.resultCode;
    if (resultCode !== '0' && resultCode !== '0000') {
        throw new Error(`관광공사 API 오류: ${data.response?.header?.resultMsg}`);
    }
    
    const items = data.response?.body?.items?.item || [];
    const itemList = Array.isArray(items) ? items : items ? [items] : [];
    
    const places = itemList.map(item => ({
        id: `tourism_${item.contentid}`,
        name: item.title,
        address: item.addr1,
        phone: item.tel || null,
        lat: parseFloat(item.mapy) || null,
        lng: parseFloat(item.mapx) || null,
        category: getContentTypeName(item.contenttypeid),
        image: item.firstimage || null,
        source: 'tourism',
        sourceData: {
            contentId: item.contentid,
            contentTypeId: item.contenttypeid,
            readCount: parseInt(item.readcount) || 0,
            modifiedTime: item.modifiedtime,
            officialStatus: '인증'
        }
    })).filter(place => place.lat && place.lng);
    
    return { source: 'tourism', data: places };
}

// 🗺️ 카카오 로컬 API 검색
async function searchKakaoAPI(params) {
    const apiKey = process.env.KAKAO_REST_API_KEY;
    if (!apiKey) throw new Error('카카오 API 키 없음');
    
    const query = params.keyword || (params.contentTypeId === '39' ? '맛집' : '관광지');
    const { lat, lng } = params.userLocation;
    const radius = Math.min(params.radiusKm * 1000, 20000);
    
    const url = `${CONFIG.API.KAKAO_BASE_URL}/search/keyword.json?query=${encodeURIComponent(query)}&x=${lng}&y=${lat}&radius=${radius}&size=15&sort=distance`;
    
    const response = await fetch(url, {
        headers: { 'Authorization': `KakaoAK ${apiKey}` }
    });
    
    if (!response.ok) throw new Error(`카카오 API HTTP ${response.status}`);
    
    const data = await response.json();
    
    const places = (data.documents || []).map(place => ({
        id: `kakao_${place.id}`,
        name: place.place_name,
        address: place.road_address_name || place.address_name,
        phone: place.phone || null,
        lat: parseFloat(place.y),
        lng: parseFloat(place.x),
        category: place.category_name,
        source: 'kakao',
        sourceData: {
            kakaoId: place.id,
            placeUrl: place.place_url,
            distance: parseInt(place.distance),
            categoryGroupCode: place.category_group_code
        }
    }));
    
    return { source: 'kakao', data: places };
}

// 📱 네이버 지역검색 API
async function searchNaverAPI(params) {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('네이버 API 키 없음');
    
    const query = params.keyword || (params.contentTypeId === '39' ? '제주맛집' : '제주관광지');
    const url = `${CONFIG.API.NAVER_BASE_URL}/local.json?query=${encodeURIComponent(query)}&display=20&sort=comment`;
    
    const response = await fetch(url, {
        headers: {
            'X-Naver-Client-Id': clientId,
            'X-Naver-Client-Secret': clientSecret
        }
    });
    
    if (!response.ok) throw new Error(`네이버 API HTTP ${response.status}`);
    
    const data = await response.json();
    
    const places = (data.items || []).map(place => ({
        id: `naver_${Buffer.from(place.title + place.address).toString('base64').slice(0, 10)}`,
        name: place.title.replace(/<[^>]*>/g, ''),
        address: place.address,
        phone: place.telephone || null,
        lat: null, // 네이버는 좌표 제공 안함
        lng: null,
        category: place.category,
        source: 'naver',
        sourceData: {
            link: place.link,
            description: place.description?.replace(/<[^>]*>/g, ''),
            roadAddress: place.roadAddress
        }
    }));
    
    return { source: 'naver', data: places };
}

// 🌐 구글 Places API 검색
async function searchGoogleAPI(params) {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) throw new Error('구글 API 키 없음');
    
    const query = params.keyword || (params.contentTypeId === '39' ? 'restaurant' : 'tourist attraction');
    const { lat, lng } = params.userLocation;
    const radius = Math.min(params.radiusKm * 1000, 50000);
    
    const url = `${CONFIG.API.GOOGLE_BASE_URL}/textsearch/json?query=${encodeURIComponent(query + ' 제주')}&location=${lat},${lng}&radius=${radius}&key=${apiKey}&language=ko`;
    
    const response = await fetch(url);
    
    if (!response.ok) throw new Error(`구글 API HTTP ${response.status}`);
    
    const data = await response.json();
    
    if (data.status !== 'OK') throw new Error(`구글 API 상태: ${data.status}`);
    
    const places = (data.results || []).map(place => ({
        id: `google_${place.place_id}`,
        name: place.name,
        address: place.formatted_address,
        phone: null, // 상세 정보에서 가져와야 함
        lat: place.geometry?.location?.lat || null,
        lng: place.geometry?.location?.lng || null,
        category: place.types?.[0] || 'establishment',
        source: 'google',
        sourceData: {
            placeId: place.place_id,
            rating: place.rating || null,
            userRatingsTotal: place.user_ratings_total || 0,
            priceLevel: place.price_level || null,
            photos: place.photos || []
        }
    })).filter(place => place.lat && place.lng);
    
    return { source: 'google', data: places };
}

// 🔗 데이터 통합 및 검증
async function integrateAndVerifyData(sourceData, params) {
    const allPlaces = [];
    const placeGroups = new Map();
    
    // 모든 소스의 데이터를 하나로 합침
    Object.entries(sourceData).forEach(([source, places]) => {
        places.forEach(place => {
            if (place.lat && place.lng) {
                allPlaces.push(place);
            }
        });
    });
    
    // 좌표 기반으로 같은 장소 그룹핑
    allPlaces.forEach(place => {
        const key = findMatchingGroup(place, placeGroups, params.userLocation);
        
        if (key) {
            placeGroups.get(key).sources[place.source] = place;
        } else {
            const newKey = `${place.lat.toFixed(4)}_${place.lng.toFixed(4)}_${normalizeString(place.name)}`;
            placeGroups.set(newKey, {
                id: `integrated_${newKey}`,
                primaryName: place.name,
                primaryAddress: place.address,
                lat: place.lat,
                lng: place.lng,
                distance: calculateDistance(params.userLocation.lat, params.userLocation.lng, place.lat, place.lng),
                sources: { [place.source]: place },
                lastUpdated: new Date().toISOString()
            });
        }
    });
    
    return Array.from(placeGroups.values());
}

// 🎯 신뢰도 점수 계산
function calculateTrustScore(integratedPlace) {
    let score = 0;
    const sources = Object.keys(integratedPlace.sources);
    const sourceCount = sources.length;
    
    // 기본 소스 점수
    sources.forEach(source => {
        score += CONFIG.SOURCE_WEIGHTS[source]?.weight || 10;
    });
    
    // 보너스 점수
    const hasPhone = sources.some(s => integratedPlace.sources[s].phone);
    const hasRating = sources.some(s => integratedPlace.sources[s].sourceData?.rating);
    const hasOfficialData = integratedPlace.sources.tourism;
    const hasRecentData = sources.some(s => {
        const modTime = integratedPlace.sources[s].sourceData?.modifiedTime;
        return modTime && isRecentDate(modTime, 365); // 1년 이내
    });
    
    if (hasPhone) score += CONFIG.BONUS_SCORES.hasPhone;
    if (hasRating) score += CONFIG.BONUS_SCORES.highRating;
    if (hasOfficialData) score += CONFIG.BONUS_SCORES.hasPhone; // 공식 데이터 보너스
    if (hasRecentData) score += CONFIG.BONUS_SCORES.recentReview;
    
    // 다중 소스 보너스
    if (sourceCount >= 3) score += 15;
    else if (sourceCount >= 2) score += 10;
    
    const finalScore = Math.min(score, 100);
    
    // 등급 결정
    let trustLevel = 'UNVERIFIED';
    for (const [level, criteria] of Object.entries(CONFIG.TRUST_LEVELS)) {
        if (finalScore >= criteria.minScore && sourceCount >= criteria.minSources) {
            trustLevel = level;
            break;
        }
    }
    
    return {
        trustScore: finalScore,
        trustLevel,
        trustBadge: CONFIG.TRUST_LEVELS[trustLevel].badge,
        trustLabel: CONFIG.TRUST_LEVELS[trustLevel].label,
        sourceCount,
        verifiedSources: sources
    };
}

// 🤖 AI 종합 분석
function generateAISummary(place) {
    const sources = Object.keys(place.sources);
    const sourceCount = sources.length;
    
    let summary = `${sourceCount}개 플랫폼에서 검증된 `;
    
    if (place.trustScore >= 90) summary += '최고급 ';
    else if (place.trustScore >= 80) summary += '우수한 ';
    else if (place.trustScore >= 65) summary += '양호한 ';
    else summary += '기본 ';
    
    summary += place.sources.tourism ? '인증 ' : '';
    summary += getPlaceTypeKorean(place.sources) + '. ';
    
    // 특징 분석
    const features = [];
    if (place.sources.tourism) features.push('공식인증');
    if (place.sources.kakao) features.push('실시간정보');
    if (place.sources.naver) features.push('리뷰풍부');
    if (place.sources.google) features.push('글로벌검증');
    
    const avgRating = calculateAverageRating(place.sources);
    if (avgRating >= 4.3) features.push('고평점');
    
    if (place.distance <= 1) features.push('근거리');
    else if (place.distance <= 3) features.push('접근용이');
    
    if (features.length > 0) {
        summary += features.slice(0, 3).join(', ') + ' 확인됨.';
    }
    
    return summary;
}

// 🔍 유틸리티 함수들
function findMatchingGroup(place, existingGroups, userLocation) {
    for (const [key, group] of existingGroups) {
        const distance = calculateDistance(place.lat, place.lng, group.lat, group.lng);
        const nameMatch = similarity(normalizeString(place.name), normalizeString(group.primaryName));
        
        // 100m 이내 + 이름 유사도 70% 이상이면 같은 장소로 판단
        if (distance <= 0.1 && nameMatch >= 0.7) {
            return key;
        }
    }
    return null;
}

function normalizeString(str) {
    return str.toLowerCase()
        .replace(/[^가-힣a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function similarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1;
    
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

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function calculateAverageRating(sources) {
    const ratings = [];
    Object.values(sources).forEach(source => {
        if (source.sourceData?.rating) ratings.push(source.sourceData.rating);
    });
    return ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
}

function getContentTypeName(contentTypeId) {
    const types = {
        '12': '관광지', '14': '문화시설', '15': '축제/행사',
        '25': '여행코스', '28': '레포츠', '32': '숙박',
        '38': '쇼핑', '39': '음식점'
    };
    return types[contentTypeId] || '기타';
}

function getPlaceTypeKorean(sources) {
    if (sources.tourism) {
        const contentType = sources.tourism.sourceData?.contentTypeId;
        return getContentTypeName(contentType);
    }
    if (sources.kakao?.category?.includes('음식점')) return '맛집';
    if (sources.kakao?.category?.includes('관광')) return '관광지';
    if (sources.naver?.category?.includes('음식')) return '맛집';
    return '장소';
}

function isRecentDate(dateString, daysThreshold) {
    if (!dateString) return false;
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = (now - date) / (1000 * 60 * 60 * 24);
    return diffDays <= daysThreshold;
}

// 📊 필터링 및 정렬
function filterByTrustLevel(places, trustLevel) {
    if (trustLevel === 'all') return places;
    
    const criteria = CONFIG.TRUST_LEVELS[trustLevel.toUpperCase()];
    if (!criteria) return places;
    
    return places.filter(place => 
        place.trustScore >= criteria.minScore && 
        place.sourceCount >= criteria.minSources
    );
}

function sortPlaces(places, sortBy, sortOrder) {
    return places.sort((a, b) => {
        let aVal, bVal;
        
        switch (sortBy) {
            case 'trustScore':
                aVal = a.trustScore || 0;
                bVal = b.trustScore || 0;
                break;
            case 'distance':
                aVal = a.distance || 999;
                bVal = b.distance || 999;
                break;
            case 'sourceCount':
                aVal = a.sourceCount || 0;
                bVal = b.sourceCount || 0;
                break;
            default:
                aVal = a.trustScore || 0;
                bVal = b.trustScore || 0;
        }
        
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
    });
}

function calculateSourceStats(sourceData) {
    return Object.entries(sourceData).reduce((stats, [source, data]) => {
        stats[source] = {
            count: data.length,
            icon: CONFIG.SOURCE_WEIGHTS[source]?.icon || '❓',
            name: CONFIG.SOURCE_WEIGHTS[source]?.name || source
        };
        return stats;
    }, {});
}

// 🏗️ 응답 구성
async function buildEnhancedResponse(searchResults, searchParams) {
    return {
        success: true,
        data: {
            places: searchResults.places,
            totalFound: searchResults.totalFound,
            trustDistribution: calculateTrustDistribution(searchResults.places),
            sourceStats: searchResults.sourceStats
        },
        searchParams,
        performance: searchResults.performance,
        timestamp: new Date().toISOString(),
        version: '4.0.0-multi-source'
    };
}

function calculateTrustDistribution(places) {
    const distribution = {};
    Object.keys(CONFIG.TRUST_LEVELS).forEach(level => {
        distribution[level] = places.filter(p => p.trustLevel === level).length;
    });
    return distribution;
}

function buildErrorResponse(error) {
    return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        version: '4.0.0-multi-source'
    };
}
