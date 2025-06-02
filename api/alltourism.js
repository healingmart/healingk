// api/alltourism.js

const AREA_CODES = {
  '서울': 1, '부산': 6, '제주': 39, '강릉': 32,
  '전주': 37, '대구': 4, '광주': 5, '대전': 3,
  '인천': 2, '울산': 7, '경주': 35, '춘천': 32,
  '세종': 8, '경기': 31, '강원': 32, '충북': 33, 
  '충남': 34, '전북': 37, '전남': 38, '경북': 35, 
  '경남': 36, '속초': 32, '평창': 32, '천안': 34, 
  '공주': 34, '부여': 34, '군산': 37, '정읍': 37, 
  '남원': 37, '목포': 38, '순천': 38, '여수': 38,
  '안동': 35, '포항': 35, '통영': 36, '거제': 36, 
  '남해': 36, '제주시': 39, '서귀포': 39, '수원': 31, 
  '성남': 31, '안양': 31, '부천': 31, '광명': 31, 
  '평택': 31, '동탄': 31, '일산': 31, '분당': 31, '판교': 31
};

const CONTENT_TYPES = {
    festivals: 15,
    accommodation: 32,
    restaurants: 39,
    culture: 14,
    attractions: 12,
    shopping: 38,
    sports: 28,
    course: 25,
    all: 'all'
};

const API_CONFIG = {
    baseUrl: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    timeout: 15000,
    maxRetries: 3,
    retryDelay: 1000,
    chunkSize: 20,
    maxItemsPerRequest: 100
};

const isDev = process.env.NODE_ENV === 'development';

// ===== 메인 핸들러 =====
module.exports = async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const startTime = Date.now();

    try {
        // 입력 파라미터 검증 및 기본값 설정
        const validatedParams = validateAndParseParams(req.query);
        if (validatedParams.error) {
            return res.status(400).json({
                success: false,
                message: validatedParams.error,
                timestamp: new Date().toISOString()
            });
        }

        const { region, category, numOfRows, pageNo } = validatedParams;

        if (isDev) {
            console.log('🚀 완벽한 ALL TOURISM API 시작');
            console.log(`📍 지역: ${region}`);
            console.log(`🏷️ 카테고리: ${category}`);
            console.log(`📊 요청 개수: ${numOfRows}`);
            console.log(`📄 페이지: ${pageNo}`);
        }

        // API 키 확인
        const apiKey = getValidApiKey();
        if (!apiKey) {
            if (isDev) console.log('⚠️ API 키 없음 - 샘플 데이터 제공');
            return res.status(200).json({
                success: true,
                data: await getEnhancedSampleData(region, category),
                message: `🏛️ ${region} 관광 정보 (API 키 설정 필요)`,
                realTime: false,
                responseTime: `${Date.now() - startTime}ms`,
                timestamp: new Date().toISOString()
            });
        }

        if (isDev) console.log('✅ API 키 확인됨');

        let result;

        // 전체 카테고리 요청 처리
        if (category === 'all') {
            if (isDev) console.log('🌐 전체 카테고리 데이터 수집 시작...');
            result = await fetchAllCategoriesData(apiKey, region, numOfRows);
        } else {
            // 단일 카테고리 요청 처리
            if (isDev) console.log(`🎯 ${category} 데이터 수집 시작...`);
            result = await fetchCategoryDataWithRetry(apiKey, region, category, numOfRows, pageNo);
        }

        const responseTime = Date.now() - startTime;
        const totalCount = getTotalCount(result);

        if (result.success) {
            if (isDev) console.log('🎉 API 요청 성공!');
            return res.status(200).json({
                success: true,
                data: result.data,
                message: `🏛️ ${region} ${category} 실시간 관광 정보!`,
                method: result.method,
                realTime: true,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString(),
                meta: {
                    region,
                    category,
                    totalCount: totalCount,
                    apiVersion: 'KorService2-Enhanced'
                }
            });
        }

        // API 실패 시 고품질 샘플 데이터 제공
        if (isDev) console.log('⚠️ API 실패 - 고품질 샘플 데이터 제공');
        return res.status(200).json({
            success: true,
            data: await getEnhancedSampleData(region, category),
            message: `🏛️ ${region} 관광 정보 (API 연결 준비중)`,
            realTime: false,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
            debug: result.debug || '모든 API 전략 실패'
        });

    } catch (error) {
        console.error('❌ 메인 핸들러 오류:', error);
        const responseTime = Date.now() - startTime;
        
        return res.status(200).json({
            success: true,
            data: await getEnhancedSampleData(req.query.region || '서울', req.query.category || 'attractions'),
            message: '🏛️ 관광 정보 서비스 (임시 데이터)',
            realTime: false,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
            error: 'Service temporarily using sample data'
        });
    }
};

