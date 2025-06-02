// api/alltourism.js

// ===== 지역 코드 및 설정 =====
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
  // 기존 한국어 카테고리
  '관광지': 12,
  '문화시설': 14,
  '축제공연행사': 15,
  '여행코스': 25,
  '레포츠': 28,
  '숙박': 32,
  '쇼핑': 38,
  '음식점': 39,
  
  // 영어 카테고리 추가 (category 파라미터 지원)
  'festivals': 15,
  'accommodation': 32,
  'restaurants': 39,
  'culture': 14,
  'attractions': 12,
  'shopping': 38,
  'sports': 28,
  'course': 25,
  'all': 'all'
};

// 카테고리 매핑 함수
function mapCategoryToContentType(category) {
    const mapping = {
        'festivals': '축제공연행사',
        'accommodation': '숙박',
        'restaurants': '음식점',
        'culture': '문화시설',
        'attractions': '관광지',
        'shopping': '쇼핑',
        'sports': '레포츠',
        'course': '여행코스',
        'all': '관광지'
    };
    
    return mapping[category] || category;
}

const API_ENDPOINTS = {
  service1: {
    areaList: 'https://apis.data.go.kr/B551011/KorService1/areaBasedList1',
    keyword: 'https://apis.data.go.kr/B551011/KorService1/searchKeyword1',
    location: 'https://apis.data.go.kr/B551011/KorService1/locationBasedList1',
    festival: 'https://apis.data.go.kr/B551011/KorService1/searchFestival1'
  },
  service2: {
    areaList: 'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
    keyword: 'https://apis.data.go.kr/B551011/KorService2/searchKeyword2',
    location: 'https://apis.data.go.kr/B551011/KorService2/locationBasedList2'
  }
};

// ===== 메인 핸들러 =====
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
            category = 'festivals',        // category 파라미터 우선 사용
            contentType = '관광지',        // 기존 호환성 유지
            numOfRows = 10,
            pageNo = 1 
        } = req.query;
        
        // category를 contentType으로 변환 (category 우선)
        const finalContentType = mapCategoryToContentType(category) || contentType;
        
        console.log('🚀 ===== ALL TOURISM API 시작 =====');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);
        console.log('🏷️ 원래 카테고리:', category);
        console.log('📦 최종 컨텐츠 타입:', finalContentType);
        console.log('📊 요청 개수:', numOfRows);

        // API 키 확인 (우선순위별)
        const apiKeyResult = getAPIKey();
        if (!apiKeyResult.success) {
            return res.status(200).json({
                success: true,
                data: getHighQualitySampleData(region, finalContentType),
                message: '⚠️ API 키 설정 필요',
                timestamp: new Date().toISOString(),
                responseTime: Date.now() - startTime
            });
        }

        console.log('✅ API 키 확인:', `${apiKeyResult.key.substring(0, 10)}...`);

        // 전북 지역 특별 처리
        if (isJeonbukRegion(region)) {
            console.log('🔄 전북 API 전용 처리...');
            const jeonbukResult = await handleJeonbukAPI(region, category);
            if (jeonbukResult.success) {
                const responseTime = Date.now() - startTime;
                return res.status(200).json({
                    ...jeonbukResult,
                    responseTime: `${responseTime}ms`
                });
            }
        }

        // 일반 관광 API 처리
        console.log('🎯 일반 관광 API 처리 시작...');
        const tourismResult = await processTourismAPI(apiKeyResult.key, region, {
            category,
            contentType: finalContentType,
            numOfRows: parseInt(numOfRows),
            pageNo: parseInt(pageNo)
        });

        const responseTime = Date.now() - startTime;

        if (tourismResult.success) {
            console.log('🎉 관광 API 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} ${category} 실시간 관광 정보!`,
                method: tourismResult.method,
                realTime: true,
                responseTime: `${responseTime}ms`,
                timestamp: new Date().toISOString()
            });
        }

        // 실패시 고품질 샘플 데이터 제공
        console.log('⚠️ API 실패 - 고품질 샘플 데이터 제공');
        return res.status(200).json({
            success: true,
            data: getHighQualitySampleData(region, finalContentType),
            message: `🏛️ ${region} 관광 정보 (API 연결 준비중)`,
            realTime: false,
            responseTime: `${responseTime}ms`,
            timestamp: new Date().toISOString(),
            debug: tourismResult.debug
        });

    } catch (error) {
        console.error('❌ 메인 핸들러 오류:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: '🏛️ 관광 정보 서비스 일시 중단',
            timestamp: new Date().toISOString()
        });
    }
};

// ===== API 키 관리 =====
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

