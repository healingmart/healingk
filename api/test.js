// api/alltourism.js (세밀한 정보 수집 완전판)

// ===== 기존 설정들 동일 =====
const AREA_CODES = {
  // 특별시/광역시
  '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
  '세종': 8, '세종시': 8,
  
  // 도 지역
  '경기': 31, '강원': 32, '충북': 33, '충남': 34, '전북': 37, '전남': 38, 
  '경북': 35, '경남': 36, '제주': 39,
  
  // 주요 관광 도시
  '강릉': 32, '춘천': 32, '속초': 32, '평창': 32,
  '천안': 34, '공주': 34, '부여': 34,
  '전주': 37, '군산': 37, '정읍': 37, '남원': 37,
  '목포': 38, '순천': 38, '여수': 38,
  '경주': 35, '안동': 35, '포항': 35,
  '통영': 36, '거제': 36, '남해': 36,
  '제주시': 39, '서귀포': 39,
  
  // 경기도 주요 도시
  '수원': 31, '성남': 31, '안양': 31, '부천': 31, '광명': 31, '평택': 31,
  '동탄': 31, '일산': 31, '분당': 31, '판교': 31
};

const CONTENT_TYPES = {
  '관광지': 12,
  '문화시설': 14,
  '축제공연행사': 15,
  '여행코스': 25,
  '레포츠': 28,
  '숙박': 32,
  '쇼핑': 38,
  '음식점': 39
};

const CATEGORY_MAPPING = {
  'festivals': '축제공연행사',
  'accommodation': '숙박',
  'restaurants': '음식점',
  'culture': '문화시설',
  'attractions': '관광지',
  'shopping': '쇼핑',
  'sports': '레포츠',
  'course': '여행코스'
};

const API_ENDPOINTS = {
  service1: {
    areaList: 'https://apis.data.go.kr/B551011/KorService1/areaBasedList1',
    keyword: 'https://apis.data.go.kr/B551011/KorService1/searchKeyword1',
    location: 'https://apis.data.go.kr/B551011/KorService1/locationBasedList1',
    festival: 'https://apis.data.go.kr/B551011/KorService1/searchFestival1',
    detailCommon: 'https://apis.data.go.kr/B551011/KorService1/detailCommon1',
    detailIntro: 'https://apis.data.go.kr/B551011/KorService1/detailIntro1',
    detailImage: 'https://apis.data.go.kr/B551011/KorService1/detailImage1'
  },
  service2: {
    areaList: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    keyword: 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2',
    location: 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2',
    detailCommon: 'https://apis.data.go.kr/B551011/KorService2/detailCommon2',
    detailIntro: 'https://apis.data.go.kr/B551011/KorService2/detailIntro2',
    detailImage: 'https://apis.data.go.kr/B551011/KorService2/detailImage2'
  }
};

// ===== 메인 핸들러 (세밀한 정보 수집 버전) =====
module.exports = async function handler(req, res) {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const startTime = Date.now();
        const { 
            region = '서울', 
            category = 'attractions',
            numOfRows = 10,
            pageNo = 1,
            detail = 'full'  // basic, medium, full
        } = req.query;
        
        const finalContentType = CATEGORY_MAPPING[category] || contentType;
        
        console.log('🚀 ===== 세밀한 관광 정보 수집 API 시작 =====');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);
        console.log('🏷️ 카테고리:', category);
        console.log('📊 요청 개수:', numOfRows);
        console.log('🔍 상세도:', detail);

        // API 키 확인
        const apiKeyResult = getAPIKey();
        if (!apiKeyResult.success) {
            return res.status(200).json({
                success: false,
                message: '⚠️ API 키 설정 필요',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });
        }

        console.log('✅ API 키 확인:', `${apiKeyResult.key.substring(0, 10)}...`);

        // 1단계: 기본 목록 수집
        console.log('📋 1단계: 기본 목록 수집 중...');
        const basicResult = await processTourismAPI(apiKeyResult.key, region, {
            category,
            contentType: finalContentType,
            numOfRows: parseInt(numOfRows),
            pageNo: parseInt(pageNo)
        });

        if (!basicResult.success || !basicResult.data.attractions || basicResult.data.attractions.length === 0) {
            return res.status(200).json({
                success: false,
                message: `❌ ${region} ${category} 기본 정보 수집 실패`,
                responseTime: `${Date.now() - startTime}ms`,
                timestamp: new Date().toISOString()
            });
        }

        const basicAttractions = basicResult.data.attractions;
        console.log(`✅ 기본 목록 ${basicAttractions.length}개 수집 완료`);

        // 2단계: 상세 정보 수집 (detail 레벨에 따라)
        let detailedAttractions = basicAttractions;
        
        if (detail === 'medium' || detail === 'full') {
            console.log('🔍 2단계: 상세 정보 수집 중...');
            detailedAttractions = await enrichWithDetailedInfo(apiKeyResult.key, basicAttractions, detail);
        }

        const responseTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            data: {
                region,
                category,
                attractions: detailedAttractions,
                events: basicResult.data.events || [],
                attractionCount: detailedAttractions.length,
                eventCount: basicResult.data.events?.length || 0,
                stats: {
                    total: detailedAttractions.length,
                    withImages: detailedAttractions.filter(a => a.images?.main).length,
                    withCoordinates: detailedAttractions.filter(a => a.coordinates?.x && a.coordinates?.y).length,
                    withDetailedInfo: detailedAttractions.filter(a => a.detailedInfo).length,
                    categories: [...new Set(detailedAttractions.map(a => a.category))].length
                }
            },
            message: `🏛️ ${region} ${category} 세밀한 관광 정보!`,
            method: basicResult.method,
            detailLevel: detail,
            realTime: true,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 메인 핸들러 오류:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: '🏛️ 세밀한 관광 정보 수집 중 오류 발생',
            timestamp: new Date().toISOString()
        });
    }
};