// ===== 입력 파라미터 검증 및 파싱 =====
function validateAndParseParams(query) {
    const { 
        region = '서울', 
        category = 'attractions',
        numOfRows = '20',
        pageNo = '1' 
    } = query;

    // 지역 검증
    if (!AREA_CODES[region]) {
        return {
            error: `지원하지 않는 지역입니다: ${region}. 지원 지역: ${Object.keys(AREA_CODES).slice(0, 10).join(', ')} 등`
        };
    }

    // 카테고리 검증
    if (category !== 'all' && !CONTENT_TYPES[category]) {
        return {
            error: `지원하지 않는 카테고리입니다: ${category}. 지원 카테고리: ${Object.keys(CONTENT_TYPES).slice(0, 8).join(', ')}, all`
        };
    }

    // 개수 검증
    const parsedNumOfRows = parseInt(numOfRows);
    if (isNaN(parsedNumOfRows) || parsedNumOfRows < 1) {
        return {
            error: 'numOfRows는 1 이상의 숫자여야 합니다'
        };
    }

    const parsedPageNo = parseInt(pageNo);
    if (isNaN(parsedPageNo) || parsedPageNo < 1) {
        return {
            error: 'pageNo는 1 이상의 숫자여야 합니다'
        };
    }

    return {
        region,
        category,
        numOfRows: Math.min(parsedNumOfRows, API_CONFIG.maxItemsPerRequest),
        pageNo: parsedPageNo
    };
}

// ===== 유효한 API 키 찾기 =====
function getValidApiKey() {
    const possibleKeys = [
        process.env.TOURISM_API_KEY,
        process.env.TOUR_API_KEY,
        process.env.JEONBUK_API_KEY,
        process.env.WEATHER_API_KEY,
        process.env.REGIONAL_API_KEY
    ];

    return possibleKeys.find(key => key && key.length > 0);
}

// ===== 전체 카테고리 데이터 병렬 수집 =====
async function fetchAllCategoriesData(apiKey, region, totalNumOfRows) {
    const categories = ['festivals', 'accommodation', 'restaurants', 'culture', 'attractions'];
    const itemsPerCategory = Math.ceil(totalNumOfRows / categories.length);
    
    if (isDev) console.log(`🌐 전체 카테고리 수집: ${categories.length}개 카테고리, 각각 ${itemsPerCategory}개`);

    // 병렬 처리를 위한 지연 시간을 가진 Promise 배열
    const promises = categories.map((category, index) => 
        new Promise(resolve => 
            setTimeout(async () => {
                try {
                    const data = await fetchTourismDataWithRetry(apiKey, region, category, itemsPerCategory);
                    resolve({ category, data });
                } catch (error) {
                    if (isDev) console.error(`❌ ${category} 수집 실패:`, error);
                    resolve({ category, data: [] });
                }
            }, index * 300) // 300ms 간격으로 요청
        )
    );

    const results = await Promise.all(promises);
    
    // 결과 정리
    const result = {};
    let totalCount = 0;
    results.forEach(({ category, data }) => {
        result[category] = data;
        totalCount += data.length;
    });

    return {
        success: totalCount > 0,
        data: result,
        totalCount,
        method: 'multi_category_collection'
    };
}