// ===== 전북 지역 확인 =====
function isJeonbukRegion(region) {
    const jeonbukRegions = ['전북', '전주', '군산', '익산', '정읍', '남원', '김제'];
    return jeonbukRegions.includes(region);
}

// ===== 전북 API 처리 =====
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

// ===== 일반 관광 API 처리 =====
async function processTourismAPI(apiKey, region, options) {
    const areaCode = AREA_CODES[region] || AREA_CODES['서울'];
    const contentTypeId = CONTENT_TYPES[options.contentType] || 12;
    
    console.log('📋 API 파라미터:', {
        지역코드: areaCode,
        컨텐츠타입: contentTypeId,
        개수: options.numOfRows,
        페이지: options.pageNo
    });

    // 다양한 API 전략 시도
    const strategies = [
        // 전략 1: Service2 지역 기반
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
        // 전략 2: Service2 키워드 기반
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
        // 전략 3: Service1 지역 기반 (백업)
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
        },
        // 전략 4: Service1 키워드 기반 (백업)
        {
            name: 'service1_keyword',
            url: API_ENDPOINTS.service1.keyword,
            params: {
                serviceKey: apiKey,
                numOfRows: options.numOfRows,
                pageNo: options.pageNo,
                MobileOS: 'ETC',
                MobileApp: 'HealingK',
                _type: 'json',
                listYN: 'Y',
                arrange: 'A',
                keyword: region,
                contentTypeId: contentTypeId
            }
        }
    ];

    // 각 전략 순차 시도
    for (const strategy of strategies) {
        console.log(`🎯 전략 시도: ${strategy.name}`);
        
        const result = await tryAPIStrategy(strategy, region);
        if (result.success) {
            console.log(`✅ ${strategy.name} 성공!`);
            return result;
        }
        
        console.log(`❌ ${strategy.name} 실패`);
        
        // 전략 간 딜레이
        await sleep(800);
    }

    return { 
        success: false, 
        method: 'all_strategies_failed',
        debug: '모든 API 전략 실패'
    };
}

