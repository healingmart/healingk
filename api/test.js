// api/test.js (완전한 세밀한 정보 수집 버전)

// ===== 지역 코드 및 설정 =====
const AREA_CODES = {
  '서울': 1, '부산': 6, '대구': 4, '인천': 2, '광주': 5, '대전': 3, '울산': 7,
  '세종': 8, '세종시': 8,
  '경기': 31, '강원': 32, '충북': 33, '충남': 34, '전북': 37, '전남': 38, 
  '경북': 35, '경남': 36, '제주': 39,
  '강릉': 32, '춘천': 32, '속초': 32, '평창': 32,
  '천안': 34, '공주': 34, '부여': 34,
  '전주': 37, '군산': 37, '정읍': 37, '남원': 37,
  '목포': 38, '순천': 38, '여수': 38,
  '경주': 35, '안동': 35, '포항': 35,
  '통영': 36, '거제': 36, '남해': 36,
  '제주시': 39, '서귀포': 39,
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
  service2: {
    areaList: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    keyword: 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2',
    detailCommon: 'https://apis.data.go.kr/B551011/KorService2/detailCommon2',
    detailIntro: 'https://apis.data.go.kr/B551011/KorService2/detailIntro2',
    detailImage: 'https://apis.data.go.kr/B551011/KorService2/detailImage2'
  }
};