// ===== 재시도 로직이 포함된 관광 데이터 수집 =====
async function fetchCategoryDataWithRetry(apiKey, region, category, numOfRows, pageNo, retryCount = 0) {
    try {
        const data = await fetchTourismDataWithRetry(apiKey, region, category, numOfRows);
        return {
            success: true,
            data: data,
            method: 'single_category_collection',
            totalCount: data.length
        };
    } catch (error) {
        if (retryCount < API_CONFIG.maxRetries) {
            if (isDev) console.log(`🔄 ${category} 재시도 ${retryCount + 1}/${API_CONFIG.maxRetries}`);
            await sleep(API_CONFIG.retryDelay * (retryCount + 1));
            return fetchCategoryDataWithRetry(apiKey, region, category, numOfRows, pageNo, retryCount + 1);
        }
        
        if (isDev) console.error(`❌ ${category} 최종 실패:`, error.message);
        return {
            success: false,
            data: [],
            error: error.message,
            method: 'failed_after_retries'
        };
    }
}

// ===== 관광 데이터 수집 (Service2 버전) =====
async function fetchTourismDataWithRetry(apiKey, region, category, numOfRows) {
    const areaCode = AREA_CODES[region];
    const contentTypeId = CONTENT_TYPES[category];

    if (isDev) {
        console.log(`🔍 ${region} (${areaCode}) ${category} (${contentTypeId}) 수집...`);
    }

    const params = new URLSearchParams({
        serviceKey: apiKey,
        numOfRows: numOfRows.toString(),
        pageNo: '1',
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentTypeId: contentTypeId.toString(),
        areaCode: areaCode.toString(),
        arrange: 'D',
        listYN: 'Y',
        mapinfoYN: 'Y',
        imageYN: 'Y'
    });

    // AbortController를 사용한 timeout 처리
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeout);

    try {
        const response = await fetch(`${API_CONFIG.baseUrl}?${params.toString()}`, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'HealingK/2.0',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (data.response?.header?.resultCode === '0000') {
            const items = data.response.body?.items?.item || [];
            const itemsArray = Array.isArray(items) ? items : [items];
            
            if (isDev) {
                console.log(`✅ ${category}: ${itemsArray.length}개 수집 완료`);
            }
            
            return processDataInChunks(itemsArray, category, contentTypeId);
        } else {
            const errorMsg = data.response?.header?.resultMsg || '알 수 없는 오류';
            if (isDev) {
                console.log(`⚠️ ${category}: 데이터 없음 (${errorMsg})`);
            }
            return [];
        }

    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.name === 'AbortError') {
            throw new Error(`${category} 요청 시간 초과 (${API_CONFIG.timeout}ms)`);
        }
        
        throw new Error(`${category} 수집 실패: ${error.message}`);
    }
}

// ===== 데이터를 청크 단위로 처리 (메모리 효율성) =====
function processDataInChunks(itemsArray, category, contentTypeId) {
    const result = [];
    
    for (let i = 0; i < itemsArray.length; i += API_CONFIG.chunkSize) {
        const chunk = itemsArray.slice(i, i + API_CONFIG.chunkSize);
        const processedChunk = chunk.map(item => transformData(item, category, contentTypeId));
        result.push(...processedChunk);
    }
    
    return result;
}

// ===== 데이터 변환 (대폭 개선된 버전) =====
function transformData(item, category, contentTypeId) {
    const baseData = {
        id: item.contentid || '',
        title: cleanAndValidateTitle(item.title || '제목 없음'),
        location: cleanAddress(item.addr1 || '주소 없음'),
        detailLocation: (item.addr2 || '').trim(),
        region: getRegionFromAddr(item.addr1),
        tel: cleanTel(item.tel || ''),
        contentTypeId: parseInt(contentTypeId),
        contentType: category,
        coordinates: {
            x: parseFloat(item.mapx) || null,
            y: parseFloat(item.mapy) || null
        },
        images: {
            main: validateAndEnhanceImageUrl(item.firstimage),
            thumbnail: validateAndEnhanceImageUrl(item.firstimage2)
        },
        timestamps: {
            created: item.createdtime || '',
            modified: item.modifiedtime || ''
        },
        mlevel: item.mlevel || '1',
        zipcode: item.zipcode || '',
        overview: cleanOverview(item.overview),
        originalData: {
            source: 'korean_tourism_organization_service2',
            contentType: category,
            isRealData: true,
            lastUpdated: new Date().toISOString()
        }
    };

    // 카테고리별 특화 데이터 추가
    const enhancedData = addCategorySpecificData(baseData, item, category);
    
    // 평점 및 인기도 (가상 데이터)
    enhancedData.rating = {
        score: (Math.random() * 2 + 3).toFixed(1), // 3.0-5.0
        reviewCount: Math.floor(Math.random() * 500) + 10,
        popularity: Math.floor(Math.random() * 100) + 1
    };

    return enhancedData;
}