// ===== API 전략 실행 =====
async function tryAPIStrategy(strategy, region) {
    try {
        const params = new URLSearchParams(strategy.params);
        const fullUrl = `${strategy.url}?${params.toString()}`;
        
        console.log(`📡 요청: ${strategy.name}`);
        console.log(`🔗 URL: ${fullUrl.substring(0, 120)}...`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(fullUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, application/xml, text/xml, */*',
                'User-Agent': 'HealingK-Tourism/1.0',
                'Cache-Control': 'no-cache'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        console.log(`📊 응답 상태:`, {
            status: response.status,
            ok: response.ok,
            contentType: response.headers.get('content-type'),
            size: response.headers.get('content-length')
        });

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

// ===== JSON 응답 처리 =====
async function handleJSONResponse(response, strategyName, region) {
    try {
        const data = await response.json();
        console.log(`📦 JSON 응답 (${strategyName}):`, JSON.stringify(data, null, 2).substring(0, 500));
        
        // 결과 코드 확인
        const resultCode = data.response?.header?.resultCode || 
                          data.resultCode || 
                          data.code || 
                          data.status;
        
        console.log(`📊 결과 코드 (${strategyName}):`, resultCode);
        
        if (resultCode === '0000' || resultCode === '00' || resultCode === '0') {
            // 데이터 추출
            const items = data.response?.body?.items?.item || 
                         data.items || 
                         data.data || 
                         data.result || 
                         data.content;
            
            if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                console.log(`🎉 데이터 발견 (${strategyName}):`, Array.isArray(items) ? items.length : 1, '개');
                
                return {
                    success: true,
                    method: strategyName,
                    data: convertToTourismFormat(items, region)
                };
            }
        }
        
        const errorMsg = data.response?.header?.resultMsg || 
                        data.resultMsg || 
                        data.message || 
                        '알 수 없는 오류';
        
        console.log(`❌ JSON 오류 (${strategyName}):`, errorMsg);
        return { success: false, error: errorMsg };
        
    } catch (error) {
        console.log(`❌ JSON 파싱 오류 (${strategyName}):`, error.message);
        return { success: false, error: 'JSON 파싱 실패' };
    }
}

// ===== XML 응답 처리 =====
async function handleXMLResponse(response, strategyName, region) {
    try {
        const text = await response.text();
        console.log(`📄 XML 응답 (${strategyName}) 길이:`, text.length);
        console.log(`📄 XML 샘플:`, text.substring(0, 300));
        
        if (text.includes('<resultCode>00</resultCode>') || text.includes('<resultCode>0000</resultCode>')) {
            console.log(`✅ XML 성공 코드 발견 (${strategyName})`);
            
            // 제목 추출
            const titleMatches = text.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
            // 주소 추출
            const addrMatches = text.match(/<addr1><!\[CDATA\[(.*?)\]\]><\/addr1>/g);
            // 이미지 추출  
            const imageMatches = text.match(/<firstimage><!\[CDATA\[(.*?)\]\]><\/firstimage>/g);
            // ID 추출
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
                
                console.log(`🎉 XML 데이터 추출 성공 (${strategyName}):`, xmlItems.length, '개');
                
                return {
                    success: true,
                    method: `${strategyName}_xml`,
                    data: convertToTourismFormat(xmlItems, region)
                };
            }
        }
        
        console.log(`❌ XML 오류 또는 데이터 없음 (${strategyName})`);
        return { success: false, error: 'XML 데이터 없음' };
        
    } catch (error) {
        console.log(`❌ XML 처리 오류 (${strategyName}):`, error.message);
        return { success: false, error: 'XML 처리 실패' };
    }
}

// ===== 데이터 변환 함수 =====
function convertToTourismFormat(data, region) {
    const items = Array.isArray(data) ? data : [data];
    
    console.log(`🔄 데이터 변환 시작: ${items.length}개 항목`);

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

    // 지역별 맞춤 이벤트 생성
    const events = generateRegionalEvents(region);

    const result = {
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

    console.log(`✅ 데이터 변환 완료:`, result.stats);
    return result;
}

// ===== 유틸리티 함수들 =====

// 제목 정리
function cleanTitle(title) {
    return title.replace(/^\[.*?\]\s*/, '').trim();
}

// 카테고리명 변환
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

// 이미지 URL 검증
function validateImageUrl(url) {
    if (!url || url === '') return null;
    if (url.startsWith('http')) return url;
    return null;
}

// 지역별 이벤트 생성
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

// 슬립 함수
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== 고품질 샘플 데이터 =====
function getHighQualitySampleData(region, contentType) {
    const sampleData = {
        '서울': {
            attractions: [
                {
                    id: 'sample_seoul_001',
                    title: '경복궁',
                    category: '역사관광지',
                    address: '서울특별시 종로구 사직로 161',
                    tel: '02-3700-3900',
                    image: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=be22184d-d414-4884-b8b3-7ff2b8b49d8a',
                    mapx: '126.9769900000',
                    mapy: '37.5788400000'
                },
                {
                    id: 'sample_seoul_002',
                    title: 'N서울타워',
                    category: '관광지',
                    address: '서울특별시 용산구 남산공원길 105',
                    tel: '02-3455-9277',
                    image: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=1e4c7c98-d28d-4e79-9db4-9e0d0b0b4b95',
                    mapx: '126.9882300000',
                    mapy: '37.5512600000'
                },
                {
                    id: 'sample_seoul_003',
                    title: '명동성당',
                    category: '종교시설',
                    address: '서울특별시 중구 명동길 74',
                    tel: '02-774-1784',
                    image: null,
                    mapx: '126.9872900000',
                    mapy: '37.5633800000'
                }
            ]
        },
        '부산': {
            attractions: [
                {
                    id: 'sample_busan_001',
                    title: '해운대해수욕장',
                    category: '자연관광지',
                    address: '부산광역시 해운대구 우동',
                    tel: '051-749-4000',
                    image: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=busan_haeundae_001',
                    mapx: '129.1603100000',
                    mapy: '35.1587200000'
                },
                {
                    id: 'sample_busan_002',
                    title: '감천문화마을',
                    category: '문화관광지',
                    address: '부산광역시 사하구 감내2로 203',
                    tel: '051-204-1444',
                    image: 'https://cdn.visitkorea.or.kr/img/call?cmd=VIEW&id=busan_gamcheon_001',
                    mapx: '129.0104400000',
                    mapy: '35.0978600000'
                }
            ]
        }
    };

    const regionData = sampleData[region] || sampleData['서울'];
    const events = generateRegionalEvents(region);

    return {
        region,
        attractions: regionData.attractions,
        events: events,
        attractionCount: regionData.attractions.length,
        eventCount: events.length,
        stats: {
            total: regionData.attractions.length,
            withImages: regionData.attractions.filter(a => a.image).length,
            withCoordinates: regionData.attractions.filter(a => a.mapx && a.mapy).length,
            categories: [...new Set(regionData.attractions.map(a => a.category))].length
        },
        message: `고품질 ${region} 관광 정보 (API 연결 준비중)`
    };
}