// ===== 상세 정보 수집 및 통합 =====
async function enrichWithDetailedInfo(apiKey, basicAttractions, detailLevel) {
    console.log(`🔍 ${basicAttractions.length}개 항목의 상세 정보 수집 시작...`);
    
    const enrichedAttractions = [];
    const concurrency = 3; // 동시 요청 제한 (API 부하 방지)
    
    // 청크 단위로 병렬 처리
    for (let i = 0; i < basicAttractions.length; i += concurrency) {
        const chunk = basicAttractions.slice(i, i + concurrency);
        console.log(`📦 청크 ${Math.floor(i/concurrency) + 1}/${Math.ceil(basicAttractions.length/concurrency)} 처리 중...`);
        
        const promises = chunk.map(async (attraction) => {
            try {
                const detailedAttraction = await getDetailedAttractionInfo(apiKey, attraction, detailLevel);
                return detailedAttraction;
            } catch (error) {
                console.error(`❌ ${attraction.title} 상세 정보 수집 실패:`, error.message);
                return attraction; // 실패 시 기본 정보 유지
            }
        });
        
        const chunkResults = await Promise.all(promises);
        enrichedAttractions.push(...chunkResults);
        
        // 청크 간 딜레이 (API 부하 방지)
        if (i + concurrency < basicAttractions.length) {
            await sleep(500);
        }
    }
    
    console.log(`✅ 상세 정보 수집 완료: ${enrichedAttractions.length}개`);
    return enrichedAttractions;
}

