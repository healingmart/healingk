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

        // 가능한 환경변수들 체크 (전북 방식)
        const possibleKeys = [
            process.env.TOURISM_API_KEY,
            process.env.JEONBUK_API_KEY,
            process.env.WEATHER_API_KEY,
            process.env.REGIONAL_API_KEY
        ];

        console.log('🔑 환경변수 체크:', {
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
                message: '⚠️ 관광 API 키 설정 필요',
                timestamp: new Date().toISOString()
            });
        }

        console.log('✅ API 키 발견:', `${apiKey.substring(0, 10)}...`);

        // === 관광지 정보 테스트 ===
        console.log('🧪 관광지 API 테스트...');
        const tourismResult = await testTourismAPI(apiKey, region);
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

        // API 실패시 샘플 데이터
        console.log('⚠️ 관광 API 테스트 실패');
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

// === 관광 API 테스트 함수 ===
async function testTourismAPI(apiKey, region) {
    try {
        const areaCode = AREA_CODES[region] || 1;
        
        // 여러 URL 시도 (전북 방식)
        const possibleUrls = [
            'https://apis.data.go.kr/B551011/KorService1/areaBasedList1',
            'http://apis.data.go.kr/B551011/KorService1/areaBasedList1'
        ];

        for (const url of possibleUrls) {
            try {
                console.log(`🔍 URL 시도: ${url}`);

                const params = {
                    serviceKey: apiKey,
                    numOfRows: 10,
                    pageNo: 1,
                    MobileOS: 'ETC',
                    MobileApp: 'HealingK',
                    _type: 'json',
                    listYN: 'Y',
                    arrange: 'A',
                    contentTypeId: 12, // 관광지
                    areaCode: areaCode
                };

                console.log('📋 요청 파라미터:', {
                    areaCode,
                    region,
                    serviceKey: 'exists'
                });

                const response = await axios.get(url, {
                    params: params,
                    timeout: 10000
                });

                console.log(`📡 ${url} 응답:`, {
                    status: response.status,
                    contentType: response.headers['content-type'],
                    isJSON: response.headers['content-type']?.includes('json')
                });

                if (response.data && typeof response.data === 'object') {
                    // 응답 형식 체크
                    const resultCode = response.data.response?.header?.resultCode;

                    console.log('📊 응답 결과 코드:', resultCode);

                    if (resultCode === '0000') {
                        const items = response.data.response?.body?.items?.item || [];

                        console.log('📦 받은 아이템 수:', Array.isArray(items) ? items.length : (items ? 1 : 0));

                        if (items && (Array.isArray(items) ? items.length > 0 : true)) {
                            console.log('🎉 관광지 데이터 발견!');
                            return {
                                success: true,
                                method: 'tourism_api',
                                data: convertToTourismFormat(items, region)
                            };
                        }
                    }
                }

                // 다음 URL 시도 전 잠시 대기
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (urlError) {
                console.log(`❌ ${url} 실패:`, urlError.message);
                continue;
            }
        }

        return { success: false, method: 'tourism_api' };

    } catch (error) {
        return { success: false, method: 'tourism_api', error: error.message };
    }
}

// === 관광 데이터를 표준 형식으로 변환 ===
function convertToTourismFormat(data, region) {
    const items = Array.isArray(data) ? data : [data];

    const attractions = items.slice(0, 5).map(item => ({
        title: item.title || '관광지',
        category: item.cat3 || item.cat2 || '관광지',
        address: item.addr1 || '',
        tel: item.tel || '',
        image: item.firstimage || null,
        mapx: item.mapx,
        mapy: item.mapy
    }));

    // 샘플 이벤트 데이터
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
        message: `API 키 설정 필요 - ${region} 샘플 데이터`
    };
}