// ===== 카테고리별 특화 데이터 추가 =====
function addCategorySpecificData(baseData, originalItem, category) {
    switch (category) {
        case 'festivals': // 축제
            return {
                ...baseData,
                category: 'festivals',
                eventInfo: {
                    startDate: originalItem.eventstartdate || '',
                    endDate: originalItem.eventenddate || '',
                    eventPlace: originalItem.eventplace || '',
                    sponsor: originalItem.sponsor1 || '',
                    status: calculateEventStatus(originalItem.eventstartdate, originalItem.eventenddate),
                    daysLeft: calculateDaysLeft(originalItem.eventstartdate, originalItem.eventenddate)
                },
                program: originalItem.program || '',
                playtime: originalItem.playtime || ''
            };

        case 'accommodation': // 숙박
            return {
                ...baseData,
                category: 'accommodation',
                accommodationInfo: {
                    type: getAccommodationType(baseData.title),
                    roomCount: parseInt(originalItem.roomcount) || null,
                    roomType: originalItem.roomtype || '',
                    checkIn: originalItem.checkintime || '',
                    checkOut: originalItem.checkouttime || '',
                    features: {
                        benikia: originalItem.benikia === 'Y',
                        goodstay: originalItem.goodstay === 'Y',
                        hanok: originalItem.hanok === 'Y'
                    }
                },
                facilities: originalItem.facilities || ''
            };

        case 'restaurants': // 음식점
            return {
                ...baseData,
                category: 'restaurants',
                restaurantInfo: {
                    foodType: getFoodType(baseData.title),
                    specialMenu: originalItem.treatmenu || '',
                    openTime: originalItem.opentime || '',
                    restDay: originalItem.restdatefood || '',
                    features: {
                        smoking: originalItem.smoking || '',
                        packing: originalItem.packing || '',
                        parking: originalItem.parking || ''
                    }
                }
            };

        case 'culture': // 문화시설
            return {
                ...baseData,
                category: 'culture',
                cultureInfo: {
                    facilityType: 'culture',
                    scale: originalItem.scale || '',
                    capacity: parseInt(originalItem.accomcount) || null,
                    useTime: originalItem.usetimeculture || '',
                    restDay: originalItem.restdateculture || '',
                    useFee: originalItem.usefee || ''
                }
            };

        case 'attractions': // 관광지
        default:
            return {
                ...baseData,
                category: 'attractions',
                attractionInfo: {
                    type: 'tourism',
                    useTime: originalItem.usetime || '',
                    restDay: originalItem.restdate || '',
                    ageLimit: originalItem.agelimit || '',
                    heritage: {
                        level1: originalItem.heritage1 || '',
                        level2: originalItem.heritage2 || '',
                        level3: originalItem.heritage3 || ''
                    }
                }
            };
    }
}

// ===== 유틸리티 함수들 (대폭 개선) =====

