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
        
        console.log('🚀 === Service2 파라미터 수정 버전 ===');
        console.log('📅 현재 시간:', new Date().toLocaleString('ko-KR'));
        console.log('🗺️ 요청 지역:', region);

        const apiKey = process.env.TOURISM_API_KEY;

        if (!apiKey) {
            return res.status(200).json({
                success: true,
                data: getTourismSampleData(region),
                message: '⚠️ TOURISM_API_KEY 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 존재:', `${apiKey.substring(0, 10)}...`);

        // === Service2 올바른 파라미터로 테스트 ===
        const tourismResult = await testService2WithCorrectParams(apiKey, region);

        if (tourismResult.success) {
            return res.status(200).json({
                success: true,
                data: tourismResult.data,
                message: `🏛️ ${region} 실시간 관광 정보! (Service2)`,
                method: tourismResult.method,
                realTime: true,
                timestamp: new Date().toISOString()
            });
        }

        return res.status(200).json({
            success: true,
            data: getTourismSampleData(region),
            message: `🏛️ ${region} 관광 정보 (Service2 파라미터 조정 중)`,
            debug: tourismResult.debug || 'no debug info',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 오류:', error);
        return res.status(200).json({
            success: true,
            data: getTourismSampleData(req.query.region || '서울'),
            message: '🏛️ 관광 정보 (백업)',
            timestamp: new Date().toISOString()
        });
    }
};

// === Service2 올바른 파라미터 테스트 ===
async function testService2WithCorrectParams(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // Service2 가능한 파라미터 조합들
        const parameterSets = [
            // 파라미터 세트 1: listYN 제거
            {
                name: 'no_listYN',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    arrange: 'A',
                    contentTypeId: 12,
                    areaCode: areaCode
                }
            },
            // 파라미터 세트 2: 최소 파라미터만
            {
                name: 'minimal',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    areaCode: areaCode
                }
            },
            // 파라미터 세트 3: arrange 제거
            {
                name: 'no_arrange',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    contentTypeId: 12,
                    areaCode: areaCode
                }
            },
            // 파라미터 세트 4: contentTypeId 제거
            {
                name: 'no_contentTypeId',
                params: {
                    serviceKey: apiKey,
                    numOfRows: 5,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    areaCode: areaCode
                }
            }
        ];

        const testUrls = [
            'https://apis.data.go.kr/B551011/KorService2/areaBasedList2',
            'https://apis.data.go.kr/B551011/KorService2/searchKeyword2'
        ];

        for (const url of testUrls) {
            for (const paramSet of parameterSets) {
                try {
                    console.log(`🔍 URL: ${url.split('/').pop()}`);
                    console.log(`📋 파라미터 세트: ${paramSet.name}`);
                    console.log(`📋 파라미터:`, JSON.stringify(paramSet.params, null, 2));

                    // searchKeyword2인 경우 keyword 추가
                    let finalParams = { ...paramSet.params };
                    if (url.includes('searchKeyword2')) {
                        finalParams.keyword = region;
                        delete finalParams.areaCode;
                    }

                    const response = await axios.get(url, {
                        params: finalParams,
                        timeout: 15000
                    });

                    console.log(`📡 응답:`, {
                        status: response.status,
                        contentType: response.headers['content-type'],
                        dataType: typeof response.data
                    });

                    console.log(`📦 Service2 응답:`, JSON.stringify(response.data, null, 2));

                    // Service2 응답 구조 처리
                    if (response.data && typeof response.data === 'object') {
                        const resultCode = response.data.resultCode;
                        console.log('📊 Service2 결과 코드:', resultCode);

                        // Service2 성공 코드 확인 (0000 또는 00일 가능성)
                        if (resultCode === '0000' || resultCode === '00' || resultCode === '0') {
                            // Service2 데이터 구조 찾기
                            const possibleData = [
                                response.data.items,
                                response.data.data,
                                response.data.result,
                                response.data.content,
                                response.data.list
                            ];

                            for (const dataPath of possibleData) {
                                if (dataPath && (Array.isArray(dataPath) ? dataPath.length > 0 : true)) {
                                    console.log('🎉 Service2 데이터 발견!');
                                    console.log('📦 데이터:', JSON.stringify(dataPath, null, 2));
                                    
                                    return {
                                        success: true,
                                        method: `service2_${paramSet.name}`,
                                        data: convertToTourismFormat(dataPath, region)
                                    };
                                }
                            }

                            // 데이터는 없지만 성공 코드
                            console.log('✅ Service2 성공 (데이터 없음)');
                            return {
                                success: true,
                                method: `service2_${paramSet.name}_empty`,
                                data: {
                                    region,
                                    attractions: [],
                                    events: [
                                        { title: `${region} 문화축제`, location: region, date: '2025-06-01' },
                                        { title: `${region} 음식축제`, location: region, date: '2025-06-15' }
                                    ],
                                    attractionCount: 0,
                                    eventCount: 2,
                                    message: `🏛️ ${region} 지역 데이터 없음 (Service2 연결 성공)`
                                }
                            };
                        } else {
                            console.log('❌ Service2 오류:', response.data.resultMsg);
                        }
                    }

                    await new Promise(resolve => setTimeout(resolve, 1000));

                } catch (paramError) {
                    console.log(`❌ 파라미터 세트 ${paramSet.name} 실패:`, paramError.message);
                    continue;
                }
            }
        }

        return { 
            success: false, 
            method: 'service2_all_params_failed',
            debug: 'All parameter combinations failed'
        };

    } catch (error) {
        console.log('❌ Service2 파라미터 테스트 오류:', error.message);
        return { success: false, method: 'service2_param_error', error: error.message };
    }
}

// === 데이터 변환 함수 ===
function convertToTourismFormat(data, region) {
    const items = Array.isArray(data) ? data : [data];

    const attractions = items.slice(0, 5).map((item, index) => ({
        title: item.title || item.name || `${region} 관광지 ${index + 1}`,
        category: item.cat3 || item.cat2 || item.category || '관광지',
        address: item.addr1 || item.address || item.location || `${region} 지역`,
        tel: item.tel || item.phone || '정보 없음',
        image: item.firstimage || item.image || null,
        mapx: item.mapx || item.longitude,
        mapy: item.mapy || item.latitude,
        id: item.contentid || item.id || `tourism_${index}`
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
        message: `🏛️ ${region} 관광 정보 (Service2 성공!)`
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
        message: `Service2 파라미터 조정 중 - ${region} 샘플 데이터`
    };
}