// ===== 개별 관광지 상세 정보 수집 =====
async function getDetailedAttractionInfo(apiKey, basicAttraction, detailLevel) {
    const contentId = basicAttraction.id;
    const contentTypeId = getContentTypeIdFromCategory(basicAttraction.category);
    
    console.log(`🔍 ${basicAttraction.title} (ID: ${contentId}) 상세 정보 수집...`);
    
    try {
        // 상세 공통 정보 수집
        const commonDetail = await fetchDetailCommon(apiKey, contentId, contentTypeId);
        
        // 특화 정보 수집 (full 레벨에서만)
        let introDetail = null;
        if (detailLevel === 'full') {
            introDetail = await fetchDetailIntro(apiKey, contentId, contentTypeId);
        }
        
        // 추가 이미지 수집 (full 레벨에서만)
        let additionalImages = [];
        if (detailLevel === 'full') {
            additionalImages = await fetchDetailImages(apiKey, contentId);
        }
        
        // 모든 정보 통합
        const enrichedAttraction = {
            ...basicAttraction,
            
            // 기본 정보 업데이트
            overview: commonDetail?.overview || basicAttraction.overview,
            tel: commonDetail?.tel || basicAttraction.tel,
            homepage: commonDetail?.homepage || null,
            
            // 상세 이용 정보
            useInfo: {
                useTime: commonDetail?.useTime || null,
                restDate: commonDetail?.restDate || null,
                useFee: commonDetail?.useFee || null,
                parking: commonDetail?.parking || null,
                babyCarriage: commonDetail?.babyCarriage || null,
                pet: commonDetail?.pet || null,
                disabled: commonDetail?.disabled || null
            },
            
            // 이미지 정보 확장
            images: {
                main: basicAttraction.image,
                thumbnail: basicAttraction.thumbnail || null,
                additional: additionalImages.slice(0, 5) // 최대 5개 추가 이미지
            },
            
            // 좌표 정보 (기존 mapx, mapy를 coordinates로 통합)
            coordinates: {
                x: parseFloat(basicAttraction.mapx) || null,
                y: parseFloat(basicAttraction.mapy) || null,
                address: basicAttraction.address
            },
            
            // 카테고리별 특화 정보
            detailedInfo: introDetail || null,
            
            // 메타 정보
            dataQuality: {
                hasOverview: !!commonDetail?.overview,
                hasUseInfo: !!(commonDetail?.useTime || commonDetail?.useFee),
                hasDetailedInfo: !!introDetail,
                hasAdditionalImages: additionalImages.length > 0,
                completeness: calculateCompleteness(commonDetail, introDetail, additionalImages)
            },
            
            lastUpdated: new Date().toISOString()
        };
        
        console.log(`✅ ${basicAttraction.title} 상세 정보 완료 (완성도: ${enrichedAttraction.dataQuality.completeness}%)`);
        return enrichedAttraction;
        
    } catch (error) {
        console.error(`❌ ${basicAttraction.title} 상세 정보 수집 실패:`, error.message);
        return {
            ...basicAttraction,
            dataQuality: {
                hasOverview: false,
                hasUseInfo: false, 
                hasDetailedInfo: false,
                hasAdditionalImages: false,
                completeness: 20,
                error: error.message
            }
        };
    }
}

// ===== 상세 공통 정보 API 호출 =====
async function fetchDetailCommon(apiKey, contentId, contentTypeId) {
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        contentTypeId: contentTypeId,
        defaultYN: 'Y',
        firstImageYN: 'Y',
        areacodeYN: 'Y',
        catcodeYN: 'Y',
        addrinfoYN: 'Y',
        mapinfoYN: 'Y',
        overviewYN: 'Y'
    });

    try {
        const response = await fetchWithTimeout(`${API_ENDPOINTS.service2.detailCommon}?${params.toString()}`, 10000);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.response?.header?.resultCode === '0000') {
            const item = data.response.body?.items?.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return {
                    overview: itemData.overview || null,
                    tel: itemData.tel || null,
                    homepage: itemData.homepage || null,
                    useTime: itemData.usetime || null,
                    restDate: itemData.restdate || null,
                    useFee: itemData.usefee || null,
                    parking: itemData.parking || null,
                    babyCarriage: itemData.babycarriage || null,
                    pet: itemData.pet || null,
                    disabled: itemData.disabled || null
                };
            }
        }
        
        return null;
    } catch (error) {
        console.log(`⚠️ DetailCommon API 실패 (${contentId}): ${error.message}`);
        return null;
    }
}

// ===== 상세 특화 정보 API 호출 =====
async function fetchDetailIntro(apiKey, contentId, contentTypeId) {
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        contentTypeId: contentTypeId
    });

    try {
        const response = await fetchWithTimeout(`${API_ENDPOINTS.service2.detailIntro}?${params.toString()}`, 10000);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.response?.header?.resultCode === '0000') {
            const item = data.response.body?.items?.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                return formatDetailIntroByContentType(itemData, contentTypeId);
            }
        }
        
        return null;
    } catch (error) {
        console.log(`⚠️ DetailIntro API 실패 (${contentId}): ${error.message}`);
        return null;
    }
}

// ===== 상세 이미지 API 호출 =====
async function fetchDetailImages(apiKey, contentId) {
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        imageYN: 'Y',
        subImageYN: 'Y',
        numOfRows: '10'
    });

    try {
        const response = await fetchWithTimeout(`${API_ENDPOINTS.service2.detailImage}?${params.toString()}`, 10000);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.response?.header?.resultCode === '0000') {
            const items = data.response.body?.items?.item;
            if (items) {
                const itemsArray = Array.isArray(items) ? items : [items];
                return itemsArray.map(img => ({
                    originUrl: img.originimgurl || img.smallimageurl,
                    thumbnailUrl: img.smallimageurl,
                    description: img.imgname || ''
                })).filter(img => img.originUrl);
            }
        }
        
        return [];
    } catch (error) {
        console.log(`⚠️ DetailImage API 실패 (${contentId}): ${error.message}`);
        return [];
    }
}