// ===== 메인 핸들러 =====
module.exports = async function handler(req, res) {
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
            category = 'accommodation',
            numOfRows = 3,
            pageNo = 1,
            detail = 'full'
        } = req.query;
        
        const finalContentType = CATEGORY_MAPPING[category] || '관광지';
        
        console.log('🚀 ===== 세밀한 정보 TEST API 시작 =====');
        console.log('🗺️ 지역:', region);
        console.log('🏷️ 카테고리:', category);
        console.log('📊 요청 개수:', numOfRows);
        console.log('🔍 상세도:', detail);

        // API 키 확인
        const apiKeyResult = getAPIKey();
        if (!apiKeyResult.success) {
            return res.status(500).json({
                success: false,
                message: '⚠️ API 키 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 확인:', `${apiKeyResult.key.substring(0, 10)}...`);

        // 1단계: 기본 목록 수집
        console.log('📋 1단계: 기본 목록 수집...');
        const basicResult = await processTourismAPI(apiKeyResult.key, region, {
            category,
            contentType: finalContentType,
            numOfRows: parseInt(numOfRows),
            pageNo: parseInt(pageNo)
        });

        if (!basicResult.success || !basicResult.data?.attractions) {
            return res.status(200).json({
                success: false,
                message: `❌ ${region} ${category} 기본 정보 수집 실패`,
                responseTime: `${Date.now() - startTime}ms`
            });
        }

        const basicAttractions = basicResult.data.attractions;
        console.log(`✅ 기본 목록 ${basicAttractions.length}개 수집 완료`);

        // 2단계: 상세 정보 수집
        let detailedAttractions = basicAttractions;
        
        if (detail === 'medium' || detail === 'full') {
            console.log(`🔍 2단계: ${detail} 상세 정보 수집 시작...`);
            detailedAttractions = await enrichWithDetailedInfo(apiKeyResult.key, basicAttractions, detail);
        }

        const responseTime = Date.now() - startTime;

        return res.status(200).json({
            success: true,
            data: {
                region,
                category,
                attractions: detailedAttractions,
                attractionCount: detailedAttractions.length,
                stats: {
                    total: detailedAttractions.length,
                    withImages: detailedAttractions.filter(a => a.images?.main || a.image).length,
                    withCoordinates: detailedAttractions.filter(a => a.coordinates?.x || (a.mapx && a.mapy)).length,
                    withDetailedInfo: detailedAttractions.filter(a => a.detailedInfo).length,
                    withOverview: detailedAttractions.filter(a => a.overview).length,
                    avgCompleteness: Math.round(detailedAttractions.reduce((sum, a) => sum + (a.dataQuality?.completeness || 20), 0) / detailedAttractions.length)
                }
            },
            message: `🏛️ ${region} ${category} 세밀한 정보 테스트!`,
            detailLevel: detail,
            realTime: true,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 테스트 API 오류:', error);
        return res.status(500).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// ===== 상세 정보 수집 =====
async function enrichWithDetailedInfo(apiKey, basicAttractions, detailLevel) {
    console.log(`🔍 ${basicAttractions.length}개 항목의 상세 정보 수집 시작...`);
    
    const enrichedAttractions = [];
    
    for (let i = 0; i < basicAttractions.length; i++) {
        const attraction = basicAttractions[i];
        console.log(`\n🔄 [${i + 1}/${basicAttractions.length}] ${attraction.title} 처리 중...`);
        
        try {
            const detailedAttraction = await getDetailedAttractionInfo(apiKey, attraction, detailLevel);
            enrichedAttractions.push(detailedAttraction);
            
            // 요청 간 딜레이 (API 부하 방지)
            if (i < basicAttractions.length - 1) {
                await sleep(1000);
            }
        } catch (error) {
            console.error(`❌ ${attraction.title} 처리 실패:`, error.message);
            enrichedAttractions.push(attraction);
        }
    }
    
    console.log(`✅ 상세 정보 수집 완료: ${enrichedAttractions.length}개`);
    return enrichedAttractions;
}

// ===== 개별 상세 정보 수집 =====
async function getDetailedAttractionInfo(apiKey, basicAttraction, detailLevel) {
    const contentId = basicAttraction.id;
    
    // 카테고리별 ContentTypeId 결정
    let contentTypeId = 32; // 숙박 기본값
    if (basicAttraction.category?.includes('B02010') || basicAttraction.category?.includes('B02011')) {
        contentTypeId = 32; // 숙박시설
    }
    
    console.log(`🔍 [${basicAttraction.title}]`);
    console.log(`  ID: ${contentId}, 타입: ${contentTypeId}`);
    
    try {
        // DetailCommon API 호출
        console.log(`📋 DetailCommon API 호출...`);
        const commonDetail = await fetchDetailCommon(apiKey, contentId, contentTypeId);
        console.log(`📋 DetailCommon 결과: ${commonDetail ? '성공' : '실패'}`);
        if (commonDetail) {
            console.log(`  - 개요: ${commonDetail.overview ? `${commonDetail.overview.length}자` : '없음'}`);
            console.log(`  - 연락처: ${commonDetail.tel || '없음'}`);
            console.log(`  - 이용시간: ${commonDetail.useTime || '없음'}`);
        }
        
        // DetailIntro API 호출 (full 레벨에서만)
        let introDetail = null;
        if (detailLevel === 'full') {
            console.log(`🏷️ DetailIntro API 호출...`);
            introDetail = await fetchDetailIntro(apiKey, contentId, contentTypeId);
            console.log(`🏷️ DetailIntro 결과: ${introDetail ? '성공' : '실패'}`);
        }
        
        // 결과 통합
        const enrichedAttraction = {
            ...basicAttraction,
            
            // 업데이트된 기본 정보
            overview: commonDetail?.overview || basicAttraction.overview,
            tel: commonDetail?.tel || basicAttraction.tel,
            homepage: commonDetail?.homepage || null,
            
            // 확장된 이용 정보
            useInfo: {
                useTime: commonDetail?.useTime || null,
                restDate: commonDetail?.restDate || null,
                useFee: commonDetail?.useFee || null,
                parking: commonDetail?.parking || null,
                babyCarriage: commonDetail?.babyCarriage || null,
                pet: commonDetail?.pet || null,
                disabled: commonDetail?.disabled || null
            },
            
            // 좌표 정보 통합
            coordinates: {
                x: parseFloat(basicAttraction.mapx) || null,
                y: parseFloat(basicAttraction.mapy) || null,
                address: basicAttraction.address
            },
            
            // 이미지 정보 확장
            images: {
                main: basicAttraction.image,
                thumbnail: null,
                additional: []
            },
            
            // 특화 정보
            detailedInfo: introDetail || null,
            
            // 데이터 품질
            dataQuality: {
                hasOverview: !!commonDetail?.overview,
                hasUseInfo: !!(commonDetail?.useTime || commonDetail?.useFee),
                hasDetailedInfo: !!introDetail,
                hasAdditionalImages: false,
                completeness: calculateCompleteness(commonDetail, introDetail, [])
            },
            
            lastUpdated: new Date().toISOString()
        };
        
        console.log(`✅ ${basicAttraction.title} 완료 (완성도: ${enrichedAttraction.dataQuality.completeness}%)`);
        return enrichedAttraction;
        
    } catch (error) {
        console.error(`❌ ${basicAttraction.title} 실패:`, error.message);
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

// ===== DetailCommon API 호출 =====
async function fetchDetailCommon(apiKey, contentId, contentTypeId) {
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        contentTypeId: contentTypeId.toString(),
        defaultYN: 'Y',
        overviewYN: 'Y'
    });

    const url = `${API_ENDPOINTS.service2.detailCommon}?${params.toString()}`;
    console.log(`📡 DetailCommon URL: ${url.substring(0, 120)}...`);

    try {
        const response = await fetchWithTimeout(url, 15000);
        console.log(`📊 DetailCommon 응답: ${response.status} ${response.ok ? 'OK' : 'ERROR'}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`📦 DetailCommon 원본:`, JSON.stringify(data, null, 2).substring(0, 400) + '...');
        
        if (data.response?.header?.resultCode === '0000') {
            const item = data.response.body?.items?.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                console.log(`✅ DetailCommon 성공!`);
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
        } else {
            console.log(`❌ DetailCommon API 오류: ${data.response?.header?.resultCode} - ${data.response?.header?.resultMsg}`);
        }
        
        return null;
    } catch (error) {
        console.log(`❌ DetailCommon 실행 오류: ${error.message}`);
        return null;
    }
}

// ===== DetailIntro API 호출 =====
async function fetchDetailIntro(apiKey, contentId, contentTypeId) {
    const params = new URLSearchParams({
        serviceKey: apiKey,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentId: contentId,
        contentTypeId: contentTypeId.toString()
    });

    const url = `${API_ENDPOINTS.service2.detailIntro}?${params.toString()}`;
    console.log(`📡 DetailIntro URL: ${url.substring(0, 120)}...`);

    try {
        const response = await fetchWithTimeout(url, 15000);
        console.log(`📊 DetailIntro 응답: ${response.status} ${response.ok ? 'OK' : 'ERROR'}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        console.log(`📦 DetailIntro 원본:`, JSON.stringify(data, null, 2).substring(0, 400) + '...');
        
        if (data.response?.header?.resultCode === '0000') {
            const item = data.response.body?.items?.item;
            if (item) {
                const itemData = Array.isArray(item) ? item[0] : item;
                console.log(`✅ DetailIntro 성공!`);
                
                // 숙박시설 특화 정보
                return {
                    type: 'accommodation',
                    roomCount: itemData.roomcount || '',
                    roomType: itemData.roomtype || '',
                    checkInTime: itemData.checkintime || '',
                    checkOutTime: itemData.checkouttime || '',
                    subFacility: itemData.subfacility || '',
                    barbecue: itemData.barbecue || '',
                    karaoke: itemData.karaoke || '',
                    sauna: itemData.sauna || ''
                };
            }
        } else {
            console.log(`❌ DetailIntro API 오류: ${data.response?.header?.resultCode} - ${data.response?.header?.resultMsg}`);
        }
        
        return null;
    } catch (error) {
        console.log(`❌ DetailIntro 실행 오류: ${error.message}`);
        return null;
    }
}

// ===== 유틸리티 함수들 =====

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

async function fetchWithTimeout(url, timeout = 15000) {
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

// ===== 기존 함수들 (간소화) =====
function getAPIKey() {
    const possibleKeys = [
        { name: 'TOURISM_API_KEY', key: process.env.TOURISM_API_KEY },
        { name: 'TOUR_API_KEY', key: process.env.TOUR_API_KEY },
        { name: 'JEONBUK_API_KEY', key: process.env.JEONBUK_API_KEY },
        { name: 'WEATHER_API_KEY', key: process.env.WEATHER_API_KEY },
        { name: 'REGIONAL_API_KEY', key: process.env.REGIONAL_API_KEY }
    ];

    const validKey = possibleKeys.find(item => item.key && item.key.length > 10);
    
    if (validKey) {
        return { success: true, key: validKey.key, source: validKey.name };
    }

    return { success: false };
}

async function processTourismAPI(apiKey, region, options) {
    const areaCode = AREA_CODES[region] || AREA_CODES['서울'];
    const contentTypeId = CONTENT_TYPES[options.contentType] || 32;
    
    const params = new URLSearchParams({
        serviceKey: apiKey,
        numOfRows: options.numOfRows,
        pageNo: options.pageNo,
        MobileOS: 'ETC',
        MobileApp: 'HealingK',
        _type: 'json',
        contentTypeId: contentTypeId,
        areaCode: areaCode
    });

    try {
        const response = await fetchWithTimeout(`${API_ENDPOINTS.service2.areaList}?${params.toString()}`, 15000);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.response?.header?.resultCode === '0000') {
            const items = data.response.body?.items?.item || [];
            const itemsArray = Array.isArray(items) ? items : [items];
            
            const attractions = itemsArray.map((item, index) => ({
                id: item.contentid || `${Date.now()}_${index}`,
                title: item.title || `${region} ${options.category} ${index + 1}`,
                category: item.cat3 || item.cat2 || options.category,
                address: item.addr1 || `${region} 지역`,
                tel: item.tel || '정보 없음',
                image: item.firstimage || null,
                mapx: item.mapx || null,
                mapy: item.mapy || null,
                overview: item.overview || null
            }));
            
            return {
                success: true,
                method: 'service2_area',
                data: { attractions }
            };
        }

        throw new Error(data.response?.header?.resultMsg || '데이터 없음');
    } catch (error) {
        return { success: false, error: error.message };
    }
}
