const axios = require('axios');

const AREA_CODES = {
  '서울': 1, '부산': 6, '제주': 39, '강릉': 32,
  '전주': 37, '대구': 4, '광주': 5, '대전': 3,
  '인천': 2, '울산': 7, '경주': 35, '춘천': 32
};

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { region = '서울' } = req.query;
        
        console.log('🏛️ === 일반 관광 API 테스트 시작 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        const possibleKeys = [
            process.env.TOUR_API_KEY,
            process.env.TOURISM_API_KEY,
            process.env.JEONBUK_API_KEY,
            process.env.WEATHER_API_KEY,
            process.env.REGIONAL_API_KEY
        ];

        console.log('🔑 환경변수 체크:', {
            TOUR_API_KEY: !!process.env.TOUR_API_KEY,
            TOURISM_API_KEY: !!process.env.TOURISM_API_KEY,
            JEONBUK_API_KEY: !!process.env.JEONBUK_API_KEY,
            WEATHER_API_KEY: !!process.env.WEATHER_API_KEY,
            REGIONAL_API_KEY: !!process.env.REGIONAL_API_KEY
        });

        const apiKey = possibleKeys.find(key => key);

        if (!apiKey) {
            console.log('❌ API 키 없음');
            return res.status(200).json({
                success: true,
                data: getTourismSampleData(region),
                message: '⚠️ TOUR_API_KEY 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 발견:', `${apiKey.substring(0, 10)}...`);

        // === 관광지 정보 테스트 ===
        console.log('🧪 다양한 관광 API 엔드포인트 테스트...');
        const tourismResult = await testMultipleAPIs(apiKey, region);
        console.log('📊 관광지 결과:', tourismResult);

        if (tourismResult.success) {
            console.log('🎉 관광 API 성공!');
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보!`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        console.log('⚠️ 모든 관광 API 테스트 실패');
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (API 연결 대기중)`,
            apiStatus: 'testing',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 관광 API 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === 다양한 API 테스트 함수 ===
async function testMultipleAPIs(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // 다양한 API 엔드포인트 정의
        const apiEndpoints = [
            // 1. 키워드 검색 API
            {
                name: 'keyword_search',
                urls: [
                    'https://apis.data.go.kr/B551011/KorService1/searchKeyword1',
                    'http://apis.data.go.kr/B551011/KorService1/searchKeyword1'
                ],
                getParams: (key) => ({
                    serviceKey: key,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    keyword: region,
                    contentTypeId: 12
                })
            },
            // 2. 위치 기반 API
            {
                name: 'location_based',
                urls: [
                    'https://apis.data.go.kr/B551011/KorService1/locationBasedList1',
                    'http://apis.data.go.kr/B551011/KorService1/locationBasedList1'
                ],
                getParams: (key) => ({
                    serviceKey: key,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    contentTypeId: 12,
                    mapX: areaCode === 1 ? '126.9780' : '129.0756', // 서울/부산 좌표
                    mapY: areaCode === 1 ? '37.5665' : '35.1796',
                    radius: '20000'
                })
            },
            // 3. 축제 정보 API
            {
                name: 'festival_search',
                urls: [
                    'https://apis.data.go.kr/B551011/KorService1/searchFestival1',
                    'http://apis.data.go.kr/B551011/KorService1/searchFestival1'
                ],
                getParams: (key) => ({
                    serviceKey: key,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    eventStartDate: '20250601',
                    eventEndDate: '20251231',
                    areaCode: areaCode
                })
            },
            // 4. 상세정보 조회 API
            {
                name: 'detail_common',
                urls: [
                    'https://apis.data.go.kr/B551011/KorService1/detailCommon1',
                    'http://apis.data.go.kr/B551011/KorService1/detailCommon1'
                ],
                getParams: (key) => ({
                    serviceKey: key,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    contentId: '126508', // 샘플 컨텐츠 ID
                    contentTypeId: 12,
                    defaultYN: 'Y',
                    firstImageYN: 'Y',
                    addrinfoYN: 'Y',
                    mapinfoYN: 'Y',
                    overviewYN: 'Y'
                })
            },
            // 5. 원래 지역기반 API (마지막 시도)
            {
                name: 'area_based',
                urls: [
                    'https://apis.data.go.kr/B551011/KorService1/areaBasedList1',
                    'http://apis.data.go.kr/B551011/KorService1/areaBasedList1'
                ],
                getParams: (key) => ({
                    serviceKey: key,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    contentTypeId: 12,
                    areaCode: areaCode
                })
            }
        ];

        // 키 변형 방법들
        const keyMethods = [
            { name: 'original', transform: (key) => key },
            { name: 'decoded', transform: (key) => decodeURIComponent(key) }
        ];

        // 각 API 엔드포인트 테스트
        for (const endpoint of apiEndpoints) {
            console.log(`🔬 === ${endpoint.name} API 테스트 ===`);
            
            for (const url of endpoint.urls) {
                for (const keyMethod of keyMethods) {
                    try {
                        const transformedKey = keyMethod.transform(apiKey);
                        const params = endpoint.getParams(transformedKey);
                        
                        console.log(`🔍 URL: ${url.split('/').pop()} | 키변형: ${keyMethod.name}`);

                        const response = await axios.get(url, {
                            params: params,
                            timeout: 10000,
                            headers: {
                                'Accept': 'application/json',
                                'User-Agent': 'HealingK/1.0'
                            }
                        });

                        console.log(`📡 응답:`, {
                            status: response.status,
                            contentType: response.headers['content-type'],
                            isJSON: response.headers['content-type']?.includes('json'),
                            dataType: typeof response.data
                        });

                        // JSON 응답 처리
                        if (response.data && typeof response.data === 'object') {
                            const resultCode = response.data.response?.header?.resultCode;
                            console.log('📊 결과 코드:', resultCode);

                            if (resultCode === '0000') {
                                const items = response.data.response?.body?.items?.item || [];
                                console.log('📦 아이템 수:', Array.isArray(items) ? items.length : (items ? 1 : 0));

                                if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                                    console.log(`🎉 성공! API: ${endpoint.name} | 키: ${keyMethod.name}`);
                                    return {
                                        success: true,
                                        method: `${endpoint.name}_${keyMethod.name}`,
                                        data: convertToTourismFormat(items, region)
                                    };
                                }
                            } else {
                                console.log('❌ 응답 오류:', response.data.response?.header?.resultMsg);
                            }
                        }
                        // XML 응답 처리
                        else if (typeof response.data === 'string') {
                            if (response.data.includes('<resultCode>00</resultCode>')) {
                                console.log(`🎉 XML 성공! API: ${endpoint.name}`);
                                
                                const titleMatches = response.data.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
                                if (titleMatches && titleMatches.length > 0) {
                                    const xmlItems = titleMatches.slice(0, 5).map((match, index) => {
                                        const title = match.replace(/<title><!\[CDATA\[/, '').replace(/\]\]><\/title>/, '');
                                        return { title, contentid: `xml_${index}` };
                                    });
                                    
                                    return {
                                        success: true,
                                        method: `${endpoint.name}_xml_${keyMethod.name}`,
                                        data: convertToTourismFormat(xmlItems, region)
                                    };
                                }
                            } else {
                                console.log('❌ XML 오류:', response.data.substring(0, 100));
                            }
                        }

                        // 짧은 대기
                        await new Promise(resolve => setTimeout(resolve, 300));

                    } catch (apiError) {
                        console.log(`❌ ${endpoint.name} 실패:`, apiError.message);
                        continue;
                    }
                }
            }
        }

        return { success: false, method: 'all_apis_failed' };

    } catch (error) {
        console.log('❌ 전체 API 테스트 실패:', error.message);
        return { success: false, method: 'test_error', error: error.message };
    }
}

// === 데이터 변환 함수 ===
function convertToTourismFormat(data, region) {
    const items = Array.isArray(data) ? data : [data];

    const attractions = items.slice(0, 5).map((item, index) => ({
        title: item.title || '관광지',
        category: item.cat3 || item.cat2 || '관광지',
        address: item.addr1 || item.address || `${region} 지역`,
        tel: item.tel || '정보 없음',
        image: item.firstimage || null,
        mapx: item.mapx,
        mapy: item.mapy,
        id: item.contentid || `tourism_${index}`
    }));

    const events = [
        { title: `${region} 문화축제`, location: region, date: '2025-06-01' },
        { title: `${region} 음식축제`, location: region, date: '2025-06-15' }
    ];

    return {
        region,
        attractions,
        events,
        attractionCount: attractions.length,
        eventCount: events.length,
        message: `🏛️ ${region} 관광 정보 (실시간 API 연결)`
    };
}

// === 샘플 데이터 ===
function getTourismSampleData(region) {
    const attractions = [
        { title: `${region} 대표 관광지`, category: '문화관광지' },
        { title: `${region} 자연공원`, category: '자연관광지' },
        { title: `${region} 역사유적`, category: '역사관광지' }
    ];

    const events = [
        { title: `${region} 문화축제`, location: region, date: '2025-06-01' },
        { title: `${region} 음식축제`, location: region, date: '2025-06-15' }
    ];

    return {
        region,
        attractions,
        events,
        attractionCount: attractions.length,
        eventCount: events.length,
        message: `TOUR_API_KEY 설정 필요 - ${region} 샘플 데이터`
    };
}