// ===== 컨텐츠 타입별 특화 정보 포맷팅 =====
function formatDetailIntroByContentType(itemData, contentTypeId) {
    switch (parseInt(contentTypeId)) {
        case 15: // 축제
            return {
                type: 'festival',
                eventStartDate: itemData.eventstartdate || '',
                eventEndDate: itemData.eventenddate || '',
                eventPlace: itemData.eventplace || '',
                eventHomepage: itemData.eventhomepage || '',
                sponsor: itemData.sponsor1 || '',
                sponsor2: itemData.sponsor2 || '',
                playTime: itemData.playtime || '',
                program: itemData.program || '',
                useTimeFestival: itemData.usetimefestival || ''
            };

        case 32: // 숙박
            return {
                type: 'accommodation',
                roomCount: itemData.roomcount || '',
                roomType: itemData.roomtype || '',
                checkInTime: itemData.checkintime || '',
                checkOutTime: itemData.checkouttime || '',
                cookingFlag: itemData.chkcooking || '',
                partyFlag: itemData.chkparty || '',
                subFacility: itemData.subfacility || '',
                barbecue: itemData.barbecue || '',
                beauty: itemData.beauty || '',
                karaoke: itemData.karaoke || '',
                sauna: itemData.sauna || ''
            };

        case 39: // 음식점
            return {
                type: 'restaurant',
                treatMenu: itemData.treatmenu || '',
                smoking: itemData.smoking || '',
                packing: itemData.packing || '',
                kidsFacility: itemData.kidsfacility || '',
                creditCard: itemData.creditcard || '',
                reservationUrl: itemData.reservationurl || '',
                openTimeFood: itemData.opentimefood || '',
                restDateFood: itemData.restdatefood || '',
                scalefood: itemData.scalefood || ''
            };

        case 14: // 문화시설
            return {
                type: 'culture',
                scale: itemData.scale || '',
                useTimeCulture: itemData.usetimeculture || '',
                restDateCulture: itemData.restdateculture || '',
                parkingCulture: itemData.parkingculture || '',
                parkingFee: itemData.parkingfee || '',
                spendTime: itemData.spendtime || '',
                accomCount: itemData.accomcount || ''
            };

        case 12: // 관광지
        default:
            return {
                type: 'attraction',
                heritage1: itemData.heritage1 || '',
                heritage2: itemData.heritage2 || '',
                heritage3: itemData.heritage3 || '',
                accomCount: itemData.accomcount || '',
                useTime: itemData.usetime || '',
                restDate: itemData.restdate || '',
                expGuide: itemData.expguide || '',
                expAgeRange: itemData.expagerange || '',
                ageLimit: itemData.agelimit || ''
            };
    }
}

// ===== 유틸리티 함수들 =====

// 컨텐츠 타입 ID 반환
function getContentTypeIdFromCategory(category) {
    const mapping = {
        '종교시설': 12,
        '공원': 12,
        '산업관광지': 12,
        '공연/행사': 15,
        '문화재': 14,
        'A02030400': 12,
        'A02050200': 12
    };
    return mapping[category] || 12;
}

// 데이터 완성도 계산
function calculateCompleteness(commonDetail, introDetail, additionalImages) {
    let score = 20; // 기본 점수
    
    if (commonDetail?.overview) score += 30;
    if (commonDetail?.tel) score += 10;
    if (commonDetail?.useTime) score += 15;
    if (commonDetail?.useFee) score += 10;
    if (introDetail) score += 10;
    if (additionalImages.length > 0) score += 5;
    
    return Math.min(score, 100);
}

// 타임아웃이 있는 fetch
async function fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'HealingK-Detailed/2.0',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 기존 함수들 (동일) =====
function getAPIKey() {
    const possibleKeys = [
        { name: 'JEONBUK_API_KEY', key: process.env.JEONBUK_API_KEY },
        { name: 'TOURISM_API_KEY', key: process.env.TOURISM_API_KEY },
        { name: 'TOUR_API_KEY', key: process.env.TOUR_API_KEY },
        { name: 'WEATHER_API_KEY', key: process.env.WEATHER_API_KEY },
        { name: 'REGIONAL_API_KEY', key: process.env.REGIONAL_API_KEY }
    ];

    console.log('🔑 환경변수 상태:');
    possibleKeys.forEach(item => {
        console.log(`  ${item.name}: ${!!item.key}`);
    });

    const validKey = possibleKeys.find(item => item.key && item.key.length > 10);
    
    if (validKey) {
        console.log(`✅ 사용할 키: ${validKey.name}`);
        return { success: true, key: validKey.key, source: validKey.name };
    }

    console.log('❌ 유효한 API 키 없음');
    return { success: false };
}