// 제목 정리 및 검증
function cleanAndValidateTitle(title) {
    if (!title || title.trim() === '') {
        return '관광지';
    }
    
    let cleanTitle = title
        .replace(/<[^>]*>/g, '')
        .replace(/^\[.*?\]\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    if (cleanTitle.length > 50) {
        cleanTitle = cleanTitle.substring(0, 47) + '...';
    }
    
    return cleanTitle || '관광지';
}

// 주소 정리
function cleanAddress(address) {
    if (!address || address.trim() === '') {
        return '주소 정보 없음';
    }
    
    return address.replace(/\s+/g, ' ').trim();
}

// 전화번호 정리
function cleanTel(tel) {
    if (!tel || tel.trim() === '') {
        return '정보 없음';
    }
    
    const cleaned = tel.replace(/[^\d-]/g, '').trim();
    return cleaned || '정보 없음';
}

// 개요 정리
function cleanOverview(overview) {
    if (!overview || overview.trim() === '') {
        return null;
    }
    
    let cleaned = overview
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    if (cleaned.length > 200) {
        cleaned = cleaned.substring(0, 197) + '...';
    }
    
    return cleaned || null;
}

// 이미지 URL 검증 및 개선
function validateAndEnhanceImageUrl(url) {
    if (!url || url.trim() === '') {
        return null;
    }
    
    const cleanUrl = url.trim();
    
    if (cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://')) {
        return cleanUrl;
    }
    
    if (cleanUrl.startsWith('/')) {
        return `https://cdn.visitkorea.or.kr${cleanUrl}`;
    }
    
    return null;
}

// 숙박시설 타입 판별
function getAccommodationType(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('호텔') || titleLower.includes('hotel')) return '호텔';
    if (titleLower.includes('펜션') || titleLower.includes('pension')) return '펜션';
    if (titleLower.includes('모텔') || titleLower.includes('motel')) return '모텔';
    if (titleLower.includes('리조트') || titleLower.includes('resort')) return '리조트';
    if (titleLower.includes('한옥') || titleLower.includes('hanok')) return '한옥';
    if (titleLower.includes('게스트하우스') || titleLower.includes('guesthouse')) return '게스트하우스';
    if (titleLower.includes('캠핑') || titleLower.includes('camping')) return '캠핑장';
    
    return '기타';
}

// 음식점 타입 판별
function getFoodType(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('한식') || titleLower.includes('korean')) return '한식';
    if (titleLower.includes('중식') || titleLower.includes('chinese')) return '중식';
    if (titleLower.includes('일식') || titleLower.includes('japanese')) return '일식';
    if (titleLower.includes('양식') || titleLower.includes('western')) return '양식';
    if (titleLower.includes('카페') || titleLower.includes('cafe')) return '카페';
    if (titleLower.includes('치킨') || titleLower.includes('chicken')) return '치킨';
    if (titleLower.includes('피자') || titleLower.includes('pizza')) return '피자';
    if (titleLower.includes('분식') || titleLower.includes('snack')) return '분식';
    if (titleLower.includes('해산물') || titleLower.includes('seafood')) return '해산물';
    if (titleLower.includes('고기') || titleLower.includes('meat')) return '고기/구이';
    
    return '기타';
}

// 이벤트 상태 계산
function calculateEventStatus(startDate, endDate) {
    if (!startDate || !endDate) return 'unknown';
    
    try {
        const now = new Date();
        const start = parseKoreanDate(startDate);
        const end = parseKoreanDate(endDate);
        
        if (!start || !end) return 'unknown';
        
        if (now < start) return 'upcoming';
        if (now > end) return 'ended';
        return 'ongoing';
    } catch (error) {
        return 'unknown';
    }
}

// 이벤트 남은 일수 계산
function calculateDaysLeft(startDate, endDate) {
    if (!startDate || !endDate) return '날짜 미정';
    
    try {
        const now = new Date();
        const start = parseKoreanDate(startDate);
        const end = parseKoreanDate(endDate);
        
        if (!start || !end) return '날짜 미정';
        
        if (now < start) {
            const diff = Math.ceil((start - now) / (1000 * 60 * 60 * 24));
            return `${diff}일 후 시작`;
        }
        
        if (now > end) {
            return '종료됨';
        }
        
        const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        return `${diff}일 남음`;
    } catch (error) {
        return '날짜 미정';
    }
}

// 한국 날짜 파싱
function parseKoreanDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return null;
    
    try {
        const year = dateStr.substring(0, 4);
        const month = dateStr.substring(4, 6);
        const day = dateStr.substring(6, 8);
        
        return new Date(`${year}-${month}-${day}T00:00:00+09:00`);
    } catch (error) {
        return null;
    }
}

function getTotalCount(result) {
    if (!result || !result.data) return 0;
    
    if (Array.isArray(result.data)) {
        return result.data.length;
    }
    
    let total = 0;
    for (const key in result.data) {
        if (Array.isArray(result.data[key])) {
            total += result.data[key].length;
        }
    }
    return total;
}