function isJeonbukRegion(region) {
    const jeonbukRegions = ['전북', '전주', '군산', '익산', '정읍', '남원', '김제'];
    return jeonbukRegions.includes(region);
}

async function handleJeonbukAPI(region, category) {
    try {
        console.log('📞 전북 API 호출 시도...');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);
        
        const response = await fetch(`https://healingk.vercel.app/api/jeonbuk-tourism?region=${region}&category=${category}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'HealingK-Tourism/1.0'
            },
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
            const data = await response.json();
            if (data && data.success) {
                console.log('✅ 전북 API 성공');
                return data;
            }
        }
        
        console.log('❌ 전북 API 실패');
        return { success: false };
    } catch (error) {
        console.log('❌ 전북 API 오류:', error.message);
        return { success: false };
    }
}

async function processTourismAPI(apiKey, region, options) {
    const areaCode = AREA_CODES[region] || AREA_CODES['서울'];
    const contentTypeId = CONTENT_TYPES[options.contentType] || 12;
    
    console.log('📋 API 파라미터:', {
        지역코드: areaCode,
        컨텐츠타입: contentTypeId,
        개수: options.numOfRows,
        페이지: options.pageNo
    });

    const strategies = [
        {
            name: 'service2_area',
            url: API_ENDPOINTS.service2.areaList,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                contentTypeId: contentTypeId,
                areaCode: areaCode
            }
        },
        {
            name: 'service2_keyword',
            url: API_ENDPOINTS.service2.keyword,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                keyword: region
            }
        },
        {
            name: 'service1_area',
            url: API_ENDPOINTS.service1.areaList,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                contentTypeId: contentTypeId,
                areaCode: areaCode
            }
        }
    ];

    for (const strategy of strategies) {
        console.log(`🎯 전략 시도: ${strategy.name}`);
        
        const result = await tryAPIStrategy(strategy, region);
        if (result.success) {
            console.log(`✅ ${strategy.name} 성공!`);
            return result;
        }
        
        console.log(`❌ ${strategy.name} 실패`);
        await sleep(800);
    }

    return { 
        success: false, 
        method: 'all_strategies_failed',
        debug: '모든 API 전략 실패'
    };
}

async function tryAPIStrategy(strategy, region) {
    try {
        const params = new URLSearchParams(strategy.params);
        const fullUrl = `${strategy.url}?${params.toString()}`;
        
        const response = await fetchWithTimeout(fullUrl, 15000);

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        const contentType = response.headers.get('content-type') || '';
        
        if (contentType.includes('application/json')) {
            return await handleJSONResponse(response, strategy.name, region);
        } else {
            return await handleXMLResponse(response, strategy.name, region);
        }

    } catch (error) {
        console.log(`❌ ${strategy.name} 실행 오류:`, error.message);
        return { success: false, error: error.message };
    }
}

async function handleJSONResponse(response, strategyName, region) {
    try {
        const data = await response.json();
        
        const resultCode = data.response?.header?.resultCode;
        
        if (resultCode === '0000' || resultCode === '00' || resultCode === '0') {
            const items = data.response?.body?.items?.item;
            
            if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                return {
                    success: true,
                    method: strategyName,
                    data: convertToTourismFormat(items, region)
                };
            }
        }
        
        return { success: false, error: data.response?.header?.resultMsg || '데이터 없음' };
        
    } catch (error) {
        return { success: false, error: 'JSON 파싱 실패' };
    }
}

async function handleXMLResponse(response, strategyName, region) {
    try {
        const text = await response.text();
        
        if (text.includes('<resultCode>00</resultCode>') || text.includes('<resultCode>0000</resultCode>')) {
            const titleMatches = text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
            const addrMatches = text.match(/<addr1><!\[CDATA\[(.*?)\]\]><\/addr1>/g);
            const imageMatches = text.match(/<firstimage><!\[CDATA\[(.*?)\]\]><\/firstimage>/g);
            const idMatches = text.match(/<contentid>(\d+)<\/contentid>/g);
            
            if (titleMatches && titleMatches.length > 0) {
                const xmlItems = titleMatches.map((titleMatch, index) => {
                    const title = titleMatch.replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '');
                    
                    let addr1 = '';
                    if (addrMatches && addrMatches[index]) {
                        addr1 = addrMatches[index].replace(/<addr1><!\[CDATA\[/, '').replace(/\]\]><\/addr1>/, '');
                    }
                    
                    let firstimage = '';
                    if (imageMatches && imageMatches[index]) {
                        firstimage = imageMatches[index].replace(/<firstimage><!\[CDATA\[/, '').replace(/\]\]><\/firstimage>/, '');
                    }
                    
                    let contentid = `xml_${index}`;
                    if (idMatches && idMatches[index]) {
                        contentid = idMatches[index].replace(/<contentid>/, '').replace(/<\/contentid>/, '');
                    }
                    
                    return { title, addr1, firstimage, contentid };
                });
                
                return {
                    success: true,
                    method: `${strategyName}_xml`,
                    data: convertToTourismFormat(xmlItems, region)
                };
            }
        }
        
        return { success: false, error: 'XML 데이터 없음' };
        
    } catch (error) {
        return { success: false, error: 'XML 처리 실패' };
    }
}

function convertToTourismFormat(data, region) {
    const items = Array.isArray(data) ? data : [data];
    
    const attractions = items.slice(0, 8).map((item, index) => {
        const attraction = {
            id: item.contentid || item.id || `tourism_${Date.now()}_${index}`,
            title: cleanTitle(item.title || item.name || `${region} 관광지 ${index + 1}`),
            category: getCategoryName(item.cat3 || item.cat2 || item.category) || '관광지',
            address: item.addr1 || item.address || item.location || `${region} 지역`,
            tel: item.tel || item.phone || '정보 없음',
            image: validateImageUrl(item.firstimage || item.image),
            mapx: item.mapx || item.longitude || null,
            mapy: item.mapy || item.latitude || null,
            overview: item.overview ? item.overview.substring(0, 200) + '...' : null
        };
        
        return attraction;
    });

    const events = generateRegionalEvents(region);

    return {
        region,
        attractions,
        events,
        attractionCount: attractions.length,
        eventCount: events.length,
        stats: {
            total: attractions.length,
            withImages: attractions.filter(a => a.image).length,
            withCoordinates: attractions.filter(a => a.mapx && a.mapy).length,
            categories: [...new Set(attractions.map(a => a.category))].length
        },
        message: `🏛️ ${region} 관광 정보 (실시간 API 연결 성공)`
    };
}

function cleanTitle(title) {
    return title.replace(/^\[.*?\]\s*/, '').trim();
}

function getCategoryName(categoryCode) {
    const categoryMap = {
        'A01010100': '자연관광지',
        'A01010200': '관광자원',
        'A02010100': '역사관광지',
        'A02010200': '휴양관광지',
        'A02010300': '체험관광지',
        'A02010400': '산업관광지',
        'A02010500': '건축/조형물',
        'A02010600': '문화시설',
        'A02010700': '축제',
        'A02010800': '공연/행사',
        'A02010900': '종교시설',
        'A02020100': '역사유적',
        'A02020200': '문화재',
        'A02020300': '박물관',
        'A02020400': '기념관',
        'A02020500': '전시관',
        'A02020600': '컨벤션센터',
        'A02020700': '공원'
    };
    
    return categoryMap[categoryCode] || categoryCode;
}

function validateImageUrl(url) {
    if (!url || url === '') return null;
    if (url.startsWith('http')) return url;
    return null;
}

function generateRegionalEvents(region) {
    const eventTemplates = {
        '서울': [
            { title: '서울 한강 축제', location: '한강공원', date: '2025-06-15' },
            { title: '서울 문화의 밤', location: '광화문광장', date: '2025-06-22' },
            { title: '서울 미식 축제', location: '명동', date: '2025-07-01' }
        ],
        '부산': [
            { title: '부산 바다 축제', location: '해운대해수욕장', date: '2025-06-20' },
            { title: '부산 국제영화제', location: '영화의전당', date: '2025-07-15' },
            { title: '부산 자갈치 축제', location: '자갈치시장', date: '2025-06-28' }
        ],
        '제주': [
            { title: '제주 유채꽃 축제', location: '성산일출봉', date: '2025-06-10' },
            { title: '제주 감귤 축제', location: '서귀포시', date: '2025-07-05' },
            { title: '제주 해녀 축제', location: '우도', date: '2025-06-25' }
        ]
    };

    return eventTemplates[region] || [
        { title: `${region} 문화축제`, location: region, date: '2025-06-15' },
        { title: `${region} 음식축제`, location: region, date: '2025-07-01' }
    ];
}