function getRegionFromAddr(addr) {
    if (!addr) return '기타';
    
    const regions = Object.keys(AREA_CODES);
    for (const region of regions) {
        if (addr.includes(region)) {
            return region;
        }
    }
    
    return '기타';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 고품질 샘플 데이터 (대폭 확장) =====
async function getEnhancedSampleData(region, category) {
    const sampleDatabase = {
        '서울': {
            'attractions': [
                {
                    id: 'sample_seoul_gyeongbok',
                    title: '경복궁',
                    category: 'attractions',
                    location: '서울특별시 종로구 사직로 161',
                    tel: '02-3700-3900',
                    images: { 
                        main: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=be22184d-d414-4884-b8b3-7ff2b8b49d8a',
                        thumbnail: null 
                    },
                    coordinates: { x: 126.9769900000, y: 37.5788400000 },
                    overview: '조선 왕조의 정궁으로 1395년에 창건된 서울의 대표적인 고궁입니다.',
                    attractionInfo: {
                        type: 'tourism',
                        useTime: '09:00-18:00',
                        restDay: '화요일'
                    },
                    rating: { score: '4.6', reviewCount: 1245, popularity: 95 },
                    originalData: { source: 'sample_data', isRealData: false }
                },
                {
                    id: 'sample_seoul_namsan',
                    title: 'N서울타워',
                    category: 'attractions',
                    location: '서울특별시 용산구 남산공원길 105',
                    tel: '02-3455-9277',
                    images: { 
                        main: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=1e4c7c98-d28d-4e79-9db4-9e0d0b0b4b95',
                        thumbnail: null 
                    },
                    coordinates: { x: 126.9882300000, y: 37.5512600000 },
                    overview: '서울의 상징이자 최고의 전망을 자랑하는 타워입니다.',
                    attractionInfo: {
                        type: 'tourism',
                        useTime: '10:00-23:00',
                        restDay: '연중무휴'
                    },
                    rating: { score: '4.4', reviewCount: 892, popularity: 88 },
                    originalData: { source: 'sample_data', isRealData: false }
                }
            ],
            'restaurants': [
                {
                    id: 'sample_seoul_restaurant_001',
                    title: '명동교자',
                    category: 'restaurants',
                    location: '서울특별시 중구 명동길 74',
                    tel: '02-774-1784',
                    images: { main: null, thumbnail: null },
                    coordinates: { x: 126.9872900000, y: 37.5633800000 },
                    overview: '1966년 개업한 명동의 대표적인 만두전문점입니다.',
                    restaurantInfo: {
                        foodType: '한식',
                        specialMenu: '명동교자, 갈비만두',
                        openTime: '10:30-21:30',
                        restDay: '연중무휴'
                    },
                    rating: { score: '4.2', reviewCount: 567, popularity: 82 },
                    originalData: { source: 'sample_data', isRealData: false }
                }
            ]
        },
        '부산': {
            'attractions': [
                {
                    id: 'sample_busan_haeundae',
                    title: '해운대해수욕장',
                    category: 'attractions',
                    location: '부산광역시 해운대구 우동',
                    tel: '051-749-4000',
                    images: { 
                        main: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=busan_haeundae_001',
                        thumbnail: null 
                    },
                    coordinates: { x: 129.1603100000, y: 35.1587200000 },
                    overview: '국내 최고의 해수욕장으로 다양한 축제와 이벤트가 열립니다.',
                    attractionInfo: {
                        type: 'tourism',
                        useTime: '상시개방',
                        restDay: '연중무휴'
                    },
                    rating: { score: '4.5', reviewCount: 723, popularity: 90 },
                    originalData: { source: 'sample_data', isRealData: false }
                }
            ]
        }
    };

    // 기본 데이터 가져오기
    const regionData = sampleDatabase[region] || sampleDatabase['서울'];
    let selectedData = [];

    if (category === 'all') {
        // 전체 카테고리인 경우 모든 데이터 합치기
        for (const [cat, items] of Object.entries(regionData)) {
            selectedData = selectedData.concat(items.slice(0, 3)); // 각 카테고리당 3개씩
        }
    } else {
        // 특정 카테고리
        const categoryData = regionData[category] || regionData['attractions'] || [];
        selectedData = categoryData.slice(0, 10);
    }

    if (isDev) {
        console.log(`📦 샘플 데이터 제공: ${region} ${category} ${selectedData.length}개`);
    }

    return selectedData;
}
